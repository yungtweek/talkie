import { OutboxRepository } from './outbox.repository';
import type { Kysely } from 'kysely';
import type { DB } from '@/modules/infra/database/kysely/kysely.module';

type MockExecutor = {
  executeQuery: jest.Mock<Promise<{ rows: unknown[] }>, [unknown]>;
  compileQuery: jest.Mock;
  transformQuery: jest.Mock;
  withPlugins: jest.Mock;
};

// A very small mock shape for Kysely's executor provider
function createMockDb(): { db: Kysely<DB>; executor: MockExecutor } {
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
}

describe('OutboxRepository', () => {
  let db: Kysely<DB>;
  let executor: MockExecutor;
  let repository: OutboxRepository;

  beforeEach(() => {
    ({ db, executor } = createMockDb());
    repository = new OutboxRepository(db);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('lockPendingBatch', () => {
    it('should query pending and failed records up to the given limit', async () => {
      const rows = [
        { id: '1', topic: 'test-topic', key: 'k1', payload_json: { foo: 'bar' }, job_id: 'job-1' },
        { id: '2', topic: 'test-topic', key: 'k2', payload_json: { foo: 'baz' }, job_id: 'job-2' },
      ];

      executor.executeQuery.mockResolvedValue({ rows });

      const limit = 10;
      const result = await repository.lockPendingBatch(limit);

      expect(executor.executeQuery).toHaveBeenCalledTimes(1);
      expect(result).toEqual(rows);
    });
  });

  describe('markFailed', () => {
    it('should update status, retry_count and error message when given an Error', async () => {
      const stringifySpy = jest.spyOn(JSON, 'stringify');
      executor.executeQuery.mockResolvedValue({ rows: [] });

      const id = '123';
      const error = new Error('boom');

      await repository.markFailed(id, error);

      expect(executor.executeQuery).toHaveBeenCalledTimes(1);
      expect(stringifySpy).not.toHaveBeenCalled();
      stringifySpy.mockRestore();
    });

    it('should stringify non-Error values passed as err', async () => {
      const stringifySpy = jest.spyOn(JSON, 'stringify');
      executor.executeQuery.mockResolvedValue({ rows: [] });

      const id = '1';
      const errPayload = { reason: 'timeout' };

      await repository.markFailed(id, errPayload);

      expect(executor.executeQuery).toHaveBeenCalledTimes(1);
      expect(stringifySpy).toHaveBeenCalledWith(errPayload);
      stringifySpy.mockRestore();
    });
  });

  describe('markPublished', () => {
    it('should update status to published and set published_at', async () => {
      executor.executeQuery.mockResolvedValue({ rows: [] });

      const id = '456';
      await repository.markPublished(id);

      expect(executor.executeQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('insertOutbox', () => {
    it('should return the inserted id when insert succeeds', async () => {
      executor.executeQuery.mockResolvedValue({ rows: [{ id: '77' }] });

      const id = await repository.insertOutbox({
        jobId: 'job-77',
        topic: 'test-topic',
        payload: { foo: 'bar' },
      });

      expect(executor.executeQuery).toHaveBeenCalledTimes(1);
      expect(id).toBe('77');
    });

    it('should return null when insert is skipped by conflict', async () => {
      executor.executeQuery.mockResolvedValue({ rows: [] });

      const id = await repository.insertOutbox({
        jobId: 'job-88',
        topic: 'test-topic',
        payload: { foo: 'bar' },
      });

      expect(executor.executeQuery).toHaveBeenCalledTimes(1);
      expect(id).toBeNull();
    });
  });
});
