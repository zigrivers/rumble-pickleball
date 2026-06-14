# Index Boundaries

## Purpose

`index.html` is still the deployed app, but contributors should treat it as ordered internal regions. These sentinels mark the file's **actual contiguous blocks**. The file is not organized strictly by responsibility, so each boundary name describes where code physically lives, not an idealized layer.

## Boundaries

| Boundary | Responsibility (actual contents) | Sentinel |
| --- | --- | --- |
| Style | HTML skeleton + all CSS (the `<style>` block) | `RUMBLE:STYLE` |
| State | storage keys + top-level state constants | `RUMBLE:STATE` |
| Tests | inline self-tests + simulation harness (`runSelfTests`, `runSimulation`) | `RUMBLE:TESTS` |
| Core | state shape, persistence, scheduling core (`newState`, `backfillStateDefaults`, `load`, `save`, `makeScheduleSeed`) | `RUMBLE:CORE` |
| Formats | per-format engines + stats + schedule generation (Stack/King/Crown, RR schedule) | `RUMBLE:FORMATS` |
| Stats | cross-format stats & ranking (`computeStats`, `rankPlayersForFormat`, `finalRanking`) | `RUMBLE:STATS` |
| Lifetime | phone-keyed lifetime ledger, recording, aggregation, sync | `RUMBLE:LIFETIME` |
| Render | setup/play/finals/done rendering, plus awards (`render`, `computeAwards`) | `RUMBLE:RENDER` |
| Modals | settings, schedule, help, dialogs (`openSettings`, modal helpers) | `RUMBLE:MODALS` |
| Boot | initial render, display-mode refresh, service-worker registration | `RUMBLE:BOOT` |

## Rule

New work should extend the nearest existing boundary. Cross-boundary helpers should be pure and named. Sentinels are ordered and non-overlapping; `npm run check:index` verifies this.

## Note

The file is **not** physically ordered by responsibility. For example, `STATE` here marks only the storage constants near the top of the script; the state *logic* (`newState`/`load`/`save`/`backfillStateDefaults`) lives under `CORE`, after the `TESTS` block; and `computeAwards` lives under `RENDER`, not `STATS`. The sentinels deliberately mark real contiguous blocks so navigation and the boundary check stay honest. A future source-split may reorganize these regions.
