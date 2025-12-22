# Auth Module Overview

The Auth module provides JWT-based authentication for HTTP and GraphQL clients. It issues access and refresh tokens, validates requests via guards, and injects user context into resolvers and controllers.

## Endpoints

- POST /v1/auth/login: validate credentials and return tokens.
- POST /v1/auth/refresh: issue new tokens using a refresh token.
- GET /v1/auth/me: return the current user payload.

## Integration points

- JwtAuthGuard protects REST controllers and GraphQL resolvers.
- RefreshJwtAuthGuard protects the refresh endpoint.
- CurrentUser decorator exposes the authenticated user in handlers.

## Configuration (env)

- JWT_SECRET, JWT_EXPIRES_IN
- REFRESH_JWT_SECRET, REFRESH_JWT_EXPIRES_IN
- JWT_ISSUER, JWT_AUDIENCE
