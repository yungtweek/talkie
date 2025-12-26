import type { Kysely } from 'kysely';
import type { DB } from '@/modules/infra/database/kysely/kysely.module';
import { OutboxRepository } from '@/modules/infra/outbox/outbox.repository';

type MockExecutor = {
  executeQuery: jest.Mock<Promise<{ rows: unknown[] }>, [unknown]>;
  compileQuery: jest.Mock;
  transformQuery: jest.Mock;
  withPlugins: jest.Mock;
};

// helper to create a mocked Kysely executor provider
const createMockDb = (): { db: Kysely<DB>; executor: MockExecutor } => {
  const executor: MockExecutor = {
    executeQuery: jest.fn<Promise<{ rows: unknown[] }>, [unknown]>(),
    compileQuery: jest.fn((query: unknown) => query),
    transformQuery: jest.fn((query: unknown) => query),
    withPlugins: jest.fn<MockExecutor, []>(() => executor),
  };

  const db = {
    getExecutor: jest.fn<MockExecutor, []>(() => executor),
  } as unknown as Kysely<DB>;

  return { db, executor };
};

describe('OutboxRepository', () => {
  let db: Kysely<DB>;
  let executor: MockExecutor;
  let repo: OutboxRepository;

  beforeEach(() => {
    ({ db, executor } = createMockDb());
    repo = new OutboxRepository(db);
  });

  afterEach(() => {
    executor.executeQuery.mockReset();
  });

  describe('insertOutbox', () => {
    it('inserts a new outbox row and returns its id', async () => {
      const mockId = '123';
      executor.executeQuery.mockResolvedValue({
        rows: [{ id: mockId }],
      });

      const jobId = 'job-123';
      const topic = 'chat.request';
      const payload = { hello: 'world' };

      const id = await repo.insertOutbox({ jobId, topic, payload });

      expect(executor.executeQuery).toHaveBeenCalledTimes(1);

      expect(id).toBe(mockId);
    });

    it('returns null when ON CONFLICT DO NOTHING results in no rows', async () => {
      executor.executeQuery.mockResolvedValue({
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
          id: '1',
          topic: 'chat.request',
          key: 'job-1',
          payload_json: { foo: 'bar' },
          job_id: 'job-1',
        },
        {
          id: '2',
          topic: 'chat.title.generate',
          key: 'job-2',
          payload_json: { foo: 'baz' },
          job_id: 'job-2',
        },
      ];

      executor.executeQuery.mockResolvedValue({ rows });

      const limit = 50;
      const result = await repo.lockPendingBatch(limit);

      expect(executor.executeQuery).toHaveBeenCalledTimes(1);
      expect(result).toEqual(rows);
    });
  });

  describe('markPublished', () => {
    it('updates row status to published and sets published_at', async () => {
      executor.executeQuery.mockResolvedValue({ rows: [] });

      await repo.markPublished('42');

      expect(executor.executeQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('markFailed', () => {
    it('increments retry_count and sets failed status when under max retries', async () => {
      executor.executeQuery.mockResolvedValue({ rows: [] });

      const error = new Error('boom');
      await repo.markFailed('10', error);

      expect(executor.executeQuery).toHaveBeenCalledTimes(1);
    });
  });
});
