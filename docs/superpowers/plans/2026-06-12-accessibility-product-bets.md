# Accessibility And Product Bets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add accessibility/readability controls, tournament templates, and a smart setup assistant, while documenting multi-device score entry as a deferred product bet.

**Architecture:** Keep changes inside `index.html` except for guide/docs updates. Add persisted UI-only preferences, pure helpers for court identity, visual-noise options, template application, and assistant recommendations, then wire those helpers into existing render functions. Multi-device score entry is handled as a decision record and future-plan task, not production app code.

**Tech Stack:** Vanilla HTML, CSS, and JavaScript in the single-file PWA. Verification uses `runSelfTests()`, `runSimulation()`, and manual browser checks from `python3 -m http.server`.

**Source of truth:** `docs/superpowers/specs/2026-06-12-accessibility-product-bets-design.md`.

---

## Project Rules

- Work from repo root: `/Users/kenallred/Developer/rumble`.
- Preserve 8-player/2-court Round Robin behavior exactly.
- Add tests before implementation for every task.
- Run both gates after every task:
  - `http://127.0.0.1:8765/index.html?test` must end with exactly 1 failure.
  - `http://127.0.0.1:8765/index.html?simulate` must end with 0 failures.
- Commit after every task with the listed commit message.
- Match the existing `el()` helper style. No dependencies, frameworks, or build step.

## Files Map

- Modify: `index.html`
  - CSS: score-entry mode, high-contrast court badges, compact mobile tabs, reduced-noise table classes
  - State: `newState()`, `backfillStateDefaults(obj)`
  - Settings: `openSettings()`
  - Score entry: `renderCourtCard()`, `renderTeamRow()`
  - Court labels: `courtCardLabel()`, `courtTagLabel()`, `courtLocationLabel()`
  - Playing layout: `renderPlaying()`, `renderRoundCourts()`
  - Standings: `renderStandingsCard()`, `renderStackStandingsCard()`, `renderKingStandingsCard()`, `renderCrownStandingsCard()`
  - Setup: `renderSetup()`, `renderFormatChooser()`, `renderTimeBudgetBlock()`, `applyTimeBudgetSolve()`
  - Tests: `runSelfTests()`, `runSimulation()`
- Modify: `guide.html`
  - Add short notes once visible controls/templates exist.
- Create: `docs/superpowers/specs/2026-06-12-multi-device-score-entry-decision.md`
  - Decision record for the deferred multi-device bet.

## Task 1: Accessibility Preference Defaults

**Enhancements covered:** Large Score Entry Mode, High-Contrast Court Labels, Compact Mobile Tournament View, Reduced Visual Noise Controls

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  In `runSelfTests()`, add:

  ```js
  // Accessibility/product Task 1 - preference defaults
  {
    const s = newState();
    backfillStateDefaults(s);
    console.assert(s.accessibilityPrefs && s.accessibilityPrefs.largeScoreEntry === false,
      "accessibilityPrefs.largeScoreEntry defaults false", s);
    console.assert(s.accessibilityPrefs.highContrastCourts === false,
      "accessibilityPrefs.highContrastCourts defaults false", s);
    console.assert(s.accessibilityPrefs.compactMobileView === false,
      "accessibilityPrefs.compactMobileView defaults false", s);
    console.assert(s.accessibilityPrefs.reduceVisualNoise === false,
      "accessibilityPrefs.reduceVisualNoise defaults false", s);
    console.assert(s.accessibilityPrefs.showPartnerChips === true &&
      s.accessibilityPrefs.showPartnerBadges === true &&
      s.accessibilityPrefs.showTrajectory === true &&
      s.accessibilityPrefs.showAdvancedStats === true,
      "accessibilityPrefs detail toggles default true", s);
  }
  {
    const s = { phase: "setup", accessibilityPrefs: { largeScoreEntry: true, showPartnerChips: false } };
    backfillStateDefaults(s);
    console.assert(s.accessibilityPrefs.largeScoreEntry === true &&
      s.accessibilityPrefs.highContrastCourts === false &&
      s.accessibilityPrefs.showPartnerChips === false &&
      s.accessibilityPrefs.showAdvancedStats === true,
      "accessibilityPrefs backfills partial legacy prefs", s);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Open `index.html?test`.

  Expected: failures increase because `accessibilityPrefs` does not exist.

- [ ] **Step 3: Implement defaults**

  Add to `newState()` and `backfillStateDefaults(obj)`:

  ```js
  accessibilityPrefs: {
    largeScoreEntry: false,
    highContrastCourts: false,
    compactMobileView: false,
    reduceVisualNoise: false,
    showPartnerChips: true,
    showPartnerBadges: true,
    showTrajectory: true,
    showAdvancedStats: true,
  },
  lastAppliedTemplate: null,
  setupAssistant: {
    goal: "balanced",
    minutes: 90,
  },
  ```

- [ ] **Step 4: Add Settings controls**

  In `openSettings()`, add a "Readability" section with toggles for:

  - Large score entry
  - High-contrast court labels
  - Compact mobile tournament view
  - Reduce visual noise

  Each toggle mutates `state.accessibilityPrefs`, calls `save()`, and re-renders after closing or immediately when safe.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify Settings shows and persists the toggles.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(accessibility): add readability preference defaults"
  ```

## Task 2: Large Score Entry Mode

**Enhancement covered:** Large Score Entry Mode

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Accessibility/product Task 2 - large score mode classes
  {
    console.assert(typeof scoreEntryClass === "function", "scoreEntryClass exists");
    const standard = scoreEntryClass({ largeScoreEntry: false });
    const large = scoreEntryClass({ largeScoreEntry: true });
    console.assert(standard === "" && large.includes("large-score-entry"),
      "scoreEntryClass maps large preference to class", { standard, large });
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `scoreEntryClass` does not exist.

- [ ] **Step 3: Implement class helper**

  Add:

  ```js
  function scoreEntryClass(prefs = state.accessibilityPrefs || {}) {
    return prefs.largeScoreEntry ? "large-score-entry" : "";
  }
  ```

- [ ] **Step 4: Wire class into score UI**

  Add the class to the court row or court card root in `renderCourtCard()`, including Crown match cards. Keep score parsing and quick-fill behavior unchanged.

- [ ] **Step 5: Add CSS**

  Add CSS:

  ```css
  .large-score-entry .team-row { grid-template-columns: 1fr auto 140px; gap: 14px; }
  .large-score-entry .score-input { width: 140px; height: 84px; font-size: 40px; }
  .large-score-entry .quickfill-pill { min-height: 56px; padding: 10px 16px; font-size: 18px; }
  @media (max-width: 520px) {
    .large-score-entry .team-row { grid-template-columns: 1fr; }
    .large-score-entry .score-input { width: 100%; height: 88px; }
    .large-score-entry .quickfill-pill { justify-content: center; width: 100%; }
  }
  ```

  Adjust exact values if needed to avoid overflow, but keep the minimum touch targets.

- [ ] **Step 6: Verify**

  Run `?test` and `?simulate`. Manually verify regular rounds, finals, Crown, phone-width layout, and keyboard focus.

- [ ] **Step 7: Commit**

  ```bash
  git add index.html
  git commit -m "feat(accessibility): add large score entry mode"
  ```

## Task 3: High-Contrast Court Labels

**Enhancement covered:** High-Contrast Court Labels

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Accessibility/product Task 3 - court identity
  {
    console.assert(typeof courtIdentity === "function", "courtIdentity exists");
    const c1 = courtIdentity(1, "rr", { highContrast: true });
    const c6 = courtIdentity(6, "rr", { highContrast: true });
    const king = courtIdentity(1, "king", { highContrast: true });
    console.assert(c1.label === "Court 1" && c1.shortLabel === "C1",
      "courtIdentity labels court 1", c1);
    console.assert(c6.label === "Court 6" && c6.shortLabel === "C6",
      "courtIdentity labels court 6", c6);
    console.assert(king.label.includes("King"),
      "courtIdentity preserves King court language", king);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `courtIdentity` does not exist.

- [ ] **Step 3: Implement court identity helper**

  Add `courtIdentity(court, format, opts)` near the existing court label helpers. It returns:

  ```js
  { label, shortLabel, className, accentVar, highContrastLabel }
  ```

  Reuse existing `courtCardLabel()`, `courtTagLabel()`, and `courtLocationLabel()` text.

- [ ] **Step 4: Wire high-contrast labels**

  In `renderCourtCard()`, render the label as a badge when `state.accessibilityPrefs.highContrastCourts` is true. In schedule/history rows, use a high-contrast `.court-tag.hc` style when enabled.

- [ ] **Step 5: Add CSS**

  Add `.court-label-badge`, `.court-tag.hc`, and per-court high-contrast styles. Ensure contrast does not depend only on the accent color.

- [ ] **Step 6: Verify**

  Run `?test` and `?simulate`. Manually verify courts 1-6, Stack court 1, King court, finals tiers, Crown, schedule modal, and history.

- [ ] **Step 7: Commit**

  ```bash
  git add index.html
  git commit -m "feat(accessibility): add high-contrast court labels"
  ```

## Task 4: Compact Mobile Tournament View

**Enhancement covered:** Compact Mobile Tournament View

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Accessibility/product Task 4 - compact mobile model
  {
    console.assert(typeof compactMobileTabsForPhase === "function", "compactMobileTabsForPhase exists");
    const tabs = compactMobileTabsForPhase("playing");
    console.assert(JSON.stringify(tabs.map(t => t.id)) === JSON.stringify(["score", "standings", "more"]),
      "compact mobile playing tabs are score standings more", tabs);
  }
  {
    console.assert(typeof shouldUseCompactTournamentView === "function", "shouldUseCompactTournamentView exists");
    console.assert(shouldUseCompactTournamentView({ compactMobileView: true }, 390) === true,
      "compact view enabled on narrow screen");
    console.assert(shouldUseCompactTournamentView({ compactMobileView: true }, 900) === false,
      "compact view disabled on wide screen");
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because compact mobile helpers do not exist.

- [ ] **Step 3: Implement helpers**

  Add:

  ```js
  function compactMobileTabsForPhase(phase) {
    if (phase === "playing") return [
      { id: "score", label: "Score" },
      { id: "standings", label: "Standings" },
      { id: "more", label: "More" },
    ];
    return [];
  }

  function shouldUseCompactTournamentView(prefs, width) {
    return !!(prefs && prefs.compactMobileView) && width <= 640;
  }
  ```

- [ ] **Step 4: Add UI state**

  Add `state.mobileTournamentTab = "score"` with backfill. Keep invalid values reset to `"score"`.

- [ ] **Step 5: Refactor `renderPlaying()` layout**

  Extract the current sections into variables:

  - byes/courts/action as Score
  - standings as Standings
  - text results/history as More

  When `shouldUseCompactTournamentView(state.accessibilityPrefs, window.innerWidth)` is true, render a segmented tab control and only the active section. Otherwise keep today's full layout.

- [ ] **Step 6: Add CSS**

  Add `.mobile-tourney-tabs`, `.mobile-tourney-tab`, `.mobile-tourney-panel`. Ensure tab buttons are at least 44px tall and sticky only if it does not cover score inputs.

- [ ] **Step 7: Verify**

  Run `?test` and `?simulate`. Manually verify mobile width, desktop width, current score editing, advance button updates, standings refresh, text results, and history.

- [ ] **Step 8: Commit**

  ```bash
  git add index.html
  git commit -m "feat(mobile): add compact tournament view"
  ```

## Task 5: Reduced Visual Noise Controls

**Enhancement covered:** Reduced Visual Noise Controls

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Accessibility/product Task 5 - visual noise options
  {
    console.assert(typeof visualNoiseOptions === "function", "visualNoiseOptions exists");
    const full = visualNoiseOptions({ reduceVisualNoise: false, showPartnerChips: true,
      showPartnerBadges: true, showTrajectory: true, showAdvancedStats: true });
    const quiet = visualNoiseOptions({ reduceVisualNoise: true, showPartnerChips: true,
      showPartnerBadges: true, showTrajectory: true, showAdvancedStats: true });
    console.assert(full.partnerChips === true && full.advancedStats === true,
      "visualNoiseOptions keeps full detail by default", full);
    console.assert(quiet.partnerChips === false && quiet.partnerBadges === false &&
      quiet.trajectory === false && quiet.advancedStats === false,
      "visualNoiseOptions master toggle hides noisy details", quiet);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `visualNoiseOptions` does not exist.

- [ ] **Step 3: Implement helper**

  Add:

  ```js
  function visualNoiseOptions(prefs = state.accessibilityPrefs || {}) {
    if (prefs.reduceVisualNoise) {
      return {
        partnerChips: false,
        partnerBadges: false,
        trajectory: false,
        advancedStats: false,
      };
    }
    return {
      partnerChips: prefs.showPartnerChips !== false,
      partnerBadges: prefs.showPartnerBadges !== false,
      trajectory: prefs.showTrajectory !== false,
      advancedStats: prefs.showAdvancedStats !== false,
    };
  }
  ```

- [ ] **Step 4: Wire standings renderers**

  In `renderStandingsCard()`, `renderStackStandingsCard()`, and `renderKingStandingsCard()`, use `visualNoiseOptions()` to suppress:

  - partner chips
  - partner badges
  - trajectory arrows
  - advanced columns with class `col-hide-mobile` or format-specific extra columns

  Keep rank order and core columns visible.

- [ ] **Step 5: Add fine-grained Settings controls**

  Under the master Reduce visual noise toggle, add checkboxes for partner chips, partner badges, trajectory arrows, and advanced stats. Disable or visually subordinate them while master reduction is on.

- [ ] **Step 6: Verify**

  Run `?test` and `?simulate`. Manually verify RR, Stack, King, Gauntlet, Crown, mobile width, and final standings.

- [ ] **Step 7: Commit**

  ```bash
  git add index.html
  git commit -m "feat(accessibility): add visual noise controls"
  ```

## Task 6: Tournament Templates

**Enhancement covered:** Tournament Templates

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Accessibility/product Task 6 - tournament templates
  {
    console.assert(typeof TOURNAMENT_TEMPLATES !== "undefined", "TOURNAMENT_TEMPLATES exists");
    console.assert(TOURNAMENT_TEMPLATES.some(t => t.id === "lunch-45"), "Lunch Break template exists");
    console.assert(TOURNAMENT_TEMPLATES.some(t => t.id === "club-90"), "Club Night template exists");
    console.assert(TOURNAMENT_TEMPLATES.some(t => t.id === "competitive-ladder"), "Competitive Ladder template exists");
    console.assert(TOURNAMENT_TEMPLATES.some(t => t.id === "social-mixer"), "Social Mixer template exists");
  }
  {
    console.assert(typeof templateConfigFor === "function", "templateConfigFor exists");
    const cfg = templateConfigFor("lunch-45", { players: 8, courts: 2 });
    console.assert(cfg.format === "rr" && cfg.rrRounds === 4 &&
      cfg.timeBudget.enabled === true && cfg.timeBudget.minutes === 45,
      "Lunch template config", cfg);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because template constants/helpers do not exist.

- [ ] **Step 3: Implement template definitions**

  Add `TOURNAMENT_TEMPLATES`, `templateConfigFor(id, context)`, and `applyTournamentTemplate(id)`.

  Applying a template sets only setup fields:

  - `state.format`
  - `state.courtCount` only after confirmation if the template recommends changing it
  - `state.rrRounds`, `state.stackRounds`, `state.kingRounds`, or `state.gauntletRounds`
  - `state.timeBudget`
  - `state.winScore`, `state.winBy`, `state.scoringSystem`
  - `state.lastAppliedTemplate`

- [ ] **Step 4: Render templates on setup**

  Add a "Templates" card above or inside `renderFormatChooser()` with four compact template buttons. Show current applied template summary and "Edit manually anytime" copy.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify each template at 8/2, 13/3, bye-heavy 24/2, and Crown guard behavior.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(setup): add tournament templates"
  ```

## Task 7: Smart Setup Assistant

**Enhancement covered:** Smart Setup Assistant

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add failing self-tests**

  ```js
  // Accessibility/product Task 7 - smart setup assistant
  {
    console.assert(typeof recommendSetups === "function", "recommendSetups exists");
    const social = recommendSetups({ players: 8, courts: 2, minutes: 90, goal: "social" });
    console.assert(social[0].format === "rr" && social[0].tradeoffs.length > 0,
      "social recommendation prefers RR with tradeoffs", social);
    const competitive = recommendSetups({ players: 12, courts: 3, minutes: 90, goal: "competitive" });
    console.assert(["stack", "king", "gauntlet"].includes(competitive[0].format),
      "competitive recommendation prefers movement/ranked format", competitive);
    const fastest = recommendSetups({ players: 16, courts: 2, minutes: 45, goal: "fastest" });
    console.assert(fastest[0].timeBudget.enabled === true && fastest[0].warnings.length >= 1,
      "fastest recommendation uses time budget and warnings", fastest);
  }
  ```

- [ ] **Step 2: Run test to verify failure**

  Expected: failures increase because `recommendSetups` does not exist.

- [ ] **Step 3: Implement recommendation helpers**

  Add deterministic helpers using only existing setup fields and pure calculations:

  ```js
  function setupRoundCountFor(format, players, courts, goal) {
    if (format === "rr") return players === 8 && courts === 2 ? 7 : (goal === "fastest" ? 4 : 6);
    if (format === "stack") return goal === "fastest" ? 4 : 8;
    if (format === "king" || format === "gauntlet") return goal === "fastest" ? 6 : 8;
    return 3;
  }

  function recommendationFor(format, title, ctx, tradeoffs) {
    const rounds = setupRoundCountFor(format, ctx.players, ctx.courts, ctx.goal);
    const shape = roundShapeFor(ctx.players, effectiveCourtCountForFormat(format, ctx.courts));
    const warnings = [];
    if (shape.byesNeeded > ctx.players / 3) warnings.push("More than one third of players sit each round.");
    if (ctx.minutes < 60) warnings.push("Short event: use rally scoring or fewer rounds.");
    return {
      id: format + "-" + ctx.goal + "-" + ctx.minutes,
      title,
      format,
      courtCount: ctx.courts,
      rounds,
      timeBudget: { enabled: true, minutes: ctx.minutes },
      scoring: ctx.goal === "fastest"
        ? { target: 7, winBy: 1, system: "rally" }
        : { target: 11, winBy: 2, system: "sideout" },
      tradeoffs: tradeoffs.concat(shape.byesNeeded ? [shape.byesNeeded + " sitting each round"] : ["everyone plays each round"]),
      warnings,
    };
  }

  function recommendSetups({ players, courts, minutes, goal }) {
    const ctx = {
      players: clampSetupRosterCount(players),
      courts: effectiveCourtCountForFormat("rr", courts),
      minutes: parseInt(minutes, 10) || 90,
      goal: goal || "balanced",
    };
    const recs = [];
    if (ctx.goal === "competitive") {
      recs.push(recommendationFor("stack", "Competitive Ladder", ctx, ["court movement rewards winning"]));
      recs.push(recommendationFor("king", "King of the Court", ctx, ["clear top-court pressure"]));
      recs.push(recommendationFor("gauntlet", "Ranked Gauntlet", ctx, ["re-ranks after every round"]));
    } else if (ctx.goal === "fastest") {
      recs.push(recommendationFor("rr", "Fast Mixer", ctx, ["few rounds", "fast rally scoring"]));
      recs.push(recommendationFor("stack", "Fast Ladder", ctx, ["movement format", "shorter scoring"]));
    } else {
      recs.push(recommendationFor("rr", ctx.goal === "social" ? "Social Mixer" : "Round Robin Mixer", ctx,
        ["best partner variety", "easy to explain"]));
      recs.push(recommendationFor("king", "Light Competitive Option", ctx, ["movement without complex standings"]));
    }
    return recs;
  }

  function applySetupRecommendation(rec) {
    state.format = rec.format;
    state.courtCount = rec.courtCount;
    if (rec.format === "rr") state.rrRounds = rec.rounds;
    if (rec.format === "stack") state.stackRounds = rec.rounds;
    if (rec.format === "king") state.kingRounds = rec.rounds;
    if (rec.format === "gauntlet") state.gauntletRounds = rec.rounds;
    state.timeBudget.enabled = !!rec.timeBudget.enabled;
    state.timeBudget.minutes = rec.timeBudget.minutes;
    state.winScore = rec.scoring.target;
    state.winBy = rec.scoring.winBy;
    state.scoringSystem = rec.scoring.system;
    state.lastAppliedTemplate = null;
    state.setupAssistant.goal = state.setupAssistant.goal || "balanced";
    save();
    return { ok: true };
  }

  function setupRecommendationSummary(rec) {
    return rec.title + ": " + rec.rounds + " rounds, " + rec.courtCount + " court" +
      (rec.courtCount === 1 ? "" : "s") + ", " + rec.scoring.system + " to " + rec.scoring.target + ".";
  }
  ```

  Recommendations must include `{ id, title, format, courtCount, rounds, timeBudget, scoring, tradeoffs, warnings }`.

- [ ] **Step 4: Add assistant modal**

  Add a "Setup Assistant" button near templates. Modal asks player count, courts, minutes, and goal. Show 2-3 recommendation cards with Apply buttons. Applying a card writes the same setup fields as templates and leaves controls editable.

- [ ] **Step 5: Verify**

  Run `?test` and `?simulate`. Manually verify social, balanced, competitive, fastest, invalid player/court counts, Crown exclusion, and time-budget interactions.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "feat(setup): add smart setup assistant"
  ```

## Task 8: Multi-Device Score Entry Decision Record

**Enhancement covered:** Multi-Device Score Entry

**Files:**
- Create: `docs/superpowers/specs/2026-06-12-multi-device-score-entry-decision.md`

- [ ] **Step 1: Create the decision record**

  Add:

  ```markdown
  # Multi-Device Score Entry Decision

  ## Decision

  Do not implement production multi-device score entry in the accessibility/product-bets branch.

  ## Rationale

  Browser-only PWAs cannot host reliable local score-entry sessions for other phones. A production version needs authentication, role-scoped court links, conflict handling, offline behavior, and an authoritative event log.

  ## Prerequisites

  - Event Log and Undo
  - TV / Projector Mode
  - QR Snapshot
  - Share/export result surfaces
  - Command-log mutation model

  ## Recommended Future Architecture

  - Cloud session per tournament
  - Organizer remains authoritative
  - Court scorer links are scoped to a court and round
  - Remote score submissions become pending events
  - Conflicts require organizer confirmation

  ## Non-Goals For Now

  - No backend
  - No account system
  - No remote score mutation
  - No silent conflict resolution
  ```

- [ ] **Step 2: Verify the decision is linked**

  Add this exact sentence under the Multi-Device Score Entry section in `docs/superpowers/specs/2026-06-12-accessibility-product-bets-design.md`:

  ```markdown
  The implementation decision is recorded in `docs/superpowers/specs/2026-06-12-multi-device-score-entry-decision.md`.
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add docs/superpowers/specs/2026-06-12-multi-device-score-entry-decision.md docs/superpowers/specs/2026-06-12-accessibility-product-bets-design.md
  git commit -m "docs(product): defer multi-device score entry behind readiness gates"
  ```

## Task 9: Guide And Final Acceptance

**Enhancements covered:** All accessibility/readability work and product bets

**Files:**
- Modify: `index.html`
- Modify: `guide.html`

- [ ] **Step 1: Add final surface availability tests**

  ```js
  // Accessibility/product final surface availability
  {
    [
      "scoreEntryClass",
      "courtIdentity",
      "compactMobileTabsForPhase",
      "visualNoiseOptions",
      "templateConfigFor",
      "applyTournamentTemplate",
      "recommendSetups",
      "applySetupRecommendation"
    ].forEach(name => console.assert(typeof window[name] === "function", name + " is available"));
  }
  ```

- [ ] **Step 2: Update guide copy**

  In `guide.html`, add short notes for:

  - Large Score Entry Mode
  - High-Contrast Court Labels
  - Compact Mobile View
  - Reduced Visual Noise
  - Tournament Templates
  - Setup Assistant

  Mention that multi-device score entry is not currently available.

- [ ] **Step 3: Run full verification**

  Run:

  ```bash
  python3 -m http.server 8765 --bind 127.0.0.1 -d .
  ```

  Verify:

  - `index.html?test` ends with exactly 1 failure
  - `index.html?simulate` ends with 0 failures
  - score entry large mode on phone and desktop
  - high-contrast labels across courts 1-6 and finals
  - compact mobile tabs
  - visual-noise toggles
  - every template
  - every assistant goal

- [ ] **Step 4: Commit**

  ```bash
  git add index.html guide.html
  git commit -m "feat: accessibility and setup guidance final verification"
  ```

## Final Acceptance Checklist

- [ ] Large Score Entry Mode increases score input and quick-fill target sizes without changing score behavior.
- [ ] High-Contrast Court Labels make court identity readable without relying on color.
- [ ] Compact Mobile Tournament View prioritizes scoring and next action on narrow screens.
- [ ] Reduced Visual Noise toggles hide partner chips, badges, arrows, and advanced stats without changing rank order.
- [ ] Tournament Templates apply setup presets while leaving manual controls editable.
- [ ] Smart Setup Assistant recommends setups with clear tradeoffs and applies only existing setup fields.
- [ ] Multi-Device Score Entry is documented as deferred with prerequisites and future architecture.
- [ ] 8-player/2-court Round Robin behavior is unchanged.
- [ ] `index.html?test` ends with exactly 1 failure.
- [ ] `index.html?simulate` ends with 0 failures.
