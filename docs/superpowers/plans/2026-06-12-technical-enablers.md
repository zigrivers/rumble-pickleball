# Technical Enablers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add internal boundary checks and a visual regression/playbook harness, then prepare a safe path to a generated single-file source split while preserving Rumble's no-framework PWA delivery model.

**Architecture:** Start with documentation and machine-checked section sentinels around the existing `index.html`. Add dev-only Playwright visual tests for deterministic app states. Only after visual baselines exist, introduce source-split tooling that can generate the committed root `index.html` deterministically.

**Tech Stack:** Vanilla HTML/CSS/JS app. Dev-only Node scripts and Playwright test runner for checks and visual regression. No runtime dependency, no frontend framework, no bundler-driven app architecture.

**Source of truth:** `docs/superpowers/specs/2026-06-12-technical-enablers-design.md`.

---

## Project Rules

- Work from repo root: `/Users/kenallred/Developer/rumble`.
- Preserve root `index.html` as the shipped app.
- Do not change tournament behavior.
- Run gates after every task:
  - `index.html?test` must end with exactly 1 failure.
  - `index.html?simulate` must end with 0 failures.
- Commit after every task with the listed commit message.
- Do not bump `sw.js` unless a later release task explicitly asks for a production cache update.

## Files Map

- Modify: `index.html`
  - Add section sentinels only when boundary checks need them.
- Create: `docs/architecture/index-boundaries.md`
  - Human-readable module map for the current file.
- Create: `tools/check-index-boundaries.mjs`
  - Verifies section sentinels/order.
- Create: `package.json`
  - Dev-only scripts for checks and visual tests.
- Create: `tools/visual-state-fixtures.mjs`
  - Deterministic state builders for visual playbook.
- Create: `tests/visual/rumble.visual.spec.mjs`
  - Playwright screenshot tests.
- Create: `tests/visual/README.md`
  - How to update/review baselines.
- Create later: `tools/build-index.mjs`, `src/index.template.html`, `src/styles/*`, `src/js/*`
  - Generated single-file source-split path.

## Task 1: Boundary Map And Section Sentinels

**Goal:** Document current `index.html` responsibilities and add machine-checkable section boundaries without moving code.

**Files:**
- Modify: `index.html`
- Create: `docs/architecture/index-boundaries.md`
- Create: `tools/check-index-boundaries.mjs`
- Modify or create: `package.json`

- [ ] **Step 1: Write the boundary map**

  Create `docs/architecture/index-boundaries.md` with this structure:

  ```markdown
  # Index Boundaries

  ## Purpose

  `index.html` is still the deployed app, but contributors should treat it as ordered internal modules.

  ## Boundaries

  | Boundary | Responsibility | Sentinel |
  | --- | --- | --- |
  | Shell | HTML skeleton and CSS | `RUMBLE:STYLE` |
  | State/Persistence | state shape, migrations, storage | `RUMBLE:STATE` |
  | Tests/Simulation | inline self-tests and simulator | `RUMBLE:TESTS` |
  | Core Scheduling | courts, rounds, byes, pairing | `RUMBLE:CORE` |
  | Format Engines | Stack, King, Gauntlet, Crown | `RUMBLE:FORMATS` |
  | Stats/Awards | standings, rankings, awards | `RUMBLE:STATS` |
  | Rendering | setup, play, finals, done renderers | `RUMBLE:RENDER` |
  | Settings/Modals | settings, schedule, help, dialogs | `RUMBLE:MODALS` |
  | Boot/PWA | render boot, service worker registration | `RUMBLE:BOOT` |

  ## Rule

  New work should extend the nearest existing boundary. Cross-boundary helpers should be pure and named.
  ```

- [ ] **Step 2: Add section sentinels to `index.html`**

  Add comments at the existing section boundaries:

  ```html
  <!-- RUMBLE:STYLE:start -->
  ```

  and:

  ```html
  <!-- RUMBLE:STYLE:end -->
  ```

  For JavaScript sections, use:

  ```js
  // RUMBLE:STATE:start
  // RUMBLE:STATE:end
  ```

  Add sentinels for `STATE`, `TESTS`, `CORE`, `FORMATS`, `STATS`, `RENDER`, `MODALS`, and `BOOT`. Do not move functions in this task.

- [ ] **Step 3: Add boundary checker**

  Create `tools/check-index-boundaries.mjs`:

  ```js
  import fs from "node:fs";

  const html = fs.readFileSync("index.html", "utf8");
  const sections = ["STYLE", "STATE", "TESTS", "CORE", "FORMATS", "STATS", "RENDER", "MODALS", "BOOT"];
  let last = -1;
  const failures = [];

  for (const section of sections) {
    const start = html.indexOf("RUMBLE:" + section + ":start");
    const end = html.indexOf("RUMBLE:" + section + ":end");
    if (start === -1) failures.push(section + " missing start sentinel");
    if (end === -1) failures.push(section + " missing end sentinel");
    if (start !== -1 && end !== -1 && start > end) failures.push(section + " start appears after end");
    if (start !== -1 && start < last) failures.push(section + " appears out of order");
    if (end !== -1) last = end;
  }

  if (failures.length) {
    console.error("[check-index-boundaries] failed");
    failures.forEach(f => console.error("- " + f));
    process.exit(1);
  }

  console.log("[check-index-boundaries] ok - " + sections.length + " sections");
  ```

- [ ] **Step 4: Add npm script**

  If `package.json` does not exist, create:

  ```json
  {
    "name": "rumble-pickleball",
    "private": true,
    "type": "module",
    "scripts": {
      "check:index": "node tools/check-index-boundaries.mjs"
    }
  }
  ```

  If `package.json` exists, add only the `check:index` script.

- [ ] **Step 5: Verify**

  Run:

  ```bash
  npm run check:index
  python3 -m http.server 8765 --bind 127.0.0.1 -d .
  ```

  Open `index.html?test` and confirm exactly 1 failure. Open `index.html?simulate` and confirm 0 failures.

- [ ] **Step 6: Commit**

  ```bash
  git add index.html docs/architecture/index-boundaries.md tools/check-index-boundaries.mjs package.json
  git commit -m "chore(architecture): document and check index boundaries"
  ```

## Task 2: URL Gate Runner For Existing Browser Checks

**Goal:** Add a scriptable way to verify `?test` and `?simulate` output before introducing visual tests.

**Files:**
- Create: `tools/run-url-check.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create URL check script**

  Create `tools/run-url-check.mjs`:

  ```js
  import { chromium } from "@playwright/test";

  const [url, expectedFlag, expectedValue] = process.argv.slice(2);
  if (!url || expectedFlag !== "--expected-failures" || expectedValue == null) {
    console.error("Usage: node tools/run-url-check.mjs <url> --expected-failures <n>");
    process.exit(2);
  }

  const expected = Number(expectedValue);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on("console", msg => logs.push(msg.text()));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await browser.close();

  const joined = logs.join("\n");
  const match = joined.match(/\[(self-tests|simulation)\].*?(\d+) failure\(s\)/);
  if (!match) {
    console.error(joined);
    console.error("Could not find failure count in console output.");
    process.exit(1);
  }

  const actual = Number(match[2]);
  if (actual !== expected) {
    console.error(joined);
    console.error("Expected " + expected + " failure(s), got " + actual + ".");
    process.exit(1);
  }

  console.log(url + " -> " + actual + " failure(s)");
  ```

- [ ] **Step 2: Add Playwright dev dependency and scripts**

  Update `package.json`:

  ```json
  {
    "scripts": {
      "check:index": "node tools/check-index-boundaries.mjs",
      "test:self": "node tools/run-url-check.mjs http://127.0.0.1:8765/index.html?test --expected-failures 1",
      "test:simulate": "node tools/run-url-check.mjs http://127.0.0.1:8765/index.html?simulate --expected-failures 0"
    },
    "devDependencies": {
      "@playwright/test": "^1.56.0"
    }
  }
  ```

  Preserve existing package fields.

- [ ] **Step 3: Install and verify**

  Run:

  ```bash
  npm install
  npx playwright install chromium
  python3 -m http.server 8765 --bind 127.0.0.1 -d .
  npm run test:self
  npm run test:simulate
  npm run check:index
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add package.json package-lock.json tools/run-url-check.mjs
  git commit -m "test: script browser self-test and simulation gates"
  ```

## Task 3: Visual State Fixtures

**Goal:** Add deterministic localStorage fixtures for the visual playbook states.

**Files:**
- Create: `tools/visual-state-fixtures.mjs`

- [ ] **Step 1: Create fixture builders**

  Create `tools/visual-state-fixtures.mjs`:

  ```js
  const names = [
    "Ava", "Ben", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal",
    "Ivy", "Jay", "Kai", "Liv", "Mia", "Noah", "Owen", "Pia"
  ];

  function player(slot) {
    return {
      slot,
      name: names[slot - 1] || "Player " + slot,
      phone: "",
      status: "active",
      eligibleFromRound: 1,
      joinedRound: 1,
      leftRound: null
    };
  }

  function game(court, team1, team2, score1 = null, score2 = null) {
    return {
      court,
      team1,
      team2,
      score1,
      score2,
      gameStartedAt: 1790000000000,
      gameEndedAt: Number.isInteger(score1) && Number.isInteger(score2) ? 1790000300000 : null,
      pauseSec: 0
    };
  }

  function baseState() {
    return {
      phase: "setup",
      format: "rr",
      rawNames: names.slice(0, 8),
      rawPhones: Array(8).fill(""),
      slots: names.slice(0, 8),
      phones: Array(8).fill(""),
      players: names.slice(0, 8).map((_, i) => player(i + 1)),
      currentRound: 1,
      rounds: [],
      finals: null,
      tiebreakRandom: [0,1,2,3,4,5,6,7],
      awardsShown: false,
      winScore: 11,
      winBy: 2,
      scoringSystem: "sideout",
      notifiedRounds: [],
      stackRounds: 8,
      kingRounds: 8,
      gauntletRounds: 8,
      rrRounds: 7,
      courtCount: 2,
      scheduleSeed: 12345,
      rrScheduleMode: "wh8",
      previousRanks: [],
      timeBudget: { enabled: false, minutes: 90, plannedConfig: null, startedAt: 0 }
    };
  }

  export function setupDesktopState() {
    return baseState();
  }

  export function playing13p3cState() {
    const s = baseState();
    s.phase = "playing";
    s.rawNames = names.slice(0, 13);
    s.slots = names.slice(0, 13);
    s.players = names.slice(0, 13).map((_, i) => player(i + 1));
    s.courtCount = 3;
    s.rrRounds = 6;
    s.rrScheduleMode = "generated";
    s.rounds = [
      { round: 1, games: [
        game(1, [1,4], [2,3], 11, 8),
        game(2, [5,8], [6,7], 9, 11),
        game(3, [9,12], [10,11])
      ], byes: [13] },
      { round: 2, games: [
        game(1, [1,5], [3,7]),
        game(2, [2,6], [4,8]),
        game(3, [9,13], [10,12])
      ], byes: [11] }
    ];
    s.currentRound = 2;
    return s;
  }

  export function finals13p3cState() {
    const s = playing13p3cState();
    s.phase = "finals";
    s.finals = {
      tiers: [
        game(1, [1,4], [2,3]),
        Object.assign(game(2, [5,8], [6,7]), { name: "Consolation" }),
        Object.assign(game(3, [9,12], [10,11]), { name: "Bronze" })
      ],
      unseated: [13]
    };
    s.finals.tiers[0].name = "Championship";
    return s;
  }

  export function doneTextResultsState() {
    const s = finals13p3cState();
    s.phase = "done";
    s.finals.tiers = s.finals.tiers.map((g, i) => Object.assign({}, g, {
      score1: i === 0 ? 11 : 9,
      score2: i === 0 ? 7 : 11,
      gameEndedAt: 1790000600000
    }));
    s.phones = s.slots.map((_, i) => i < 4 ? "555000000" + (i + 1) : "");
    s.players.forEach((p, i) => { p.phone = s.phones[i] || ""; });
    return s;
  }

  export function stateForVisual(name) {
    if (name === "setup-desktop" || name === "setup-mobile") return setupDesktopState();
    if (name === "playing-13p-3c" || name === "settings-modal") return playing13p3cState();
    if (name === "finals-13p-3c") return finals13p3cState();
    if (name === "text-results") return doneTextResultsState();
    throw new Error("Unknown visual state: " + name);
  }
  ```

- [ ] **Step 2: Add a fixture sanity check**

  Add this export:

  ```js
  export function listVisualStates() {
    return ["setup-desktop", "setup-mobile", "playing-13p-3c", "settings-modal", "finals-13p-3c", "text-results"];
  }
  ```

  Create a one-line check in the same file:

  ```js
  if (process.argv[1] && process.argv[1].endsWith("visual-state-fixtures.mjs")) {
    console.log(listVisualStates().join("\n"));
  }
  ```

- [ ] **Step 3: Verify**

  Run:

  ```bash
  node tools/visual-state-fixtures.mjs
  npm run check:index
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add tools/visual-state-fixtures.mjs
  git commit -m "test(visual): add deterministic state fixtures"
  ```

## Task 4: Playwright Visual Playbook

**Goal:** Add screenshot tests for setup desktop/mobile, active tournament, settings modal, finals, text results, and guide.

**Files:**
- Create: `tests/visual/rumble.visual.spec.mjs`
- Create: `tests/visual/README.md`
- Modify: `package.json`

- [ ] **Step 1: Create visual spec**

  Create `tests/visual/rumble.visual.spec.mjs`:

  ```js
  import { test, expect } from "@playwright/test";
  import { stateForVisual } from "../../tools/visual-state-fixtures.mjs";

  const STORAGE_KEY = "pb_tourney_v5";
  const BASE = "http://127.0.0.1:8765";

  async function seedState(page, name) {
    const state = stateForVisual(name);
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    await page.evaluate(({ key, value }) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(value));
    }, { key: STORAGE_KEY, value: state });
    await page.reload({ waitUntil: "load" });
  }

  test("setup desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedState(page, "setup-desktop");
    await expect(page).toHaveScreenshot("setup-desktop.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
  });

  test("setup mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedState(page, "setup-mobile");
    await expect(page).toHaveScreenshot("setup-mobile.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
  });

  test("playing 13 players 3 courts", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedState(page, "playing-13p-3c");
    await expect(page).toHaveScreenshot("playing-13p-3c.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
  });

  test("settings modal", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedState(page, "settings-modal");
    await page.getByLabel("Settings").click();
    await expect(page).toHaveScreenshot("settings-modal.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
  });

  test("finals 13 players 3 courts", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedState(page, "finals-13p-3c");
    await expect(page).toHaveScreenshot("finals-13p-3c.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
  });

  test("text results", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedState(page, "text-results");
    await expect(page).toHaveScreenshot("text-results.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
  });

  test("guide flex section", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(BASE + "/guide.html#flex", { waitUntil: "load" });
    await expect(page).toHaveScreenshot("guide-flex.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
  });
  ```

- [ ] **Step 2: Add visual scripts**

  Update `package.json` scripts:

  ```json
  {
    "test:visual": "playwright test tests/visual/rumble.visual.spec.mjs",
    "test:visual:update": "playwright test tests/visual/rumble.visual.spec.mjs --update-snapshots"
  }
  ```

- [ ] **Step 3: Add README**

  Create `tests/visual/README.md`:

  ```markdown
  # Visual Playbook

  Start the local server before running visual tests:

  ```bash
  python3 -m http.server 8765 --bind 127.0.0.1 -d .
  ```

  Verify screenshots:

  ```bash
  npm run test:visual
  ```

  Update baselines after intentional UI changes:

  ```bash
  npm run test:visual:update
  ```

  Review every changed PNG before committing. Screenshots protect layout and readability, not tournament behavior.
  ```

- [ ] **Step 4: Generate baselines**

  Run:

  ```bash
  python3 -m http.server 8765 --bind 127.0.0.1 -d .
  npm run test:visual:update
  npm run test:visual
  ```

  Review each generated screenshot before committing.

- [ ] **Step 5: Run behavior gates**

  Run:

  ```bash
  npm run test:self
  npm run test:simulate
  npm run check:index
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add package.json tests/visual tools/visual-state-fixtures.mjs
  git commit -m "test(visual): add playbook screenshot coverage"
  ```

## Task 5: Build Script In Verify-Only Mode

**Goal:** Introduce deterministic generated-single-file tooling without changing root `index.html` ownership yet.

**Files:**
- Create: `tools/build-index.mjs`
- Create: `src/index.template.html`
- Create: `src/README.md`
- Modify: `package.json`

- [ ] **Step 1: Create source template**

  Create `src/index.template.html` as a byte-for-byte copy of current `index.html`.

  Create `src/README.md`:

  ```markdown
  # Source Split Staging

  Root `index.html` remains the deployed app. This directory stages a deterministic generated-single-file path.

  `npm run build:index` writes root `index.html` from `src/index.template.html`.
  `npm run check:generated` verifies root `index.html` is current.
  ```

- [ ] **Step 2: Create build script**

  Create `tools/build-index.mjs`:

  ```js
  import fs from "node:fs";
  import crypto from "node:crypto";

  const mode = process.argv.includes("--check") ? "check" : "write";
  const source = fs.readFileSync("src/index.template.html", "utf8");
  const current = fs.existsSync("index.html") ? fs.readFileSync("index.html", "utf8") : "";

  function sha(text) {
    return crypto.createHash("sha256").update(text).digest("hex");
  }

  if (mode === "check") {
    if (source !== current) {
      console.error("index.html is stale.");
      console.error("src sha:   " + sha(source));
      console.error("index sha: " + sha(current));
      process.exit(1);
    }
    console.log("[build-index] index.html is current (" + sha(current).slice(0, 12) + ")");
  } else {
    fs.writeFileSync("index.html", source);
    console.log("[build-index] wrote index.html (" + sha(source).slice(0, 12) + ")");
  }
  ```

- [ ] **Step 3: Add scripts**

  Add:

  ```json
  {
    "build:index": "node tools/build-index.mjs",
    "check:generated": "node tools/build-index.mjs --check"
  }
  ```

- [ ] **Step 4: Verify no-op generation**

  Run:

  ```bash
  npm run check:generated
  npm run build:index
  git diff --exit-code index.html
  npm run check:index
  npm run test:visual
  npm run test:self
  npm run test:simulate
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/index.template.html src/README.md tools/build-index.mjs package.json
  git commit -m "build: stage deterministic single-file generator"
  ```

## Task 6: Extract CSS Source Files

**Goal:** Make the first real source split by extracting CSS while generated `index.html` remains byte-equivalent after build.

**Files:**
- Create: `src/styles/app.css`
- Modify: `src/index.template.html`
- Modify: `tools/build-index.mjs`
- Modify: `package.json`
- Modify: `index.html` generated output

- [ ] **Step 1: Extract CSS**

  Move the content between `<style>` and `</style>` from `src/index.template.html` into `src/styles/app.css`.

  Replace it in the template with:

  ```html
  <style>
  <!-- @include src/styles/app.css -->
  </style>
  ```

- [ ] **Step 2: Update build script include support**

  Update `tools/build-index.mjs` to replace include comments:

  ```js
  function resolveIncludes(text) {
    return text.replace(/<!-- @include ([^ ]+) -->/g, (_, file) => {
      return fs.readFileSync(file, "utf8").trimEnd();
    });
  }

  const sourceTemplate = fs.readFileSync("src/index.template.html", "utf8");
  const source = resolveIncludes(sourceTemplate);
  ```

  Keep the existing hash/check/write logic.

- [ ] **Step 3: Build and verify**

  Run:

  ```bash
  npm run build:index
  npm run check:generated
  npm run check:index
  npm run test:visual
  npm run test:self
  npm run test:simulate
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/index.template.html src/styles/app.css tools/build-index.mjs index.html package.json
  git commit -m "build: extract css source while preserving generated index"
  ```

## Task 7: Extract JavaScript By Existing Boundaries

**Goal:** Split JavaScript into boundary files using existing sentinels, one boundary per commit.

**Files:**
- Create: `src/js/00-state.js`
- Create: `src/js/10-tests.js`
- Create: `src/js/20-core.js`
- Create: `src/js/30-formats.js`
- Create: `src/js/40-stats.js`
- Create: `src/js/50-render.js`
- Create: `src/js/60-modals.js`
- Create: `src/js/90-boot.js`
- Modify: `src/index.template.html`
- Modify: `tools/build-index.mjs`
- Modify: `index.html` generated output

- [ ] **Step 1: Add JS include support**

  Extend `resolveIncludes()` to support JavaScript comments:

  ```js
  function resolveIncludes(text) {
    return text
      .replace(/<!-- @include ([^ ]+) -->/g, (_, file) => fs.readFileSync(file, "utf8").trimEnd())
      .replace(/\/\/ @include ([^\n]+)/g, (_, file) => fs.readFileSync(file.trim(), "utf8").trimEnd());
  }
  ```

- [ ] **Step 2: Extract one boundary at a time**

  For each sentinel block, move code from `src/index.template.html` into the matching `src/js/*.js` file and replace it with:

  ```js
  // @include src/js/00-state.js
  ```

  Use these files:

  - `00-state.js` for state/persistence
  - `10-tests.js` for self-tests/simulation
  - `20-core.js` for core scheduling helpers
  - `30-formats.js` for Stack/King/Gauntlet/Crown engines
  - `40-stats.js` for stats, rankings, awards, text result builders
  - `50-render.js` for render dispatch and screens
  - `60-modals.js` for settings/help/schedule modals
  - `90-boot.js` for boot and PWA registration

- [ ] **Step 3: Verify after each boundary**

  After each extracted boundary, run:

  ```bash
  npm run build:index
  npm run check:generated
  npm run check:index
  npm run test:self
  npm run test:simulate
  npm run test:visual
  ```

- [ ] **Step 4: Commit each boundary**

  Commit after each boundary with messages:

  ```bash
  git add src/js src/index.template.html tools/build-index.mjs index.html
  git commit -m "build: extract state boundary"
  git commit -m "build: extract tests boundary"
  git commit -m "build: extract core scheduling boundary"
  git commit -m "build: extract format engines boundary"
  git commit -m "build: extract stats and awards boundary"
  git commit -m "build: extract render boundary"
  git commit -m "build: extract modal boundary"
  git commit -m "build: extract boot boundary"
  ```

  Use only the matching message for the boundary just extracted.

## Task 8: CI-Ready Verification Documentation

**Goal:** Document the exact local/CI verification sequence so future UI work uses the new harness consistently.

**Files:**
- Create: `docs/architecture/verification.md`

- [ ] **Step 1: Create verification doc**

  Create `docs/architecture/verification.md`:

  ```markdown
  # Verification

  ## Local Server

  ```bash
  python3 -m http.server 8765 --bind 127.0.0.1 -d .
  ```

  ## Required Gates

  ```bash
  npm run check:index
  npm run check:generated
  npm run test:self
  npm run test:simulate
  npm run test:visual
  ```

  ## Visual Baselines

  Update screenshots only for intentional visual changes:

  ```bash
  npm run test:visual:update
  npm run test:visual
  ```

  Review every changed screenshot before committing.

  ## Production Artifact

  Root `index.html` is committed and remains the deployed app. When source files under `src/` change, run:

  ```bash
  npm run build:index
  npm run check:generated
  ```
  ```

- [ ] **Step 2: Run full verification**

  Run:

  ```bash
  npm run check:index
  npm run check:generated
  npm run test:self
  npm run test:simulate
  npm run test:visual
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add docs/architecture/verification.md
  git commit -m "docs: document technical verification workflow"
  ```

## Final Acceptance Checklist

- [ ] `docs/architecture/index-boundaries.md` maps current internal boundaries.
- [ ] `npm run check:index` verifies section sentinels.
- [ ] `npm run test:self` verifies `?test` expected 1 failure.
- [ ] `npm run test:simulate` verifies `?simulate` expected 0 failures.
- [ ] Visual playbook covers setup desktop, setup mobile, active tournament, settings modal, finals, text results, and guide.
- [ ] Visual baseline PNGs are reviewed before commit.
- [ ] Source-split generator can verify root `index.html` is current.
- [ ] CSS extraction preserves generated `index.html` behavior.
- [ ] JavaScript extraction happens one boundary at a time with gates after each boundary.
- [ ] Root `index.html` remains committed and deployable.
- [ ] No runtime dependency or framework is introduced.
