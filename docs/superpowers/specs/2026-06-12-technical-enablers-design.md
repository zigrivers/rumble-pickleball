# Technical Enablers - Design

## Goal

Make Rumble easier to change safely as the single-file app grows, while preserving its no-framework, single-deploy-file PWA model. Add internal boundaries and a visual regression/playbook harness so future UI work can move faster with less risk.

## Scope

This spec covers two technical enablers:

1. Stronger internal boundaries for the 10k-line `index.html`
2. Visual regression/playbook coverage for key app states

The near-term design does not rewrite the app into a framework and does not require a runtime build. The deployed artifact remains root `index.html`.

## Current State

- `index.html` is 10,725 lines and contains CSS, app state, scheduling logic, scoring logic, render helpers, inline self-tests, simulation, settings, and service-worker registration.
- There is no `package.json`, no build command, no Playwright config, and no screenshot regression harness.
- Existing verification is strong for behavior:
  - `index.html?test` must end at the known 1 failure.
  - `index.html?simulate` must end at 0 failures.
- Existing structure relies on comment sections and developer discipline, not machine-checked boundaries.

## Design Principles

- **Preserve deploy simplicity:** root `index.html` remains the shipped app.
- **No framework:** do not introduce React/Vue/Svelte or a bundler-oriented app architecture.
- **Tooling is dev-only:** Playwright and build/check scripts must not affect runtime.
- **Reduce risk before moving code:** add boundary docs/checks and visual coverage before large source movement.
- **Prefer generated single artifact only after confidence:** source splitting is allowed only if root `index.html` can be generated deterministically and verified.
- **Golden path unchanged:** technical refactors must not alter 8-player/2-court behavior.

## Approaches Considered

### Approach A: Stricter Section Conventions Only

Keep all code in `index.html`, add a section map, required section headers, and a boundary-check script. This is the lowest risk and improves navigation quickly, but the file remains large and merge conflicts remain likely.

### Approach B: Generated Single-File Source Split

Split source into `src/styles`, `src/core`, `src/render`, `src/tests`, and `src/index.template.html`, then generate root `index.html`. This gives real boundaries while preserving the single deploy file, but it creates meaningful tooling and migration churn.

### Approach C: Two-Stage Path

This is the recommended approach. First add a boundary map and visual playbook while leaving `index.html` untouched except for explicit section sentinels. Then introduce a deterministic source-split generator in "verify-only" mode. Only after visual baselines are stable should the repo switch to generated root `index.html`.

## Boundary Model

The app should be organized around these conceptual modules:

| Boundary | Responsibility | Current Anchors |
| --- | --- | --- |
| Shell | HTML skeleton, CSS variables, global layout | `<style>`, app container, boot |
| State/Persistence | state shape, migrations, localStorage | `newState()`, `backfillStateDefaults()`, `load()`, `save()` |
| Scheduling Core | rounds, courts, byes, pairing | `roundShapeFor()`, `allocateByes()`, RR/ladder/gauntlet builders |
| Scoring/Stats | score predicates, rankings, awards | `computeStats()`, `rankPlayers*()`, `computeAwards()` |
| Setup UI | setup form, format chooser, time budget | `renderSetup()`, `renderFormatChooser()`, `renderTimeBudgetBlock()` |
| Play UI | court cards, score entry, standings, history | `renderPlaying()`, `renderCourtCard()`, `renderStandingsCard()` |
| Finals/Done UI | finals tiers, podium, final standings | `renderFinalsScreen()`, `renderDoneScreen()` |
| Settings/Modals | settings, schedule, help, confirmations | `openSettings()`, `openScheduleModal()`, modal helpers |
| Diagnostics/Tests | self-tests, simulation, visual fixtures | `runSelfTests()`, `runSimulation()` |
| PWA | service worker registration/update chip | service-worker registration block, `sw.js` |

The first implementation step should document this map and add a script that verifies section sentinels appear in the expected order.

## Source Split Strategy

Source splitting should happen only after boundary checks and visual screenshots exist.

Target source shape:

```text
src/
  index.template.html
  styles/
    tokens.css
    layout.css
    courts.css
    standings.css
    modals.css
  js/
    00-state.js
    10-core-rounds.js
    20-formats.js
    30-stats-awards.js
    40-render-setup.js
    50-render-play.js
    60-render-finals-done.js
    70-settings-modals.js
    80-tests.js
    90-boot-pwa.js
tools/
  build-index.mjs
  check-index-boundaries.mjs
```

`tools/build-index.mjs` concatenates the files into root `index.html`. It must be deterministic: running it twice without source changes produces no diff. The generated file must retain the inline self-tests and simulation harness.

Source split acceptance criteria:

- Root `index.html` remains committed.
- `npm run build:index` regenerates root `index.html`.
- `npm run check:index` fails if root `index.html` is stale.
- `?test` and `?simulate` gates remain unchanged.
- Visual regression baselines pass before and after each extraction phase.

## Visual Regression / Playbook Harness

Add Playwright as a dev-only tool. The harness should serve the repo locally, seed deterministic localStorage state, open key states, and take screenshots.

Initial playbook states:

1. `setup-desktop` - normal setup screen at 1280x900
2. `setup-mobile` - setup screen at 390x844
3. `playing-13p-3c` - active tournament with 13 players, 3 courts, and byes
4. `settings-modal` - playing phase with Settings open
5. `finals-13p-3c` - tiered finals board
6. `text-results` - done screen or results card with text results visible
7. `guide-flex` - guide page, players/courts section

Visual harness requirements:

- Use deterministic seeded state fixtures, not manual clicking through long flows.
- Mask or freeze dynamic text such as timers and timestamps.
- Capture desktop and mobile where the layout differs.
- Store baseline screenshots in the repo.
- Provide an update command and a verify command.
- Do not fail on the known keep-awake self-test artifact; visual tests are separate from `?test`.

Recommended commands:

```json
{
  "scripts": {
    "serve": "python3 -m http.server 8765 --bind 127.0.0.1 -d .",
    "test:self": "node tools/run-url-check.mjs http://127.0.0.1:8765/index.html?test --expected-failures 1",
    "test:simulate": "node tools/run-url-check.mjs http://127.0.0.1:8765/index.html?simulate --expected-failures 0",
    "test:visual": "playwright test tests/visual/rumble.visual.spec.mjs",
    "test:visual:update": "playwright test tests/visual/rumble.visual.spec.mjs --update-snapshots",
    "check:index": "node tools/check-index-boundaries.mjs"
  },
  "devDependencies": {
    "@playwright/test": "^1.0.0"
  }
}
```

The actual Playwright version should be pinned by the implementer at install time. The app has no runtime dependency on Playwright.

## Risk Management

- Start with docs/check scripts before moving code.
- Visual baselines must be introduced before source extraction.
- Extract one boundary at a time.
- Each extraction commit must regenerate root `index.html` and prove no behavior change.
- Keep service worker cache bumps out of technical-enabler commits until a release task explicitly updates production assets.

## Testing Strategy

Every implementation phase must run:

- `git diff --check`
- `python3 -m http.server 8765 --bind 127.0.0.1 -d .`
- `index.html?test` expected 1 failure
- `index.html?simulate` expected 0 failures
- `npm run check:index` after boundary tooling exists
- `npm run test:visual` after visual tooling exists

Manual review is still required for the first baseline set because screenshots can bless bad layouts if created blindly.

## Non-Goals

- No framework migration.
- No runtime dependency.
- No uncommitted generated deploy artifact.
- No source split before visual baselines exist.
- No behavior changes to tournament logic.
- No redesign of UI surfaces as part of technical-enabler work.
