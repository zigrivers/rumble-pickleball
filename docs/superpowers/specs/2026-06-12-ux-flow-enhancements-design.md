# Setup And Run UX Enhancements - Design

## Goal

Improve Rumble's setup, live tournament, settings, standings, and finals UI without changing scheduling, ranking, scoring, storage compatibility, or the 8-player/2-court golden path behavior.

## Scope

This spec covers ten UI/UX enhancements:

1. Progressive setup flow
2. Phone fields collapsed by default
3. Roster paste preview with duplicate detection
4. Format recommendation helper
5. Tournament command bar
6. Scoreboard vs details standings toggle
7. Dedicated roster panel during play
8. Settings split into Event Controls and App Settings
9. Finals board redesign
10. Non-Crown final action rename

All changes stay in the existing single-file app, `index.html`, with docs updated only when a visible workflow changes. No dependencies, framework, build step, backend, or scheduling algorithm changes are introduced.

## UX Principles

- **Organizer-first:** optimize for someone running an event courtside while people are waiting.
- **Progressive disclosure:** show the main path first; keep advanced controls one tap away.
- **Preserve confidence:** every screen should make the next required action obvious.
- **Do not hide state:** collapsed UI must still summarize hidden settings, phone counts, byes, or incomplete scores.
- **Golden path unchanged:** 8 players, 2 courts, Round Robin scheduling, ranking, finals, and scoring behavior remain behaviorally identical.

## Approaches Considered

### Approach A: Small Surface Polish

This would keep the current setup, settings, standings, and finals structure, then add small local improvements such as hiding phones and renaming the finals button. It is low risk, but it does not solve the larger density problem that flexible players/courts introduced.

### Approach B: Progressive Operational UI

This is the recommended approach. It keeps the single-file app and current algorithms, but introduces clearer surfaces: guided setup, a live command bar, a dedicated roster panel, split settings, and a finals board. It improves scan speed without replacing the proven tournament model.

### Approach C: Full IA Rewrite

This would rebuild Rumble around separate Setup, Run, and Review pages with more persistent navigation. It could produce the cleanest long-term product shape, but it is too broad for the current codebase and risks disturbing golden-path behavior.

## Current Anchors

- Setup surface: `renderSetup()`, `renderFormatChooser()`, `renderTimeBudgetBlock()`, `canStart()`, `updateStartState()`
- Paste flow: `openPasteModal()`, `parsePastedNames()`
- Live play: `renderPlaying()`, `renderRoundCourts()`, `renderCourtCard()`
- Standings: `renderStandingsCard()`, `renderStackStandingsCard()`, `renderKingStandingsCard()`, `renderCrownStandingsCard()`
- Finals: `renderFinalsScreen()`, `buildFinals()`, `finalTiers()`, `finalRanking()`
- Settings and roster management: `openSettings()`, `addMidEventPlayer()`, `markPlayerLeft()`, `returnMidEventPlayer()`, `changeCourtCountMidEvent()`
- Tests and simulations: `runSelfTests()` and `runSimulation()`

## State Additions

State additions are UI preferences only. They must not affect scheduling output.

```js
setupStep: "format" | "roster" | "options",
setupContactMode: false,
standingsMode: "scoreboard" | "details",
settingsTab: "event" | "app"
```

Backfill defaults in `backfillStateDefaults(obj)`. Existing saves with no fields get:

- `setupStep: "format"`
- `setupContactMode: false`
- `standingsMode: "scoreboard"`
- `settingsTab: "event"`

If any setup phone value is present, setup renders in contact mode even when `setupContactMode` is false, so saved phone data is never hidden without a visible summary.

## Enhancement Designs

### 1. Progressive Setup Flow

Setup becomes a guided three-section flow:

1. **Format:** format chooser, courts stepper, fit line, format recommendation, round count controls.
2. **Roster:** player count, names, paste/import controls, phone mode summary.
3. **Options:** time budget and scoring settings.

The flow is not a hard wizard. Completed sections collapse to summaries and can be reopened. The Start Tournament button stays below the active setup content and remains governed by `canStart()`.

Default state on a new tournament is `setupStep: "format"`. Selecting a format or changing courts keeps the user in Format. Tapping Continue moves to Roster. Valid roster names move to Options. Start is enabled anywhere once `canStart()` is true.

Crown keeps its existing exact-4-player, one-court rule. The Crown flow still shows Format, Roster, and Options, but the courts summary states that Crown always uses one court.

### 2. Phone Fields Collapsed By Default

Fresh setup rows show only player names. A compact setup action shows one of:

- `Add phones` when no phone numbers are present
- `Phones: N saved` when at least one setup phone exists
- `Hide phones` when contact mode is expanded

When expanded, each roster row shows its phone input using the current `rawPhones`, roster autofill, and normalization behavior. Collapsing phones never deletes values. Pasted phone numbers automatically expand contact mode after import so the organizer can review them.

Mid-event Add Player phone input remains visible in the roster panel because it is a single operational row, not a full setup roster.

### 3. Roster Paste Preview

The paste modal changes from immediate fill to preview-then-apply.

Accepted input:

- One name per line
- Comma-separated names on one line
- Spreadsheet rows copied as tab-separated or comma-separated cells
- Rows with name and phone in either order, as long as exactly one cell looks phone-like

Parsing rules:

- Trim whitespace and ignore blank rows.
- Normalize phone values through existing `normalizePhone()`.
- A row's name is the first non-phone cell after trimming.
- A row's phone is the first valid phone-like cell.
- Duplicate names are detected case-insensitively after trimming repeated spaces.
- The first occurrence of a duplicate is kept; later duplicates are shown as skipped.
- If fewer than the required setup count remain after skips, Apply is disabled with a clear count message.
- If more than the required setup count remain, Apply uses the first required count and shows the remaining rows as skipped.

The preview lists applied rows and skipped rows. Applying writes `state.rawNames[]` and `state.rawPhones[]` for visible setup rows only, preserving extra rows for format switches.

### 4. Format Recommendation Helper

The format chooser gains a short recommendation line and optional per-format badges. The helper is advisory only; it does not auto-select formats.

Inputs:

- `state.format`
- setup roster count
- effective court count
- selected round count for each format
- time budget status and minutes, when enabled

Recommended heuristics:

- **Round Robin:** best for social balance when the roster can complete the selected rounds with reasonable byes.
- **King / Stack:** best for competitive movement, especially with larger rosters or shorter time budgets.
- **Gauntlet:** best when a ranked ladder feel is desired and repeated re-ranking is acceptable.
- **Crown:** recommended only at exactly 4 players.

The helper text is intentionally short: one sentence plus a reason, such as `Recommended: Round Robin - everyone rotates partners and the current setup has only one bye per round.`

### 5. Tournament Command Bar

During `phase === "playing"` and `phase === "finals"`, render a sticky command bar beneath the header.

Playing bar content:

- Format name
- Current round and total rounds
- Completed courts count, for example `2/3 courts done`
- Bye count or names summary when byes exist
- Next action: enter missing scores, advance round, build finals, or review tie

Finals bar content:

- `Finals`
- Completed finals count
- Next action: enter missing scores or finish tournament

The bar may include compact buttons for Roster and Schedule once those surfaces exist. It must not duplicate the large primary round button; it summarizes and provides navigation.

### 6. Scoreboard Vs Details Toggle

Standings default to `scoreboard` mode for scan speed. A segmented control in each standings card switches between:

- **Scoreboard:** rank, player, GP, W-L, main score metric, and point differential when available.
- **Details:** current detailed tables, including partner chips, partner counts, trajectories, per-game rates, court-specific stats, and departed labels.

Mode is persisted in `state.standingsMode` and applied consistently to live standings, finals seed summaries only where standings cards are reused, and done-screen final standings if that screen uses the same renderer. Crown may keep a single details-style table if its standings are already compact, but the toggle should not crash in Crown.

### 7. Dedicated Roster Panel During Play

Move mid-event roster operations out of Settings into `openRosterPanel()`. It is available during `phase === "playing"` for non-Crown formats.

The roster panel contains:

- Active players with Leave buttons
- Departed players with Return buttons
- Court count selector for next round
- Add Player row
- Inline validation errors

Behavior must remain identical to the existing Manage Players section. Settings keeps a button that opens the roster panel but no longer embeds the full roster manager.

### 8. Split Settings Into Two Areas

Settings becomes a two-tab modal:

- **Event Controls:** How this works, schedule, win score, round counts, time budget status, roster panel link.
- **App Settings:** keep-awake controls, saved phone numbers, diagnostics, install/offline related actions, reset/clear actions.

Default tab is Event Controls. The last tab selected persists in `state.settingsTab`. Setup phase hides in-event controls that do not apply but still exposes setup-relevant options.

### 9. Finals Board Redesign

Finals become a dedicated board:

- A compact action area at the top with finals progress and the finish button.
- Tier cards for Championship, Consolation, Bronze, and other seated tiers.
- Each tier shows seed pairings, season seed numbers, and the physical court.
- The full seed list moves into a collapsible `Season seeds` section.
- Unseated and departed players appear in a separate summary when present.

The underlying `state.finals.tiers[]`, scores, and final ranking order do not change.

### 10. Rename Non-Crown Final Action

Non-Crown finals use `Finish Tournament` as the final action label. Crown keeps `Crown Champions`.

Rules:

- `renderFinalsScreen()` uses `Finish Tournament`.
- Crown-specific screens keep existing Crown wording.
- Guide text changes from `Crown Champions` to `Finish Tournament` when describing non-Crown finals.
- No phase, scoring, awards, or final ranking logic changes.

## Testing Strategy

Each enhancement starts with inline self-tests in `runSelfTests()` for pure helpers and DOM smoke tests where the behavior is render-only. Use the existing gate:

- `index.html?test` ends with exactly 1 failure, the known keep-awake headless artifact.
- `index.html?simulate` ends with 0 failures.

Manual visual checks are required for:

- setup desktop and mobile
- setup with phones collapsed and expanded
- paste preview with names only, spreadsheet copy, duplicates, and too many rows
- live play with 8/2, 13/3, and a bye-heavy setup
- standings toggle on RR, Stack, King, Gauntlet, and Crown
- settings tabs
- finals board for 8/2 and 13/3

## Non-Goals

- No new tournament formats.
- No algorithm changes to pairing, byes, rankings, finals construction, or time-budget solving.
- No backend sync or player self-service.
- No new dependencies.
- No source split or build step.
