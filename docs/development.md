# Development

This document is the developer onboarding guide. It explains how to run the app locally, how the workspaces are structured, and which checks should run before changes are submitted.

## Requirements

| Tool | Version / note |
| --- | --- |
| Node.js | `>=22.12 <27`; Node 24 LTS is the recommended runtime. |
| npm | `>=11` |
| Docker | Recommended for PostgreSQL and the full dev stack |
| PowerShell | Windows examples use PowerShell syntax |

## Project Structure

```text
bp-tracker/
├─ apps/
│  ├─ api/              Express API, Prisma, API tests
│  └─ web/              Vue/Vite frontend
├─ packages/
│  └─ contracts/        Shared Zod schemas and types
├─ data/
│  ├─ seeds/            Neutral master data
│  ├─ imports/          Ignored local operator files
│  └─ source-snapshots/ Ignored local source snapshots
├─ docs/                Project and operations documentation
├─ infra/nginx/         Nginx config for the web image
└─ scripts/             Local quality scripts
```

## Recommended Dev Flow

For active development, the most practical flow is:

1. Start PostgreSQL with Docker.
2. Run the API and web app locally with npm.
3. Use the full Docker stack as a final compatibility check.

### PostgreSQL Only Via Docker

```bash
docker compose -f docker-compose.dev.yml up -d postgres
cp .env.example .env
npm install
```

If the app runs on the host and connects to Docker PostgreSQL, `.env` must use the published host port:

```env
DATABASE_URL=postgresql://bp_tracker:bp_tracker@localhost:5433/bp_tracker
DIRECT_DATABASE_URL=postgresql://bp_tracker:bp_tracker@localhost:5433/bp_tracker
```

Then run:

```bash
npm run prisma:generate
npm run prisma:push
npm run seed
npm run dev
```

### Full Docker Dev Stack

```bash
cp .env.example.docker .env
docker compose -f docker-compose.dev.yml up -d --build
```

Ports:

| Service | URL |
| --- | --- |
| Web | http://localhost:5173 |
| API | http://localhost:3000 |
| API docs | http://localhost:3000/api/docs |
| OpenAPI JSON | http://localhost:3000/api/openapi.json |
| PostgreSQL from host | `localhost:5433` |

Important: the dev images copy the source code during build. Local code changes only become visible in the Docker dev stack after rebuilding the affected images.

```bash
docker compose -f docker-compose.dev.yml up -d --build api web
```

## Workspaces

| Workspace | Purpose |
| --- | --- |
| `@bp-tracker/contracts` | Shared API contracts, validation, and types. |
| `@bp-tracker/api` | Express routes, auth, Prisma, notifications. |
| `@bp-tracker/web` | Vue app, pages, components, i18n, web tests. |

Root scripts usually delegate to these workspaces.

## Script Reference

| Command | Purpose |
| --- | --- |
| `npm run dev` | Builds contracts and starts API + web locally. |
| `npm run build` | Builds contracts, API, and web. |
| `npm run typecheck` | Runs type checks across all workspaces. |
| `npm run lint` | Alias for typecheck. |
| `npm test` | Runs Vitest suites across all workspaces. |
| `npm run test:coverage` | Runs coverage with 100% thresholds from the Vitest configs. |
| `npm run audit:web` | Runs the browser audit for accessibility, SEO basics, and performance budgets. |
| `npm run legacy:audit` | Compares a legacy bot `blueprint.json` dump against neutral seed data without writing to the database. |
| `npm run prisma:generate` | Generates the Prisma client. |
| `npm run prisma:push` | Pushes the schema to a dev database. |
| `npm run prisma:migrate` | Deploys migrations. |
| `npm run seed` | Loads neutral master data. |

Workspace-specific commands use `-w`, for example:

```bash
npm run test -w @bp-tracker/api
npm run typecheck -w @bp-tracker/web
```

## Database and Prisma

| Situation | Command |
| --- | --- |
| Prisma client is missing or stale | `npm run prisma:generate` |
| Quickly sync a dev database | `npm run prisma:push` |
| Develop a local migration | `npm run prisma:dev -w @bp-tracker/api` |
| Deploy migrations | `npm run prisma:migrate` |
| Load master data | `npm run seed` |

The Docker dev stack automatically runs `prisma:push -- --accept-data-loss` and `seed` when the API starts. Production databases should use migrations instead.

## API Docs

The API exposes OpenAPI documentation at:

```text
http://localhost:3000/api/docs
http://localhost:3000/api/openapi.json
```

Update `apps/api/src/openapi/spec.ts` when adding or changing routes. Request schemas should come from `packages/contracts` whenever possible.

## Tests and Quality

```bash
npm run typecheck
npm test
npm run test:coverage
```

The web audit requires a running web app:

```bash
npm run audit:web
```

Optional targets and budgets:

```bash
BP_TRACKER_AUDIT_URL=http://localhost:5173 npm run audit:web
BP_TRACKER_AUDIT_MAX_LOAD_MS=4000 BP_TRACKER_AUDIT_MAX_TRANSFER_KB=1200 npm run audit:web
```

The audit checks:

- Axe accessibility findings
- form controls without `id` or `name`
- basic SEO such as title, meta description, and H1 structure
- browser performance budgets

Legacy blueprint catalog research can be run with a local old bot dump:

```bash
npm run legacy:audit -- "C:\path\to\blueprint.json"
```

The generated reports are written under `work/legacy-blueprint-audit` by default and are ignored by Git.

## Troubleshooting

| Problem | Cause / fix |
| --- | --- |
| `Can't reach database server at postgres` | `postgres` is the Docker-internal hostname. From the host, use `localhost:5433`. |
| `ECONNREFUSED localhost:3000` | The API is not running yet or the API container is still starting. Check logs with `docker compose -f docker-compose.dev.yml logs api`. |
| Prisma types do not match the schema | Run `npm run prisma:generate`. |
| Docker stack shows old web/API changes | Rebuild the dev images or run locally with `npm run dev`. |
| First admin is missing | Open the app and complete the setup flow. Optionally set `FIRST_ADMIN_SETUP_TOKEN`. |
