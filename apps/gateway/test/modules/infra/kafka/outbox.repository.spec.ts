import { Pool } from 'pg';
import { OutboxRepository } from '@/modules/infra/outbox/outbox.repository';

// helper to create a mocked Pool
const createMockPool = () => {
  return {
    query: jest.fn(),
  } as {
    query: jest.Mock<Promise<{ rows: unknown[] }>, [string, unknown[]]>;
  };
};

describe('OutboxRepository', () => {
  let pool: {
    query: jest.Mock<Promise<{ rows: unknown[] }>, [string, unknown[]]>;
  };
  let repo: OutboxRepository;

  beforeEach(() => {
    pool = createMockPool();
    repo = new OutboxRepository(pool as unknown as Pool);
  });

  afterEach(() => {
    pool.query.mockReset();
  });

  describe('insertOutbox', () => {
    it('inserts a new outbox row and returns its id', async () => {
      const mockId = 123;
      pool.query.mockResolvedValue({
        rows: [{ id: mockId }],
      });

      const jobId = 'job-123';
      const topic = 'chat.request';
      const payload = { hello: 'world' };

      const id = await repo.insertOutbox({ jobId, topic, payload });

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];
      console.log(sql, params);
      const expected = 'INTO outbox (job_id, topic, key, payload_json, idempotency_key)';
      expect(sql).toContain(expected);
      expect(params).toEqual([
        jobId,
        topic,
        jobId, // key
        JSON.stringify(payload),
        jobId, // idempotency_key
      ]);

      expect(id).toBe(mockId);
    });

    it('returns null when ON CONFLICT DO NOTHING results in no rows', async () => {
      pool.query.mockResolvedValue({
        rows: [],
      });

      const id = await repo.insertOutbox({
        jobId: 'job-123',
        topic: 'chat.request',
        payload: { hello: 'world' },
      });

      expect(id).toBeNull();
    });
  });

  describe('lockPendingBatch', () => {
    it('selects pending outbox rows with limit', async () => {
      const rows = [
        {
          id: 1,
          topic: 'chat.request',
          key: 'job-1',
          payload_json: { foo: 'bar' },
          job_id: 'job-1',
        },
        {
          id: 2,
          topic: 'chat.title.generate',
          key: 'job-2',
          payload_json: { foo: 'baz' },
          job_id: 'job-2',
        },
      ];

      pool.query.mockResolvedValue({ rows });

      const limit = 50;
      const result = await repo.lockPendingBatch(limit);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];

      expect(sql).toContain('SELECT id, topic, key, payload_json, job_id');
      expect(sql).toContain('FROM outbox');
      expect(sql).toContain("status = 'pending'");
      expect(sql).toContain('FOR UPDATE SKIP LOCKED');
      expect(params).toEqual([limit]);

      expect(result).toEqual(rows);
    });
  });

  describe('markPublished', () => {
    it('updates row status to published and sets published_at', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await repo.markPublished(42);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];

      expect(sql).toContain('UPDATE outbox');
      expect(sql).toContain("SET status = 'published'");
      expect(sql).toContain('published_at = now()');
      expect(params).toEqual([42]);
    });
  });

  describe('markFailed', () => {
    it('increments retry_count and sets failed status when under max retries', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const error = new Error('boom');
      await repo.markFailed(10, error);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];

      expect(sql).toContain('UPDATE outbox');
      expect(sql).toContain('retry_count + 1');
      expect(sql).toContain('last_error');
      expect(sql).toContain('last_attempt_at');
      expect(sql).toContain('next_attempt_at');
      expect(params[0]).toBe(10);
      expect(params[1]).toBe('boom');
    });
  });
});
