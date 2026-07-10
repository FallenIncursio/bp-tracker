# Changelog

All notable changes to BP Tracker are documented here.

## 0.2.13 - 2026-07-10

- Fixed ignored Sirius spawn windows being reopened by spawn-plan backfill and kept wanted BPs only in the roadmap Discord status.

## 0.2.12 - 2026-07-10

- Deduplicated Discord wanted BP sections between roadmap and Sirius status, limited Sirius spawn windows to burst or overdue sources, and added a web action to ignore incorrect spawn windows.

## 0.2.11 - 2026-07-10

- Compact Sirius Discord status output with wanted hits first, shorter active planet rows, filtered open spawn windows, and delayed respawn text until a planet has burst.

## 0.2.10 - 2026-07-10

- Improved Discord status readability with icon section titles, summary counts, structured planet lines, and wanted-hit planet context.

## 0.2.9 - 2026-07-10

- Removed low-value Discord status sections for recent edits and compact missing counts.
- Added clan-level Discord status language settings for German, English, and Spanish output.
- Improved Discord status truncation so long fields do not cut through timestamp markup.

## 0.2.8 - 2026-07-09

- Moved the version details popover to the app overlay layer so it stays above Dashboard and Blueprint page content.

## 0.2.7 - 2026-07-09

- Fixed the version details popover so commit messages wrap cleanly and the panel no longer clips into the page content.

## 0.2.6 - 2026-07-09

- Allowed Sirius 2-slot drops to be saved with an unknown enemy.
- Included cosmetic Sirius pattern drops in the 18-slot selection while keeping them out of member status counts.
- Added feedback for saving Sirius drop edits and covered empty slot replacement.

## 0.2.5 - 2026-07-09

- Highlighted active Sirius blueprint rows on the dashboard when the logged-in user personally has the blueprint marked as wanted.

## 0.2.4 - 2026-07-09

- Corrected the German Ancient label and cosmetic pattern seed from Antik to Ancient.

## 0.2.3 - 2026-07-09

- Added missing Oolyte, Dolomyte, Clay, and Kenyte Materialisierer resource blueprints.
- Renamed Speed blueprints to Beschleuniger and Stun blueprints to Stunladung while keeping legacy aliases searchable.

## 0.2.2 - 2026-07-09

- Marked Sirius slot blueprints as Ancient rarity in seed data.
- Added clickable version details with commit metadata in the app footer.
- Made package metadata the app version source so env templates no longer need version updates.

## 0.2.1 - 2026-07-09

- Added sortable blueprint columns with mobile sort controls.
- Sorted blueprint slots numerically from 2-slot to 18-slot and back.

## 0.2.0 - 2026-07-09

- Added wanted blueprint alerts for active Sirius hits.
- Added Discord status-message guards and registration protections.
- Fixed clan roadmap note/time clearing and roadmap action menu dismissal.
- Replaced Sirius Rotation hover-only count tooltips with click/tap-friendly popovers.
- Added release version consistency checks and tag-based GitHub Release publishing.

## 0.1.0 - 2026-07-09

- Initial public release.
