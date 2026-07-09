# BP Tracker

Open-source blueprint tracker for Pirate Galaxy with multi-clan support, Sirius rotation tracking, a blueprint checker, and optional Discord integration.

Planned public instance: [bp-tracker.arcenciel.io](https://bp-tracker.arcenciel.io)  
Repository: [github.com/FallenIncursio/bp-tracker](https://github.com/FallenIncursio/bp-tracker)

## Features

| Area | Summary |
| --- | --- |
| Multi-clan | Clans have separate members, roles, Sirius rotations, and Discord settings. |
| Blueprints | Users maintain their own blueprint status: missing, owned, or wanted. |
| Sirius | Ring and slot rules, enemies, planet timers, drop history, and fast active-run entry. |
| BP Checker | Checks ships, systems, and special groups against the selected clan inventory. |
| Roles | Global admin plus clan-scoped admirals, commanders, and members. |
| Discord | Login, registration, account linking, clan-channel notifications, and maintained status-channel overviews. |
| UI | Dark mode, German/English/Spanish localization, tooltips, help, and about pages. |

## Stack

| Layer | Technology |
| --- | --- |
| Web | Vue 3, Vite, TypeScript, Vue Router, Vue I18n |
| API | Express 5, TypeScript, Zod |
| Database | PostgreSQL, Prisma |
| Tests | Vitest, Playwright/Axe web audit |
| Runtime | Docker Compose, Nginx for the web image |

## Quick Start With Docker

```bash
cp .env.example.docker .env
docker compose -f docker-compose.dev.yml up -d --build
```

Then open:

| Service | URL |
| --- | --- |
| Web | http://localhost:5173 |
| API | http://localhost:3000 |
| Health | http://localhost:3000/api/health |
| API Docs | http://localhost:3000/api/docs |
| PostgreSQL from host | `localhost:5433` |

As long as no global admin exists, the app shows the first-admin setup flow.

## Documentation

| Document | Purpose |
| --- | --- |
| [Development](docs/development.md) | Local setup, workspaces, scripts, Prisma, tests, and troubleshooting. |
| [Configuration](docs/configuration.md) | `.env` variables, Discord, database URLs, and secrets. |
| [Deployment](docs/deployment.md) | Production with Docker Compose, reverse proxy, backups, and operations. |
| [API Documentation](docs/api.md) | OpenAPI JSON, Swagger UI, authentication, and maintenance rules. |
| [Data and Seeds](docs/data-imports.md) | Public seed data and the boundary for private clan data. |
| [Data Model](docs/data-model.md) | Domain model, status values, and the Sirius drop ledger. |
| [Roles](docs/roles.md) | Permissions for admin, admiral, commander, member, and guests. |
| [Contributing](CONTRIBUTING.md) | Contribution rules, quality checks, and documentation maintenance. |

## Common Commands

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run test:coverage
npm run audit:web
npm run build
```

See [docs/development.md](docs/development.md) for prerequisites, database setup, and quality checks.

## License

MIT
