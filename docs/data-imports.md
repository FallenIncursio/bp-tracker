# Data Policy

The public repository ships neutral application data only. Clan member lists, blueprint ownership, wish lists, Sirius rotations, drop history, and source exports are private deployment data.

## Public Seed Data

Seed data lives in `data/seeds/` and is safe to publish.

| File | Purpose |
| --- | --- |
| `blueprints.json` | Global blueprint catalog, systems, slots, rarity, aliases, and translations. |
| `ships.json` | Ship definitions used by the BP checker. |
| `sirius-planets.json` | Known Sirius planet names and ring metadata. |

Load or refresh neutral master data with:

```bash
npm run seed
```

The seed script is idempotent. It creates or updates neutral master data and does not replace clan-specific users, memberships, blueprint statuses, active rotations, or drop evidence.

## Private Data Boundary

Private clan data should be created through the app UI or handled by deployment-local tooling outside this repository.

Do not commit:

- registered users, member names, or membership lists
- member blueprint status or wish lists
- active Sirius rotations or clan roadmap entries
- clan-specific drop history
- exported spreadsheets, source snapshots, screenshots, or one-off migration files

`data/imports/` and `data/source-snapshots/` exist only as ignored local operator folders. They are useful during private deployments, but their contents must stay out of the public repository.

## No Generic Clan Importer

BP Tracker does not ship a generic Excel, CSV, or Google Sheets importer. Clan sheets usually have different layouts and naming rules, so a generic importer would be more likely to silently corrupt data than to help.

If a clan needs a migration, keep it deployment-local and explicit about the source format. A public importer should only be added when BP Tracker owns the input schema, validates every row, provides a preview, and has tests with neutral fixture data.

## Optional Catalog Audit

The repository includes one read-only research tool:

```bash
npm run legacy:audit -- "C:\path\to\blueprint.json"
```

This script compares an old NRNF-style bot blueprint catalog against the neutral BP Tracker seed catalog. It does not write to the database and should not be used for clan member imports.

Generated reports are written to `work/legacy-blueprint-audit` by default. `work/` is ignored by Git.
