# Setup And Run UX Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ten UI/UX enhancements that make setup, live play, settings, standings, and finals easier to run without changing tournament algorithms or golden-path 8-player/2-court behavior.

**Architecture:** All changes stay in `index.html`, with `guide.html` updated only for visible copy changes. Add small UI preference fields through `backfillStateDefaults()`, pure model helpers for recommendation, paste preview, command bar status, standings mode, and finals board rendering, then connect those helpers to existing render functions. No dependencies, no build step, no service worker bump unless an implementation changes cached production assets for release.

**Tech Stack:** Vanilla HTML, CSS, and JavaScript in the single-file PWA. Verification uses the existing inline `runSelfTests()` harness, `?simulate`, and manual browser checks from a local `python3 -m http.server` session.

**Source of truth:** `docs/superpowers/specs/2026-06-12-ux-flow-enhancements-design.md`.

---

## Project Rules

- Work from repo root: `/Users/kenallred/Developer/rumble`.
- Preserve 8-player/2-court Round Robin behavior. These tasks are UI-only unless a listed test requires a pure helper.
- Add tests before implementation for every task.
- Run both gates after every task:
  - `http://127.0.0.1:8765/index.html?test` must end with exactly 1 failure.
  - `http://127.0.0.1:8765/index.html?simulate` must end with 0 failures.
- Commit after every task with the listed commit message.
- Keep changes surgical and match the existing `el()` helper style.

## Files Map

- Modify: `index.html`
  - CSS tokens and layout rules in the existing `<style>` block.
  - State defaults in `newState()` and `backfillStateDefaults(obj)`.
  - Setup UI in `renderSetup()`, `renderFormatChooser()`, `renderTimeBudgetBlock()`.
  - Paste UI in `openPasteModal()` and parser helpers near `parsePastedNames()`.
  - Live UI in `renderPlaying()`, `renderRoundCourts()`, `renderCourtCard()`.
  - Standings UI in `renderStandingsCard()`, `renderStackStandingsCard()`, `renderKingStandingsCard()`, `renderCrownStandingsCard()`.
  - Settings in `openSettings()` and extracted settings helper renderers.
  - Finals in `renderFinalsScreen()`.
  - Tests in `runSelfTests()`.
- Modify: `guide.html`
  - Only Task 10 changes visible final-action wording.

## Shared Setup Task: UI Preference Defaults

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  In `runSelfTests()`, add:

  ```js
  // UX flow defaults
  {
    const s = newState();
    backfillStateDefaults(s);
    console.assert(s.setupStep === "format", "ux defaults: setupStep=format", s);
    console.assert(s.setupContactMode === false, "ux defaults: setupContactMode=false", s);
    console.assert(s.standingsMode === "scoreboard", "ux defaults: standingsMode=scoreboard", s);
    console.assert(s.settingsTab === "event", "ux defaults: settingsTab=event", s);
  }
  {
    const s = { phase: "setup" };
    backfillStateDefaults(s);
    console.assert(s.setupStep === "format" && s.standingsMode === "scoreboard",
      "ux defaults backfill legacy state", s);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Run the local server and open `index.html?test`.

  Expected: total failures increase above the known 1 because the new fields do not exist yet.

- [ ] **Step 3: Implement defaults**

  Add these fields to `newState()` and `backfillStateDefaults(obj)`:

  ```js
  setupStep: "format",
  setupContactMode: false,
  standingsMode: "scoreboard",
  settingsTab: "event",
  ```

  Backfill invalid values to the defaults. Valid `setupStep` values are `"format"`, `"roster"`, and `"options"`. Valid `standingsMode` values are `"scoreboard"` and `"details"`. Valid `settingsTab` values are `"event"` and `"app"`.

- [ ] **Step 4: Verify**

  `?test` returns exactly 1 failure. `?simulate` returns 0 failures.

- [ ] **Step 5: Commit**

  ```bash
  git add index.html
  git commit -m "feat(ux): add setup and display preference defaults"
  ```

## Enhancement 1: Progressive Setup Flow

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  Add pure helper tests before rendering changes:

  ```js
  // Progressive setup flow
  {
    console.assert(typeof setupStepSummary === "function", "setupStepSummary exists");
    const s = newState();
    s.format = "rr";
    s.courtCount = 2;
    s.rawNames = ["A","B","C","D","E","F","G","H"];
    s.rawPhones = Array(8).fill("");
    backfillStateDefaults(s);
    const formatSummary = setupStepSummary(s, "format");
    const rosterSummary = setupStepSummary(s, "roster");
    console.assert(formatSummary.includes("Round Robin") && formatSummary.includes("2 courts"),
      "setup format summary names format and courts", formatSummary);
    console.assert(rosterSummary.includes("8 players") && rosterSummary.includes("8 named"),
      "setup roster summary counts named players", rosterSummary);
  }
  {
    const s = newState();
    s.setupStep = "bad";
    backfillStateDefaults(s);
    console.assert(s.setupStep === "format", "invalid setupStep backfills to format", s);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `setupStepSummary` does not exist.

- [ ] **Step 3: Implement helpers**

  Add:

  ```js
  const SETUP_STEPS = ["format", "roster", "options"];

  function setupRosterCountForState(s) {
    if (s.format === "crown") return 4;
    const names = Array.isArray(s.rawNames) ? s.rawNames : [];
    return clampSetupRosterCount(names.length || 8);
  }

  function setupStepSummary(s, step) {
    const formatLabel = formatDisplayName(s.format);
    const courtCount = effectiveCourtCountForFormat(s.format, s.courtCount);
    const count = setupRosterCountForState(s);
    const named = (s.rawNames || []).slice(0, count).filter(n => String(n || "").trim()).length;
    if (step === "format") return formatLabel + " · " + courtCount + " court" + (courtCount === 1 ? "" : "s");
    if (step === "roster") return count + " players · " + named + " named";
    if (step === "options") return s.timeBudget && s.timeBudget.enabled ? "Time budget on" : "Standard scoring";
    return "";
  }
  ```

  If `formatDisplayName()` does not exist, add it near format helpers and use the same names shown in `renderFormatChooser()`.

- [ ] **Step 4: Render progressive setup sections**

  Replace the current setup order in `renderSetup()` with:

  1. rules block
  2. setup section shell for Format
  3. setup section shell for Roster
  4. setup section shell for Options
  5. Start Tournament button and hint

  Extract existing `renderFormatChooser()` into the Format section, the roster list into `renderSetupRosterSection()`, and `renderTimeBudgetBlock()` into the Options section. Completed/inactive sections render a summary and an Edit button. The active section renders its full controls and a Continue button.

- [ ] **Step 5: Add CSS**

  Add styles for `.setup-flow`, `.setup-step`, `.setup-step.active`, `.setup-step-summary`, and `.setup-step-actions`. Keep the mobile layout one column.

- [ ] **Step 6: Verify**

  Run `?test` and `?simulate`. Manually check desktop and mobile setup, Crown setup, 8-player/2-court RR setup, and 13-player/3-court setup.

- [ ] **Step 7: Commit**

  ```bash
  git add index.html
  git commit -m "feat(setup): add progressive setup flow"
  ```

## Enhancement 2: Collapse Phone Fields By Default

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Setup phone visibility
  {
    const s = newState();
    s.rawPhones = Array(8).fill("");
    s.setupContactMode = false;
    console.assert(typeof shouldShowSetupPhones === "function", "shouldShowSetupPhones exists");
    console.assert(shouldShowSetupPhones(s) === false, "phones hidden for fresh setup");
    s.rawPhones[2] = "5551112222";
    console.assert(shouldShowSetupPhones(s) === true, "phones shown when saved phone exists");
    s.rawPhones[2] = "";
    s.setupContactMode = true;
    console.assert(shouldShowSetupPhones(s) === true, "phones shown in contact mode");
  }
  {
    const s = newState();
    s.rawPhones = ["", "5551112222", "", ""];
    console.assert(setupPhoneSummary(s).includes("1 saved"), "phone summary counts saved phones", setupPhoneSummary(s));
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because phone visibility helpers do not exist.

- [ ] **Step 3: Implement helpers**

  Add:

  ```js
  function setupPhoneCount(s) {
    return (s.rawPhones || []).filter(p => String(p || "").trim()).length;
  }

  function shouldShowSetupPhones(s) {
    return !!s.setupContactMode || setupPhoneCount(s) > 0;
  }

  function setupPhoneSummary(s) {
    const count = setupPhoneCount(s);
    if (shouldShowSetupPhones(s)) return count ? "Phones: " + count + " saved" : "Phone fields shown";
    return "Phones hidden";
  }
  ```

- [ ] **Step 4: Update setup roster rendering**

  In `renderSetupRosterSection()`, render name inputs always. Render phone inputs only when `shouldShowSetupPhones(state)` is true. Add a setup action button that toggles `state.setupContactMode`, saves, and re-renders. Button text is `Add phones`, `Hide phones`, or `Phones: N saved`.

  Do not change `state.rawPhones`, `_phoneAutofilled`, `rosterPhoneFor()`, or `saveRosterEntry()` behavior.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify fresh setup shows names only, expanding phones preserves autofill, collapsing phones preserves entered values, and a save with existing phones reloads with phone editing visible.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(setup): collapse phone fields by default"
  ```

## Enhancement 3: Roster Paste Preview

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Roster paste preview
  {
    console.assert(typeof parseRosterPaste === "function", "parseRosterPaste exists");
    const parsed = parseRosterPaste("Ava\t555-111-2222\nBen\t5553334444\nava\t5559990000\nCy", 3);
    console.assert(parsed.apply.length === 3, "paste preview applies first 3 unique rows", parsed);
    console.assert(parsed.apply[0].name === "Ava" && parsed.apply[0].phone === "5551112222",
      "paste preview extracts name and normalized phone", parsed);
    console.assert(parsed.skipped.some(r => r.reason === "duplicate"), "paste preview reports duplicate", parsed);
    console.assert(parsed.ok === true, "paste preview ok when enough unique rows exist", parsed);
  }
  {
    const parsed = parseRosterPaste("Ava\nAva", 4);
    console.assert(parsed.ok === false && parsed.error.includes("need 4"),
      "paste preview blocks too few unique names", parsed);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `parseRosterPaste` does not exist.

- [ ] **Step 3: Implement parser**

  Add `parseRosterPaste(text, count)` near `parsePastedNames()`. Return:

  ```js
  {
    ok: boolean,
    apply: [{ name, phone, sourceLine }],
    skipped: [{ name, phone, sourceLine, reason }],
    error: string
  }
  ```

  Use existing `normalizePhone()` and `isValidPhone()` where available. Detect spreadsheet rows by tabs first, then CSV-style commas. For a one-line comma-separated list with no valid phone cells, treat each comma item as a separate name.

- [ ] **Step 4: Replace immediate paste fill with preview**

  Update `openPasteModal()` so typing or clicking Preview renders two lists: rows that will apply and rows skipped. Apply writes only `playerCount` visible rows to `state.rawNames` and `state.rawPhones`. If any applied phone exists, set `state.setupContactMode = true`.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify names-only paste, spreadsheet paste, duplicate paste, too many rows, too few rows, and Crown 4-player paste.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(setup): preview pasted rosters with duplicates"
  ```

## Enhancement 4: Format Recommendation Helper

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Format recommendation helper
  {
    console.assert(typeof formatRecommendation === "function", "formatRecommendation exists");
    const social = formatRecommendation({ format: "rr", players: 8, courts: 2, timeBudgetEnabled: false, minutes: 90 });
    console.assert(social.recommended === "rr" && social.message.includes("Round Robin"),
      "8/2 social recommendation prefers Round Robin", social);
    const crown = formatRecommendation({ format: "crown", players: 4, courts: 1, timeBudgetEnabled: false, minutes: 120 });
    console.assert(crown.recommended === "crown", "4-player Crown recommendation", crown);
    const large = formatRecommendation({ format: "rr", players: 20, courts: 2, timeBudgetEnabled: true, minutes: 75 });
    console.assert(["king", "stack", "gauntlet"].includes(large.recommended),
      "large tight event recommends movement format", large);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `formatRecommendation` does not exist.

- [ ] **Step 3: Implement helper**

  Add a deterministic helper returning:

  ```js
  { recommended: "rr" | "stack" | "king" | "gauntlet" | "crown", message: string, reasonsByFormat: object }
  ```

  Keep the heuristic simple: Crown only at 4 players, RR for balanced social events with no tight budget and byes at or below one third, King/Stack for tight or larger competitive events, Gauntlet when many players need repeated ranking.

- [ ] **Step 4: Render helper in format chooser**

  In `renderFormatChooser()`, render one `.format-recommendation` line under the label and add a small `Recommended` badge to the matching format option.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify recommendations update when player count, courts, format, and time budget change.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(setup): recommend formats from players courts and time"
  ```

## Enhancement 5: Tournament Command Bar

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Tournament command bar model
  {
    console.assert(typeof commandBarModel === "function", "commandBarModel exists");
    const round = {
      round: 1,
      games: [
        { court: 1, team1: [1,2], team2: [3,4], score1: 11, score2: 7 },
        { court: 2, team1: [5,6], team2: [7,8], score1: null, score2: null }
      ],
      byes: [9]
    };
    const model = commandBarModel({ phase: "playing", format: "rr", currentRound: 1, rounds: [round] });
    console.assert(model.progress === "1/2 courts done", "command bar counts completed courts", model);
    console.assert(model.nextAction.includes("Court 2"), "command bar points to incomplete court", model);
    console.assert(model.byes.includes("1 sitting"), "command bar summarizes byes", model);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `commandBarModel` does not exist.

- [ ] **Step 3: Implement model and renderer**

  Add `commandBarModel(s)` and `renderCommandBar(model)`. The model exposes `title`, `progress`, `byes`, `nextAction`, and `phase`.

- [ ] **Step 4: Mount command bar**

  In `renderPlaying()`, render the command bar before court cards. In `renderFinalsScreen()`, render the finals command bar before the finals board/action area.

- [ ] **Step 5: Add CSS**

  Add `.command-bar` as sticky below the existing top header, with compact wrapping on mobile. Keep it readable without covering score inputs.

- [ ] **Step 6: Verify**

  Run `?test` and `?simulate`. Manually verify 8/2 RR, 13/3 with byes, incomplete round, complete round, final regular round, and finals.

- [ ] **Step 7: Commit**

  ```bash
  git add index.html
  git commit -m "feat(play): add tournament command bar"
  ```

## Enhancement 6: Scoreboard Vs Details Toggle

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Standings mode
  {
    console.assert(typeof standingsColumnsForMode === "function", "standingsColumnsForMode exists");
    const rrScoreboard = standingsColumnsForMode("rr", "scoreboard");
    const rrDetails = standingsColumnsForMode("rr", "details");
    console.assert(rrScoreboard.includes("W-L") && rrScoreboard.includes("GP"),
      "RR scoreboard includes W-L and GP", rrScoreboard);
    console.assert(rrDetails.includes("PPG") && rrDetails.includes("W/G"),
      "RR details keeps current advanced columns", rrDetails);
  }
  {
    const s = newState();
    s.standingsMode = "bad";
    backfillStateDefaults(s);
    console.assert(s.standingsMode === "scoreboard", "invalid standingsMode backfills", s);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `standingsColumnsForMode` does not exist.

- [ ] **Step 3: Implement mode helpers**

  Add `standingsColumnsForMode(format, mode)`, `renderStandingsModeToggle()`, and `setStandingsMode(mode)`.

- [ ] **Step 4: Update standings renderers**

  In each `render*StandingsCard()` function, render the segmented control in the card header. Scoreboard mode uses compact columns. Details mode preserves the current detailed tables and partner chips.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify RR, Stack, King, Gauntlet, Crown, mobile width, departed players, partner chips in details mode, and no partner chips in scoreboard mode.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(standings): add scoreboard and details modes"
  ```

## Enhancement 7: Dedicated Roster Panel During Play

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Roster panel availability
  {
    console.assert(typeof rosterPanelAvailable === "function", "rosterPanelAvailable exists");
    console.assert(rosterPanelAvailable({ phase: "playing", format: "rr" }) === true,
      "roster panel available during non-Crown play");
    console.assert(rosterPanelAvailable({ phase: "playing", format: "crown" }) === false,
      "roster panel hidden for Crown");
    console.assert(rosterPanelAvailable({ phase: "setup", format: "rr" }) === false,
      "roster panel hidden during setup");
    console.assert(rosterPanelAvailable({ phase: "finals", format: "rr" }) === false,
      "roster panel hidden during finals");
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `rosterPanelAvailable` does not exist.

- [ ] **Step 3: Extract roster panel**

  Move the current Manage Players section from `openSettings()` into `openRosterPanel()`. Keep the existing calls to `addMidEventPlayer()`, `markPlayerLeft()`, `returnMidEventPlayer()`, and `changeCourtCountMidEvent()` unchanged.

- [ ] **Step 4: Add entry points**

  Add a Roster button to the command bar when `rosterPanelAvailable(state)` is true. In Settings, replace the embedded roster manager with a button that closes Settings and opens `openRosterPanel()`.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify add, leave, return, court-count change, validation errors, Settings link, and no roster panel in setup/finals/Crown.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(roster): move live roster controls into dedicated panel"
  ```

## Enhancement 8: Split Settings Into Event Controls And App Settings

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Settings tabs
  {
    console.assert(typeof settingsSectionsForPhase === "function", "settingsSectionsForPhase exists");
    const playing = settingsSectionsForPhase({ phase: "playing", format: "rr" });
    console.assert(playing.event.includes("View full schedule") && playing.event.includes("Roster"),
      "event settings include schedule and roster", playing);
    console.assert(playing.app.includes("Keep awake") && playing.app.includes("Saved phone numbers"),
      "app settings include device and saved phone controls", playing);
  }
  {
    const s = newState();
    s.settingsTab = "bad";
    backfillStateDefaults(s);
    console.assert(s.settingsTab === "event", "invalid settingsTab backfills", s);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `settingsSectionsForPhase` does not exist.

- [ ] **Step 3: Extract settings sections**

  Split `openSettings()` internals into `renderEventSettings(modal, close)` and `renderAppSettings(modal, close)`. Keep behavior unchanged while moving code.

- [ ] **Step 4: Add tabs**

  Add a segmented tab control at the top of the modal. Switching tabs sets `state.settingsTab`, saves, and reopens or re-renders the modal content.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify setup settings, playing settings, finals settings, done settings, keep-awake diagnostics, saved phone deletion, reset/clear actions, and Event/App tab persistence.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(settings): split event controls from app settings"
  ```

## Enhancement 9: Finals Board Redesign

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Finals board model
  {
    console.assert(typeof finalsBoardModel === "function", "finalsBoardModel exists");
    const finals = { tiers: [
      { name: "Championship", court: 1, team1: [1,4], team2: [2,3], score1: null, score2: null },
      { name: "Consolation", court: 2, team1: [5,8], team2: [6,7], score1: null, score2: null }
    ], unseated: [9] };
    const model = finalsBoardModel(finals, new Map([[1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,7],[8,8],[9,9]]));
    console.assert(model.tiers.length === 2 && model.tiers[0].name === "Championship",
      "finals board includes tier cards", model);
    console.assert(model.unseated.length === 1, "finals board includes unseated summary", model);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `finalsBoardModel` does not exist.

- [ ] **Step 3: Implement board model and renderers**

  Add `finalsBoardModel(finals, seedMap)`, `renderFinalsBoard(model, refreshes)`, and `renderSeasonSeedsDetails(ranked)`. The model reads existing finals tiers and does not mutate state.

- [ ] **Step 4: Update finals screen**

  In `renderFinalsScreen()`, replace the always-open full seed card with the board action area, tier cards, collapsible season seeds, and unseated/departed summary.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify 8/2 finals, 13/3 finals, unseated players, all finals scores entered, Back to Round, and mobile layout.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(finals): redesign finals as tier board"
  ```

## Enhancement 10: Rename Non-Crown Final Action

**Files:**
- Modify: `index.html`
- Modify: `guide.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Final action labels
  {
    console.assert(typeof finalActionLabel === "function", "finalActionLabel exists");
    console.assert(finalActionLabel("rr") === "Finish Tournament", "RR final action label");
    console.assert(finalActionLabel("stack") === "Finish Tournament", "Stack final action label");
    console.assert(finalActionLabel("king") === "Finish Tournament", "King final action label");
    console.assert(finalActionLabel("gauntlet") === "Finish Tournament", "Gauntlet final action label");
    console.assert(finalActionLabel("crown") === "👑 Crown Champions", "Crown final action label");
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `finalActionLabel` does not exist.

- [ ] **Step 3: Implement label helper**

  Add:

  ```js
  function finalActionLabel(format) {
    return format === "crown" ? "👑 Crown Champions" : "Finish Tournament";
  }
  ```

  Use it in `renderFinalsScreen()` for non-Crown finals. Keep Crown-specific screens unchanged.

- [ ] **Step 4: Update guide copy**

  In `guide.html`, update the non-Crown finals instruction from `Crown Champions` to `Finish Tournament`. Keep Crown-specific wording if present.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify non-Crown finals button reads `Finish Tournament` and Crown still reads `👑 Crown Champions`.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html guide.html
  git commit -m "feat(finals): rename non-crown completion action"
  ```

## Final Acceptance Checklist

- [ ] Progressive setup renders Format, Roster, and Options as guided sections.
- [ ] Fresh setup hides phone inputs, and entered/pasted phones are preserved.
- [ ] Paste preview handles names-only, phones, spreadsheet rows, duplicates, too many rows, and too few rows.
- [ ] Format recommendation updates when roster count, courts, format, rounds, or time budget changes.
- [ ] Command bar accurately describes current tournament progress and next action.
- [ ] Standings toggle works across RR, Stack, King, Gauntlet, and Crown without changing rank order.
- [ ] Roster panel preserves existing add/leave/return/court-count behavior.
- [ ] Settings separates Event Controls and App Settings without losing existing controls.
- [ ] Finals board shows tier cards, court assignments, seed details, unseated players, and finish readiness.
- [ ] Non-Crown finals use `Finish Tournament`; Crown keeps `👑 Crown Champions`.
- [ ] 8-player/2-court Round Robin golden path remains behaviorally identical.
- [ ] `index.html?test` ends with exactly 1 failure.
- [ ] `index.html?simulate` ends with 0 failures.
