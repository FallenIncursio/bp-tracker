# API Documentation

BP Tracker exposes an OpenAPI 3.1 document from the API service.

| Endpoint | Purpose |
| --- | --- |
| `/api/docs` | Interactive Swagger UI. |
| `/api/openapi.json` | Raw OpenAPI JSON for tools and client generation. |

Local Docker URLs:

| Endpoint | URL |
| --- | --- |
| Swagger UI | http://localhost:3000/api/docs |
| OpenAPI JSON | http://localhost:3000/api/openapi.json |

## Authentication

The API uses an HTTP-only session cookie. Login, registration, first-admin setup, and Discord OAuth can all create a session. The OpenAPI security scheme is named `cookieAuth` and uses the configured `COOKIE_NAME`.

Protected endpoints include role hints through `x-required-role`, for example:

- `Authenticated user`
- `Global ADMIN`
- `Clan ADMIRAL`
- `Clan COMMANDER`

## Discord Status Publishing

Clan admirals can configure Discord channels through the clan endpoints. The notification channel is for user alerts. The status channel is for maintained overview messages.

| Endpoint | Role | Purpose |
| --- | --- | --- |
| `GET /api/clans/{clanId}/discord-settings` | `Clan ADMIRAL` | Read notification and status-channel settings. |
| `PATCH /api/clans/{clanId}/discord-settings` | `Clan ADMIRAL` | Save notification channel, status channel, and pin preference. |
| `GET /api/clans/{clanId}/discord-channels` | `Clan ADMIRAL` | List bot-visible Discord text channels for a server. |
| `POST /api/clans/{clanId}/discord-settings/test` | `Clan ADMIRAL` | Send a notification-channel test message. |
| `POST /api/clans/{clanId}/discord-settings/status/publish` | `Clan ADMIRAL` | Publish or recreate the roadmap and Sirius status messages. |

The status messages use Discord timestamps and `allowed_mentions: { parse: [] }`, so linked user mentions can be displayed without notifying them.

## Schema Source

Request body schemas are generated from the shared Zod contracts where possible. These contracts live in `packages/contracts` and are reused by the API and frontend.

Response schemas are documented conservatively. Stable public DTOs such as auth users, clans, blueprints, Sirius appearances, and notification preferences are described explicitly. Some database-shaped responses are intentionally described as flexible objects until they are promoted to shared response contracts.

## Maintenance Rules

When adding or changing API routes:

1. Update `apps/api/src/openapi/spec.ts`.
2. Reuse a shared contract from `packages/contracts` for request bodies when possible.
3. Add or adjust OpenAPI tests in `apps/api/tests/openapi.test.ts`.
4. Run `npm run typecheck -w @bp-tracker/api` and `npm run test -w @bp-tracker/api`.
