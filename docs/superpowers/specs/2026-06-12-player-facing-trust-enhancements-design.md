# Player-Facing And Trust Enhancements - Design

## Goal

Add player-facing presentation, sharing, and trust/recovery features to Rumble without changing tournament scheduling, ranking, scoring, or the 8-player/2-court golden path behavior.

## Scope

This spec covers seven enhancements:

1. TV / Projector Mode
2. Shareable Result Cards
3. QR Snapshot
4. Personal Player Recaps
5. Undo / Event Log
6. Fairness Explainers
7. Pre-Start Validation Summary

All features stay in the existing single-file app, `index.html`, with guide copy updated only where player-facing workflows change. No backend, account system, live multi-device sync, new dependency, framework, or build step is introduced.

## Design Principles

- **Read-only player surfaces:** player-facing displays must not expose score editing, settings, reset, or roster controls.
- **Static first:** snapshots and QR codes export the current tournament state at one moment; they do not live-sync.
- **Trust before novelty:** undo and explanations must be reliable before visual sharing gets fancy.
- **Offline-friendly:** generated cards, QR codes, and display views use local browser APIs and in-file code only.
- **Golden path unchanged:** existing 8-player/2-court Round Robin behavior, standings, finals, and self-test expectations remain unchanged.

## Approaches Considered

### Approach A: Output-Only Enhancements

This adds TV mode, result cards, QR snapshots, and personal recaps, but leaves undo and explainers for later. It delivers visible player value quickly, but does not address organizer trust when mistakes happen.

### Approach B: Trust Foundation Plus Player Outputs

This is the recommended approach. Build event logging, undo snapshots, fairness explanation models, and pre-start summaries first, then reuse the resulting recap/snapshot models for TV mode, cards, QR snapshots, and personal recaps.

### Approach C: Full Multi-Device Platform

This would add live score entry from player phones and real-time synced displays. It would be powerful, but it adds backend, conflict resolution, auth/privacy, and offline complexity. It is intentionally out of scope.

## Current Anchors

- State and persistence: `newState()`, `backfillStateDefaults(obj)`, `load()`, `save()`
- Main render dispatch: `render()`
- Live tournament: `renderPlaying()`, `renderRoundCourts()`, `renderCourtCard()`
- Score mutation: `renderTeamRow()` score input handlers
- Finals/results: `buildFinals()`, `renderFinalsScreen()`, `renderDoneScreen()`, `finalRanking()`
- Text recaps: `buildResultsMessage()`, `renderTextResultsCard()`
- Awards/cards: `computeAwards()`, `renderAwardsStrip()`, `renderPodium()`
- Schedule modal: `openScheduleModal()`
- Byes/fairness: `roundShapeFor()`, `byeStatsFor()`, `allocateByes()`, `movementToastText()`, `kingMovementToastText()`
- Setup validation: `validateSetupConfig()`, `fitLineText()`, `applyTimeBudgetSolve()`
- Tests: `runSelfTests()` and `runSimulation()`

## State Additions

Add these fields as UI/operations support only:

```js
eventLog: [],
undoStack: [],
eventSeq: 0,
displayPrefs: {
  rotateSeconds: 12,
  showTopCount: 8
}
```

Backfill defaults in `backfillStateDefaults(obj)`. Event log and undo data must never affect scheduling or ranking.

### Event Entry

```js
{
  id: 1,
  ts: 1790000000000,
  kind: "score" | "advance" | "finals" | "roster" | "courtCount" | "settings" | "undo",
  label: "R2 Court 1 score changed from 11-8 to 9-11",
  detail: "Optional short detail",
  reversible: true,
  undoId: 1
}
```

### Undo Entry

Undo entries store a bounded full-state snapshot before the mutation. This is deliberately simple and reliable for a single-file local app.

```js
{
  id: 1,
  eventId: 1,
  label: "Undo score change",
  beforeState: { ...stateWithoutEventLogOrUndoStack },
  createdAt: 1790000000000
}
```

Keep at most 20 undo entries and 100 event log entries. `beforeState` excludes `eventLog`, `undoStack`, and transient non-state globals. Undo restores the stored tournament state while preserving the event log and the highest current `eventSeq`, removing the consumed undo entry, and appending a new `kind:"undo"` event.

## Feature Designs

### 1. TV / Projector Mode

TV mode is a read-only route opened from the organizer app, for example `index.html?display`. It reads the current tournament from localStorage, renders a full-screen display, and polls localStorage every two seconds so a second browser window or mirrored display updates as the organizer enters scores.

Content by phase:

- **Setup:** event title, format, players, courts, and "waiting to start".
- **Playing:** current round, active court cards, scores, byes, top standings, and next-up summary where known.
- **Finals:** finals tier cards, court assignments, scores, and final readiness.
- **Done:** champions, podium, awards headline, and final standings top rows.

TV mode must not render settings, score inputs, roster controls, reset controls, text buttons, or editable fields. It may include a small "Live from this device" status line and last-updated timestamp.

### 2. Shareable Result Cards

Result cards are generated locally as SVG, then converted to PNG through canvas when supported. Fallback is a downloadable SVG. No external image service is used.

Card types:

- **Final Podium:** champions, podium, format, player count, court count, final score, and short standings.
- **Round Recap:** round number, court winners, byes, and standings through that round.
- **Personal Recap:** one player's finish, record, best win, common partner, byes, and awards mentions.

Cards use the app's dark theme and existing court color tokens. They must be readable at 1080x1350 for social sharing and printable enough at smaller sizes.

### 3. QR Snapshot

QR Snapshot exports a static snapshot link encoded in the URL fragment:

```text
index.html#snapshot=<base64url-json>
```

The snapshot payload contains only the data needed to render a read-only snapshot page:

```js
{
  v: 1,
  createdAt,
  phase,
  format,
  title,
  summary,
  standings,
  currentRound,
  courts,
  byes,
  finals,
  podium
}
```

The QR code is generated in-app with a small no-dependency QR encoder. It targets byte mode and medium error correction. If the encoded link is too large for the supported QR version, the UI shows a copy-link fallback and asks the organizer to use a smaller snapshot type.

Scanning the QR opens the same `index.html`, detects `#snapshot=`, and renders a snapshot view without reading localStorage. The snapshot is not live; the view clearly shows the generated timestamp.

### 4. Personal Player Recaps

Personal recaps are structured data used by text results, result cards, and snapshot views.

Each recap includes:

- final or current rank
- games played
- wins, losses, ties
- points per game and differential per game
- best win by point differential
- closest loss
- most common partner
- bye count
- notable awards or "headline" line

Example headline: `You finished 4th, went 3-2, best win was Round 3, most common partner was Alex.`

Recaps support RR, Stack, King, Gauntlet, and Crown. Format-specific scores may add labels such as `SS/G`, `KS/G`, or Crown match record, but missing data must degrade gracefully.

### 5. Undo / Event Log

Every high-risk organizer mutation records an event:

- score changes
- round advance
- finals build
- final tournament completion
- roster add/leave/return
- mid-event court-count change
- scoring/time setting changes before start

Undo is exposed as:

- a compact "Undo" chip after the latest reversible event
- an Event Log modal listing recent events and reversible entries

Score edits are coalesced per input focus session. Typing `1` then `11` produces one event when the field blurs or when quick-fill applies, not one event per keystroke.

Undo must re-render immediately and preserve the event log. Undoing a score edit also reopens round/finals readiness exactly as the restored state dictates.

### 6. Fairness Explainers

Fairness explainers are small "Why?" surfaces attached to byes, ladder movement, and finals qualification.

Explainer types:

- **Bye:** why a player sat, including bye count, eligibility rounds, last bye, and policy.
- **Movement:** why a player climbed, dropped, stayed, returned from bye, or joined a court.
- **Finals:** why a player landed in a tier, was paired with a seed, or was unseated.

Explainers are derived from existing state. They must not mutate scheduling. Where the exact allocator reason cannot be reconstructed from stored state, the copy must say the deterministic rule that applies rather than pretending to know hidden intent.

### 7. Pre-Start Validation Summary

Before starting a tournament, show a Review & Start summary after `canStart()` is true and before `startTournament()` mutates the state.

Summary includes:

- format
- player count and duplicate/name validation status
- configured courts and active courts
- expected byes per round
- rounds
- scoring mode and win condition
- estimated duration when time budget is enabled
- finals style
- phone count for text results

The summary has two actions: `Back to setup` and `Start tournament`. It does not alter validation rules; it makes the existing configuration explicit.

## Snapshot And Recap Data Flow

Use one shared set of pure builders:

```js
buildTournamentSnapshot(kind, opts)
buildPersonalRecap(slot, opts)
buildShareCardModel(type, opts)
buildFairnessExplanation(type, opts)
```

Rendering surfaces consume these builders:

- TV mode consumes `buildTournamentSnapshot("live")`.
- QR snapshot consumes `buildTournamentSnapshot("snapshot")`.
- Share cards consume `buildShareCardModel()`.
- Text results can reuse `buildPersonalRecap()` while preserving current message copy.
- Fairness modals consume `buildFairnessExplanation()`.

## Testing Strategy

Add inline `runSelfTests()` asserts for all pure helpers and event/undo behavior. Use the existing gates:

- `index.html?test` ends with exactly 1 failure, the known keep-awake headless artifact.
- `index.html?simulate` ends with 0 failures.

Manual visual checks are required for:

- TV mode at 1920x1080 and mobile portrait
- final podium card, round recap card, and personal recap card
- QR snapshot generation and snapshot route rendering
- undo score edit, undo round advance, undo roster change
- bye, movement, and finals explainers
- pre-start summary for 8/2, 13/3, Crown, and a bye-heavy setup

## Non-Goals

- No backend sync.
- No player score entry from phones.
- No auth, accounts, or cloud storage.
- No dependency on third-party QR or image services.
- No changes to pairing, bye allocation, ranking, finals construction, or scoring algorithms.
