# Ingest Flow (Gateway -> Index Worker)

This document describes the end-to-end lifecycle for uploaded files: registration, upload, indexing, and deletion.

## Actors

- Gateway (REST/GraphQL)
- Object storage (MinIO/S3)
- Kafka (topics: ingest.request, ingest.delete)
- Index Worker
- Postgres (file metadata)
- Weaviate (vector store)
- Redis (user-scoped file events)

## Statuses

The shared FileStatus enum includes: pending, ready, indexed, vectorized, failed, deleted.
Gateway may set an internal "deleting" status before enqueueing cleanup; this state is not part of the shared schemas.

## Upload and indexing flow

```mermaid
sequenceDiagram
  participant U as User
  participant G as Gateway
  participant S as Object Storage
  participant K as Kafka
  participant W as Index Worker
  participant V as Weaviate
  participant DB as Postgres

  U->>G: POST /v1/ingest/presign/put (filename, size, checksum)
  G-->>U: presigned URL + key
  U->>S: PUT object
  U->>G: POST /v1/ingest/complete { bucket, key }
  G->>DB: mark status = ready
  G->>K: produce ingest.request { jobId, userId, fileId, bucket, key }
  K-->>W: consume ingest.request
  W->>S: download object
  W->>W: extract -> clean -> chunk -> embed
  W->>V: upsert vectors
  W->>DB: status = indexed -> vectorized
```

## Deletion flow

```mermaid
sequenceDiagram
  participant U as User
  participant G as Gateway
  participant K as Kafka
  participant W as Index Worker
  participant V as Weaviate
  participant DB as Postgres

  U->>G: deleteFile(fileId)
  G->>DB: mark status = deleting (internal)
  G->>K: produce ingest.delete { jobId, userId, fileId, reason }
  K-->>W: consume ingest.delete
  W->>V: delete vectors by userId + fileId
  W->>DB: status = deleted
```

## Events (UI and subscriptions)

User-facing file events are published over Redis:

- Channel: user:{userId}:files
- Types: file.registered, file.status.changed, file.visibility.changed, file.deleted
- Schema source: packages/events-contracts/src/ingest.ts

Indexing emits file.status.changed events as status moves ready -> indexed -> vectorized. Gateway emits
file.deleted when deletion is requested (before async cleanup completes).
