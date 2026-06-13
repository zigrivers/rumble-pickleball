# Win % and W–L Record Columns — Design Spec

**Date:** 2026-06-13
**Status:** Approved design, pending implementation plan
**Scope:** Standings tables in `index.html` for Round Robin, Gauntlet, Stack, and King — live cards and done-screen tables.

---

## 1. Problem

The standings tables show a **W/G** column — wins per game, rendered as a 0–1 decimal (e.g. `0.8`). Players find the decimal unintuitive: it's really a win rate (a percentage), and when everyone has played the same number of games a plain win–loss record is clearer still. `0.8` forces mental math that `75%` or `6–2` does not.

## 2. Goals

- Replace the **W/G** decimal with a **W%** (win percentage) display in every standings table that currently shows W/G.
- Add a **W–L** (win–loss record) column alongside it.
- Apply this consistently across all formats that have a W/G column: **Round Robin, Gauntlet, Stack, King** — both the live standings card and the done-screen final-standings table.
- Keep mobile uncluttered.

## 3. Non-goals

- **No ranking/metric change.** Win rate remains the same tiebreaker it is today; only its *display* changes (W/G → W%), plus the new record column. No sort logic, no Adjusted Margin changes.
- **Crown is out of scope.** Crown ranks by match points and has no W/G column.
- **Other surfaces unchanged** (they show a single metric, not a W/G column): finals Seeds card, Champions podium, shareable results recap, snapshot export, and the "Most Points" MVP award.

## 4. The two values (uniform across all formats)

Both derive entirely from `wins` and `gp`, which every format's stats object already exposes (`computeStats`, `computeStackStats`, `computeKingStats`). Because no game can tie — pickleball is win-by-2, and Stack is win-by-1, both explicitly disallowing ties — every **decided** game a player appears in is either a win or a loss, and byes are excluded from `gp`. Therefore:

- **W–L (record)** — rendered `${wins}–${gp - wins}` using an en-dash, e.g. `6–2`. Losses are computed as `gp − wins` (no reliance on any `losses` field, so it's identical across all four formats). A 0-game player shows `0–0`.
- **W% (win percentage)** — `Math.round((wins / gp) × 100) + "%"`, e.g. `75%`. Use the existing `winRate` (`wins / Math.max(1, gp)`) as the source: `Math.round(winRate × 100) + "%"`. A 0-game player shows `0%`.

Both use the **same `wins`/`gp` basis as today's W/G**. On the done screen (subtitle "Includes finals games") that basis already includes finals games via `computeStats(totalRegularRounds(), true)`, so W–L and W% include finals there too — exactly like GP and the current W/G.

## 5. Column layout

In every target table, the single **W/G** column is replaced by two columns inserted at the same position: **W–L** then **W%**.

- **W–L** — always visible. Header `W–L`, `title="Win–loss record"`.
- **W%** — `col-hide-mobile`. Header `W%`, `title="Win percentage"`.

Because W–L is visible and W% hides on mobile, **the mobile column count is unchanged** (W–L simply takes W/G's slot; W% appears only on wider screens).

Per-format resulting layouts (✷ = `col-hide-mobile`):

| Format | Before | After |
|---|---|---|
| **RR / Gauntlet** | `#` · Player · GP · AM · **W/G** · +/–G✷ | `#` · Player · GP · AM · **W–L** · **W%✷** · +/–G✷ |
| **Stack** | `#` · Player · GP · SS/G · **W/G** · Climbs✷ · C1✷ | `#` · Player · GP · SS/G · **W–L** · **W%✷** · Climbs✷ · C1✷ |
| **King** | `#` · Player · GP · KS/G · **W/G** · 👑W✷ · PPG✷ | `#` · Player · GP · KS/G · **W–L** · **W%✷** · 👑W✷ · PPG✷ |

Each table also needs a matching `<col>` added to its `<colgroup>` for the extra column (reuse existing `num`/width classes; the W% `<col>`/`<th>`/`<td>` carry `col-hide-mobile`).

## 6. Affected render functions (6 tables)

| Format | Live card | Done-screen branch |
|---|---|---|
| RR / Gauntlet | `renderStandingsCard` | `renderDoneScreen` (RR/Gauntlet `else` branch) |
| Stack | `renderStackStandingsCard` | `renderDoneScreen` (Stack branch) |
| King | `renderKingStandingsCard` | `renderDoneScreen` (King branch) |

In each, for the header: replace the `W/G` `<th>` with a `W–L` `<th>` and a `W%` `<th>` (`col-hide-mobile`). For each row: replace the `s.winRate.toFixed(1)` `<td>` with a W–L `<td>` (`s.wins + "–" + (s.gp - s.wins)`) and a W% `<td>` (`Math.round(s.winRate * 100) + "%"`, `col-hide-mobile`). Add one `<col>` to the colgroup.

> The RR/Gauntlet done-screen branch uses `allStats` (from `computeStats(totalRegularRounds(), true)`) for `wins`/`gp`; the AM column already uses `marginBySlot`. W–L/W% read from `allStats` (`s.wins`, `s.gp`) — finals-inclusive, matching GP.

## 7. Test impact

- **`checkTable` (simulation, RR tournaments only) — must update.** It reads cells positionally. Today: `cells[3]`=AM, `cells[4]`=W/G, `cells[5]`=+/–G. After the change the RR/Gauntlet table is `# · Player · GP · AM · W–L · W% · +/–G`, so: `cells[3]`=AM, `cells[4]`=**W–L**, `cells[5]`=**W%**, `cells[6]`=**+/–G**. Update the row-mapping and the per-row assertion to:
  - `cells[4]` (W–L) === `e.w + "–" + (e.gp - e.w)`
  - `cells[5]` (W%) === `Math.round((e.w / Math.max(1, e.gp)) * 100) + "%"`
  - `cells[6]` (diff) === `fmtDiff(e.dg)` (moved from `cells[5]`)
  - `expectedTable` already exposes `w` and `gp` — **no change needed there**.
- **`checkWellFormedTable` (Stack/King/Gauntlet flex scenarios) — no change.** It only counts rows and checks unique names; column changes don't affect it.
- **RR display self-test** (`renderStandingsCard(2)` textContent check): extend the assertion to confirm the new columns render, e.g. assert the text contains a `W–L`/`W%`-style token (a regex like `/\d+–\d+/` for the record and `/%/` for the percent) in addition to `GP`/`AM`.
- No other self-test reads these tables' cells positionally.

## 8. Edge cases

- **0-game players** (ranked last): `0–0` and `0%`. `gp - wins = 0`, `winRate = 0`.
- **Rounding:** `Math.round` — `0.875 → 88%`, `0.75 → 75%`. (Display only; ranking still uses full-precision `winRate`.)
- **En-dash** `–` (U+2013) for the record, matching existing app typography (tier names, +/–G). Not a hyphen.
- **Done-screen finals inclusion:** W–L/W% include finals (same basis as GP), intentionally — consistent with the existing W/G there.

## 9. Verification

- **Unit (self-tests, `?test`):** RR display test confirms `W–L` and `W%` tokens render; existing suite stays green (only the pre-existing flaky `_reVerify` keep-awake assert may appear).
- **Simulation (`?simulate`):** `0 failure(s)` after updating `checkTable` to the new cell indices and W–L/W% derivations.
- **Manual smoke:** open RR, Stack, and King events; confirm each standings table (live and done) shows `W–L` and `W%` in place of `W/G`, that `W%` hides on a narrow viewport while `W–L` stays, and that values are correct (e.g. 6 wins of 8 → `6–2`, `75%`).
- **Browser-cache caution:** verify only against a freshly-served port with the browser closed/reloaded (the Playwright MCP browser caches `index.html` aggressively).

## 10. Open knobs (defaults chosen)

| Knob | Default |
|---|---|
| W% precision | integer percent (`Math.round`) |
| Record separator | en-dash `–` |
| Mobile | `W–L` visible, `W%` hidden (`col-hide-mobile`) |
| Column order | `… · format-metric · W–L · W% · …` (W/G's old slot) |
