# Configuration

The app reads configuration from `.env`. Two templates are provided:

| File                  | Use case                                           |
| --------------------- | -------------------------------------------------- |
| `.env.example`        | Host-based development with local Node processes.  |
| `.env.example.docker` | Docker Compose development or production baseline. |

Never commit secrets.

## Base Settings

| Variable          | Example                 | Purpose                                       |
| ----------------- | ----------------------- | --------------------------------------------- |
| `NODE_ENV`        | `development`           | Runtime mode. Use `production` in production. |
| `PUBLIC_BASE_URL` | `http://localhost:5173` | Public web URL for links and redirects.       |
| `API_BASE_URL`    | `http://localhost:3000` | Public API URL, used for OAuth fallbacks.     |
| `CORS_ORIGIN`     | `http://localhost:5173` | Allowed web origin for the API.               |
| `PORT`            | `3000`                  | API port inside the process/container.        |
| `COOKIE_NAME`     | `bp_tracker_session`    | Session cookie name.                          |

The OpenAPI security scheme uses `COOKIE_NAME` for session-cookie authentication. API docs are served by the API at `/api/docs` and `/api/openapi.json`.

## Database

| Variable              | Host dev                                                       | Docker-internal                                               |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`        | `postgresql://bp_tracker:bp_tracker@localhost:5433/bp_tracker` | `postgresql://bp_tracker:bp_tracker@postgres:5432/bp_tracker` |
| `DIRECT_DATABASE_URL` | same as `DATABASE_URL`                                         | same as `DATABASE_URL`                                        |

Notes:

- `postgres` only works inside the Docker network.
- From the Windows host, Docker PostgreSQL is available at `localhost:5433`.
- A natively installed PostgreSQL often uses `localhost:5432`.

## Auth and Setup

| Variable                  | Required        | Purpose                                                    |
| ------------------------- | --------------- | ---------------------------------------------------------- |
| `SESSION_SECRET`          | Production: yes | Secret used to protect sessions. Must be long and private. |
| `FIRST_ADMIN_SETUP_TOKEN` | Optional        | If set, the first-admin setup requires this token.         |

As long as no global `ADMIN` exists, the setup flow is enabled. After the first admin exists, this setup path is closed.

## Discord

| Variable                     | Required for Discord      | Purpose                                                                                  |
| ---------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `DISCORD_CLIENT_ID`          | Yes                       | OAuth2 client ID.                                                                        |
| `DISCORD_CLIENT_SECRET`      | Yes                       | OAuth2 client secret.                                                                    |
| `DISCORD_REDIRECT_URI`       | Yes                       | Callback, e.g. `https://bp-tracker.arcenciel.io/api/auth/discord/callback`.              |
| `DISCORD_OAUTH_STATE_SECRET` | Recommended               | Secret used to sign OAuth state. Should be set in production.                            |
| `DISCORD_BOT_TOKEN`          | Only for Discord messages | Bot token for notification messages, status messages, test messages, and channel lookup. |
| `DISCORD_ALLOWED_GUILD_IDS`  | Optional                  | Comma-separated allowlist for Discord servers.                                           |

The OAuth flow stores profile metadata such as Discord ID, username, and avatar hash. Discord access tokens are not persisted.

Clan Discord settings are configured in the Admin page:

- The notification channel is used for user-facing alerts and may mention linked Discord users.
- The status channel is used for two maintained bot messages: clan roadmap and Sirius status. These messages intentionally disable pings and can be pinned by the bot.
- The channel name fields are display-only convenience labels. The channel ID is the value used for delivery.

The bot needs access to the selected server and the selected channels. Required permissions are:

- View Channel
- Send Messages
- Embed Links
- Read Message History
- Manage Messages, only if status messages should be pinned

## Web Build

| Variable                    | Example                                        | Purpose                             |
| --------------------------- | ---------------------------------------------- | ----------------------------------- |
| `VITE_GITHUB_URL`           | `https://github.com/FallenIncursio/bp-tracker` | Link shown in app navigation/about. |
| `VITE_PROJECT_HOMEPAGE_URL` | `https://bp-tracker.arcenciel.io`              | Public project/app URL.             |
| `VITE_APP_VERSION`          | `0.2.1`                                        | Displayed app version.              |

`VITE_*` variables are embedded at web build time. Rebuild the web image after changing them.

## Audit Variables

| Variable                           | Default                 | Purpose                          |
| ---------------------------------- | ----------------------- | -------------------------------- |
| `BP_TRACKER_AUDIT_URL`             | `http://localhost:5173` | Target URL for the web audit.    |
| `BP_TRACKER_AUDIT_ROUTES`          | main app routes         | Comma-separated route list.      |
| `BP_TRACKER_AUDIT_MAX_LOAD_MS`     | `6000`                  | Maximum load time.               |
| `BP_TRACKER_AUDIT_MAX_DCL_MS`      | `3500`                  | Maximum DOMContentLoaded budget. |
| `BP_TRACKER_AUDIT_MAX_TRANSFER_KB` | `9000`                  | Maximum transfer size.           |
| `BP_TRACKER_AUDIT_MAX_DOM_NODES`   | `5000`                  | Maximum DOM size.                |
