# Deployment

This document describes production hosting and operations. For local development, see [development.md](development.md).

Planned main domain: `bp-tracker.arcenciel.io`

## Target Architecture

```text
Internet
   │
   ▼
Reverse proxy / TLS
   │
   ▼
Web container :8080
   │  /api/*
   ▼
API container :3000
   │
   ▼
PostgreSQL
```

The web container contains Nginx and forwards `/api/*` to the API container.

## Requirements

| Area | Recommendation |
| --- | --- |
| Host | Linux server with Docker and Docker Compose |
| TLS | External reverse proxy, for example Caddy, Traefik, or Nginx |
| Data | Persistent Docker volume or managed PostgreSQL |
| Backups | Regular PostgreSQL backups before updates and imports |

## Production Start

```bash
cp .env.example.docker .env
# Set POSTGRES_PASSWORD, SESSION_SECRET, and public URLs.
docker compose -f docker-compose.prod.yml up -d --build
```

The production Compose file publishes the web container on port `8080`. TLS and the public domain should be handled by a reverse proxy in front of it.

The API container loads `.env` via `env_file` and overrides central production values explicitly in the Compose file. This allows optional variables such as Discord, setup token, or import configuration to be maintained in `.env`.

## Required Secrets

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Password for the PostgreSQL user. |
| `SESSION_SECRET` | Secret for sessions. Must be long and random. |

For Discord, also set the variables described in [configuration.md](configuration.md).

Discord deployments usually use two clan-specific channels:

- a notification channel where the bot can mention linked users for wanted or missing blueprint hits
- a status channel where the bot maintains pinned roadmap and Sirius overview messages without pings

The status channel should normally be writable only by the bot and readable by clan members.

## First Admin Account

As long as no global `ADMIN` exists, the setup flow is enabled. `FIRST_ADMIN_SETUP_TOKEN` can be set to require a token for first-admin creation.

After the first admin exists, user management is role based:

- registrations create `PENDING` memberships
- admins, admirals, or commanders approve users
- roles below `ADMIN` are clan-scoped

## Database Updates

Before app updates:

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

Production databases should use controlled Prisma migrations. The development stack uses `prisma db push`, which is convenient for development but not the preferred production workflow.

## Backups

Simple volume backup with `pg_dump`:

```bash
docker exec bp-tracker-postgres-1 pg_dump -U bp_tracker -d bp_tracker > bp_tracker_backup.sql
```

Restore example:

```bash
docker exec -i bp-tracker-postgres-1 psql -U bp_tracker -d bp_tracker < bp_tracker_backup.sql
```

Check service names first if the Compose project name differs.

## Private Data In Production

Public deployments start with neutral seed data. Clan-specific users, memberships, blueprint statuses, Sirius rotations, and historical source snapshots are operational data and should stay in the production database or deployment-local private tooling.

Important rules:

- Create a backup before large data changes.
- Confirm that operational scripts point at the intended database URL.
- Newly created users should change their password after first login.
- Do not commit clan exports or source snapshots to the public repository.

## Health Checks

```bash
curl https://bp-tracker.arcenciel.io/api/health
```

API documentation:

```text
https://bp-tracker.arcenciel.io/api/docs
https://bp-tracker.arcenciel.io/api/openapi.json
```

Local Compose port:

```bash
curl http://localhost:3000/api/health
```

## Operations Checklist

- `.env` no longer contains placeholder secrets.
- `POSTGRES_PASSWORD` and `SESSION_SECRET` are long and unique.
- The reverse proxy terminates TLS and forwards to `localhost:8080`.
- Backups are tested.
- First-admin setup is complete.
- Discord redirect URI exactly matches the public domain.
- Discord bot has channel permissions for messages, embeds, and optional pinning.
