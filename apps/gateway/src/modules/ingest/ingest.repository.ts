import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SqlBool } from 'kysely';
import { Insertable, Kysely, Selectable, sql, UpdateObject } from 'kysely';
import {
  FileMetadataRegisterZ,
  UpdateIndexStatusByKeyZ,
  UpdateIndexStatusZ,
} from '@/modules/ingest/ingest.zod';
import type {
  FileMetadataRegister,
  UpdateIndexStatusByKeyInput,
  UpdateIndexStatusInput,
} from '@/modules/ingest/ingest.zod';
import type { FileVisibility } from '@talkie/types-zod';
import { DB, KYSELY } from '@/modules/infra/database/kysely/kysely.module';
import type { JsonValue } from '@/modules/infra/database/kysely/db.types';

export type FileMetadataRow = Selectable<DB['file_metadata']>;

/** Slim row for list views (do not expose S3 key to clients). */
export type FileListItem = Pick<
  FileMetadataRow,
  'id' | 'filename' | 'content_type' | 'status' | 'size' | 'uploaded_at' | 'created_at'
> & {
  visibility: FileVisibility;
};

export type UpsertByKeyInput = FileMetadataRegister;

const logger = new Logger('IngestRepository');

const jsonbMerge = (value: unknown) =>
  sql<JsonValue>`coalesce(meta, '{}'::jsonb) || ${JSON.stringify(value)}::jsonb`;

@Injectable()
export class IngestRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * List files visible to requester without exposing S3 key.
   * - Orders by uploaded_at DESC NULLS LAST, then created_at DESC, then id DESC.
   * - Supports keyset pagination via a cursor composed of (uploaded_at, created_at, id).
   * - Returns at most `first` items and a nextCursor (base64) if more remain.
   */
  async listRowsForUser(
    requesterId: string,
    first: number,
    after?: { uploadedAt: string | null; createdAt: string; id: string } | null,
  ): Promise<FileListItem[]> {
    let query = this.db
      .selectFrom('file_metadata')
      .select([
        'id',
        'filename',
        'content_type',
        'status',
        'size',
        'uploaded_at',
        'created_at',
        'visibility',
      ])
      .where(eb =>
        eb.or([
          eb('visibility', '=', 'public'),
          eb.and([eb('visibility', '=', 'private'), eb('owner_id', '=', requesterId)]),
        ]),
      )
      .where('status', 'not in', ['deleted', 'deleting']);

    if (after) {
      query = query.where(sql<SqlBool>`
        (coalesce(uploaded_at, to_timestamp(0)), created_at, id)
        < (
          coalesce(${after.uploadedAt}::timestamptz, to_timestamp(0)),
          ${after.createdAt}::timestamptz,
          ${after.id}::uuid
        )
      `);
    }

    const rows = await query
      .orderBy(sql`uploaded_at DESC NULLS LAST`)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(first + 1)
      .execute();

    return rows.map(row => ({
      ...row,
      visibility: row.visibility as FileVisibility,
    }));
  }

  /**
   * Insert or update a file_metadata row by its unique key.
   * Only provided fields are written; others remain unchanged on conflict.
   */
  async upsertByKey(input: UpsertByKeyInput): Promise<FileMetadataRow> {
    const parsed = FileMetadataRegisterZ.parse(input);
    const meta = parsed.meta ?? {};

    const insertValues: Insertable<DB['file_metadata']> = {
      bucket: parsed.bucket,
      key: parsed.key,
      filename: parsed.filename,
      owner_id: parsed.ownerId,
      content_type: parsed.contentType,
      visibility: parsed.visibility ?? 'private',
      status: parsed.status,
      meta,
    };

    try {
      const row = await this.db
        .insertInto('file_metadata')
        .values(insertValues)
        .onConflict(oc =>
          oc.column('key').doUpdateSet({
            content_type: insertValues.content_type,
            visibility: insertValues.visibility,
            status: insertValues.status,
            meta: insertValues.meta,
            updated_at: new Date(),
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
      return row;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`upsertByKey failed: ${message}`, err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }

  /** Fetch by id */
  async getById(id: string): Promise<FileMetadataRow | null> {
    const row = await this.db
      .selectFrom('file_metadata')
      .selectAll()
      .where('id', '=', id)
      .limit(1)
      .executeTakeFirst();
    return row ?? null;
  }

  /** Return the owner_id for a given file id, or null if not found. */
  async getOwnerId(fileId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('file_metadata')
      .select('owner_id')
      .where('id', '=', fileId)
      .limit(1)
      .executeTakeFirst();
    return row?.owner_id ?? null;
  }

  /** Fetch by (bucket, key) */
  async getByKey(bucket: string, key: string): Promise<FileMetadataRow | null> {
    const row = await this.db
      .selectFrom('file_metadata')
      .selectAll()
      .where('bucket', '=', bucket)
      .where('key', '=', key)
      .limit(1)
      .executeTakeFirst();
    return row ?? null;
  }

  /** Partial update for index/vector fields (called by gateway on orchestration milestones). */
  async updateIndexStatus(input: UpdateIndexStatusInput): Promise<void> {
    const parsed = UpdateIndexStatusZ.parse(input);
    const updates: UpdateObject<DB, 'file_metadata'> = {};

    if (parsed.chunk_count !== undefined) updates.chunk_count = parsed.chunk_count;
    if (parsed.embedding_model !== undefined) updates.embedding_model = parsed.embedding_model;
    if (parsed.indexed_at !== undefined) updates.indexed_at = parsed.indexed_at;
    if (parsed.vectorized_at !== undefined) updates.vectorized_at = parsed.vectorized_at;
    if (parsed.status !== undefined) updates.status = parsed.status;

    if (parsed.meta !== undefined) {
      updates.meta = jsonbMerge(parsed.meta);
    }

    updates.updated_at = new Date();

    try {
      await this.db
        .updateTable('file_metadata')
        .set(updates)
        .where('id', '=', parsed.file_id)
        .execute();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`updateIndexStatus failed: ${message}`, err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }

  /** Partial update by (bucket, key) for clients that don't know file_id. */
  async updateIndexStatusByKey(input: UpdateIndexStatusByKeyInput): Promise<Date | null> {
    const parsed = UpdateIndexStatusByKeyZ.parse(input);
    const updates: UpdateObject<DB, 'file_metadata'> = {};
    let hasMutation = false;

    if (parsed.chunkCount !== undefined) {
      updates.chunk_count = parsed.chunkCount;
      hasMutation = true;
    }
    if (parsed.embeddingModel !== undefined) {
      updates.embedding_model = parsed.embeddingModel;
      hasMutation = true;
    }
    if (parsed.indexedAt !== undefined) {
      updates.indexed_at = parsed.indexedAt;
      hasMutation = true;
    }
    if (parsed.vectorizedAt !== undefined) {
      updates.vectorized_at = parsed.vectorizedAt;
      hasMutation = true;
    }
    if (parsed.status !== undefined) {
      updates.status = parsed.status;
      hasMutation = true;
    }
    if (parsed.size !== undefined) {
      updates.size = parsed.size;
      hasMutation = true;
    }
    if (parsed.etag !== undefined) {
      updates.etag = parsed.etag;
      hasMutation = true;
    }
    if (parsed.meta !== undefined) {
      updates.meta = jsonbMerge(parsed.meta);
      hasMutation = true;
    }

    if (!hasMutation) return null;

    updates.updated_at = new Date();

    try {
      const row = await this.db
        .updateTable('file_metadata')
        .set(updates)
        .where('bucket', '=', parsed.bucket)
        .where('key', '=', parsed.key)
        .returning('updated_at')
        .executeTakeFirst();
      return row?.updated_at ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        `updateIndexStatusByKey failed: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }

  /** Mark file as failed and store reason into meta.reason */
  async markFailed(file_id: string, reason: string): Promise<void> {
    try {
      await this.db
        .updateTable('file_metadata')
        .set({
          status: 'failed',
          meta: sql`jsonb_set(coalesce(meta, '{}'::jsonb), '{reason}', to_jsonb(${reason}::text), true)`,
          updated_at: new Date(),
        })
        .where('id', '=', file_id)
        .execute();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`markFailed failed: ${message}`, err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }

  /** Transition file status to 'deleting' (pre-delete state). */
  async markDeleting(file_id: string): Promise<void> {
    try {
      await this.db
        .updateTable('file_metadata')
        .set({
          status: 'deleting',
          updated_at: new Date(),
          delete_requested_at: new Date(),
        })
        .where('id', '=', file_id)
        .execute();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`markDeleting failed: ${message}`, err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }

  /** Update visibility by file id (ownership is validated upstream). */
  async updateVisibility(
    file_id: string,
    visibility: 'private' | 'department' | 'public' | 'followers',
  ): Promise<void> {
    try {
      await this.db
        .updateTable('file_metadata')
        .set({
          visibility,
          updated_at: new Date(),
        })
        .where('id', '=', file_id)
        .execute();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`updateVisibility failed: ${message}`, err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }

  /** Mark failed by (bucket, key) for clients that don't know file_id */
  async markFailedByKey(bucket: string, key: string, reason: string): Promise<void> {
    try {
      await this.db
        .updateTable('file_metadata')
        .set({
          status: 'failed',
          meta: sql`jsonb_set(coalesce(meta, '{}'::jsonb), '{reason}', to_jsonb(${reason}::text), true)`,
          updated_at: new Date(),
        })
        .where('bucket', '=', bucket)
        .where('key', '=', key)
        .execute();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`markFailedByKey failed: ${message}`, err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }
}
