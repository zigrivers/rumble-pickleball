# Player-Facing And Trust Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only player displays, shareable outputs, static QR snapshots, personal recaps, undo/event logging, fairness explainers, and a pre-start review summary without changing tournament algorithms.

**Architecture:** Keep the app single-file. Add small state fields for event logging, undo snapshots, and display preferences; add pure builders for snapshots, recaps, share-card models, QR payloads, fairness explanations, and pre-start summaries; wire those builders into existing render functions. No backend, no dependency, no build step.

**Tech Stack:** Vanilla HTML, CSS, and JavaScript in `index.html`; `guide.html` only for visible workflow documentation. Verification uses existing `runSelfTests()`, `runSimulation()`, and manual browser checks served by `python3 -m http.server`.

**Source of truth:** `docs/superpowers/specs/2026-06-12-player-facing-trust-enhancements-design.md`.

---

## Project Rules

- Work from repo root: `/Users/kenallred/Developer/rumble`.
- Preserve 8-player/2-court Round Robin behavior exactly.
- Add tests before implementation for every task.
- Run both gates after every task:
  - `http://127.0.0.1:8765/index.html?test` must end with exactly 1 failure.
  - `http://127.0.0.1:8765/index.html?simulate` must end with 0 failures.
- Commit after every task with the listed commit message.
- Match the current `el()` helper style and avoid dependencies.

## Files Map

- Modify: `index.html`
  - State defaults: `newState()`, `backfillStateDefaults(obj)`
  - Persistence helpers: `save()`, event/undo wrappers near state helpers
  - Score mutation: `renderTeamRow()`
  - Live display: `render()`, `renderPlaying()`, `renderRoundCourts()`, `renderStandingsCard()`
  - Results: `buildResultsMessage()`, `renderTextResultsCard()`, `renderDoneScreen()`
  - Finals: `renderFinalsScreen()`, `buildFinals()`
  - Setup: `renderSetup()`, `validateSetupConfig()`, `fitLineText()`, `applyTimeBudgetSolve()`
  - Fairness: `byeStatsFor()`, `allocateByes()`, `movementToastText()`, `kingMovementToastText()`
  - Tests: `runSelfTests()`, `runSimulation()`
- Modify: `guide.html`
  - Add short sections for display mode, snapshots/cards, and undo/explainers after the features exist.

## Task 1: Event Log And Undo Foundation

**Enhancement covered:** Undo / Event Log

**Files:**
- Modify: `index.html`

- [x] **Step 1: Add failing self-tests**

  In `runSelfTests()`, add:

  ```js
  // Player-facing/trust Task 1 - event log and undo defaults
  {
    const s = newState();
    backfillStateDefaults(s);
    console.assert(Array.isArray(s.eventLog) && s.eventLog.length === 0,
      "eventLog defaults to []", s);
    console.assert(Array.isArray(s.undoStack) && s.undoStack.length === 0,
      "undoStack defaults to []", s);
    console.assert(s.eventSeq === 0, "eventSeq defaults to 0", s);
  }
  {
    console.assert(typeof stateSnapshotForUndo === "function", "stateSnapshotForUndo exists");
    console.assert(typeof recordEvent === "function", "recordEvent exists");
    console.assert(typeof undoLastEvent === "function", "undoLastEvent exists");
    const saved = state;
    state = newState();
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.slots = state.rawNames.slice();
    backfillStateDefaults(state);
    const before = stateSnapshotForUndo();
    state.currentRound = 2;
    recordEvent({ kind: "advance", label: "Advanced to Round 2", beforeState: before, reversible: true });
    console.assert(state.eventLog.length === 1 && state.undoStack.length === 1,
      "recordEvent stores log and undo entry", state);
    const undone = undoLastEvent();
    console.assert(undone.ok === true && state.currentRound === 1,
      "undoLastEvent restores previous state", { undone, state });
    console.assert(state.eventLog.some(e => e.kind === "undo"),
      "undo appends undo event", state.eventLog);
    state = saved;
  }
  ```

- [x] **Step 2: Run test to verify failure**

  Open `index.html?test`.

  Expected: failures increase because the event/undo helpers do not exist.

- [x] **Step 3: Implement state defaults and helpers**

  Add defaults:

  ```js
  eventLog: [],
  undoStack: [],
  eventSeq: 0,
  displayPrefs: { rotateSeconds: 12, showTopCount: 8 },
  ```

  Add helpers:

  ```js
  function stateSnapshotForUndo() {
    const copy = JSON.parse(JSON.stringify(state));
    copy.eventLog = [];
    copy.undoStack = [];
    return copy;
  }

  function restoreUndoSnapshot(snapshot) {
    const eventLog = state.eventLog || [];
    const undoStack = state.undoStack || [];
    const eventSeq = parseInt(state.eventSeq, 10) || 0;
    state = backfillStateDefaults(JSON.parse(JSON.stringify(snapshot)));
    state.eventLog = eventLog;
    state.undoStack = undoStack;
    state.eventSeq = Math.max(eventSeq, parseInt(state.eventSeq, 10) || 0);
  }

  function recordEvent(evt) {
    if (!Array.isArray(state.eventLog)) state.eventLog = [];
    if (!Array.isArray(state.undoStack)) state.undoStack = [];
    state.eventSeq = (parseInt(state.eventSeq, 10) || 0) + 1;
    const id = state.eventSeq;
    const entry = {
      id,
      ts: Date.now(),
      kind: evt.kind,
      label: evt.label,
      detail: evt.detail || "",
      reversible: !!(evt.reversible && evt.beforeState),
      undoId: evt.beforeState ? id : null,
    };
    state.eventLog.unshift(entry);
    state.eventLog = state.eventLog.slice(0, 100);
    if (evt.beforeState) {
      state.undoStack.unshift({
        id,
        eventId: id,
        label: "Undo " + evt.label.charAt(0).toLowerCase() + evt.label.slice(1),
        beforeState: evt.beforeState,
        createdAt: entry.ts,
      });
      state.undoStack = state.undoStack.slice(0, 20);
    }
    save();
    return entry;
  }

  function undoLastEvent() {
    if (!Array.isArray(state.undoStack) || !state.undoStack.length) {
      return { ok: false, error: "Nothing to undo." };
    }
    const undo = state.undoStack.shift();
    restoreUndoSnapshot(undo.beforeState);
    state.undoStack = (state.undoStack || []).filter(u => u.id !== undo.id);
    recordEvent({ kind: "undo", label: undo.label, reversible: false });
    save();
    render();
    return { ok: true };
  }
  ```

- [x] **Step 4: Add Event Log UI**

  Add `openEventLogModal()` and a compact Undo chip near the header when `state.undoStack.length > 0`. The modal lists `state.eventLog` entries newest first and shows an Undo button for the newest reversible event only.

- [x] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually open the Event Log with no events, with one event, and after undo.

- [x] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(trust): add event log and undo foundation"
  ```

## Task 2: Record High-Risk Mutations

**Enhancement covered:** Undo / Event Log

**Files:**
- Modify: `index.html`

- [x] **Step 1: Add failing self-tests**

  ```js
  // Player-facing/trust Task 2 - event labels
  {
    console.assert(typeof scoreChangeEventLabel === "function", "scoreChangeEventLabel exists");
    const label = scoreChangeEventLabel({ round: 2, court: 1, before: [11, 8], after: [9, 11] });
    console.assert(label === "R2 Court 1 score changed from 11-8 to 9-11",
      "scoreChangeEventLabel describes score edit", label);
  }
  {
    console.assert(typeof mutationEventLabel === "function", "mutationEventLabel exists");
    console.assert(mutationEventLabel("buildFinals", { round: 7 }).includes("Built finals"),
      "mutationEventLabel names finals build");
  }
  ```

- [x] **Step 2: Run test to verify failure**

  Expected: failures increase because label helpers do not exist.

- [x] **Step 3: Implement label helpers**

  Add:

  ```js
  function scoreChangeEventLabel(info) {
    const before = info.before.map(v => Number.isInteger(v) ? v : "blank").join("-");
    const after = info.after.map(v => Number.isInteger(v) ? v : "blank").join("-");
    return "R" + info.round + " Court " + info.court + " score changed from " + before + " to " + after;
  }

  function mutationEventLabel(kind, info) {
    if (kind === "advance") return "Advanced to Round " + info.round;
    if (kind === "buildFinals") return "Built finals after Round " + info.round;
    if (kind === "finish") return "Finished tournament";
    if (kind === "rosterAdd") return "Added " + info.name;
    if (kind === "rosterLeave") return info.name + " left after Round " + info.round;
    if (kind === "rosterReturn") return info.name + " returned for Round " + info.round;
    if (kind === "courtCount") return "Changed courts to " + info.courts;
    return "Updated tournament";
  }
  ```

- [x] **Step 4: Wire mutation events**

  Record events around:

  - score input focus/blur in `renderTeamRow()`; coalesce each focus session into one event
  - quick-fill pill
  - round advance button
  - `buildFinals()`
  - final completion button
  - `addMidEventPlayer()`
  - `markPlayerLeft()`
  - `returnMidEventPlayer()`
  - `changeCourtCountMidEvent()`

  Capture `const before = stateSnapshotForUndo()` immediately before the mutation and call `recordEvent()` after successful mutation.

- [x] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify score edit undo, round advance undo, finals build undo, roster add undo, leave undo, return undo, and court-count undo.

- [x] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(trust): record reversible tournament events"
  ```

## Task 3: Personal Player Recap Model

**Enhancement covered:** Personal Player Recaps

**Files:**
- Modify: `index.html`

- [x] **Step 1: Add failing self-tests**

  ```js
  // Player-facing/trust Task 3 - personal recaps
  {
    console.assert(typeof buildPersonalRecap === "function", "buildPersonalRecap exists");
    const saved = state;
    state = newState();
    state.format = "rr";
    state.players = [1,2,3,4].map(i => ({ slot: i, name: "P" + i, phone: "", status: "active",
      eligibleFromRound: 1, joinedRound: 1, leftRound: null }));
    state.slots = ["P1","P2","P3","P4"];
    state.rounds = [
      makeRound(1, [{ court: 1, team1: [1,2], team2: [3,4], score1: 11, score2: 5 }], []),
      makeRound(2, [{ court: 1, team1: [1,3], team2: [2,4], score1: 8, score2: 11 }], [])
    ];
    const recap = buildPersonalRecap(1, { final: false, throughRound: 2 });
    console.assert(recap.name === "P1" && recap.record === "1-1",
      "personal recap includes record", recap);
    console.assert(recap.bestWin && recap.bestWin.round === 1,
      "personal recap finds best win", recap);
    console.assert(recap.mostCommonPartner && ["P2", "P3"].includes(recap.mostCommonPartner.name),
      "personal recap finds common partner", recap);
    console.assert(recap.headline.includes("went 1-1"),
      "personal recap builds headline", recap);
    state = saved;
  }
  ```

- [x] **Step 2: Run test to verify failure**

  Expected: failures increase because `buildPersonalRecap` does not exist.

- [x] **Step 3: Implement recap helper**

  Add `buildPersonalRecap(slot, opts)` near `buildResultsMessage()`. It returns:

  ```js
  {
    slot, name, rank, fieldSize, gp, wins, losses, ties, record,
    avgPoints, avgDiff, bestWin, closestLoss, mostCommonPartner,
    byeCount, headline, awards: []
  }
  ```

  Use `computeStats()`, `rankPlayersForFormat()` or `finalRanking()`, `gamesOf()`, and `byesOf()`.

- [x] **Step 4: Reuse recap in text results**

  Update `buildResultsMessage()` to build its "You:" line from `buildPersonalRecap()` while preserving the current message structure and phone/text behavior.

- [x] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify final text results and mid-event text standings for RR and Gauntlet.

- [x] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(results): build personal player recaps"
  ```

## Task 4: Shareable Result Cards

**Enhancements covered:** Shareable Result Cards, Personal Player Recaps

**Files:**
- Modify: `index.html`

- [x] **Step 1: Add failing self-tests**

  ```js
  // Player-facing/trust Task 4 - share card models
  {
    console.assert(typeof buildShareCardModel === "function", "buildShareCardModel exists");
    const model = buildShareCardModel("podium", { title: "Rumble Pickleball" });
    console.assert(model.type === "podium" && Array.isArray(model.lines),
      "share card model returns printable lines", model);
  }
  {
    console.assert(typeof renderShareCardSvg === "function", "renderShareCardSvg exists");
    const svg = renderShareCardSvg({ type: "round", title: "Round 2", lines: ["Court 1: A/B def C/D"], footer: "Rumble" });
    console.assert(svg.includes("<svg") && svg.includes("Round 2") && svg.includes("Court 1"),
      "renderShareCardSvg returns svg markup", svg);
  }
  ```

- [x] **Step 2: Run test to verify failure**

  Expected: failures increase because share-card helpers do not exist.

- [x] **Step 3: Implement card model and SVG renderer**

  Add:

  - `buildShareCardModel(type, opts)`
  - `renderShareCardSvg(model)`
  - `downloadShareCard(model, format)`

  Supported `type` values are `"podium"`, `"round"`, and `"player"`. SVG size is `1080 x 1350`. Use escaped text only; do not inject raw HTML into SVG.

- [x] **Step 4: Add Share Cards UI**

  Add a Share Cards button on the done screen and in the mid-event text results card. The modal lets the organizer choose Final Podium, Round Recap, or Player Recap and then download PNG, download SVG, or copy image when `navigator.clipboard.write()` supports it.

- [x] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually generate each card type, inspect the downloaded SVG/PNG, and verify fallback when clipboard image copy is unavailable.

- [x] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(results): generate shareable result cards"
  ```

## Task 5: Static Snapshot Builder And QR Encoder

**Enhancement covered:** QR Snapshot

**Files:**
- Modify: `index.html`

- [x] **Step 1: Add failing self-tests**

  ```js
  // Player-facing/trust Task 5 - snapshots and QR
  {
    console.assert(typeof buildTournamentSnapshot === "function", "buildTournamentSnapshot exists");
    const snap = buildTournamentSnapshot("snapshot", { now: 1790000000000 });
    console.assert(snap.v === 1 && snap.createdAt === 1790000000000 && Array.isArray(snap.standings),
      "buildTournamentSnapshot returns v1 snapshot", snap);
  }
  {
    console.assert(typeof encodeSnapshotHash === "function", "encodeSnapshotHash exists");
    console.assert(typeof decodeSnapshotHash === "function", "decodeSnapshotHash exists");
    const payload = { v: 1, title: "Rumble", standings: [{ rank: 1, name: "A" }] };
    const hash = encodeSnapshotHash(payload);
    const decoded = decodeSnapshotHash(hash);
    console.assert(decoded.title === "Rumble" && decoded.standings[0].name === "A",
      "snapshot hash round-trips", { hash, decoded });
  }
  {
    console.assert(typeof qrMatrixForText === "function", "qrMatrixForText exists");
    const matrix = qrMatrixForText("https://example.com/#snapshot=test");
    console.assert(Array.isArray(matrix) && matrix.length > 20 && matrix.every(row => row.length === matrix.length),
      "qrMatrixForText returns square matrix", matrix);
  }
  ```

- [x] **Step 2: Run test to verify failure**

  Expected: failures increase because snapshot and QR helpers do not exist.

- [x] **Step 3: Implement snapshot helpers**

  Add:

  - `buildTournamentSnapshot(kind, opts)`
  - `encodeSnapshotHash(payload)`
  - `decodeSnapshotHash(hash)`
  - `snapshotUrl(payload)`

  Encode compact JSON with base64url. Snapshot payload must include only read-only display data, not phone numbers, event log entries, undo snapshots, or localStorage internals.

- [x] **Step 4: Implement no-dependency QR helper**

  Add `qrMatrixForText(text)` and `renderQrSvg(matrix)`. Use byte-mode QR with medium error correction and support versions large enough for the snapshot URLs produced by `buildTournamentSnapshot("snapshot")`. If text is too large, return `{ error: "too_large" }` and show copy-link fallback.

- [x] **Step 5: Add QR Snapshot UI and route**

  Add a QR Snapshot button in the text/results/share modal surfaces. Add route handling before normal `render()` dispatch:

  - if `location.hash` starts with `#snapshot=`, decode and render a read-only snapshot view
  - otherwise render the normal app

- [x] **Step 6: Verify**

  Run `?test` and `?simulate`. Manually create a QR snapshot from playing, finals, and done phases; open the copied snapshot URL in a new tab; verify it does not read or mutate localStorage.

- [x] **Step 7: Commit**

  ```bash
  git add index.html
  git commit -m "feat(snapshot): add static QR snapshot export"
  ```

## Task 6: TV / Projector Mode

**Enhancement covered:** TV / Projector Mode

**Files:**
- Modify: `index.html`

- [x] **Step 1: Add failing self-tests**

  ```js
  // Player-facing/trust Task 6 - display mode
  {
    console.assert(typeof isDisplayMode === "function", "isDisplayMode exists");
    console.assert(typeof displayModeModel === "function", "displayModeModel exists");
    const model = displayModeModel(buildTournamentSnapshot("live", { now: 1790000000000 }));
    console.assert(model.title && Array.isArray(model.panels),
      "displayModeModel creates display panels", model);
  }
  ```

- [x] **Step 2: Run test to verify failure**

  Expected: failures increase because display helpers do not exist.

- [x] **Step 3: Implement display route and model**

  Add:

  ```js
  function isDisplayMode() {
    return typeof location !== "undefined" && location.search.includes("display");
  }
  ```

  Add `displayModeModel(snapshot)` and `renderDisplayMode(model)`.

- [x] **Step 4: Wire read-only display rendering**

  In `render()`, if `isDisplayMode()` is true, load state from localStorage, build `buildTournamentSnapshot("live")`, and render display mode only. Poll `load()` every two seconds and re-render if the saved JSON changed. Also listen for `storage` events.

- [x] **Step 5: Add organizer entry point**

  Add a Display / Projector button in Settings or results surfaces that opens `index.html?display` in a new tab/window. Do not show score inputs, Settings, reset, roster controls, or text buttons in display mode.

- [x] **Step 6: Verify**

  Run `?test` and `?simulate`. Manually verify display mode for setup, playing, finals, done, 1920x1080, and mobile portrait. In a second browser tab, enter a score in the normal app and verify display updates.

- [x] **Step 7: Commit**

  ```bash
  git add index.html
  git commit -m "feat(display): add read-only TV projector mode"
  ```

## Task 7: Fairness Explainers

**Enhancement covered:** Fairness Explainers

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Player-facing/trust Task 7 - fairness explainers
  {
    console.assert(typeof buildFairnessExplanation === "function", "buildFairnessExplanation exists");
    const saved = state;
    state = newState();
    state.players = [1,2,3,4,5].map(i => ({ slot: i, name: "P" + i, phone: "", status: "active",
      eligibleFromRound: 1, joinedRound: 1, leftRound: null }));
    state.rounds = [makeRound(1, [{ court: 1, team1: [1,2], team2: [3,4], score1: null, score2: null }], [5])];
    const exp = buildFairnessExplanation("bye", { slot: 5, round: 1 });
    console.assert(exp.title.includes("P5") && exp.body.includes("sitting"),
      "bye explanation names player and sitting state", exp);
    state = saved;
  }
  {
    const exp = buildFairnessExplanation("finals", { slot: 1, seed: 1, tier: "Championship" });
    console.assert(exp.body.includes("seed") && exp.body.includes("Championship"),
      "finals explanation references seed and tier", exp);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `buildFairnessExplanation` does not exist.

- [ ] **Step 3: Implement explanation helpers**

  Add `buildFairnessExplanation(type, opts)` returning:

  ```js
  { title: string, body: string, facts: string[] }
  ```

  Implement `type` values `"bye"`, `"movement"`, and `"finals"` using existing state helpers.

- [ ] **Step 4: Add UI entry points**

  Add small `Why?` buttons:

  - next to the bye banner in `renderPlaying()`
  - in ladder movement toasts or history rows where movement is visible
  - in `renderFinalsScreen()` seed/tier rows

  Each opens a modal with the explanation title, body, facts, and Close button.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify RR byes, Stack movement, King movement, Gauntlet byes, finals tier placement, and unseated finals explanations.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(trust): explain byes movement and finals placement"
  ```

## Task 8: Pre-Start Validation Summary

**Enhancement covered:** Pre-Start Validation Summary

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Player-facing/trust Task 8 - pre-start summary
  {
    console.assert(typeof preStartSummaryModel === "function", "preStartSummaryModel exists");
    const saved = state;
    state = newState();
    state.format = "rr";
    state.courtCount = 3;
    state.rawNames = ["A","B","C","D","E","F","G","H","I","J","K","L","M"];
    state.rawPhones = ["5551112222"].concat(Array(12).fill(""));
    backfillStateDefaults(state);
    const model = preStartSummaryModel();
    console.assert(model.players === 13 && model.configuredCourts === 3 && model.byesPerRound === 1,
      "preStartSummaryModel reports players courts and byes", model);
    console.assert(model.phoneCount === 1 && model.finalsStyle.includes("tier"),
      "preStartSummaryModel reports phones and finals style", model);
    state = saved;
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `preStartSummaryModel` does not exist.

- [ ] **Step 3: Implement summary model**

  Add `preStartSummaryModel()` near setup validation helpers. Include:

  ```js
  {
    formatLabel, players, configuredCourts, activeCourts, byesPerRound,
    rounds, scoring, estimatedDuration, finalsStyle, phoneCount, warnings: []
  }
  ```

- [ ] **Step 4: Add Review & Start modal**

  Change the setup Start button handler from direct `startTournament()` to `openPreStartSummary()`. The modal calls `startTournament()` only after the organizer confirms. If `canStart()` is false, keep the existing disabled behavior and hint.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify 8/2 RR, 13/3 RR, Crown, bye-heavy 24/2, time-budget enabled, and duplicate-name blocking.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(setup): add pre-start validation summary"
  ```

## Task 9: Docs And Final Acceptance

**Enhancements covered:** All seven

**Files:**
- Modify: `index.html`
- Modify: `guide.html`

- [ ] **Step 1: Add guide copy**

  Update `guide.html` with short mentions of:

  - TV / Projector mode
  - Share cards and QR snapshot
  - Undo / Event Log
  - Why? fairness explainers
  - Review & Start summary

- [ ] **Step 2: Add final smoke assertions**

  Add a small `runSelfTests()` block that asserts the route helpers and major model builders exist:

  ```js
  // Player-facing/trust final surface availability
  {
    [
      "buildPersonalRecap",
      "buildShareCardModel",
      "buildTournamentSnapshot",
      "qrMatrixForText",
      "displayModeModel",
      "buildFairnessExplanation",
      "preStartSummaryModel",
      "openEventLogModal"
    ].forEach(name => console.assert(typeof window[name] === "function", name + " is available"));
  }
  ```

- [ ] **Step 3: Run full verification**

  Run:

  ```bash
  python3 -m http.server 8765 --bind 127.0.0.1 -d .
  ```

  Verify:

  - `index.html?test` ends with exactly 1 failure
  - `index.html?simulate` ends with 0 failures
  - TV display mode renders and updates from another tab
  - QR snapshot link opens a read-only snapshot
  - share cards download
  - undo works for score, advance, and roster changes
  - fairness explainers render for bye, movement, and finals cases

- [ ] **Step 4: Commit**

  ```bash
  git add index.html guide.html
  git commit -m "feat: player-facing and trust enhancements docs and final verification"
  ```

## Final Acceptance Checklist

- [ ] TV / Projector mode is read-only and shows current tournament state.
- [ ] Shareable result cards generate final podium, round recap, and player recap outputs.
- [ ] QR Snapshot creates static snapshot links and renders snapshot views without localStorage.
- [ ] Personal player recaps support all formats and degrade gracefully when data is missing.
- [ ] Event Log records score, round, finals, roster, court, and finish mutations.
- [ ] Undo restores the prior tournament state for recent reversible events.
- [ ] Fairness explainers cover byes, movement, finals tiers, and unseated players.
- [ ] Pre-start summary appears before start and does not weaken existing validation.
- [ ] 8-player/2-court Round Robin behavior is unchanged.
- [ ] `index.html?test` ends with exactly 1 failure.
- [ ] `index.html?simulate` ends with 0 failures.
