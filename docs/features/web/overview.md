# Web App Overview

The web app is a Next.js client for Talkie. It provides authentication, chat, and file ingest UI on top of the Gateway APIs.

## Key features

- Auth flows and session-aware routing.
- Chat UI with streaming responses (SSE from the Gateway).
- Session list and history via GraphQL.
- File ingest UI with presigned uploads and status updates.

## Integration points

- GraphQL over HTTP for queries and mutations.
- GraphQL over WebSocket for subscriptions where enabled.
- REST and SSE endpoints for chat streaming and ingest events.

## Code map

- apps/web/src/app: Next.js routes and layouts.
- apps/web/src/features/auth: auth flows and session state.
- apps/web/src/features/chat: chat sessions, streaming, and message UI.
- apps/web/src/features/ingest: file upload and status views.
