# Contributing

Thanks for contributing to BP Tracker. These rules keep changes understandable and the app stable.

## Before Changing Code

1. Clarify the issue or goal.
2. Check the existing patterns in the relevant workspace.
3. Update the documentation when changing data models, permissions, setup, or operations.

## Local Checks

```bash
npm run typecheck
npm test
npm run build
```

For UI changes, also run:

```bash
npm run audit:web
```

The web audit expects a running app at `http://localhost:5173`, unless `BP_TRACKER_AUDIT_URL` is set.

## Development Rules

- Do not commit secrets.
- Do not commit clan-specific users, member names, blueprint ownership, active rotations, private exports, or source snapshots.
- Update `.env.example` and [docs/configuration.md](docs/configuration.md) when adding environment variables.
- Update [docs/roles.md](docs/roles.md) when permissions change.
- Update [docs/data-model.md](docs/data-model.md) when Prisma models or central status values change.
- Keep seed data neutral and avoid committing clan-specific operational data.
- UI text must support all locales in `apps/web/src/i18n/locales.ts` (`de`, `en`, and `es` today).
- Until the first public release, schema cleanup may update the single initial migration. After the first public release, add forward-only migrations instead of rewriting existing migration files.

## Pull Requests

A good pull request includes:

- a short change summary
- screenshots for UI changes
- executed checks
- notes about migrations or operational data changes

Run the relevant checks before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
```

For UI changes, also run:

```bash
npm run audit:web
```
