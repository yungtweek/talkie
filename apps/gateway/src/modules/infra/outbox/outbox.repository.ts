// infra/kafka/outbox.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '@/modules/infra/database/database.module';

interface OutboxRow {
  id: number;
  topic: string;
  key: string | null;
  payload_json: unknown;
  job_id: string | null;
}

@Injectable()
export class OutboxRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Insert an event into the outbox table (for async dispatch).
   * @returns numeric outbox id for traceability
   */
  async insertOutbox(params: {
    jobId: string;
    topic: string;
    payload: unknown;
  }): Promise<number | null> {
    const { jobId, topic, payload } = params;

    const idempotencyKey = jobId;

    const sql = `
    INSERT INTO outbox (job_id, topic, key, payload_json, idempotency_key)
    VALUES ($1, $2, $3, $4::jsonb, $5)
    ON CONFLICT (topic, idempotency_key)
    DO NOTHING
    RETURNING id
  `;

    const { rows } = await this.pool.query<{ id: number }>(sql, [
      jobId,
      topic,
      jobId, // key = jobId
      JSON.stringify(payload ?? {}),
      idempotencyKey,
    ]);

    return rows[0]?.id ?? null;
  }
  async lockPendingBatch(limit: number): Promise<OutboxRow[]> {
    const sql = `
      SELECT id, topic, key, payload_json, job_id
      FROM outbox
      WHERE status = 'pending'
        AND next_attempt_at <= now()
      ORDER BY next_attempt_at, id
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `;
    const { rows } = await this.pool.query<OutboxRow>(sql, [limit]);
    return rows;
  }

  async markPublished(id: number) {
    const sql = `
      UPDATE outbox
      SET status = 'published',
          published_at = now()
      WHERE id = $1
    `;
    await this.pool.query(sql, [id]);
  }

  async markFailed(id: number, err: unknown) {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);

    const sql = `
      UPDATE outbox
      SET status         = CASE WHEN retry_count + 1 >= 5 THEN 'dead_lettered' ELSE 'failed' END,
          retry_count    = retry_count + 1,
          last_error     = $2,
          last_attempt_at = now(),
          next_attempt_at = now() + interval '30 seconds'
      WHERE id = $1
    `;
    await this.pool.query(sql, [id, message]);
  }
}
