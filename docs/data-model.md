# Data Model

The app separates global master data, clan-specific data, and user-specific state. This allows one installation to serve multiple clans without mixing roles or blueprint status values.

## Overview

| Area | Models | Description |
| --- | --- | --- |
| Master data | `GameSystem`, `BlueprintItemType`, `Blueprint`, `BlueprintAlias`, `SiriusPlanet`, `Ship`, `ShipRequiredBlueprint` | Neutral Pirate Galaxy data shared by all clans. |
| Clans | `Clan`, `ClanMembership`, `ClanDiscordSettings` | Clan structure, roles, approvals, and Discord channel configuration. |
| Users | `User`, `Session`, `UserBlueprintStatus` | Login, sessions, and personal blueprint status values. |
| Sirius | `SiriusPlanetAppearance`, `SiriusPlanetBlueprintSlot`, `SiriusDropEvent`, `SiriusDropEvidence` | Active planet runs, slots, and historical drops. |
| Notifications | `Notification`, `NotificationPreference` | In-app and Discord notifications. |

## Status Values

| Status | UI label | Meaning |
| --- | --- | --- |
| `MISSING` | `fehlt` / missing | The user does not own the blueprint yet. |
| `OWNED` | `voll` / owned | The user owns the blueprint completely. |
| `WANTED` | `Wunsch` / wanted | The user wants this blueprint prioritized. |

A missing database row is treated as `MISSING`. A separate `UNKNOWN` status is not offered as a usable UI state.

## Multi-Clan Principle

`ADMIN` is global. All other permissions are represented through `ClanMembership`.

```text
User
  ├─ globalRole: ADMIN | null
  └─ memberships[]
       ├─ clanId
       ├─ role: ADMIRAL | COMMANDER | MEMBER
       └─ status: PENDING | ACTIVE | REJECTED
```

A user can have different roles in different clans. Admirals and commanders only affect their own clan.

`ClanDiscordSettings` stores separate notification and status channels. The status-channel fields keep the Discord message IDs for the maintained roadmap and Sirius overview posts, so the bot can edit existing messages instead of creating noisy duplicates.

## Blueprints

`Blueprint` contains the canonical blueprint record:

- localized labels and source aliases
- system
- item type
- Sirius slot group
- required parts
- special, cosmetic, or ship relationship

`BlueprintAlias` covers alternative spellings from sources and old sheets.

`UserBlueprintStatus` connects users and blueprints. This keeps blueprint inventory per user independent from clan membership. The checker then evaluates the active members of the selected clan.

## Sirius Rotation

`SiriusPlanetAppearance` describes one concrete planet run:

- clan
- planet
- ring
- active period
- next spawn
- notes

`SiriusPlanetBlueprintSlot` describes the slots for that run:

- slot group, e.g. `SLOT_18`, `SLOT_14`, `SLOT_12`, `SLOT_5`, `SLOT_2`
- enemy for 2er slots, e.g. `SORIS`, `AMARNA`, `GIZA`
- blueprint
- source and confidence

## Drop History Ledger

Sirius drops are stored in a ledger in addition to active planet runs.

| Model | Responsibility |
| --- | --- |
| `SiriusDropEvent` | Deduplicated drop: clan, planet, blueprint, slot, drop timestamp. |
| `SiriusDropEvidence` | Evidence for a drop: source, snapshot, row, timestamp. |

The ledger makes it possible to:

- show the last drops for a blueprint
- calculate drop age
- merge multiple evidence records for one drop
- keep destroyed planets useful for history and planning

## Seed Relationship

Neutral master data comes from `data/seeds`. Clan-specific data is created through the app or deployment-local private tooling. See [data-imports.md](data-imports.md) for details.
