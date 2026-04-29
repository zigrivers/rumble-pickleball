# Pickleball UX Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 15 UX enhancements from `docs/superpowers/specs/2026-04-29-pickleball-ux-enhancements-design.md` to `pickleball.html` without breaking the single-file / no-build / no-deps constraint.

**Architecture:** All changes layer onto the existing single HTML file. Pure helpers (`finalRanking`, `computeAwards`, `partnerOf`, `parsePastedNames`, `maybeFireRoundComplete`) are added as named, side-effect-free top-level functions. UI features are added as render helpers invoked from existing render dispatchers. Two new state fields (`awardsShown`, `notifiedRounds`) and one new config field (`winScore`) extend the existing `pb_tourney_v1` localStorage object. Tests for pure logic are inline `console.assert` blocks gated behind `?test` URL param so the production file stays clean for AirDrop.

**Tech Stack:** Vanilla JS, vanilla CSS, no build step, no deps. Playwright MCP for verification (HTTP server: `python3 -m http.server 8765 --bind 127.0.0.1 -d /Users/kenallred/Documents/dev-projects/rumble`). Spec reference: `docs/superpowers/specs/2026-04-29-pickleball-ux-enhancements-design.md`.

**Verification approach:** This project has no formal test framework (single deliverable HTML file, MVP posture). For each task that adds pure logic, we add a `console.assert` block to a `runSelfTests()` function gated by `?test` URL param. For UI/DOM behavior, we verify via playwright MCP screenshots and `browser_evaluate` calls in the same session as the implementation. Each task ends with a commit so the history shows the feature progression.

---

## Project conventions reference

- **All edits go into `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html`.** No new files unless specified.
- **CSS additions:** append to the existing `<style>` block (search for the existing `</style>` closing tag and insert above it). Group by feature with section comments.
- **JS additions:** append helpers near the top of the script block (search for `// ====================== rendering ======================` line — render helpers go below it; pure data helpers go above it, just before the `el()` function).
- **State changes:** edit `newState()` for defaults, edit `load()` for migration of existing saved state.
- **Existing helper names to reuse:** `el`, `nameOf`, `teamName`, `isGameComplete`, `isRoundComplete`, `computeStats`, `rankPlayers`, `save`, `load`, `render`.
- **Always run `save()` after mutating `state`** (existing convention).
- **Color tokens (in CSS `:root`):** `--court1` (cyan, South), `--court2` (violet, North), `--gold`, `--silver`, `--good` (green), `--bad` (red), `--accent` (yellow), `--muted`.

## Verification harness

Each task that adds verification will use these patterns:

- **Pure-function test (in `runSelfTests`)**:
  ```js
  console.assert(actual === expected, "[label]", { actual, expected });
  ```
  Run by visiting `http://127.0.0.1:8765/pickleball.html?test` and checking devtools console for any `Assertion failed:` lines.

- **Playwright UI verification (during this session or future)**:
  1. Start server: `python3 -m http.server 8765 --bind 127.0.0.1 -d /Users/kenallred/Documents/dev-projects/rumble` (background)
  2. Resize: 820×1180 (iPad portrait) or 1180×820 (iPad landscape)
  3. Navigate: `http://127.0.0.1:8765/pickleball.html`
  4. Seed state via `browser_evaluate` if needed
  5. Take screenshot, compare to spec
  6. Optionally interact + re-screenshot

---

## Task 0: Confirm baseline + add `?test` self-test harness

**Goal:** Add the empty `runSelfTests()` function so subsequent tasks can append assertions to it. No behavior change in production mode.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (top of script block)

- [ ] **Step 1: Add `runSelfTests()` and the `?test` gate**

  Search for `let state = load() || newState();` and **insert** the following block immediately above it:

  ```js
  // -------- self-tests (gated by ?test URL param) --------
  function runSelfTests() {
    let failures = 0;
    const _origAssert = console.assert.bind(console);
    console.assert = (cond, ...rest) => {
      if (!cond) failures++;
      _origAssert(cond, ...rest);
    };
    // Tests are appended by feature tasks below.
    console.log(`[self-tests] complete — ${failures} failure(s)`);
    console.assert = _origAssert;
  }
  if (typeof location !== "undefined" && location.search.includes("test")) {
    queueMicrotask(runSelfTests);
  }
  ```

- [ ] **Step 2: Verify production load is unchanged**

  Open `http://127.0.0.1:8765/pickleball.html` (no `?test`) in playwright. Confirm console has no errors and the setup screen renders.

- [ ] **Step 3: Verify test mode runs (no failures yet)**

  Open `http://127.0.0.1:8765/pickleball.html?test`. Confirm console shows `[self-tests] complete — 0 failure(s)`.

- [ ] **Step 4: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Add ?test self-test harness skeleton"
  ```

---

## Task 1: State schema additions (`awardsShown`, `winScore`, `notifiedRounds`)

**Goal:** Add the three new fields with safe defaults. Both fresh state and saved state from the previous version must end up with the new fields populated.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (`newState()` function and `load()` function)

- [ ] **Step 1: Update `newState()` to include the new fields**

  Find:
  ```js
  function newState() {
    return {
      phase: "setup",
      rawNames: ["", "", "", "", "", "", "", ""],
      slots:    ["", "", "", "", "", "", "", ""],
      currentRound: 1,
      rounds: [],
      finals: null,
      tiebreakRandom: [],
    };
  }
  ```

  Replace with:
  ```js
  function newState() {
    return {
      phase: "setup",
      rawNames: ["", "", "", "", "", "", "", ""],
      slots:    ["", "", "", "", "", "", "", ""],
      currentRound: 1,
      rounds: [],
      finals: null,
      tiebreakRandom: [],
      awardsShown: false,
      winScore: 11,
      notifiedRounds: [],
    };
  }
  ```

- [ ] **Step 2: Update `load()` to backfill defaults on older saved state**

  Find:
  ```js
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.phase) return null;
      return obj;
    } catch (e) { return null; }
  }
  ```

  Replace with:
  ```js
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.phase) return null;
      // Backfill defaults for fields added after the initial release.
      if (typeof obj.awardsShown !== "boolean") obj.awardsShown = false;
      if (typeof obj.winScore !== "number") obj.winScore = 11;
      if (!Array.isArray(obj.notifiedRounds)) obj.notifiedRounds = [];
      return obj;
    } catch (e) { return null; }
  }
  ```

- [ ] **Step 3: Add self-tests for `newState` defaults**

  Inside `runSelfTests()` (replacing the `// Tests are appended by feature tasks below.` comment with the first set, then leaving the comment for future tasks to extend), append:
  ```js
    // Task 1 — newState defaults
    {
      const s = newState();
      console.assert(s.awardsShown === false, "newState.awardsShown=false");
      console.assert(s.winScore === 11, "newState.winScore=11");
      console.assert(Array.isArray(s.notifiedRounds) && s.notifiedRounds.length === 0,
        "newState.notifiedRounds=[]");
    }
  ```

- [ ] **Step 4: Verify the tests pass**

  Open `http://127.0.0.1:8765/pickleball.html?test`. Console shows `0 failure(s)`. Open without `?test` and confirm setup screen still renders.

- [ ] **Step 5: Verify migration of pre-existing saved state**

  In playwright, run:
  ```js
  localStorage.setItem("pb_tourney_v1", JSON.stringify({
    phase: "playing",
    rawNames: ["A","B","C","D","E","F","G","H"],
    slots:    ["A","B","C","D","E","F","G","H"],
    currentRound: 1,
    rounds: [{round:1, court1:{team1:[1,2],team2:[3,4],score1:null,score2:null}, court2:{team1:[5,6],team2:[7,8],score1:null,score2:null}}],
    finals: null,
    tiebreakRandom: [0,1,2,3,4,5,6,7],
    // intentionally missing: awardsShown, winScore, notifiedRounds
  }));
  location.reload();
  ```

  After reload, evaluate:
  ```js
  const s = JSON.parse(localStorage.getItem("pb_tourney_v1"));
  return { aS: s.awardsShown, wS: s.winScore, nR: s.notifiedRounds };
  ```

  Wait — `state` is in-memory; localStorage still has the old shape until the next `save()`. Better assertion:
  ```js
  ({ aS: state.awardsShown, wS: state.winScore, nR: state.notifiedRounds })
  ```

  Expect `{ aS: false, wS: 11, nR: [] }`.

- [ ] **Step 6: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Add awardsShown, winScore, notifiedRounds state fields"
  ```

---

## Task 2: Setup screen — "How it works" rules block

**Goal:** Add a collapsible (default-expanded) `<details>` card under the title on the Setup screen with the spec's rules content.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (CSS + `renderSetup()`)

- [ ] **Step 1: Add CSS for the rules block**

  Append to the `<style>` block (just before `</style>`):
  ```css
  /* Rules block (Setup + Settings) */
  details.rules {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0;
    margin: 0 0 14px;
  }
  details.rules summary {
    list-style: none;
    cursor: pointer;
    padding: 14px 16px;
    font-size: 16px;
    font-weight: 700;
    user-select: none;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--text);
  }
  details.rules summary::-webkit-details-marker { display: none; }
  details.rules summary::after { content: "▾"; color: var(--muted); }
  details.rules[open] summary::after { content: "▴"; }
  details.rules .rules-body {
    padding: 0 16px 14px;
    color: var(--muted);
    font-size: 15px;
    line-height: 1.6;
  }
  details.rules .rules-body ul { margin: 0; padding-left: 20px; }
  details.rules .rules-body li { margin: 6px 0; }
  details.rules .rules-body strong { color: var(--text); }
  ```

- [ ] **Step 2: Add a `renderRulesBlock()` helper**

  Just before the existing `function renderSetup() {` line, insert:
  ```js
  function renderRulesBlock() {
    const details = el("details", { class: "rules", open: "" });
    details.appendChild(el("summary", null, "How it works"));
    const body = el("div", { class: "rules-body" });
    const ul = el("ul");
    [
      "8 players, 2 courts, doubles. Every round, all 8 play.",
      "7 rounds, one per partner — by the end, you'll have partnered with every other player exactly once.",
      "Score games however you normally would (typically first to 11, win by 2). Type any final score.",
      "After round 7, points decide the seeds. Top 4 play the 🏆 Championship, bottom 4 play the 🥈 Consolation.",
      "Championship is #1 + #4 vs #2 + #3 — a balanced pairing so the top players don't stomp.",
      "Final ranking: total points → wins → point differential.",
    ].forEach(text => ul.appendChild(el("li", null, text)));
    body.appendChild(ul);
    details.appendChild(body);
    return details;
  }
  ```

- [ ] **Step 3: Insert the rules block at the top of `renderSetup()`**

  Find the start of `renderSetup`:
  ```js
  function renderSetup() {
    const wrap = el("div");
    const card = el("div", { class: "card" },
  ```

  Replace with:
  ```js
  function renderSetup() {
    const wrap = el("div");
    wrap.appendChild(renderRulesBlock());
    const card = el("div", { class: "card" },
  ```

- [ ] **Step 4: Verify with playwright**

  Clear localStorage, reload, screenshot at iPad portrait (820×1180). Confirm: rules `<details>` appears above the "Enter 8 Players" card, default expanded with 6 bullets, "▴" chevron. Tap the summary, confirm collapse + chevron flips to "▾". Tap again to expand. No layout shift in either state breaks the screen.

- [ ] **Step 5: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Setup: add 'How it works' rules block above name inputs"
  ```

---

## Task 3: Setup screen — "Paste 8 names" shortcut

**Goal:** Add a "Paste 8 names" link above the inputs that opens a modal with a textarea. Parsing accepts newline- or comma-separated, validates exactly-8-unique (case-insensitive), distributes into `state.rawNames`, re-renders.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (helper + setup render + modal handler)

- [ ] **Step 1: Add `parsePastedNames` pure helper**

  Just before `function renderSetup()`, insert:
  ```js
  // Returns { ok: true, names: string[8] } or { ok: false, count: number, error: string }.
  // Splits on newlines or commas, trims, drops empties. Validates exactly 8 unique
  // (case-insensitive, matching canStart()'s gate).
  function parsePastedNames(text) {
    const parts = String(text || "")
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean);
    const lower = parts.map(s => s.toLowerCase());
    const uniqueCount = new Set(lower).size;
    if (parts.length !== 8 || uniqueCount !== 8) {
      return { ok: false, count: parts.length, error:
        `found ${parts.length}${parts.length === uniqueCount ? "" : ` (${parts.length - uniqueCount} duplicate)`} — need 8 unique names` };
    }
    return { ok: true, names: parts };
  }
  ```

- [ ] **Step 2: Add self-tests for `parsePastedNames`**

  Inside `runSelfTests()`, append:
  ```js
    // Task 3 — parsePastedNames
    {
      const a = parsePastedNames("Adrian\nAlex\nJohn\nJoe\nKen\nKris\nSam\nTodd");
      console.assert(a.ok && a.names.length === 8 && a.names[0] === "Adrian", "parsePastedNames newline");
      const b = parsePastedNames("Adrian, Alex, John, Joe, Ken, Kris, Sam, Todd");
      console.assert(b.ok && b.names[7] === "Todd", "parsePastedNames comma");
      const c = parsePastedNames("Adrian\nAlex");
      console.assert(!c.ok && c.count === 2, "parsePastedNames too few");
      const d = parsePastedNames("a\nb\nc\nd\ne\nf\ng\nA"); // case dup
      console.assert(!d.ok, "parsePastedNames case-insensitive duplicate");
      const e = parsePastedNames("  Adrian  \n\n,Alex,John,Joe,Ken,Kris,Sam,Todd");
      console.assert(e.ok && e.names[0] === "Adrian", "parsePastedNames trims & strips empties");
    }
  ```

- [ ] **Step 3: Verify the tests pass**

  Open `http://127.0.0.1:8765/pickleball.html?test`. Console shows `0 failure(s)`.

- [ ] **Step 4: Add CSS for the paste link + modal**

  Append to the `<style>` block:
  ```css
  /* Paste-names link and modal */
  .paste-link {
    display: inline-block;
    color: var(--accent);
    font-size: 14px;
    font-weight: 600;
    background: none;
    border: none;
    padding: 8px 0;
    margin-bottom: 4px;
    cursor: pointer;
    text-decoration: underline;
    min-height: 36px;
  }
  .paste-textarea {
    width: 100%;
    min-height: 200px;
    background: var(--panel-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    font-family: inherit;
    font-size: 16px;
    line-height: 1.5;
    resize: vertical;
  }
  .paste-error {
    color: var(--bad);
    font-size: 14px;
    font-weight: 600;
    margin: 8px 0 0;
    min-height: 20px;
  }
  ```

- [ ] **Step 5: Add `openPasteModal()` handler**

  Just before `function renderSetup()`, insert:
  ```js
  function openPasteModal() {
    const bg = el("div", { class: "modal-bg" });
    const close = () => bg.remove();
    bg.addEventListener("click", e => { if (e.target === bg) close(); });

    const modal = el("div", { class: "modal" });
    modal.appendChild(el("h2", null, "Paste 8 names"));
    modal.appendChild(el("p", { class: "muted", style: "margin: 0 0 12px;" },
      "One name per line, or comma-separated. Whitespace is trimmed."));

    const textarea = el("textarea", {
      class: "paste-textarea",
      placeholder: "Adrian\nAlex\nJohn\nJoe\nKen\nKris\nSam\nTodd",
      autocomplete: "off",
      autocapitalize: "words",
      autocorrect: "off",
      spellcheck: "false",
    });
    modal.appendChild(textarea);

    const errorLine = el("div", { class: "paste-error" });
    modal.appendChild(errorLine);

    const fillBtn = el("button", {
      class: "primary",
      style: "width: 100%; margin-top: 12px;",
      onclick: () => {
        const result = parsePastedNames(textarea.value);
        if (!result.ok) {
          errorLine.textContent = result.error;
          return;
        }
        for (let i = 0; i < 8; i++) state.rawNames[i] = result.names[i];
        save();
        close();
        render();
      }
    }, "Fill names");
    modal.appendChild(fillBtn);

    modal.appendChild(el("button", {
      style: "width: 100%; margin-top: 8px;",
      onclick: close,
    }, "Cancel"));

    bg.appendChild(modal);
    document.body.appendChild(bg);
    setTimeout(() => textarea.focus(), 0);
  }
  ```

- [ ] **Step 6: Add the "Paste 8 names" link to `renderSetup()`**

  Find:
  ```js
    const card = el("div", { class: "card" },
      el("h2", null, "Enter 8 Players"),
      el("p", { class: "muted", style: "margin: 0 0 14px;" },
        "Names are randomly assigned to slots 1–8 when the tournament starts.")
    );
  ```

  Replace with:
  ```js
    const card = el("div", { class: "card" },
      el("h2", null, "Enter 8 Players"),
      el("p", { class: "muted", style: "margin: 0 0 14px;" },
        "Names are randomly assigned to slots 1–8 when the tournament starts.")
    );
    const pasteLink = el("button", {
      class: "paste-link",
      onclick: openPasteModal,
    }, "Paste 8 names");
    card.appendChild(pasteLink);
  ```

- [ ] **Step 7: Verify with playwright**

  - Clear localStorage, reload at iPad portrait. Tap "Paste 8 names" link.
  - Type "Adrian\nAlex\nJohn\nJoe" only → tap Fill → expect error "found 4 — need 8 unique names". Modal stays open.
  - Type all 8 valid names → tap Fill → modal closes, all 8 inputs are populated, "Start Tournament" enables.
  - Reopen modal, paste "Adrian, Alex, John, Joe, Ken, Kris, Sam, Adrian" → expect duplicate error.
  - Tap Cancel → modal closes, no state change.

- [ ] **Step 8: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Setup: add 'Paste 8 names' shortcut with validation"
  ```

---

## Task 4: Setup screen — Animated shuffle reveal on Start

**Goal:** When user taps "Start Tournament," names visibly cycle through the 8 slots for ~1200ms before locking, with a tap-to-skip overlay. Final assignment is computed up-front.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (CSS + helper + `startTournament` integration)

- [ ] **Step 1: Add CSS for the shuffle overlay**

  Append to the `<style>` block:
  ```css
  /* Shuffle reveal overlay */
  .shuffle-overlay {
    position: fixed;
    inset: 0;
    background: var(--bg);
    z-index: 200;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    cursor: pointer;
  }
  .shuffle-title {
    font-size: 22px;
    font-weight: 800;
    color: var(--accent);
    letter-spacing: 0.06em;
    margin-bottom: 18px;
    text-transform: uppercase;
  }
  .shuffle-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    max-width: 520px;
    width: 100%;
  }
  .shuffle-slot {
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 12px;
    padding: 16px 14px;
    font-size: 22px;
    font-weight: 700;
    text-align: center;
    transition: border-color 0.18s ease, color 0.18s ease;
  }
  .shuffle-slot.locked {
    border-color: var(--accent);
    color: var(--accent);
  }
  .shuffle-skip {
    margin-top: 18px;
    color: var(--muted);
    font-size: 13px;
  }
  ```

- [ ] **Step 2: Add `runShuffleReveal(finalSlots, onDone)` helper**

  Just before `function startTournament()`, insert:
  ```js
  function runShuffleReveal(finalSlots, onDone) {
    const overlay = el("div", { class: "shuffle-overlay" });
    overlay.appendChild(el("div", { class: "shuffle-title" }, "Drawing slots…"));
    const grid = el("div", { class: "shuffle-grid" });
    const cells = [];
    for (let i = 0; i < 8; i++) {
      const c = el("div", { class: "shuffle-slot" }, finalSlots[i]);
      grid.appendChild(c);
      cells.push(c);
    }
    overlay.appendChild(grid);
    overlay.appendChild(el("div", { class: "shuffle-skip" }, "Tap anywhere to skip"));
    document.body.appendChild(overlay);

    const startTime = performance.now();
    const totalMs = 1200;
    let frame;
    let done = false;

    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      // lock-in: show finalSlots with locked styling
      for (let i = 0; i < 8; i++) {
        cells[i].textContent = finalSlots[i];
        cells[i].classList.add("locked");
      }
      setTimeout(() => {
        overlay.remove();
        onDone();
      }, 220);
    }

    overlay.addEventListener("click", finish);

    function tick(now) {
      const elapsed = now - startTime;
      if (elapsed >= totalMs) { finish(); return; }
      // ease-out: shuffle frequency slows toward the end
      const progress = elapsed / totalMs;
      const interval = 60 + 280 * progress; // 60ms early, 340ms late
      const stepIndex = Math.floor(elapsed / interval);
      // re-randomize cells (cosmetic only — finalSlots is the real assignment)
      const perm = shuffle(finalSlots);
      for (let i = 0; i < 8; i++) cells[i].textContent = perm[i];
      // progressive lock-in: start locking final cells in the last 35% of the animation
      if (progress > 0.65) {
        const lockedCount = Math.min(8, Math.floor((progress - 0.65) / 0.35 * 8) + 1);
        for (let i = 0; i < lockedCount; i++) {
          cells[i].textContent = finalSlots[i];
          cells[i].classList.add("locked");
        }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }
  ```

- [ ] **Step 3: Wire `startTournament()` to use the reveal**

  Find the body of `startTournament()`:
  ```js
  function startTournament() {
    state.slots = shuffle(state.rawNames.map(s => s.trim()));
    state.rounds = SCHEDULE.map((roundDef, idx) => {
      const flip = Math.random() < 0.5;
      const c1 = flip ? roundDef[0] : roundDef[1];
      const c2 = flip ? roundDef[1] : roundDef[0];
      return {
        round: idx + 1,
        court1: { team1: c1[0].slice(), team2: c1[1].slice(), score1: null, score2: null },
        court2: { team1: c2[0].slice(), team2: c2[1].slice(), score1: null, score2: null },
      };
    });
    state.tiebreakRandom = shuffle([0,1,2,3,4,5,6,7]);
    state.currentRound = 1;
    state.phase = "playing";
    state.finals = null;
    save();
    render();
  }
  ```

  Replace with:
  ```js
  function startTournament() {
    // Compute the assignment up-front (real source of truth).
    state.slots = shuffle(state.rawNames.map(s => s.trim()));
    state.rounds = SCHEDULE.map((roundDef, idx) => {
      const flip = Math.random() < 0.5;
      const c1 = flip ? roundDef[0] : roundDef[1];
      const c2 = flip ? roundDef[1] : roundDef[0];
      return {
        round: idx + 1,
        court1: { team1: c1[0].slice(), team2: c1[1].slice(), score1: null, score2: null },
        court2: { team1: c2[0].slice(), team2: c2[1].slice(), score1: null, score2: null },
      };
    });
    state.tiebreakRandom = shuffle([0,1,2,3,4,5,6,7]);
    state.currentRound = 1;
    state.notifiedRounds = [];
    state.awardsShown = false;
    state.phase = "playing";
    state.finals = null;
    save();
    // Cosmetic reveal animation, then render the playing screen.
    runShuffleReveal(state.slots.slice(), () => render());
  }
  ```

- [ ] **Step 4: Verify with playwright**

  Clear localStorage. Enter 8 names. Tap Start. Observe:
  - Overlay covers the whole viewport.
  - Names cycle visibly for ~1.2 seconds.
  - Slots progressively lock to gold-bordered final names in the last third.
  - Overlay dismisses, round 1 renders.
  - Re-run; this time tap on the overlay during animation → it skips immediately to the playing screen.

- [ ] **Step 5: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Setup: animated shuffle reveal on Start Tournament"
  ```

---

## Task 5: Round screen — Partner-preview chip in standings

**Goal:** Add a small color-coded "→ Partner" chip after each player's name in the Live Standings. Source is `state.rounds[currentRound]` (next-round entry, post-flip). Disappears at round 7 and during finals/done.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (helper + standings render integration)

- [ ] **Step 1: Add `nextPartnerInfo(slot)` pure helper**

  Just before `// ====================== rendering ======================`, insert:
  ```js
  // Returns { partner: number, courtKey: 1|2 } for the given player's next round,
  // or null if there's no next round (currentRound >= 7) or no rounds yet.
  function nextPartnerInfo(slot) {
    if (state.phase !== "playing") return null;
    if (state.currentRound >= 7) return null;
    const next = state.rounds[state.currentRound]; // currentRound is 1-based; this is round N+1
    if (!next) return null;
    for (const courtKey of [1, 2]) {
      const game = courtKey === 1 ? next.court1 : next.court2;
      for (const team of [game.team1, game.team2]) {
        const idx = team.indexOf(slot);
        if (idx !== -1) return { partner: team[1 - idx], courtKey };
      }
    }
    return null;
  }
  ```

- [ ] **Step 2: Add CSS for the partner chip**

  Append to `<style>`:
  ```css
  /* Partner-preview chip in standings */
  .partner-chip {
    display: inline-block;
    margin-left: 8px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    vertical-align: middle;
    white-space: nowrap;
  }
  .partner-chip.c1 { color: var(--court1); background: rgba(56, 189, 248, 0.15); }
  .partner-chip.c2 { color: var(--court2); background: rgba(167, 139, 250, 0.15); }
  ```

- [ ] **Step 3: Add chip to standings rendering**

  In `renderStandingsCard()`, find:
  ```js
      const partnerBadge = opts.hidePartners ? null : el("span", {
        class: "partner-badge" + (remaining === 0 ? " done" : ""),
        title: "Partners remaining"
      }, remaining + " left");
      tbody.appendChild(el("tr", { class: "r" + (i + 1) },
        rankCell(i),
        el("td", { class: "name" }, s.name, partnerBadge),
  ```

  Replace with:
  ```js
      const partnerBadge = opts.hidePartners ? null : el("span", {
        class: "partner-badge" + (remaining === 0 ? " done" : ""),
        title: "Partners remaining"
      }, remaining + " left");
      // Next-round partner chip (only when applicable)
      const npi = nextPartnerInfo(s.slot);
      const partnerChip = npi ? el("span", {
        class: "partner-chip c" + npi.courtKey,
        title: "Next round partner",
      }, "→ " + nameOf(npi.partner)) : null;
      tbody.appendChild(el("tr", { class: "r" + (i + 1) },
        rankCell(i),
        el("td", { class: "name" }, s.name, partnerChip, partnerBadge),
  ```

- [ ] **Step 4: Add self-test for partner lookup**

  Inside `runSelfTests()`, append:
  ```js
    // Task 5 — nextPartnerInfo
    {
      const saved = state;
      const fakeRounds = [
        { round:1, court1:{team1:[1,2],team2:[3,4],score1:null,score2:null}, court2:{team1:[5,6],team2:[7,8],score1:null,score2:null} },
        { round:2, court1:{team1:[1,3],team2:[2,4],score1:null,score2:null}, court2:{team1:[5,7],team2:[6,8],score1:null,score2:null} },
      ];
      state = { phase:"playing", slots:["A","B","C","D","E","F","G","H"], currentRound:1, rounds:fakeRounds };
      const r = nextPartnerInfo(1); // round 2 partners 1 with 3 on court 1
      console.assert(r && r.partner === 3 && r.courtKey === 1, "nextPartnerInfo slot 1 round 2", r);
      const r2 = nextPartnerInfo(8); // round 2: 8 with 6 on court 2
      console.assert(r2 && r2.partner === 6 && r2.courtKey === 2, "nextPartnerInfo slot 8 round 2", r2);
      state.currentRound = 7;
      console.assert(nextPartnerInfo(1) === null, "nextPartnerInfo no chip at round 7");
      state = saved;
    }
  ```

- [ ] **Step 5: Verify in playwright**

  Seed a mid-tournament state at round 5. Screenshot iPad portrait. Each row in standings should show `Adrian → Ken` (cyan or violet pill matching the next-round court). Tap forward to round 7 — chips disappear.

- [ ] **Step 6: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Round: partner-preview chip in standings"
  ```

---

## Task 6: Round screen — Tap-winner quick-fill pill

**Goal:** Add a small "× 11" pill between team name and score input. Visible only when both scores in that game are null. Tap → fills `state.winScore` and focuses the opponent's input. Pill amount tracks `state.winScore`.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (CSS + `renderTeamRow` changes)

- [ ] **Step 1: Add CSS for the quick-fill pill**

  Append to `<style>`:
  ```css
  /* Tap-winner quick-fill pill */
  .team-row {
    /* override existing 1fr 110px to allow pill column */
    grid-template-columns: 1fr auto 110px;
  }
  .quickfill-pill {
    background: rgba(251, 191, 36, 0.15);
    color: var(--accent);
    border: 1px solid rgba(251, 191, 36, 0.4);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
    min-height: 36px;
    white-space: nowrap;
    align-self: center;
  }
  .quickfill-pill:active { background: rgba(251, 191, 36, 0.3); }
  ```

  (Note: the `.team-row` rule already exists earlier in the file. The new `grid-template-columns` override must come after it. Append the new rules; the cascade will let the second declaration win because of source order.)

- [ ] **Step 2: Modify `renderTeamRow` to insert the pill**

  Find the current body of `renderTeamRow`:
  ```js
  function renderTeamRow(game, teamKey, scoreKey, otherScoreKey, refreshes) {
    const team = game[teamKey];
    const node = el("div", { class: "team-row" });
    node.appendChild(el("div", { class: "team-name" }, nameOf(team[0]) + " & " + nameOf(team[1])));

    const input = el("input", {
      class: "score-input",
      type: "number",
      ...
    });
    ...
    node.appendChild(input);
  ```

  Replace with the version that adds a pill cell between name and input:
  ```js
  function renderTeamRow(game, teamKey, scoreKey, otherScoreKey, refreshes) {
    const team = game[teamKey];
    const node = el("div", { class: "team-row" });
    node.appendChild(el("div", { class: "team-name" }, nameOf(team[0]) + " & " + nameOf(team[1])));

    // Quick-fill pill: shown only when both scores are null.
    const pillSlot = el("div");  // takes the auto column even when empty
    node.appendChild(pillSlot);

    const input = el("input", {
      class: "score-input",
      type: "number",
      inputmode: "numeric",
      pattern: "[0-9]*",
      min: "0",
      placeholder: "–",
      value: Number.isInteger(game[scoreKey]) ? String(game[scoreKey]) : "",
      "aria-label": "Score for " + nameOf(team[0]) + " and " + nameOf(team[1]),
    });
    input.addEventListener("input", () => {
      const v = input.value.trim();
      if (v === "") {
        game[scoreKey] = null;
      } else {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n) && n >= 0) game[scoreKey] = n;
      }
      save();
      refreshes.forEach(fn => fn());
    });
    node.appendChild(input);

    function applyWinnerStyle() {
      const a = game[scoreKey], b = game[otherScoreKey];
      const isWinner = Number.isInteger(a) && Number.isInteger(b) && a > b;
      node.classList.toggle("winner", isWinner);
      input.classList.toggle("winner", isWinner);
    }

    function refreshPill() {
      pillSlot.textContent = "";
      // Quick-fill is a Round-screen feature only; suppress on Finals matchups.
      if (state.phase !== "playing") return;
      const bothBlank = !Number.isInteger(game.score1) && !Number.isInteger(game.score2);
      if (!bothBlank) return;
      const pill = el("button", {
        class: "quickfill-pill",
        title: "Mark this team as winner with " + state.winScore + " points",
      }, "× " + state.winScore);
      pill.addEventListener("click", () => {
        game[scoreKey] = state.winScore;
        save();
        refreshes.forEach(fn => fn());
        // Focus the opponent's input so the user can type the loser's score.
        const allInputs = node.parentElement.querySelectorAll(".score-input");
        for (const inp of allInputs) {
          if (inp !== input) { inp.focus(); break; }
        }
      });
      pillSlot.appendChild(pill);
    }
    refreshPill();
    refreshes.push(refreshPill);

    return { node, applyWinnerStyle };
  }
  ```

- [ ] **Step 3: Verify with playwright**

  - Seed a state with round 6 blank. Screenshot iPad portrait.
  - Both rows on each court show "× 11" pill between name and score box.
  - Tap pill on Court 1's first row. Score updates to 11; the pill disappears from BOTH rows on that court (since one side is now non-null); the opponent's score input gains focus (visible focus border).
  - Pill on Court 2 still visible (its game still both-null).
  - Type 7 in the opponent's input. Court 1 shows "win by 4" summary, both pills gone.
  - Open Settings, change Win-score to 15 (this requires Task 15 to be done first — for THIS task's verification, manually edit `state.winScore` via `browser_evaluate` and re-render to confirm pill reads "× 15").

- [ ] **Step 4: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Round: tap-winner quick-fill pill"
  ```

---

## Task 7: Round screen — Round-complete moment (toast + shimmer + persisted gate)

**Goal:** When the round becomes complete, fire a 2.5s toast and 1.5s shimmer on the next-round button, gated by `state.notifiedRounds`. Fires once per round per tournament, refresh-safe.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (CSS + helper + integrate into `renderPlaying` + score-input handler refresh callback)

- [ ] **Step 1: Add CSS for toast + shimmer**

  Append to `<style>`:
  ```css
  /* Round-complete toast */
  .toast-stack {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 80;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .toast {
    background: var(--panel);
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 999px;
    padding: 12px 22px;
    font-weight: 800;
    font-size: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    opacity: 0;
    transform: translateY(-16px);
    animation: toast-in 220ms ease-out forwards, toast-out 220ms ease-in 2280ms forwards;
  }
  @keyframes toast-in {
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes toast-out {
    to { opacity: 0; transform: translateY(-16px); }
  }
  /* Shimmer on the primary nav button */
  .row-actions button.primary.shimmering {
    animation: nav-shimmer 1500ms ease-out;
  }
  @keyframes nav-shimmer {
    0%   { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.5); }
    50%  { box-shadow: 0 0 24px 6px rgba(251, 191, 36, 0.5); }
    100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); }
  }
  ```

- [ ] **Step 2: Add `showToast(text)` and `maybeFireRoundComplete(primaryBtn)` helpers**

  Just before `// ====================== rendering ======================`, append:
  ```js
  function showToast(text) {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = el("div", { class: "toast-stack" });
      document.body.appendChild(stack);
    }
    const t = el("div", { class: "toast" }, text);
    stack.appendChild(t);
    setTimeout(() => t.remove(), 2700);
  }

  function maybeFireRoundComplete(primaryBtn) {
    if (state.phase !== "playing") return;
    const idx = state.currentRound - 1;
    const round = state.rounds[idx];
    if (!round || !isRoundComplete(round)) return;
    if (state.notifiedRounds.includes(state.currentRound)) return;
    state.notifiedRounds.push(state.currentRound);
    save();
    showToast("🎉 Round " + state.currentRound + " complete!");
    if (primaryBtn) {
      primaryBtn.classList.remove("shimmering");
      // force reflow so the keyframe restarts
      void primaryBtn.offsetWidth;
      primaryBtn.classList.add("shimmering");
      setTimeout(() => primaryBtn.classList.remove("shimmering"), 1600);
    }
  }
  ```

- [ ] **Step 3: Wire the gate into `renderPlaying`**

  At the top of `renderPlaying()`, after `const round = state.rounds[state.currentRound - 1];` insert nothing — but at the **bottom** of `renderPlaying()`, after the existing `return wrap;` would return ... wait, `return wrap;` is the last line. We need to fire the gate after the DOM is in the page, not before the function returns. Two options:

  Option A: have `render()` call `maybeFireRoundComplete` after appending the playing-screen content. Modify `render()`:

  Find:
  ```js
  function render() {
    const app = document.getElementById("app");
    app.innerHTML = "";
    app.appendChild(renderHeader());
    if (state.phase === "setup")        app.appendChild(renderSetup());
    else if (state.phase === "playing") app.appendChild(renderPlaying());
    else if (state.phase === "finals")  app.appendChild(renderFinalsScreen());
    else if (state.phase === "done")    app.appendChild(renderDoneScreen());
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  ```

  Replace with:
  ```js
  function render() {
    const app = document.getElementById("app");
    app.innerHTML = "";
    app.appendChild(renderHeader());
    if (state.phase === "setup")        app.appendChild(renderSetup());
    else if (state.phase === "playing") app.appendChild(renderPlaying());
    else if (state.phase === "finals")  app.appendChild(renderFinalsScreen());
    else if (state.phase === "done")    app.appendChild(renderDoneScreen());
    window.scrollTo({ top: 0, behavior: "auto" });
    if (state.phase === "playing") {
      const primaryBtn = app.querySelector(".row-actions button.primary");
      maybeFireRoundComplete(primaryBtn);
    }
  }
  ```

- [ ] **Step 4: Wire the gate into the score-input refresh callback**

  Find inside `renderPlaying`:
  ```js
    refreshes.push(() => {
      if (state.currentRound < 7) primaryBtn.disabled = !isRoundComplete(round);
      else primaryBtn.disabled = !state.rounds.every(isRoundComplete);
      const newStandings = renderStandingsCard(state.currentRound, standingsOpts());
      standingsCard.replaceWith(newStandings);
      standingsCard = newStandings;
    });
  ```

  Replace with:
  ```js
    refreshes.push(() => {
      if (state.currentRound < 7) primaryBtn.disabled = !isRoundComplete(round);
      else primaryBtn.disabled = !state.rounds.every(isRoundComplete);
      const newStandings = renderStandingsCard(state.currentRound, standingsOpts());
      standingsCard.replaceWith(newStandings);
      standingsCard = newStandings;
      maybeFireRoundComplete(primaryBtn);
    });
  ```

- [ ] **Step 5: Verify with playwright**

  - Seed round 5 with one game complete and one game with score1 only set. Reload (no `?test`). No toast yet. Type the final score → toast slides in at top, primary "Round 6 →" button gets gold shimmer. Toast auto-dismisses after ~2.5s.
  - Refresh the page. No new toast (already in `notifiedRounds`).
  - Edit a score in the same round. No re-toast.
  - Navigate to Round 4 (already complete from seed). No toast (already notified during initial fire when seeded).
  - Wait — for the seed-then-load-with-incomplete-round case to fire the toast: enter the score in the live page rather than seeding completed. Repeat: seed everything blank for round 5; reload; type all 4 scores. Toast fires once when both courts complete.
  - Close-and-reopen the tab between entering the courts → toast still fires once on the render where the round becomes complete.

- [ ] **Step 6: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Round: round-complete toast + shimmer with persisted gate"
  ```

---

## Task 8: Finals screen — Seed pills inline in matchup rows

**Goal:** Render a small "#1", "#4", etc. seed pill before each player name in the Championship and Consolation matchups. Gold-tinted on Championship, silver-tinted on Consolation.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (CSS + helper + finals render)

- [ ] **Step 1: Add CSS for seed pills**

  Append to `<style>`:
  ```css
  /* Finals seed pills */
  .seed-pill {
    display: inline-block;
    font-size: 11px;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 4px;
    margin-right: 4px;
    vertical-align: middle;
    line-height: 1.4;
  }
  .seed-pill.gold { background: rgba(251, 191, 36, 0.18); color: var(--gold); }
  .seed-pill.silver { background: rgba(203, 213, 225, 0.15); color: var(--silver); }
  ```

- [ ] **Step 2: Add `seedPill(rank, kind)` helper**

  Just before `// ====================== rendering ======================`, append:
  ```js
  // rank: 1-based seed number; kind: "gold" (championship) or "silver" (consolation)
  function seedPill(rank, kind) {
    return el("span", { class: "seed-pill " + kind }, "#" + rank);
  }
  ```

- [ ] **Step 3: Compute seed-by-slot for the current finals**

  Just before `function renderFinalsScreen() {`, add a helper:
  ```js
  // For the current finals, returns a Map<slot, rank> using rankPlayers(7) order.
  function seedRankBySlot() {
    const ranked = rankPlayers(7);
    const m = new Map();
    ranked.forEach((s, i) => m.set(s.slot, i + 1));
    return m;
  }
  ```

- [ ] **Step 4: Modify `renderTeamRow` to accept optional seed info**

  This task expands `renderTeamRow` to optionally render seed pills. Find the line:
  ```js
  function renderTeamRow(game, teamKey, scoreKey, otherScoreKey, refreshes) {
  ```

  Replace with:
  ```js
  function renderTeamRow(game, teamKey, scoreKey, otherScoreKey, refreshes, seedInfo) {
  ```

  Find the line:
  ```js
    node.appendChild(el("div", { class: "team-name" }, nameOf(team[0]) + " & " + nameOf(team[1])));
  ```

  Replace with:
  ```js
    if (seedInfo) {
      const kind = seedInfo.kind; // "gold" or "silver"
      const seeds = seedInfo.seeds; // Map<slot, rank>
      const nameNode = el("div", { class: "team-name" });
      nameNode.appendChild(seedPill(seeds.get(team[0]), kind));
      nameNode.appendChild(document.createTextNode(nameOf(team[0])));
      nameNode.appendChild(document.createTextNode(" & "));
      nameNode.appendChild(seedPill(seeds.get(team[1]), kind));
      nameNode.appendChild(document.createTextNode(nameOf(team[1])));
      node.appendChild(nameNode);
    } else {
      node.appendChild(el("div", { class: "team-name" }, nameOf(team[0]) + " & " + nameOf(team[1])));
    }
  ```

- [ ] **Step 5: Pass seed info through `renderRoundCourts` and `renderCourtCard` for finals**

  In `renderRoundCourts`, find:
  ```js
  function renderRoundCourts(round, isFinals, refreshes) {
    const wrap = el("div", { class: "court-row" });
    if (isFinals) {
      wrap.appendChild(renderCourtCard(round.championship, "champ", refreshes));
      wrap.appendChild(renderCourtCard(round.consolation,  "cons",  refreshes));
    } else {
      wrap.appendChild(renderCourtCard(round.court1, 1, refreshes));
      wrap.appendChild(renderCourtCard(round.court2, 2, refreshes));
    }
    return wrap;
  }
  ```

  Replace with:
  ```js
  function renderRoundCourts(round, isFinals, refreshes) {
    const wrap = el("div", { class: "court-row" });
    if (isFinals) {
      const seeds = seedRankBySlot();
      wrap.appendChild(renderCourtCard(round.championship, "champ", refreshes, { kind: "gold", seeds }));
      wrap.appendChild(renderCourtCard(round.consolation,  "cons",  refreshes, { kind: "silver", seeds }));
    } else {
      wrap.appendChild(renderCourtCard(round.court1, 1, refreshes));
      wrap.appendChild(renderCourtCard(round.court2, 2, refreshes));
    }
    return wrap;
  }
  ```

  In `renderCourtCard`, find:
  ```js
  function renderCourtCard(game, courtKey, refreshes) {
  ```

  Replace with:
  ```js
  function renderCourtCard(game, courtKey, refreshes, seedInfo) {
  ```

  Find:
  ```js
    const team1Wrap = renderTeamRow(game, "team1", "score1", "score2", refreshes);
    const team2Wrap = renderTeamRow(game, "team2", "score2", "score1", refreshes);
  ```

  Replace with:
  ```js
    const team1Wrap = renderTeamRow(game, "team1", "score1", "score2", refreshes, seedInfo);
    const team2Wrap = renderTeamRow(game, "team2", "score2", "score1", refreshes, seedInfo);
  ```

- [ ] **Step 6: Verify with playwright**

  Seed a tournament past round 7 into finals phase. Screenshot iPad portrait. Each player on Championship has a gold "#1"/"#4"/"#2"/"#3" pill before their name. Consolation has silver "#5"/"#8"/"#6"/"#7" pills. Round screen (during play) does NOT have seed pills.

- [ ] **Step 7: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Finals: seed pills inline in matchup rows"
  ```

---

## Task 9: Finals — Amplified Championship + balanced-pairing caption + Crown Champions tied gate

**Goal:** Make Championship card visually dominant (8px gold border, gold glow, 22px team-name font, 44px score-input font, 20px padding). Add a one-line "Balanced pairing — top seed + 4th vs 2nd + 3rd" caption inside the Championship card. Disable the Crown Champions button when either finals game is tied.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (CSS + finals render + Crown gate)

- [ ] **Step 1: Add CSS for amplified Championship + caption**

  Append to `<style>`:
  ```css
  /* Amplified championship card */
  .court-card.gold {
    border-top-width: 8px;
    box-shadow: 0 0 32px rgba(251, 191, 36, 0.18);
    padding: 20px;
  }
  .court-card.gold .court-label { font-size: 14px; }
  .court-card.gold .team-name { font-size: 22px; }
  .court-card.gold .score-input { font-size: 44px; height: 80px; }
  .pairing-caption {
    color: var(--muted);
    font-size: 12px;
    margin: 0 0 12px;
    line-height: 1.4;
  }
  /* Compact consolation card */
  .court-card.silver {
    padding: 14px;
  }
  .court-card.silver .court-label { font-size: 12px; }
  .court-card.silver .team-name { font-size: 16px; }
  .court-card.silver .score-input { font-size: 28px; height: 60px; }
  ```

- [ ] **Step 2: Add the balanced-pairing caption to the Championship card**

  In `renderCourtCard`, find:
  ```js
    card.appendChild(el("div", { class: "court-label" }, labelText));

    const matchup = el("div", { class: "matchup" });
  ```

  Replace with:
  ```js
    card.appendChild(el("div", { class: "court-label" }, labelText));
    if (courtKey === "champ") {
      card.appendChild(el("div", { class: "pairing-caption" },
        "Balanced pairing — top seed + 4th vs 2nd + 3rd"));
    }

    const matchup = el("div", { class: "matchup" });
  ```

- [ ] **Step 3: Update Crown Champions gate to require non-tied scores**

  In `renderFinalsScreen`, find:
  ```js
    const champDone = isGameComplete(state.finals.championship);
    const consDone  = isGameComplete(state.finals.consolation);

    const finishBtn = el("button", {
      class: "primary",
      style: "width: 100%; margin-bottom: 8px;",
      onclick: () => {
        if (isGameComplete(state.finals.championship) && isGameComplete(state.finals.consolation)) {
          state.phase = "done"; save(); render();
        }
      }
    }, "👑 Crown Champions");
    finishBtn.disabled = !(champDone && consDone);
    refreshes.push(() => {
      finishBtn.disabled = !(isGameComplete(state.finals.championship) && isGameComplete(state.finals.consolation));
    });
  ```

  Replace with:
  ```js
    const finalsDecided = (g) => isGameComplete(g) && g.score1 !== g.score2;
    const finalsReady = () =>
      finalsDecided(state.finals.championship) && finalsDecided(state.finals.consolation);

    const finishBtn = el("button", {
      class: "primary",
      style: "width: 100%; margin-bottom: 8px;",
      onclick: () => {
        if (finalsReady()) {
          state.phase = "done";
          save();
          render();
        }
      }
    }, "👑 Crown Champions");
    finishBtn.disabled = !finalsReady();
    refreshes.push(() => {
      finishBtn.disabled = !finalsReady();
    });
  ```

- [ ] **Step 4: Verify with playwright**

  - Seed finals phase. Championship card visibly larger than Consolation: gold glow, taller team rows, bigger score inputs.
  - "Balanced pairing — top seed + 4th vs 2nd + 3rd" appears under the Championship label only.
  - Enter Championship score 11–11 (tied). Crown Champions disabled. Card shows "Tied — enter a tiebreaker".
  - Change to 11–9. Consolation still blank → Crown disabled. Enter Consolation 11–6. Crown enables.
  - Tap Crown → done screen.

- [ ] **Step 5: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Finals: amplified championship + pairing caption + tied-game gate"
  ```

---

## Task 10: Champions — `finalRanking()` helper

**Goal:** Pure function returning the 8 players in tournament-outcome tier order: champ-W (2) > champ-L (2) > cons-W (2) > cons-L (2). Within tier, season ranking breaks order. Used by the podium and the standings table on the Champions screen.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (helper near other compute functions)

- [ ] **Step 1: Add `finalRanking()` helper**

  Just before `// ====================== rendering ======================`, append:
  ```js
  // Returns an array of 8 stat objects (same shape as rankPlayers items) in
  // tournament-outcome tier order. Falls back to rankPlayers(7) order if finals
  // are missing or undecided.
  function finalRanking() {
    const seasonOrder = rankPlayers(7);
    const seasonRank = new Map();
    seasonOrder.forEach((s, i) => seasonRank.set(s.slot, i));
    const bySlot = new Map();
    seasonOrder.forEach(s => bySlot.set(s.slot, s));

    const f = state.finals;
    const allDecided = f
      && isGameComplete(f.championship) && f.championship.score1 !== f.championship.score2
      && isGameComplete(f.consolation)  && f.consolation.score1  !== f.consolation.score2;
    if (!allDecided) return seasonOrder.slice();

    const champWinTeam  = f.championship.score1 > f.championship.score2 ? f.championship.team1 : f.championship.team2;
    const champLoseTeam = f.championship.score1 > f.championship.score2 ? f.championship.team2 : f.championship.team1;
    const consWinTeam   = f.consolation.score1  > f.consolation.score2  ? f.consolation.team1  : f.consolation.team2;
    const consLoseTeam  = f.consolation.score1  > f.consolation.score2  ? f.consolation.team2  : f.consolation.team1;

    const sortByseason = arr => arr.slice().sort((a, b) => seasonRank.get(a) - seasonRank.get(b));
    const ordered = [
      ...sortByseason(champWinTeam),
      ...sortByseason(champLoseTeam),
      ...sortByseason(consWinTeam),
      ...sortByseason(consLoseTeam),
    ];
    return ordered.map(slot => bySlot.get(slot));
  }
  ```

- [ ] **Step 2: Add self-tests for `finalRanking`**

  Inside `runSelfTests()`, append:
  ```js
    // Task 10 — finalRanking
    // Verify tier ordering (champ-W > champ-L > cons-W > cons-L) holds
    // and that within each tier players are ordered by season ranking,
    // by deriving the expected order from rankPlayers(7) instead of
    // assuming a particular slot-to-season-rank mapping.
    {
      const saved = state;
      const rounds = SCHEDULE.map((rd, i) => ({
        round: i + 1,
        court1: { team1: rd[0][0].slice(), team2: rd[0][1].slice(), score1: 11, score2: 0 },
        court2: { team1: rd[1][0].slice(), team2: rd[1][1].slice(), score1: 11, score2: 0 },
      }));
      state = {
        phase: "done",
        slots: ["A","B","C","D","E","F","G","H"],
        rounds,
        currentRound: 7,
        tiebreakRandom: [0,1,2,3,4,5,6,7],
        finals: {
          championship: { team1: [1,4], team2: [2,3], score1: 9, score2: 11 }, // team2 wins
          consolation:  { team1: [5,8], team2: [6,7], score1: 11, score2: 9 }, // team1 wins
        },
        awardsShown: false, winScore: 11, notifiedRounds: [],
      };
      const seasonOrder = rankPlayers(7).map(s => s.slot);
      const seasonRankOf = slot => seasonOrder.indexOf(slot);
      const sortBySeason = arr => arr.slice().sort((a,b) => seasonRankOf(a) - seasonRankOf(b));
      const expected = [
        ...sortBySeason([2, 3]),  // championship winners
        ...sortBySeason([1, 4]),  // championship losers
        ...sortBySeason([5, 8]),  // consolation winners
        ...sortBySeason([6, 7]),  // consolation losers
      ];
      const order = finalRanking().map(s => s.slot);
      console.assert(JSON.stringify(order) === JSON.stringify(expected),
        "finalRanking tier order", { order, expected });
      state = saved;
    }
  ```

- [ ] **Step 3: Verify the self-tests pass**

  Open `?test`, console: `0 failure(s)`.

- [ ] **Step 4: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Champions: finalRanking() tier-ordered helper"
  ```

---

## Task 11: Champions — Top-3 podium

**Goal:** Render a stepped gold/silver/bronze podium for ranks 1–3 from `finalRanking()`. Ranks 4–8 continue in the standings table beneath.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (CSS + render)

- [ ] **Step 1: Add CSS for the podium**

  Append to `<style>`:
  ```css
  /* Top-3 podium on Champions screen */
  .podium {
    display: grid;
    grid-template-columns: 1fr 1.2fr 1fr;
    gap: 8px;
    align-items: end;
    max-width: 480px;
    margin: 28px auto 20px;
  }
  .podium-step { text-align: center; }
  .podium-name { font-size: 18px; font-weight: 800; margin-bottom: 4px; }
  .podium-step.gold .podium-name { font-size: 22px; color: var(--gold); }
  .podium-points { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  .podium-bar {
    border-radius: 10px 10px 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .podium-step.gold .podium-bar {
    height: 110px;
    background: linear-gradient(180deg, #fde047 0%, #fbbf24 100%);
    box-shadow: 0 0 24px rgba(251, 191, 36, 0.35);
    font-size: 48px;
  }
  .podium-step.silver .podium-bar {
    height: 80px;
    background: linear-gradient(180deg, #cbd5e1 0%, #94a3b8 100%);
    font-size: 38px;
  }
  .podium-step.bronze .podium-bar {
    height: 60px;
    background: linear-gradient(180deg, #d97706 0%, #b45309 100%);
    font-size: 32px;
  }
  ```

- [ ] **Step 2: Add `renderPodium(ranking)` helper**

  Just before `function renderDoneScreen()`, insert:
  ```js
  function renderPodium(ranking) {
    const stats = computeStats(7, true); // for points
    const pointsBySlot = new Map(stats.map(s => [s.slot, s.points]));
    const order = ["silver", "gold", "bronze"]; // visual left/center/right
    const ranks = [ranking[1], ranking[0], ranking[2]]; // map to visual order
    const emojis = { silver: "🥈", gold: "🥇", bronze: "🥉" };
    const podium = el("div", { class: "podium" });
    order.forEach((kind, i) => {
      const r = ranks[i];
      const step = el("div", { class: "podium-step " + kind });
      step.appendChild(el("div", { class: "podium-name" }, r.name));
      step.appendChild(el("div", { class: "podium-points" }, pointsBySlot.get(r.slot) + " pts"));
      step.appendChild(el("div", { class: "podium-bar" }, emojis[kind]));
      podium.appendChild(step);
    });
    return podium;
  }
  ```

- [ ] **Step 3: Hoist `ranking` declaration at the top of `renderDoneScreen`**

  Find the start of `renderDoneScreen`:
  ```js
  function renderDoneScreen() {
    const wrap = el("div");
    const f = state.finals;
    const champ = f.championship, cons = f.consolation;
  ```

  Replace with:
  ```js
  function renderDoneScreen() {
    const wrap = el("div");
    const f = state.finals;
    const champ = f.championship, cons = f.consolation;
    const ranking = finalRanking();
  ```

- [ ] **Step 4: Replace the existing `rankPlayers(7)` lookup with the hoisted `ranking`**

  In the same function, find:
  ```js
    const ranked = rankPlayers(7);
    const allStats = computeStats(7, true);
  ```

  Replace with (drop the duplicate `ranked` declaration; reuse the hoisted `ranking`):
  ```js
    const allStats = computeStats(7, true);
  ```

  Then find the iteration that builds the standings table:
  ```js
    ranked.forEach((rs, i) => {
      const s = allStats.find(x => x.slot === rs.slot);
      tbody.appendChild(el("tr", { class: "r" + (i + 1) },
        rankCell(i),
        el("td", { class: "name" }, s.name),
        el("td", { class: "num" }, "" + s.points),
        el("td", { class: "num" }, "" + s.wins),
        el("td", { class: "num", style: s.diff > 0 ? "color: var(--good);" : (s.diff < 0 ? "color: var(--bad);" : "") },
          (s.diff > 0 ? "+" : "") + s.diff),
      ));
    });
  ```

  Replace with — slice off the top 3 (already on the podium) and offset the rank index so rows display 4–8:
  ```js
    ranking.slice(3).forEach((rs, i) => {
      const tableRank = i + 3; // 0-indexed → ranks 4..8 via rankCell(i+3) which renders digits
      const s = allStats.find(x => x.slot === rs.slot);
      tbody.appendChild(el("tr", { class: "r" + (tableRank + 1) },
        rankCell(tableRank),
        el("td", { class: "name" }, s.name),
        el("td", { class: "num" }, "" + s.points),
        el("td", { class: "num" }, "" + s.wins),
        el("td", { class: "num", style: s.diff > 0 ? "color: var(--good);" : (s.diff < 0 ? "color: var(--bad);" : "") },
          (s.diff > 0 ? "+" : "") + s.diff),
      ));
    });
  ```

  Also update the table header just above this loop. Find:
  ```js
    finalCard.appendChild(head);
  ```
  (which sits before the table is built). Just after the existing `el("h3", ..., "Final Standings")` line inside the head block, no change needed — the header still says "Final Standings"; the podium handles 1–3 visually and the table handles 4–8 numerically.

- [ ] **Step 5: Insert the podium between champions card and standings**

  In `renderDoneScreen`, find:
  ```js
    card.appendChild(champions);
    wrap.appendChild(card);

    // Final standings — uses the same renderStandingsCard, with finals included in totals
    const finalCard = el("div", { class: "card" });
  ```

  Replace with:
  ```js
    card.appendChild(champions);
    wrap.appendChild(card);

    wrap.appendChild(renderPodium(ranking));

    // Final standings — uses the same renderStandingsCard, with finals included in totals
    const finalCard = el("div", { class: "card" });
  ```

- [ ] **Step 6: Verify with playwright**

  - Seed a done state where #2+#3 won the championship (e.g. championship: 11–9 with #2+#3 as winners). Screenshot iPad portrait.
  - Podium maps to `finalRanking()[0..2]`: the higher-season-rank champion on the gold step, the other champion on silver, the higher-season-rank championship-loser on bronze.
  - Standings table below contains exactly 5 rows for ranks 4–8, in `finalRanking()` order. The first row's rank cell renders "4", not a medal.
  - The standings table does NOT duplicate the podium players — rows 1–3 of `finalRanking()` appear only on the podium.

- [ ] **Step 7: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Champions: top-3 podium driven by finalRanking()"
  ```

---

## Task 12a: Champions — `computeAwards()` helper + self-tests

**Goal:** Add the pure-function helper that computes the four awards. Renderer comes in Task 12b. Tied candidates for Biggest Win and Closest Game are tracked as arrays so all tied teams render comma-separated.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (helper + tests)

- [ ] **Step 1: Add `computeAwards()` pure helper**

  Just before `function renderDoneScreen()`, insert:
  ```js
  // Returns { mvp, biggestWin, closestGame, hotStreak }. Each award is
  // { names: string[], detail: string|null }. names is empty if no qualifying
  // entry; multiple names indicate ties.
  function computeAwards() {
    const stats = computeStats(7, true);

    // MVP — highest total points (all tied players named)
    const maxPts = stats.reduce((m, s) => Math.max(m, s.points), 0);
    const mvpNames = stats.filter(s => s.points === maxPts).map(s => nameOf(s.slot));
    const mvp = { names: mvpNames, detail: maxPts + " pts" };

    // Build chronological game list: rounds 1-7 (each has c1, c2), then champ, cons.
    const games = [];
    for (let r = 0; r < state.rounds.length; r++) {
      const round = state.rounds[r];
      games.push({ ...round.court1, label: "R" + (r + 1) + " South" });
      games.push({ ...round.court2, label: "R" + (r + 1) + " North" });
    }
    if (state.finals) {
      games.push({ ...state.finals.championship, label: "Championship" });
      games.push({ ...state.finals.consolation,  label: "Consolation" });
    }
    // Two views of the game list:
    //   completed  — every game that has both scores (ties included). Used for Hot Streak so a tied game properly resets streaks.
    //   decided    — completed AND non-tied. Used for Biggest Win / Closest Game.
    const completed = games.filter(g => isGameComplete(g));
    const decided = completed.filter(g => g.score1 !== g.score2);

    // For each decided game, derive the winner-side summary.
    const summarized = decided.map(g => {
      const team1Won = g.score1 > g.score2;
      const winTeam = team1Won ? g.team1 : g.team2;
      const winScore = team1Won ? g.score1 : g.score2;
      const loseScore = team1Won ? g.score2 : g.score1;
      return {
        diff: winScore - loseScore,
        winTeam,
        winScore,
        loseScore,
        label: g.label,
      };
    });

    // Biggest Win — largest diff. Tied diffs all win; report all winning teams.
    let biggestWin = { names: [], detail: null };
    if (summarized.length) {
      const maxDiff = Math.max(...summarized.map(s => s.diff));
      const winners = summarized.filter(s => s.diff === maxDiff);
      biggestWin = {
        names: winners.map(w => teamName(w.winTeam) + " +" + w.diff),
        detail: winners.map(w => w.winScore + "–" + w.loseScore + " · " + w.label).join(" / "),
      };
    }

    // Closest Game — smallest diff; tiebreak by descending winning score.
    // Multiple games matching the best (diff, -winScore) pair are all reported.
    let closestGame = { names: [], detail: null };
    if (summarized.length) {
      const minDiff = Math.min(...summarized.map(s => s.diff));
      const closestSet = summarized.filter(s => s.diff === minDiff);
      const maxWinScore = Math.max(...closestSet.map(s => s.winScore));
      const tied = closestSet.filter(s => s.winScore === maxWinScore);
      closestGame = {
        names: tied.map(t => t.winScore + "–" + t.loseScore),
        detail: tied.map(t => t.label).join(" / "),
      };
    }

    // Hot Streak — longest consecutive-wins run for a single player.
    // Iterates every completed game (including ties) so a tied game resets
    // streaks for all four involved players.
    const streaks = new Map(); // slot -> current run
    const best = new Map();    // slot -> max run seen
    for (const g of completed) {
      if (g.score1 === g.score2) {
        for (const slot of [...g.team1, ...g.team2]) {
          best.set(slot, Math.max(best.get(slot) || 0, streaks.get(slot) || 0));
          streaks.set(slot, 0);
        }
        continue;
      }
      const team1Won = g.score1 > g.score2;
      const winners = team1Won ? g.team1 : g.team2;
      const losers = team1Won ? g.team2 : g.team1;
      for (const slot of winners) {
        streaks.set(slot, (streaks.get(slot) || 0) + 1);
        best.set(slot, Math.max(best.get(slot) || 0, streaks.get(slot)));
      }
      for (const slot of losers) {
        best.set(slot, Math.max(best.get(slot) || 0, streaks.get(slot) || 0));
        streaks.set(slot, 0);
      }
    }
    for (const [slot, cur] of streaks) {
      best.set(slot, Math.max(best.get(slot) || 0, cur));
    }
    const maxStreak = best.size ? Math.max(...best.values()) : 0;
    const streakSlots = maxStreak > 0
      ? [...best.entries()].filter(([, v]) => v === maxStreak).map(([k]) => k)
      : [];
    const hotStreak = streakSlots.length
      ? { names: streakSlots.map(nameOf), detail: maxStreak + " in a row" }
      : { names: [], detail: null };

    return { mvp, biggestWin, closestGame, hotStreak };
  }
  ```

- [ ] **Step 2: Add self-tests for `computeAwards`**

  Inside `runSelfTests()`, append:
  ```js
    // Task 12a — computeAwards
    {
      const saved = state;
      // Setup: every round-robin game is a 11-vs-1 blowout for team1, except court2
      // which is 11-vs-9. Championship is 11-vs-9, Consolation 11-vs-9.
      // Expected: Biggest Win is +10 (lots of ties — all team1 winners on c1).
      // Closest Game: 11-9 across many games; all tied at diff=2 with winScore=11.
      const rounds = SCHEDULE.map((rd, i) => ({
        round: i + 1,
        court1: { team1: rd[0][0].slice(), team2: rd[0][1].slice(), score1: 11, score2: 1 },
        court2: { team1: rd[1][0].slice(), team2: rd[1][1].slice(), score1: 11, score2: 9 },
      }));
      state = {
        phase: "done",
        slots: ["A","B","C","D","E","F","G","H"],
        rounds, currentRound: 7,
        tiebreakRandom: [0,1,2,3,4,5,6,7],
        finals: {
          championship: { team1: [1,4], team2: [2,3], score1: 11, score2: 9 },
          consolation:  { team1: [5,8], team2: [6,7], score1: 11, score2: 9 },
        },
        awardsShown: false, winScore: 11, notifiedRounds: [],
      };
      const a = computeAwards();
      console.assert(a.mvp.names.length >= 1, "MVP has at least one name");
      console.assert(a.biggestWin.names.every(n => n.includes("+10")),
        "Biggest Win all +10", a.biggestWin);
      console.assert(a.closestGame.names.every(n => n === "11–9"),
        "Closest Game all 11–9", a.closestGame);
      console.assert(a.hotStreak.detail && /in a row/.test(a.hotStreak.detail),
        "Hot Streak detail", a.hotStreak);
      // Single-winner sanity: rebuild with only ONE blowout game
      const rounds2 = SCHEDULE.map((rd, i) => ({
        round: i + 1,
        court1: { team1: rd[0][0].slice(), team2: rd[0][1].slice(), score1: 11, score2: 9 },
        court2: { team1: rd[1][0].slice(), team2: rd[1][1].slice(), score1: 11, score2: 9 },
      }));
      // Make round 1 court 1 a +10 blowout (the only one)
      rounds2[0].court1.score1 = 11; rounds2[0].court1.score2 = 1;
      state.rounds = rounds2;
      const b = computeAwards();
      console.assert(b.biggestWin.names.length === 1 && b.biggestWin.names[0].includes("+10"),
        "Biggest Win single", b.biggestWin);
      state = saved;
    }
  ```

- [ ] **Step 3: Verify**

  Open `http://127.0.0.1:8765/pickleball.html?test`. Console: `0 failure(s)`.

- [ ] **Step 4: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Champions: computeAwards() helper with tied-candidate handling"
  ```

---

## Task 12b: Champions — Awards strip rendering

**Goal:** Render the four computed awards as 2×2 chips below the podium.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (CSS + render integration)

- [ ] **Step 1: Add CSS for the awards strip**

  Append to `<style>`:
  ```css
  /* Tournament awards */
  .awards-strip {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    max-width: 600px;
    margin: 0 auto 20px;
  }
  .award-chip {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
  }
  .award-label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .award-value {
    font-size: 16px;
    font-weight: 700;
    margin-top: 2px;
    line-height: 1.3;
  }
  .award-detail {
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
  }
  ```

- [ ] **Step 2: Add `renderAwardsStrip()` helper**

  Just below `computeAwards`, insert:
  ```js
  function renderAwardsStrip() {
    const a = computeAwards();
    const wrap = el("div", { class: "awards-strip" });
    const chip = (label, item, inlineDetail) => {
      const node = el("div", { class: "award-chip" });
      node.appendChild(el("div", { class: "award-label" }, label));
      const valueText = item.names.length ? item.names.join(", ") : "—";
      const valueEl = el("div", { class: "award-value" }, valueText);
      if (item.detail && item.names.length && inlineDetail) {
        valueEl.appendChild(document.createTextNode(" · " + item.detail));
      }
      node.appendChild(valueEl);
      if (item.detail && item.names.length && !inlineDetail) {
        node.appendChild(el("div", { class: "award-detail" }, item.detail));
      }
      return node;
    };
    wrap.appendChild(chip("🎯 MVP", a.mvp, true));            // inline detail
    wrap.appendChild(chip("💥 BIGGEST WIN", a.biggestWin, false));
    wrap.appendChild(chip("🤏 CLOSEST GAME", a.closestGame, false));
    wrap.appendChild(chip("🔥 HOT STREAK", a.hotStreak, true)); // inline detail
    return wrap;
  }
  ```

- [ ] **Step 3: Insert the awards strip into `renderDoneScreen`**

  Find:
  ```js
    wrap.appendChild(renderPodium(ranking));

    // Final standings — uses the same renderStandingsCard, with finals included in totals
  ```

  Replace with:
  ```js
    wrap.appendChild(renderPodium(ranking));
    wrap.appendChild(renderAwardsStrip());

    // Final standings — uses the same renderStandingsCard, with finals included in totals
  ```

- [ ] **Step 4: Verify with playwright**

  - Seed a done tournament. Screenshot iPad portrait. 4 chips in a 2×2 grid below the podium.
  - MVP shows "Name · 85 pts" inline.
  - Biggest Win shows team + diff on first line, score + label below.
  - Closest Game shows score on first line, label below.
  - Hot Streak shows name(s) inline with " · 4 in a row".
  - Tweak seed so two players tie for MVP (give both 85 pts). Verify chip shows both names comma-separated.

- [ ] **Step 5: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Champions: render awards strip below podium"
  ```

---

## Task 13: Champions — Confetti pop on first view

**Goal:** A 2-second canvas confetti burst fires the first time `phase === "done"` is rendered with `awardsShown === false`. Sets `awardsShown = true` and saves; subsequent renders don't refire.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (helper + integration into `renderDoneScreen`)

- [ ] **Step 1: Add `runConfetti()` helper**

  Just before `function renderDoneScreen()`, insert:
  ```js
  function runConfetti() {
    const canvas = el("canvas", {
      style: "position: fixed; inset: 0; z-index: 90; pointer-events: none;"
    });
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const colors = ["#fbbf24", "#fde047", "#cbd5e1", "#d97706", "#38bdf8", "#a78bfa", "#10b981"];
    const N = 80;
    const parts = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: -Math.random() * 80,
      vx: (Math.random() - 0.5) * 6,
      vy: 2 + Math.random() * 4,
      size: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
    }));
    const start = performance.now();
    const totalMs = 2000;
    function frame(now) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; // gravity
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.4);
        ctx.restore();
      }
      if (elapsed < totalMs) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    }
    requestAnimationFrame(frame);
  }
  ```

- [ ] **Step 2: Wire confetti into `renderDoneScreen`**

  Find inside `renderDoneScreen` (anywhere reasonable — the start of the function is fine):
  ```js
  function renderDoneScreen() {
    const wrap = el("div");
    const f = state.finals;
    const champ = f.championship, cons = f.consolation;
    const ranking = finalRanking();
  ```

  Replace with:
  ```js
  function renderDoneScreen() {
    const wrap = el("div");
    const f = state.finals;
    const champ = f.championship, cons = f.consolation;
    const ranking = finalRanking();

    // First-view confetti, gated on awardsShown
    if (!state.awardsShown) {
      state.awardsShown = true;
      save();
      // defer so confetti fires after the DOM is mounted
      queueMicrotask(runConfetti);
    }
  ```

- [ ] **Step 3: Verify**

  - Seed a `phase === "playing"` state with all rounds + finals scored, `awardsShown: false`.
  - Navigate to finals → tap Crown Champions. Confetti fires for ~2s.
  - Refresh page. No confetti (awardsShown now true).
  - Tap "Edit Final Scores" → back. Still no confetti.
  - In playwright, set `state.awardsShown = false; save(); render()`. Confetti fires.
  - Reset Tournament from Settings (Task 17 — for now, manually `state = newState(); save(); render()`). Run a new tournament; reach Champions screen → confetti fires fresh.

- [ ] **Step 4: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Champions: confetti pop gated by awardsShown"
  ```

---

## Task 14: Settings — How this works modal

**Goal:** Add a "How this works" button at the top of the settings modal that opens a sub-modal with the same content as the Setup-screen rules block.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (handler + settings render)

- [ ] **Step 1: Refactor rules content into a shared array**

  Find the body of `renderRulesBlock`:
  ```js
  function renderRulesBlock() {
    const details = el("details", { class: "rules", open: "" });
    details.appendChild(el("summary", null, "How it works"));
    const body = el("div", { class: "rules-body" });
    const ul = el("ul");
    [
      "8 players, 2 courts, doubles. Every round, all 8 play.",
      ...
    ].forEach(text => ul.appendChild(el("li", null, text)));
    body.appendChild(ul);
    details.appendChild(body);
    return details;
  }
  ```

  Replace with:
  ```js
  const RULES_BULLETS = [
    "8 players, 2 courts, doubles. Every round, all 8 play.",
    "7 rounds, one per partner — by the end, you'll have partnered with every other player exactly once.",
    "Score games however you normally would (typically first to 11, win by 2). Type any final score.",
    "After round 7, points decide the seeds. Top 4 play the 🏆 Championship, bottom 4 play the 🥈 Consolation.",
    "Championship is #1 + #4 vs #2 + #3 — a balanced pairing so the top players don't stomp.",
    "Final ranking: total points → wins → point differential.",
  ];
  function renderRulesUl() {
    const ul = el("ul");
    RULES_BULLETS.forEach(text => ul.appendChild(el("li", null, text)));
    return ul;
  }
  function renderRulesBlock() {
    const details = el("details", { class: "rules", open: "" });
    details.appendChild(el("summary", null, "How it works"));
    const body = el("div", { class: "rules-body" });
    body.appendChild(renderRulesUl());
    details.appendChild(body);
    return details;
  }
  ```

- [ ] **Step 2: Add `openHowItWorksModal()` handler**

  Just before `function openSettings()`, insert:
  ```js
  function openHowItWorksModal() {
    const bg = el("div", { class: "modal-bg" });
    const close = () => bg.remove();
    bg.addEventListener("click", e => { if (e.target === bg) close(); });

    const modal = el("div", { class: "modal" });
    modal.appendChild(el("h2", null, "How this works"));
    const body = el("div", { class: "rules-body", style: "padding: 0; margin-bottom: 16px;" });
    body.appendChild(renderRulesUl());
    modal.appendChild(body);
    modal.appendChild(el("button", {
      style: "width: 100%;",
      onclick: close,
    }, "Close"));
    bg.appendChild(modal);
    document.body.appendChild(bg);
  }
  ```

- [ ] **Step 3: Add the link in `openSettings`**

  Find the start of the settings modal body (just after `modal.appendChild(el("h2", null, "Settings"));`):
  ```js
    modal.appendChild(el("h2", null, "Settings"));

    if (state.phase === "setup") {
  ```

  Replace with:
  ```js
    modal.appendChild(el("h2", null, "Settings"));

    modal.appendChild(el("button", {
      style: "width: 100%; margin-bottom: 12px;",
      onclick: () => { close(); openHowItWorksModal(); },
    }, "How this works"));

    if (state.phase === "setup") {
  ```

- [ ] **Step 4: Verify**

  Open Settings (gear icon). Tap "How this works". Sub-modal opens with the same 6 bullets as the Setup rules block. Close. No layout breakage.

- [ ] **Step 5: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Settings: How this works modal"
  ```

---

## Task 15: Settings — Win-score dropdown

**Goal:** A small `<select>` in Settings labeled "Win score" with options 11/15/21, bound to `state.winScore`. Updates immediately propagate to round-screen pill labels.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (`openSettings` + CSS)

- [ ] **Step 1: Add CSS for the inline select**

  Append to `<style>`:
  ```css
  /* Settings inline select row */
  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
    min-height: 60px;
  }
  .settings-row label { font-weight: 700; }
  .settings-row select {
    min-height: 44px;
    background: var(--panel-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 16px;
    font-family: inherit;
  }
  ```

- [ ] **Step 2: Add the dropdown in `openSettings`**

  Find (within the `if (state.phase === "setup") { ... } else { ... edit names ... }` block, after the name editing inputs and before the close/reset buttons):

  Find the section:
  ```js
    const closeBtn = el("button", { style: "width: 100%; margin-top: 12px;", onclick: () => { close(); render(); } }, "Done");
    modal.appendChild(closeBtn);
  ```

  Replace with:
  ```js
    const winScoreRow = el("div", { class: "settings-row" });
    winScoreRow.appendChild(el("label", null, "Win score"));
    const winSelect = el("select");
    [11, 15, 21].forEach(v => {
      const opt = el("option", { value: String(v) }, String(v));
      if (state.winScore === v) opt.setAttribute("selected", "selected");
      winSelect.appendChild(opt);
    });
    winSelect.addEventListener("change", () => {
      state.winScore = parseInt(winSelect.value, 10);
      save();
    });
    winScoreRow.appendChild(winSelect);
    modal.appendChild(winScoreRow);

    const closeBtn = el("button", { style: "width: 100%; margin-top: 12px;", onclick: () => { close(); render(); } }, "Done");
    modal.appendChild(closeBtn);
  ```

- [ ] **Step 3: Verify**

  - Open Settings. "Win score" row visible with select showing "11" by default.
  - Change to "15". Tap Done. Open Round screen with a blank round → quick-fill pill reads "× 15".
  - Reload → still 15 (persisted).
  - Change to "21" via Settings → pill reads "× 21".

- [ ] **Step 4: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Settings: win-score dropdown bound to state.winScore"
  ```

---

## Task 16: Settings — View Full Schedule modal

**Goal:** A button in Settings (visible only when `phase !== "setup"`) that opens a sub-modal listing all 7 rounds with both court matchups and any entered scores. When phase is finals or done, also append the Championship and Consolation matchups.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (handler + settings render + CSS)

- [ ] **Step 1: Add CSS for the schedule modal**

  Append to `<style>`:
  ```css
  /* Schedule modal */
  .schedule-list { max-height: 60vh; overflow-y: auto; }
  .schedule-round {
    padding: 12px 0;
    border-top: 1px solid var(--border);
  }
  .schedule-round:first-child { border-top: none; }
  .schedule-round-title {
    font-size: 13px;
    color: var(--muted);
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .schedule-game {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    font-size: 15px;
  }
  .schedule-game .court-tag {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    font-weight: 800;
    flex-shrink: 0;
  }
  .schedule-game .court-tag.c1 { background: rgba(56, 189, 248, 0.15); color: var(--court1); }
  .schedule-game .court-tag.c2 { background: rgba(167, 139, 250, 0.15); color: var(--court2); }
  .schedule-game .court-tag.gold { background: rgba(251, 191, 36, 0.18); color: var(--gold); }
  .schedule-game .court-tag.silver { background: rgba(203, 213, 225, 0.15); color: var(--silver); }
  .schedule-game .game-text { flex: 1; }
  .schedule-game .game-score {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  ```

- [ ] **Step 2: Add `openScheduleModal()` handler**

  Just before `function openSettings()`, insert:
  ```js
  function openScheduleModal() {
    const bg = el("div", { class: "modal-bg" });
    const close = () => bg.remove();
    bg.addEventListener("click", e => { if (e.target === bg) close(); });

    const modal = el("div", { class: "modal" });
    modal.appendChild(el("h2", null, "Full Schedule"));

    const list = el("div", { class: "schedule-list" });

    function gameRow(g, courtTag, courtClass) {
      const row = el("div", { class: "schedule-game" });
      row.appendChild(el("span", { class: "court-tag " + courtClass }, courtTag));
      row.appendChild(el("span", { class: "game-text" },
        teamName(g.team1) + " vs " + teamName(g.team2)));
      const scoreText = isGameComplete(g)
        ? g.score1 + "–" + g.score2
        : "—";
      row.appendChild(el("span", { class: "game-score" }, scoreText));
      return row;
    }

    state.rounds.forEach(r => {
      const block = el("div", { class: "schedule-round" });
      block.appendChild(el("div", { class: "schedule-round-title" }, "Round " + r.round));
      block.appendChild(gameRow(r.court1, "South", "c1"));
      block.appendChild(gameRow(r.court2, "North", "c2"));
      list.appendChild(block);
    });

    if (state.finals && (state.phase === "finals" || state.phase === "done")) {
      const block = el("div", { class: "schedule-round" });
      block.appendChild(el("div", { class: "schedule-round-title" }, "Finals"));
      block.appendChild(gameRow(state.finals.championship, "Champ", "gold"));
      block.appendChild(gameRow(state.finals.consolation,  "Cons",  "silver"));
      list.appendChild(block);
    }

    modal.appendChild(list);
    modal.appendChild(el("button", {
      style: "width: 100%; margin-top: 12px;",
      onclick: close,
    }, "Close"));
    bg.appendChild(modal);
    document.body.appendChild(bg);
  }
  ```

- [ ] **Step 3: Add the View Full Schedule button in `openSettings`**

  Find the location just after the "How this works" button (added in Task 14):
  ```js
    modal.appendChild(el("button", {
      style: "width: 100%; margin-bottom: 12px;",
      onclick: () => { close(); openHowItWorksModal(); },
    }, "How this works"));
  ```

  Add immediately below it:
  ```js
    if (state.phase !== "setup") {
      modal.appendChild(el("button", {
        style: "width: 100%; margin-bottom: 12px;",
        onclick: () => { close(); openScheduleModal(); },
      }, "View full schedule"));
    }
  ```

- [ ] **Step 4: Verify**

  - Setup phase → open Settings. "How this works" present, "View full schedule" absent.
  - Start a tournament. Open Settings → both buttons present. Tap "View full schedule" → modal lists all 7 rounds with South/North tags, scores or "—".
  - Advance to finals → modal includes a "Finals" section with Champ + Cons rows.
  - Advance to done → same.

- [ ] **Step 5: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Settings: view full schedule modal"
  ```

---

## Task 17: Extract `generateRounds()` helper

**Goal:** Pull the schedule + court-flip generation out of `startTournament` into a named helper so the upcoming Reset Tournament path doesn't duplicate it. Pure refactor — no behavior change.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (helper + `startTournament` body)

- [ ] **Step 1: Add the `generateRounds()` helper**

  Just before `function startTournament()`, insert:
  ```js
  // Returns a fresh array of 7 round objects with randomized court 1/2 flip.
  function generateRounds() {
    return SCHEDULE.map((roundDef, idx) => {
      const flip = Math.random() < 0.5;
      const c1 = flip ? roundDef[0] : roundDef[1];
      const c2 = flip ? roundDef[1] : roundDef[0];
      return {
        round: idx + 1,
        court1: { team1: c1[0].slice(), team2: c1[1].slice(), score1: null, score2: null },
        court2: { team1: c2[0].slice(), team2: c2[1].slice(), score1: null, score2: null },
      };
    });
  }
  ```

- [ ] **Step 2: Use it in `startTournament`**

  Find:
  ```js
    state.slots = shuffle(state.rawNames.map(s => s.trim()));
    state.rounds = SCHEDULE.map((roundDef, idx) => {
      const flip = Math.random() < 0.5;
      const c1 = flip ? roundDef[0] : roundDef[1];
      const c2 = flip ? roundDef[1] : roundDef[0];
      return {
        round: idx + 1,
        court1: { team1: c1[0].slice(), team2: c1[1].slice(), score1: null, score2: null },
        court2: { team1: c2[0].slice(), team2: c2[1].slice(), score1: null, score2: null },
      };
    });
  ```

  Replace with:
  ```js
    state.slots = shuffle(state.rawNames.map(s => s.trim()));
    state.rounds = generateRounds();
  ```

- [ ] **Step 3: Verify**

  - Reload the app. Confirm Setup screen renders with no errors.
  - Run a fresh tournament from the setup screen. Confirm the 7 rounds populate correctly and South/North court labels are present (i.e. the flip still happens).
  - Open Settings → View Full Schedule (if Task 16 already shipped) and verify all 7 rounds show.

- [ ] **Step 4: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Extract generateRounds() helper to avoid duplication"
  ```

---

## Task 18: Settings — Two-tier reset (Reset Tournament + Clear All)

**Goal:** Replace the existing single Reset button with two: Reset Tournament (preserves names + winScore, hidden in setup) and Clear All (full wipe). Uses the `generateRounds()` helper from Task 17.

**Files:**
- Modify: `/Users/kenallred/Documents/dev-projects/rumble/pickleball.html` (handler in `openSettings`)

- [ ] **Step 1: Replace the existing reset button with two-tier logic**

  Find the existing Reset block in `openSettings`:
  ```js
    const resetBtn = el("button", {
      class: "danger",
      style: "width: 100%; margin-top: 8px;",
      onclick: () => {
        if (confirm("Reset the tournament? All scores and the random schedule will be cleared. Names entered on the setup screen will be kept.")) {
          const keptRaw = state.rawNames.slice();
          state = newState();
          state.rawNames = keptRaw;
          save(); close(); render();
        }
      }
    }, "Reset Tournament");
    modal.appendChild(resetBtn);
  ```

  Replace with:
  ```js
    // Divider before destructive actions
    modal.appendChild(el("div", {
      style: "border-top: 1px solid var(--border); margin: 16px 0 8px;"
    }));

    // Reset Tournament — visible only outside the setup phase
    if (state.phase !== "setup") {
      modal.appendChild(el("button", {
        style: "width: 100%; margin-top: 8px; background: var(--accent); color: #1a1207; border-color: var(--accent);",
        onclick: () => {
          if (!confirm("Reset scores and re-shuffle the schedule? Your 8 names will be kept.")) return;
          const keptNames = state.slots.slice();
          const keptWinScore = state.winScore;
          state = newState();
          state.rawNames = keptNames.slice();
          state.slots = shuffle(keptNames);
          state.rounds = generateRounds();
          state.tiebreakRandom = shuffle([0,1,2,3,4,5,6,7]);
          state.winScore = keptWinScore;
          state.phase = "playing";
          state.currentRound = 1;
          save();
          close();
          render();
        }
      }, "Reset Tournament"));
    }

    // Clear All — always visible
    modal.appendChild(el("button", {
      class: "danger",
      style: "width: 100%; margin-top: 8px;",
      onclick: () => {
        if (!confirm("Clear all data including names? This can't be undone.")) return;
        state = newState();
        save();
        close();
        render();
      }
    }, "Clear All"));
  ```

- [ ] **Step 2: Verify**

  - Setup phase → Settings → only "Clear All" (red) visible at bottom; no Reset Tournament.
  - Mid-tournament with scores → Settings → both buttons visible; "Reset Tournament" yellow, "Clear All" red.
  - Set Win score to 21 in the dropdown. Tap Reset Tournament → confirm → scores cleared, schedule re-shuffled (different court flips with high probability), names preserved, winScore still 21 (verify by re-opening Settings or by reading the round-screen pill — should read "× 21").
  - Tap Clear All → confirm → back to empty Setup screen, all names blank.

- [ ] **Step 3: Commit**

  ```bash
  git add pickleball.html
  git commit -m "Settings: two-tier reset (Reset Tournament + Clear All)"
  ```

---

## Task 19: End-to-end smoke verification

**Goal:** Walk through a complete tournament in playwright, exercising all the new UX in sequence. No new code; this is a verification gate before declaring the plan complete.

**Files:** none — verification only.

- [ ] **Step 1: Server up + clean storage**

  Ensure the http server is running on 8765. In playwright, navigate to `http://127.0.0.1:8765/pickleball.html` and clear localStorage.

- [ ] **Step 2: Setup flow**

  - Confirm "How it works" rules block visible, default expanded.
  - Tap "Paste 8 names". Paste `Adrian, Alex, John, Joe, Ken, Kris, Sam, Todd`. Tap Fill. All 8 inputs populate; Start Tournament enables.
  - Tap Start Tournament. Shuffle reveal animates; finishes; round 1 renders.

- [ ] **Step 3: First few rounds with quick-fill**

  - Round 1 South: tap "× 11" pill on team 1's row → score 11 appears, opponent input focused. Type 7. Court summary shows "🎉 [team] win by 4".
  - Round 1 North: same flow.
  - Round becomes complete → toast slides in, "Round 2 →" button shimmers gold.
  - Tap "Round 2 →".
  - Continue through round 5 mixing quick-fill + direct typing. Refresh the page once mid-round 4. Confirm previously-fired toast does not re-fire; current-round state preserved.

- [ ] **Step 4: Partner-preview chip**

  - Throughout rounds 1–6, confirm each row in Live Standings shows "→ Partner" chip color-matched to the next-round court.
  - At round 7, chips disappear.

- [ ] **Step 5: Settings probe**

  - Open Settings. Tap How this works → modal shows 6 bullets. Close.
  - Tap View full schedule → all rounds 1–7 with South/North tags and scores; no Finals section yet.
  - Change Win score to 15 → on round screen, pill reads "× 15". Change back to 11.
  - Tap Reset Tournament. Confirm. Round 1 renders fresh with re-shuffled court flips. Names preserved.

- [ ] **Step 6: Re-run to finals**

  - Skip ahead via `browser_evaluate` by seeding a state with all 7 rounds completed. Reload.
  - Tap Build Finals → finals screen.
  - Confirm: Championship card amplified (gold glow, larger), Consolation compact, both have seed pills (#1/#4 vs #2/#3 etc.), Championship has "Balanced pairing" caption.
  - Enter Championship 11–11 → Crown button disabled, "Tied — enter a tiebreaker" message. Change to 11–9 → still disabled until Consolation entered. Enter Consolation 11–7 → Crown enables.
  - Tap Crown.

- [ ] **Step 7: Champions screen**

  - Confetti fires once.
  - Champions card shows winning team and scorecard.
  - Top-3 podium rendered: gold center, silver left, bronze right. Names + points labelled.
  - Awards strip: 4 chips (MVP, Biggest Win, Closest Game, Hot Streak). Verify each is reasonable for the scored data.
  - Final Standings table below: ranks 4–8 in `finalRanking()` order.
  - Refresh → no second confetti.

- [ ] **Step 8: Reset flow exits cleanly**

  - From Champions, tap Start New Tournament → confirm → Setup screen, names cleared.
  - Run a fresh tournament partway → from Settings, Clear All → empty Setup again, no leftover state.

- [ ] **Step 9: iPad landscape sanity**

  - Resize playwright to 1180×820. Walk through round + finals + champions screens. Confirm no horizontal overflow, courts side-by-side, podium centered, awards 2×2 grid intact.

- [ ] **Step 10: Optional — `?test` self-tests**

  Open `http://127.0.0.1:8765/pickleball.html?test`. Console should show `[self-tests] complete — 0 failure(s)` with no preceding `Assertion failed` lines.

- [ ] **Step 11: Commit (if any small fixes were needed during smoke)**

  If the smoke test surfaced small fixes, commit them now. Otherwise, no commit needed.

  ```bash
  git status   # confirm clean tree
  ```

---

## Self-review (post-write)

Spec coverage check (each spec section → task that implements it):

- **§1 Goals** — covered across Tasks 2–17
- **§2 Non-goals** — implicitly preserved by not including those features
- **§3 State schema additions** — Task 1
- **§3.1 Name-handling safety** — `el()` already uses `createTextNode`; verified by smoke test (no `innerHTML` of names anywhere)
- **§4.1 Setup**
  - How it works rules block — Task 2
  - Paste 8 names — Task 3
  - Animated shuffle reveal — Task 4
- **§4.2 Round screen**
  - Partner-preview chip — Task 5
  - Tap-winner quick-fill — Task 6
  - Round-complete moment — Task 7
- **§4.3 Finals screen**
  - Seed pills — Task 8
  - Compact seeds list (kept) — already present in existing code (untouched)
  - Amplified championship — Task 9
  - Balanced-pairing caption — Task 9
  - Crown Champions tied gate — Task 9
- **§4.4 Champions screen**
  - finalRanking() helper — Task 10
  - Top-3 podium — Task 11
  - Tournament awards — Tasks 12a (helper) + 12b (render)
  - Confetti — Task 13
- **§4.5 Settings**
  - How this works modal — Task 14
  - Edit Names — preserved (untouched)
  - Win-score dropdown — Task 15
  - View Full Schedule — Task 16
  - generateRounds() refactor — Task 17
  - Reset Tournament + Clear All — Task 18
- **§5 Acceptance criteria** — Task 19 (end-to-end smoke) covers schedule integrity, score-entry/refresh-safety, confetti gating, paste validation, name preservation, View Full Schedule visibility, layout. Self-tests cover the pure-function math.
- **§6 Risks** — addressed by skip-overlay + visibility rules + cleanup-on-end
- **§7 File structure** — all helpers added with the prescribed names

No placeholders detected on re-read. Type/method names consistent across tasks (`isRoundComplete(r)` always takes a round object; `seedPill(rank, kind)` consistent; `nextPartnerInfo(slot)` consistent; `finalRanking()` returns the same shape used by both podium and table).
