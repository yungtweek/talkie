import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config({ path: '.env.local' });
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { OutboxRepository } from './outbox.repository';
import type { DB } from '@/modules/infra/database/kysely/kysely.module';

jest.setTimeout(30000); // allow enough time for real DB operations

describe('OutboxRepository (e2e, local DB)', () => {
  let pool: Pool;
  let db: Kysely<DB>;
  let repo: OutboxRepository;

  beforeAll(() => {
    const connectionString = process.env.OUTBOX_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('OUTBOX_TEST_DATABASE_URL or DATABASE_URL must be set for Outbox e2e tests');
    }

    pool = new Pool({
      connectionString,
    });
    db = new Kysely<DB>({
      dialect: new PostgresDialect({ pool }),
    });

    // Important: the real `outbox` table is expected to already exist in this DB.
    // This test will insert and then clean up its own rows.
    repo = new OutboxRepository(db);
  });

  afterAll(async () => {
    if (pool) {
      // Clean up test data so we don't pollute the real outbox table
      await pool.query(
        `
        DELETE FROM outbox
        WHERE topic IN ('e2e-test', 'e2e-test-fail', 'e2e-test-dead', 'e2e-test-retry')
      `,
      );
      await db.destroy();
    }
  });

  it('should insert an outbox row into PostgreSQL', async () => {
    const topic = 'e2e-test';
    const payload = { foo: 'bar' };
    const jobId = crypto.randomUUID();

    const id = await repo.insertOutbox({ jobId, topic, payload });

    expect(id).not.toBeNull();

    const result = await pool.query(`SELECT * FROM outbox WHERE id = $1`, [id]);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].topic).toBe(topic);
    expect(result.rows[0].job_id).toBe(jobId);
    expect(result.rows[0].payload_json).toMatchObject(payload);
    expect(result.rows[0].payload_json.outboxCreatedAt).toBeDefined();
    expect(['pending', 'publishing']).toContain(result.rows[0].status);
  });

  it('should mark an outbox row as failed in PostgreSQL', async () => {
    const topic = 'e2e-test-fail';
    const payload = { foo: 'baz' };
    const jobId = crypto.randomUUID();

    // Insert a fresh pending row
    const id = await repo.insertOutbox({ jobId, topic, payload });
    if (id === null) {
      throw new Error('insertOutbox returned null (unexpected)');
    }

    // Simulate a publish failure
    const error = new Error('forced failure');
    await repo.markFailed(id, error);

    const result = await pool.query(`SELECT * FROM outbox WHERE id = $1`, [id]);

    expect(result.rows.length).toBe(1);
    const row = result.rows[0];

    // status should move to failed (or dead_lettered after enough retries, depending on implementation)
    expect(row.status === 'failed' || row.status === 'dead_lettered').toBe(true);
    expect(row.retry_count).toBeGreaterThanOrEqual(1);
    expect(row.last_error).toContain('forced failure');
    // next_attempt_at should be >= now() (backoff applied)
    expect(new Date(row.next_attempt_at).getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
  });

  it('should move to dead_lettered after 5 failures', async () => {
    const topic = 'e2e-test-dead';
    const payload = { foo: 'dead' };
    const jobId = crypto.randomUUID();

    const id = await repo.insertOutbox({ jobId, topic, payload });
    if (id === null) throw new Error('insertOutbox returned null');

    // 5번 실패시키기
    for (let i = 0; i < 5; i++) {
      await repo.markFailed(id, new Error(`forced failure ${i}`));
    }

    const result = await pool.query(`SELECT * FROM outbox WHERE id=$1`, [id]);
    expect(result.rows.length).toBe(1);

    const row = result.rows[0];
    expect(row.retry_count).toBe(5);
    expect(row.status).toBe('dead_lettered');
    expect(row.last_error).toContain('forced failure');
  });

  it('should keep failed status after first failure and allow retry on next attempt', async () => {
    const topic = 'e2e-test-retry';
    const payload = { foo: 'retry' };
    const jobId = crypto.randomUUID();

    const id = await repo.insertOutbox({ jobId, topic, payload });
    if (id === null) throw new Error('insertOutbox returned null');

    // 1회 실패
    await repo.markFailed(id, new Error('forced failure once'));

    let result = await pool.query(`SELECT * FROM outbox WHERE id=$1`, [id]);
    expect(result.rows.length).toBe(1);
    let row = result.rows[0];

    // 첫 번째 실패 후 상태 확인
    expect(row.status).toBe('failed');
    expect(row.retry_count).toBe(1);
    expect(row.last_error).toContain('forced failure once');

    // 다시 select 해서 next_attempt_at 검증
    const nextAttemptAt = new Date(row.next_attempt_at).getTime();
    expect(nextAttemptAt).toBeGreaterThan(Date.now() - 1000);

    // 2회 실패 시도
    await repo.markFailed(id, new Error('forced failure twice'));

    result = await pool.query(`SELECT * FROM outbox WHERE id=$1`, [id]);
    row = result.rows[0];

    expect(row.retry_count).toBe(2);
    expect(row.status).toBe('failed'); // 아직 dead_lettered 아님
    expect(row.last_error).toContain('forced failure twice');
  });
});
