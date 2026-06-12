# Accessibility And Product Bets - Design

## Goal

Improve courtside readability and setup guidance while documenting a responsible path for larger product bets. The accessibility/readability work should be implementable now inside the single-file PWA. Tournament templates and the smart setup assistant should improve setup confidence without hiding manual controls. Multi-device score entry is documented as a future, gated bet rather than a feature to start immediately.

## Scope

This spec covers seven enhancements:

1. Large Score Entry Mode
2. High-Contrast Court Labels
3. Compact Mobile Tournament View
4. Reduced Visual Noise Controls
5. Tournament Templates
6. Smart Setup Assistant
7. Multi-Device Score Entry

All near-term implementation stays in `index.html`, with `guide.html` updated only when a visible workflow changes. No dependencies, framework, build step, backend, account system, or sync service is introduced by the accessibility/template/assistant work.

## Design Principles

- **Courtside first:** score entry must be usable while standing at a court, on a phone, with glare and motion.
- **Information density is adjustable:** advanced stats and partner metadata are valuable, but they should not be mandatory during live scoring.
- **Color is never the only signal:** court identity must be conveyed with text, shape, number, and contrast.
- **Templates guide, controls remain visible:** presets and assistant recommendations configure the existing setup controls; organizers can still edit everything.
- **Do not start multi-device sync too early:** capture the architecture and prerequisites, but do not add backend-dependent score entry before local display, sharing, undo, and snapshots are mature.
- **Golden path unchanged:** 8-player/2-court Round Robin scheduling, ranking, finals, and scoring behavior remain unchanged.

## Approaches Considered

### Approach A: CSS-Only Accessibility Polish

This would enlarge score inputs and increase contrast with CSS only. It is low risk, but it does not give organizers control over visual noise or mobile layout.

### Approach B: Preference-Driven Readability Layer

This is the recommended approach. Add small persisted UI preferences, render helpers, and CSS modes for large scoring, high-contrast court labels, compact mobile flow, and reduced standings noise. The tournament logic remains untouched.

### Approach C: Product Redesign And Backend Prep

This would combine readability improvements with a broader rewrite for templates, assistant flows, and multi-device sync. It is too broad for the single-file app and would risk burying the immediate courtside wins.

## Current Anchors

- Score entry: `renderCourtCard()`, `renderTeamRow()`, `.score-input`, `.quickfill-pill`, `.team-row`
- Court labels: `courtCardLabel()`, `courtTagLabel()`, `courtLocationLabel()`, `.court-label`, `.court-card.c1` through `.court-card.c6`
- Live play layout: `renderPlaying()`, `renderRoundCourts()`, `renderStandingsCard()`, `renderHistory()`
- Standings metadata: `partner-chip`, `partner-badge`, `trajectorySpan()`, `renderStandingsCard()`, `renderStackStandingsCard()`, `renderKingStandingsCard()`
- Setup controls: `renderFormatChooser()`, `renderTimeBudgetBlock()`, `setupRosterCount()`, `fitLineText()`, `applyTimeBudgetSolve()`
- State and persistence: `newState()`, `backfillStateDefaults(obj)`, `save()`, `load()`
- Settings: `openSettings()`
- Tests: `runSelfTests()` and `runSimulation()`

## State Additions

Add UI-only preferences:

```js
accessibilityPrefs: {
  largeScoreEntry: false,
  highContrastCourts: false,
  compactMobileView: false,
  reduceVisualNoise: false,
  showPartnerChips: true,
  showPartnerBadges: true,
  showTrajectory: true,
  showAdvancedStats: true
},
lastAppliedTemplate: null,
setupAssistant: {
  goal: "balanced",
  minutes: 90
}
```

Backfill defaults in `backfillStateDefaults(obj)`. These fields must not affect tournament generation, ranking, scoring, or persisted historical results.

## Feature Designs

### 1. Large Score Entry Mode

Large Score Entry Mode increases touch target size and simplifies score rows during live scoring.

Behavior:

- Adds a persisted toggle in Settings and a compact button near live court cards.
- Applies to regular rounds, finals, and Crown scoring.
- In large mode, score inputs use larger dimensions, larger numeric text, and extra vertical spacing.
- Quick-fill pills become larger and remain keyboard/focus accessible.
- Team names wrap cleanly and never overlap score controls.

Target sizing:

- Standard mode keeps today's sizing.
- Large mode uses at least 72px input height and at least 56px quick-fill target height.
- On screens under 520px wide, team rows become a stacked layout: team name, quick-fill, score input.

### 2. High-Contrast Court Labels

High-contrast labels add redundant court identity beyond color.

Behavior:

- Adds a persisted toggle in Settings.
- Court cards show a compact label badge such as `Court 1`, `Court 2`, `King's Court`, or `Championship`.
- The badge includes text, number, and a high-contrast border/background.
- Existing court accent colors remain visible, but meaning does not depend on hue.
- History rows and schedule rows keep text labels and gain high-contrast badge styling when the preference is enabled.

The helper `courtIdentity(court, format, opts)` returns text, short label, CSS class, accent token, and high-contrast label text for all regular courts and finals tiers.

### 3. Compact Mobile Tournament View

Compact mobile view prioritizes the current scoring task on phones.

Behavior:

- Adds a persisted toggle in Settings.
- Automatically offers the mode on narrow screens, but does not force it.
- On mobile while playing, the first viewport shows: round/byes, current courts, and primary next action.
- Standings, text results, and history move behind compact tabs or collapsed sections.
- The current court cards remain fully editable.

Tabs:

- `Score`: byes, courts, round action.
- `Standings`: live standings card.
- `More`: text results and history.

Desktop layout remains unchanged unless the user explicitly enables compact mobile view and the viewport is narrow.

### 4. Reduced Visual Noise Controls

Reduced Visual Noise lets organizers hide metadata while preserving rank order and score logic.

Controls:

- One master toggle: `Reduce visual noise`.
- Fine-grained toggles: partner chips, partner badges, trajectory arrows, advanced stat columns.

Behavior:

- Master toggle turns off partner chips, partner badges, trajectory arrows, and advanced stat columns.
- Fine-grained toggles can override the master by turning one item back on.
- Rank order never changes.
- Hidden advanced stats remain available in detailed text results and final exports.

Default is today's full-detail behavior.

### 5. Tournament Templates

Templates are one-tap setup presets that configure existing setup fields.

Initial templates:

| Template | Goal | Format | Rounds | Time/Scoring |
| --- | --- | --- | --- | --- |
| Lunch Break 45 | fast | Round Robin | 4 | time budget 45, rally fallback |
| Club Night 90 | balanced | Round Robin | 7 if 8/2 else 6 | time budget 90 |
| Competitive Ladder | competitive | Stack | 8 | side-out to 11, win by 2 |
| Social Mixer | social | Round Robin | 7 if 8/2 else 6 | side-out to 11, win by 2 |

Court behavior:

- Templates do not assume physical courts the organizer does not have.
- By default they keep the current `state.courtCount`.
- If the current court count creates more than one third of players sitting, the template recommendation suggests a higher count, but applying the template asks before changing courts.

Applying a template sets format, round count, time budget/scoring fields, and `lastAppliedTemplate`. The setup screen shows a short summary and keeps all manual controls editable.

### 6. Smart Setup Assistant

The assistant asks for:

- player count
- courts available
- available time
- event goal: social, balanced, competitive, fastest

It returns 2-3 recommendations with tradeoffs:

```js
{
  id: "rr-balanced-90",
  title: "Round Robin Mixer",
  format: "rr",
  courtCount: 3,
  rounds: 6,
  timeBudget: { enabled: true, minutes: 90 },
  scoring: { target: 11, winBy: 2, system: "sideout" },
  tradeoffs: ["best partner variety", "1 player sits each round"],
  warnings: []
}
```

The assistant is advisory. Applying a recommendation writes the same setup fields a user could edit manually. It should explain why it chose the recommendation and what the tradeoffs are.

### 7. Multi-Device Score Entry

Multi-device score entry is not part of the near-term implementation. This spec records the future path and the gate before work begins.

Why defer:

- Browser-only PWAs cannot reliably host a local server for other phones.
- Real score entry requires authentication/role tokens, conflict handling, offline rules, and an authoritative event log.
- A half-built version could corrupt scores or create organizer distrust.

Prerequisites before implementation:

- Event Log and Undo are implemented.
- TV / Projector Mode exists.
- QR Snapshot and static share/export exist.
- A command-log mutation model exists so remote score submissions can be validated and replayed.

Recommended future architecture:

- Cloud session per tournament with short event code.
- Organizer device remains authoritative.
- Court scorer links are scoped to a court/round and expire after the round.
- Remote submissions create pending score events; organizer can auto-accept or review.
- Conflicts resolve by event timestamp and explicit organizer confirmation, not silent overwrite.

This batch should create a decision record and future plan, not production multi-device score entry.

## Testing Strategy

Use inline self-tests for pure helpers:

- preference defaults
- class/model helpers
- template application
- assistant recommendations
- visual-noise option mapping

Use manual visual checks for:

- large score entry on mobile and desktop
- high-contrast labels for courts 1-6, finals, Crown
- compact mobile tabs at narrow widths
- reduced visual noise toggles across RR, Stack, King, Gauntlet, Crown
- template application for 8/2, 13/3, Crown guard, bye-heavy setup
- assistant recommendations for social, competitive, balanced, fastest

Verification gates stay unchanged:

- `index.html?test` ends with exactly 1 failure, the known keep-awake headless artifact.
- `index.html?simulate` ends with 0 failures.

## Non-Goals

- No schedule/ranking/scoring algorithm changes.
- No backend, accounts, or real-time sync.
- No new dependency or build step.
- No forced mobile redesign for desktop users.
- No removal of existing stats; controls only hide or reveal them.
