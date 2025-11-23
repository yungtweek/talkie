import { OutboxRepository } from './outbox.repository';
import type { Pool } from 'pg';

// A very small mock shape for pg.Pool
function createMockPool() {
  return {
    query: jest.fn(),
  } as unknown as Pool;
}

describe('OutboxRepository', () => {
  let pool: Pool & { query: jest.Mock };
  let repository: OutboxRepository;

  beforeEach(() => {
    pool = createMockPool() as Pool & { query: jest.Mock };
    repository = new OutboxRepository(pool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('lockPendingBatch', () => {
    it('should query pending and failed records up to the given limit', async () => {
      const rows = [
        { id: 1, topic: 'test-topic', key: 'k1', payload_json: { foo: 'bar' }, job_id: 'job-1' },
        { id: 2, topic: 'test-topic', key: 'k2', payload_json: { foo: 'baz' }, job_id: 'job-2' },
      ];

      pool.query.mockResolvedValue({ rows });

      const limit = 10;
      const result = await repository.lockPendingBatch(limit);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];

      expect(typeof sql).toBe('string');
      // Make sure we are targeting both pending and failed states and using SKIP LOCKED
      expect(sql).toContain("status IN ('pending', 'failed')");
      expect(sql.toLowerCase()).toContain('for update skip locked');

      expect(params).toEqual([limit]);
      expect(result).toEqual(rows);
    });
  });

  describe('markFailed', () => {
    it('should update status, retry_count and error message when given an Error', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const id = 123;
      const error = new Error('boom');

      await repository.markFailed(id, error);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];

      expect(typeof sql).toBe('string');
      expect(sql).toContain('UPDATE outbox');
      expect(sql).toContain('retry_count');
      expect(sql).toContain('last_error');
      expect(sql).toContain('next_attempt_at');

      // id should be the first parameter
      expect(params[0]).toBe(id);
      // error message should be the second parameter
      expect(params[1]).toBe(error.message);
    });

    it('should stringify non-Error values passed as err', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const id = 1;
      const errPayload = { reason: 'timeout' };

      await repository.markFailed(id, errPayload);

      const [, params] = pool.query.mock.calls[0];
      // second param is the error string
      expect(params[1]).toBe(JSON.stringify(errPayload));
    });
  });

  describe('markPublished', () => {
    it('should update status to published and set published_at', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const id = 456;
      await repository.markPublished(id);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];

      expect(typeof sql).toBe('string');
      expect(sql).toContain('UPDATE outbox');
      expect(sql).toContain("status = 'published'");
      expect(sql).toContain('published_at');

      expect(params).toEqual([id]);
    });
  });
});
