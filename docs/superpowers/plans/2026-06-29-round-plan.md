# Round Plan — Per-Round Pairing Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-round pairing modes (Open / Mixed / Gender / Blend) so game managers can design the arc of a pickleball night — gender doubles warmup rounds, mixed social rounds, blend rounds with some courts of each.

**Architecture:** A `state.roundPlan` array holds one `RoundMode` per round. The scheduler resolves the mode via `roundPlanForRound(ri)` and threads it explicitly through all scheduling primitives (no more `state.mixedMode` reads inside the scheduler). Each generated game stores its `courtMode` tag. New helpers (`dealGenderCourts`, `pairGenderAware`, `dealBlendCourts`) implement the gender and blend constraints. Bye allocation becomes mode-aware for all modes.

**Tech Stack:** Vanilla JS (single `index.html`, no build step). Inline `console.assert` self-tests via `?test` URL. Tournament simulations via `?simulate` URL.

## Global Constraints

- **Single file:** All JS/CSS/HTML lives in `index.html` (~15,700 lines). No build step, no bundler.
- **Code markers:** Core helpers in `// RUMBLE:CORE` / `// RUMBLE:FORMATS` sections. Tests in `// RUMBLE:TESTS` section.
- **Explicit mode threading:** Scheduling primitives receive `mode` as a parameter — they do NOT read `state.mixedMode`. This is the critical architectural change.
- **Test commands:** `npm run test:self` (expects exactly 1 baseline failure). `npm run test:simulate` (expects 0 failures). Requires server on port 8765: `python3 -m http.server 8765`.
- **Group storage:** Groups are `"a"`, `"b"`, or `""` (unset/wildcard).
- **Spec reference:** `docs/superpowers/specs/2026-06-29-round-plan-per-round-pairing-modes-design.md`
- **Backward compat:** `mixedMode:true` + empty `roundPlan` = all mixed (today's behavior). `mixedMode:false` + empty = all open (today's behavior).

---

### Task 1: State field, migration, and `roundPlanForRound` resolver

**Files:**
- Modify: `index.html` — `newState()` (~line 5280), `backfillStateDefaults()` (~line 5380), FORMATS section (~line 6527)
- Test: `index.html` — TESTS section (~line 4800)

**Interfaces:**
- Produces: `state.roundPlan` (Array), `roundPlanForRound(ri)` → `RoundMode`

- [ ] **Step 1: Add `roundPlan` to `newState()`**

In `newState()`, after the `slotGroups: []` field, add:

```js
    roundPlan: [],                                     // per-round pairing modes: Array<{mode, mixedCourts?}>
```

- [ ] **Step 2: Add backfill to `backfillStateDefaults()`**

Before the final `return obj;`, add:

```js
  if (!Array.isArray(obj.roundPlan)) obj.roundPlan = [];
```

- [ ] **Step 3: Add `roundPlanForRound` helper**

In the FORMATS section, after `groupOf`/`mixedModeBadTeamCount`/`isMixedTeam`, add:

```js
// Resolves the effective pairing mode for round index `ri` (0-based).
// Falls back to mixedMode if roundPlan is empty or the round isn't covered.
function roundPlanForRound(ri) {
  if (Array.isArray(state.roundPlan) && state.roundPlan[ri]) {
    return state.roundPlan[ri];
  }
  return state.mixedMode ? { mode: "mixed" } : { mode: "open" };
}
```

- [ ] **Step 4: Write unit tests**

In the TESTS section, after the existing mixed-mode tests, add:

```js
  // ---- Round Plan: state + resolver ----
  (function roundPlanStateTests() {
    const legacy = backfillStateDefaults({ phase: "setup", format: "rr", rawNames: ["A","B"] });
    console.assert(Array.isArray(legacy.roundPlan) && legacy.roundPlan.length === 0,
      "roundPlan migration: defaults to []");

    const ns = newState();
    console.assert(Array.isArray(ns.roundPlan) && ns.roundPlan.length === 0,
      "newState: roundPlan is empty array");

    state = newState();
    console.assert(roundPlanForRound(0).mode === "open",
      "roundPlanForRound: empty plan + mixedMode off → open");

    state.mixedMode = true;
    console.assert(roundPlanForRound(0).mode === "mixed",
      "roundPlanForRound: empty plan + mixedMode on → mixed");

    state.roundPlan = [{ mode: "gender" }, { mode: "blend", mixedCourts: 2 }, { mode: "mixed" }];
    console.assert(roundPlanForRound(0).mode === "gender", "roundPlanForRound: ri=0 → gender");
    console.assert(roundPlanForRound(1).mode === "blend", "roundPlanForRound: ri=1 → blend");
    console.assert(roundPlanForRound(1).mixedCourts === 2, "roundPlanForRound: blend mixedCourts");
    console.assert(roundPlanForRound(2).mode === "mixed", "roundPlanForRound: ri=2 → mixed");
    console.assert(roundPlanForRound(99).mode === "mixed",
      "roundPlanForRound: out-of-bounds falls back to mixedMode");

    state = newState();
  })();
```

- [ ] **Step 5: Run tests**

Run: `npm run test:self`
Expected: PASS with exactly 1 failure (baseline)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(round-plan): state field, migration, roundPlanForRound resolver"
```

---

### Task 2: Thread explicit `mode` through existing scheduling primitives

**Files:**
- Modify: `index.html` — `bestRRSplit` (~line 8504), `generateRRSchedule` (~line 8517), `assignCourtsConstrained` (~line 6666)

**Interfaces:**
- Consumes: `roundPlanForRound(ri)` from Task 1
- Produces: `bestRRSplit(four, court, history, chosen, mode)` with mode param; `generateRRSchedule` passes mode per-round

This is the critical decoupling task. Currently `bestRRSplit` checks `state.mixedMode` directly. We add a `mode` parameter so it routes based on the per-round mode, not the global flag.

- [ ] **Step 1: Add `mode` parameter to `bestRRSplit`**

Change `bestRRSplit` signature and routing:

```js
function bestRRSplit(four, court, history, chosen, mode) {
  if (mode === "mixed") {
    const [team1, team2] = pairMixedAware(four, { court, history, chosen });
    return makeGame(court, team1, team2);
  }
  let best = null, bestCost = Infinity;
  for (const [team1, team2] of rrTeamSplits(four)) {
    const game = makeGame(court, team1, team2);
    const cost = rrRoundCost([...chosen, game], history);
    if (cost < bestCost) { best = game; bestCost = cost; }
  }
  return best;
}
```

- [ ] **Step 2: Update `generateRRSchedule` to pass mode**

In `generateRRSchedule`, for each round, resolve the mode and pass it through:

```js
    const plan = roundPlanForRound(ri);
    const mode = plan.mode;
    // ... inside the restart loop:
    games.push(bestRRSplit(four, c + 1, prior, games, mode));
```

Replace the existing `state.mixedMode ? dealBalancedCourts(...)` check with:

```js
      const courts = (mode === "mixed" || mode === "blend")
        ? dealCourtsByMode(plan, alloc.playing, alloc.activeCourts, rng, prior)
        : null;
```

- [ ] **Step 3: Update `assignCourtsConstrained` to accept `mode`**

Add `mode` parameter to `assignCourtsConstrained` and use it instead of reading `state.mixedMode`:

```js
function assignCourtsConstrained(playing, naturalCourt, activeCourts, history, rng, mode) {
  if (!mode || mode === "open" || playing.length < activeCourts * 4) {
    // Fallback: simple slice
    ...
  }
  // ... inside scoring, use mode to determine badTeams/crossTeams
```

- [ ] **Step 4: Update all call sites**

Find every call to `bestRRSplit`, `generateRRSchedule`, and `assignCourtsConstrained` and ensure they pass the mode. For the existing mixed-mode tests and code, pass `"mixed"`. For non-mixed paths, pass `"open"`.

- [ ] **Step 5: Run tests**

Run: `npm run test:self && npm run test:simulate`
Expected: 1 baseline failure (self), 0 failures (simulate)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(round-plan): thread explicit mode through scheduling primitives

bestRRSplit, generateRRSchedule, and assignCourtsConstrained now
receive mode as a parameter instead of reading state.mixedMode.
This decouples the scheduler from the global flag so per-round
modes work correctly."
```

---

### Task 3: `pairGenderAware` helper

**Files:**
- Modify: `index.html` — FORMATS section (~line 6650, after `pairMixedAware`)
- Test: `index.html` — TESTS section

**Interfaces:**
- Consumes: `groupOf()` (existing), `rrTeamSplits()` (existing), `pairingCost()` (existing)
- Produces: `pairGenderAware(four, opts)` → `[team1, team2]`

- [ ] **Step 1: Write failing test**

```js
  // ---- Round Plan: pairGenderAware ----
  (function pairGenderAwareTests() {
    state.mixedMode = true;
    state.slotGroups = ["a","a","b","b"];

    // 2A+2B → [A,A] vs [B,B]
    const [t1, t2] = pairGenderAware([1,2,3,4], {});
    console.assert(t1.includes(1) && t1.includes(2), "pairGender: A+A team", t1);
    console.assert(t2.includes(3) && t2.includes(4), "pairGender: B+B team", t2);

    // 4A → any split, cost-only
    state.slotGroups = ["a","a","a","a"];
    const [t1b, t2b] = pairGenderAware([1,2,3,4], {});
    console.assert(t1b.length === 2 && t2b.length === 2, "pairGender: 4A produces two teams");

    // Wildcard: unset group never counts as cross
    state.slotGroups = ["a","","b",""];
    const [t1c, t2c] = pairGenderAware([1,2,3,4], {});
    console.assert(t1c.length === 2, "pairGender: wildcard handling no crash");

    state = newState();
  })();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:self` — Expected: FAIL (`pairGenderAware is not defined`)

- [ ] **Step 3: Implement `pairGenderAware`**

After `pairMixedAware`, add:

```js
// Mirror of pairMixedAware: minimizes cross-group (mixed) teams.
// For gender mode: same-group teams preferred, mixed teams avoided.
function pairGenderAware(four, opts) {
  const splits = rrTeamSplits(four);
  const scored = splits.map(([team1, team2]) => {
    let crossTeams = 0;
    for (const team of [team1, team2]) {
      const g0 = groupOf(team[0]), g1 = groupOf(team[1]);
      if (g0 && g1 && g0 !== g1) crossTeams++;
    }
    return { teams: [team1, team2], crossTeams, cost: pairingCost(team1, team2, opts) };
  });
  scored.sort((a, b) => a.crossTeams - b.crossTeams || a.cost - b.cost);
  return scored[0].teams;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:self` — Expected: PASS (1 baseline failure)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(round-plan): pairGenderAware — minimizes cross-group teams"
```

---

### Task 4: `dealGenderCourts` and `dealBlendCourts` helpers

**Files:**
- Modify: `index.html` — FORMATS section (after `dealBalancedCourts` ~line 6640)
- Test: `index.html` — TESTS section

**Interfaces:**
- Consumes: `groupOf()`, `dealBalancedCourts()` (existing), `seededShuffle` (existing)
- Produces: `dealGenderCourts(playing, activeCourts, rng, priorRounds)` → tagged courts; `dealBlendCourts(plan, playing, activeCourts, rng, prior)` → tagged courts

- [ ] **Step 1: Write failing tests**

```js
  // ---- Round Plan: dealGenderCourts ----
  (function dealGenderCourtsTests() {
    const rng = mulberry32(42);
    state.mixedMode = true;
    state.slotGroups = ["a","a","a","a","a","a","b","b","b","b","b","b"];

    // 6A+6B, 3 courts → three 2A+2B courts
    const courts = dealGenderCourts([1,2,3,4,5,6,7,8,9,10,11,12], 3, rng, []);
    console.assert(courts.length === 3, "dealGender: 3 courts");
    for (const c of courts) {
      const aCount = c.slots.filter(s => groupOf(s) === "a").length;
      const bCount = c.slots.filter(s => groupOf(s) === "b").length;
      console.assert(aCount === 2 && bCount === 2, "dealGender: 2A+2B per court", { aCount, bCount });
    }

    state = newState();
  })();

  // ---- Round Plan: dealBlendCourts ----
  (function dealBlendCourtsTests() {
    const rng = mulberry32(42);
    state.mixedMode = true;
    state.slotGroups = ["a","a","a","a","a","a","b","b","b","b","b","b"];

    // 6A+6B, 3 courts, 2 mixed → 2 mixed courts + 1 gender court
    const courts = dealBlendCourts({ mode: "blend", mixedCourts: 2 }, [1,2,3,4,5,6,7,8,9,10,11,12], 3, rng, []);
    console.assert(courts.length === 3, "dealBlend: 3 courts");
    console.assert(courts[0].courtMode === "mixed", "dealBlend: court 0 is mixed");
    console.assert(courts[1].courtMode === "mixed", "dealBlend: court 1 is mixed");
    console.assert(courts[2].courtMode === "gender", "dealBlend: court 2 is gender");

    // All 12 players placed
    const allSlots = courts.flatMap(c => c.slots);
    console.assert(allSlots.length === 12, "dealBlend: all 12 placed");
    console.assert(!allSlots.includes(undefined), "dealBlend: no undefined");

    state = newState();
  })();
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement `dealGenderCourts`**

```js
// Deals players to courts for gender mode, preferring 2A+2B per court
// (which pairs as A+A vs B+B). Returns tagged courts: [{ slots, courtMode }].
function dealGenderCourts(playing, activeCourts, rng, priorRounds) {
  const shuffle = (arr) => seededShuffle(arr.slice(), rng);
  const aPool = shuffle(playing.filter(s => groupOf(s) === "a"));
  const bPool = shuffle(playing.filter(s => groupOf(s) === "b"));
  const unset = shuffle(playing.filter(s => groupOf(s) === ""));
  const courts = Array.from({ length: activeCourts }, () => []);
  // Deal 2A+2B per court
  for (let c = 0; c < activeCourts; c++) {
    while (courts[c].length < 2 && aPool.length) courts[c].push(aPool.pop());
    while (courts[c].length < 4 && bPool.length) courts[c].push(bPool.pop());
  }
  // Fill remaining from surplus
  const surplus = [...aPool, ...bPool, ...unset];
  for (let c = 0; c < activeCourts && surplus.length; c++) {
    while (courts[c].length < 4 && surplus.length) courts[c].push(surplus.pop());
  }
  return courts.map(slots => ({ slots, courtMode: "gender" }));
}
```

- [ ] **Step 4: Implement `dealBlendCourts`**

```js
// Splits courts into mixed + gender sets and deals each. Returns tagged courts.
function dealBlendCourts(plan, playing, activeCourts, rng, prior) {
  const mixedCourts = Math.max(1, Math.min(plan.mixedCourts || 1, activeCourts - 1));
  const genderCourts = activeCourts - mixedCourts;
  // Deal mixed courts first: 2A+2B each
  const mSlots = dealBalancedCourts(playing, mixedCourts, rng, prior);
  // Remove dealt players, deal gender courts from remainder
  const dealt = new Set(mSlots.flat());
  const remaining = playing.filter(s => !dealt.has(s));
  const gTagged = dealGenderCourts(remaining, genderCourts, rng, prior);
  return [
    ...mSlots.map(slots => ({ slots, courtMode: "mixed" })),
    ...gTagged,
  ];
}
```

- [ ] **Step 5: Implement `dealCourtsByMode` dispatcher**

```js
// Dispatches to the right dealer based on plan.mode. Returns tagged courts
// (array of { slots, courtMode }) for blend/gender, or plain slot arrays for open.
function dealCourtsByMode(plan, playing, activeCourts, rng, prior) {
  if (plan.mode === "gender") return dealGenderCourts(playing, activeCourts, rng, prior);
  if (plan.mode === "blend") return dealBlendCourts(plan, playing, activeCourts, rng, prior);
  if (plan.mode === "mixed") {
    const courts = dealBalancedCourts(playing, activeCourts, rng, prior);
    return courts.map(slots => ({ slots, courtMode: "mixed" }));
  }
  return null; // open — caller uses seededShuffle
}
```

- [ ] **Step 6: Implement `pairByMode` dispatcher**

```js
// Dispatches within-court pairing based on courtMode tag.
function pairByMode(courtMode, four, opts) {
  if (courtMode === "gender") return pairGenderAware(four, opts);
  if (courtMode === "mixed") return pairMixedAware(four, opts);
  return null; // open — caller uses bestRRSplit
}
```

- [ ] **Step 7: Run tests**

Run: `npm run test:self && npm run test:simulate`

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat(round-plan): dealGenderCourts, dealBlendCourts, dispatchers"
```

---

### Task 5: Wire the router into `generateRRSchedule`

**Files:**
- Modify: `index.html` — `generateRRSchedule` (~line 8517)

- [ ] **Step 1: Update `generateRRSchedule` to use the full router**

Replace the round-generation loop to call `dealCourtsByMode` and `pairByMode`, storing `courtMode` on each game:

```js
    const plan = roundPlanForRound(ri);
    const mode = plan.mode;
    // ...
    for (let attempt = 0; attempt < restarts; attempt++) {
      let taggedCourts = null;
      let games = [];
      if (mode === "open") {
        const shuffled = seededShuffle(alloc.playing, rng);
        for (let c = 0; c < alloc.activeCourts; c++) {
          const four = shuffled.slice(c * 4, c * 4 + 4);
          if (four.length === 4) games.push(bestRRSplit(four, c + 1, prior, games, "open"));
        }
      } else {
        taggedCourts = dealCourtsByMode(plan, alloc.playing, alloc.activeCourts, rng, prior);
        for (let c = 0; c < taggedCourts.length; c++) {
          const { slots, courtMode } = taggedCourts[c];
          if (slots.length === 4) {
            const teams = pairByMode(courtMode, slots, { court: c + 1, history: prior, chosen: games });
            const game = teams ? makeGame(c + 1, teams[0], teams[1]) : bestRRSplit(slots, c + 1, prior, games, mode);
            if (game && courtMode) game.courtMode = courtMode;
            games.push(game);
          }
        }
      }
      // ... cost scoring and best-games selection (same as today)
    }
```

- [ ] **Step 2: Update the court-swap post-processing to preserve `courtMode`**

In the court-swap loop (the post-schedule optimization), ensure `game.courtMode` is preserved when swapping `game.court`:

```js
      for (const g of riGames) {
        const oldC = g.court || 1;
        const newC = oldC === 1 ? 2 : 1;
        g.court = newC;
        // courtMode stays — it's about team composition, not court label
      }
```

(This should already work since `courtMode` is a separate field, but verify.)

- [ ] **Step 3: Run tests**

Run: `npm run test:self && npm run test:simulate`

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(round-plan): wire mode router into generateRRSchedule"
```

---

### Task 6: Mode-aware bye allocation

**Files:**
- Modify: `index.html` — `allocateByesMixed` (~line 8435), `isMixedFeasible` (~line 8427)

- [ ] **Step 1: Generalize `isMixedFeasible` to `isFeasibleForMode`**

```js
// Checks if a playing set can satisfy the given mode's pairing constraints.
function isFeasibleForMode(playing, activeCourts, mode) {
  if (mode === "open") return true;
  const aCount = playing.filter(s => groupOf(s) === "a").length;
  const bCount = playing.filter(s => groupOf(s) === "b").length;
  if (mode === "mixed") return aCount >= 2 * activeCourts && bCount >= 2 * activeCourts;
  if (mode === "gender") return aCount % 2 === 0 && bCount % 2 === 0;
  if (mode === "blend") {
    // Need enough A and B for mixed courts, plus even remainder for gender
    return aCount >= 2 * activeCourts && bCount >= 2 * activeCourts;
  }
  return true;
}
```

- [ ] **Step 2: Generalize `allocateByesMixed` to `allocateByesForMode`**

Rename and add a `mode` parameter. The feasibility check calls `isFeasibleForMode` instead of `isMixedFeasible`:

```js
function allocateByesForMode(mode, policy, context) {
  const result = allocateByes(policy, context);
  if (mode === "open" || result.byes.length === 0) return result;
  const shape = roundShapeFor((context.activeSlots || []).length, context.courtCount || 2);
  if (isFeasibleForMode(result.playing, shape.activeCourts || shape.courts, mode)) return result;
  // Search for a feasible variant (same 60-attempt shuffle as before)
  ...
}
```

- [ ] **Step 3: Update all call sites**

In `generateRRSchedule` and the ladder round builders, replace `allocateByesMixed(...)` with `allocateByesForMode(mode, ...)`, passing the resolved mode.

- [ ] **Step 4: Write tests for gender/blend feasibility**

```js
  // ---- Round Plan: mode-aware bye allocation ----
  (function allocateByesForModeTests() {
    state.mixedMode = true;
    state.slotGroups = ["a","a","a","a","a","b","b","b","b","b"]; // 5A+5B
    // Gender mode, 2 courts, 2 byes → need even A and B after byes
    const alloc = allocateByesForMode("gender", "rotation", {
      activeSlots: [1,2,3,4,5,6,7,8,9,10],
      players: [1,2,3,4,5,6,7,8,9,10].map(s => ({ slot: s, status: "active", eligibleFromRound: 1 })),
      rounds: [], round: 1, courtCount: 2, rng: mulberry32(42),
    });
    const aPlaying = alloc.playing.filter(s => groupOf(s) === "a").length;
    const bPlaying = alloc.playing.filter(s => groupOf(s) === "b").length;
    console.assert(aPlaying % 2 === 0, "allocByes gender: even A after byes", aPlaying);
    console.assert(bPlaying % 2 === 0, "allocByes gender: even B after byes", bPlaying);
    state = newState();
  })();
```

- [ ] **Step 5: Run tests**

Run: `npm run test:self && npm run test:simulate`

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(round-plan): mode-aware bye allocation for all modes"
```

---

### Task 7: Setup UI — Round Plan section

**Files:**
- Modify: `index.html` — `renderSetup()` (~line 11200), new `renderRoundPlanSection()` function

- [ ] **Step 1: Add `renderRoundPlanSection` function**

In the CORE section, add a function that renders the per-round dropdown list. It reads `state.roundPlan` and `totalRegularRounds()`. Each row has a `<select>` with Open/Mixed/Gender/Blend options. Blend rows show a sub-control for `mixedCourts`. Three quick-preset buttons at the top.

- [ ] **Step 2: Wire into `renderSetup`**

After the mixed-mode toggle card and before the Start button, insert:

```js
    if (state.mixedMode && state.format !== "crown") {
      wrap.appendChild(renderRoundPlanSection());
    }
```

- [ ] **Step 3: Implement quick presets**

- "All Mixed": `state.roundPlan = Array.from({length: total}, () => ({mode:"mixed"}))`
- "Mixed → Gender": first half `{mode:"mixed"}`, second half `{mode:"gender"}`
- "Custom": `state.roundPlan = Array.from({length: total}, () => ({mode:"open"}))`

- [ ] **Step 4: Default population when mixed toggled ON**

When `state.mixedMode` is toggled ON and `roundPlan` is empty, populate with all-mixed:

```js
    if (state.mixedMode && state.roundPlan.length === 0) {
      const total = totalRegularRounds();
      state.roundPlan = Array.from({ length: total }, () => ({ mode: "mixed" }));
    }
```

- [ ] **Step 5: Run tests + manual verification**

Run: `npm run test:self && npm run test:simulate`. Open browser and verify the Round Plan dropdowns appear when mixed mode is toggled on.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(round-plan): setup UI — per-round dropdowns, presets, blend control"
```

---

### Task 8: Surfaces — mode badge, court-type badge, team badges

**Files:**
- Modify: `index.html` — round header rendering, court card rendering, team badge rendering

- [ ] **Step 1: Add mode to round header**

Where the header shows "Round 3 of 7", append the mode:

```js
    const plan = roundPlanForRound(state.currentRound - 1);
    const modeLabel = { open: "Open", mixed: "Mixed", gender: "Gender", blend: "Blend" }[plan.mode] || "";
    const blendDetail = plan.mode === "blend" ? ` (${plan.mixedCourts} mixed + ${activeCourts - plan.mixedCourts} open)` : "";
    // Header text: "Round 3 of 7 · Mixed" or "Round 6 of 7 · Blend (2 mixed + 1 open)"
```

- [ ] **Step 2: Add court-type badge for blend rounds**

On blend rounds, read `game.courtMode` and show a badge next to the court name:

```js
    const courtMode = game.courtMode || (plan.mode === "gender" ? "gender" : plan.mode === "mixed" ? "mixed" : "open");
    if (courtMode === "mixed" || courtMode === "gender") {
      // Show badge: "Mixed" or "Gender" next to court name
    }
```

- [ ] **Step 3: Update team badges for gender mode**

`mixedBadgeForTeam` currently shows M·W for mixed teams. Extend it to show M·M or W·W for same-gender teams:

```js
function badgeForTeam(team) {
  if (!state.mixedMode && !hasRoundPlan()) return "";
  const g0 = groupOf(team[0]), g1 = groupOf(team[1]);
  if (g0 && g1 && g0 !== g1) return "M·W"; // mixed
  if (g0 && g1 && g0 === g1) return g0 === "a" ? "M·M" : "W·W"; // same gender
  return " ✓"; // wildcard
}
```

- [ ] **Step 4: Run tests + manual verification**

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(round-plan): surfaces — mode header, court-type badge, team badges"
```

---

### Task 9: Settings — Round Plan view + mid-tournament edit

**Files:**
- Modify: `index.html` — Settings/Manage section rendering

- [ ] **Step 1: Add Round Plan section to Settings**

In the settings panel (where Manage Players lives), add a read-only view of the round plan. Completed rounds are locked (greyed out). Remaining rounds have editable dropdowns.

- [ ] **Step 2: Implement edit handler**

When a remaining round's mode is changed, update `state.roundPlan[ri]` and regenerate the schedule for remaining rounds (RR) or mark for next-round pickup (ladder).

- [ ] **Step 3: Run tests + manual verification**

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(round-plan): settings view + mid-tournament plan editing"
```

---

### Task 10: Integration tests — simulation configs

**Files:**
- Modify: `index.html` — `simulationConfigs()` (~line 4870), `initFlexibleScenario` (~line 5020)

- [ ] **Step 1: Add round-plan support to `initFlexibleScenario`**

When `cfg.roundPlan` is present, set `state.roundPlan` and populate groups.

- [ ] **Step 2: Add simulation configs**

```js
    { label: "Gender RR 12/3", format: "rr", players: 12, courts: 3, rounds: 5, mixed: true, roundPlan: "gender", seed: 4301 },
    { label: "Blend RR 12/3", format: "rr", players: 12, courts: 3, rounds: 5, mixed: true, roundPlan: "blend2", seed: 4302 },
    { label: "Round Plan arc", format: "rr", players: 12, courts: 3, rounds: 5, mixed: true, roundPlan: "arc", seed: 4303 },
```

Where `"gender"` maps to all-gender rounds, `"blend2"` maps to blend with 2 mixed courts, and `"arc"` maps to `[gender, gender, mixed, mixed, blend(2)]`.

- [ ] **Step 3: Add mode-specific assertions in `runFlexibleScenario`**

After each round, verify teams match the round's mode. For gender rounds: all same-group. For blend: mixed courts mixed, gender courts same-group.

- [ ] **Step 4: Run simulation**

Run: `npm run test:simulate` — Expected: 0 failures

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "test(round-plan): integration tests for gender, blend, and arc configs"
```

---

### Task 11: Edge-case tests + regression sweep

**Files:**
- Modify: `index.html` — TESTS section

- [ ] **Step 1: Add edge-case tests**

```js
  // ---- Round Plan: edge cases ----
  (function roundPlanEdgeCaseTests() {
    // Open round inside populated plan → truly open (no mixed pairing)
    state = newState();
    state.format = "rr"; state.courtCount = 2;
    state.mixedMode = true;
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.rawGroups = ["a","b","a","b","a","b","a","b"];
    state.slots = state.rawNames.slice();
    const gmap = {}; state.rawNames.forEach((n,i) => gmap[n] = state.rawGroups[i]);
    state.slotGroups = state.slots.map(n => gmap[n] || "");
    state.roundPlan = [{mode:"mixed"}, {mode:"open"}, {mode:"gender"}];
    state.scheduleSeed = 333;
    writePlayersFromSlots(8);
    state.rounds = generateRRSchedule([1,2,3,4,5,6,7,8], 2, 3, [], mulberry32(state.scheduleSeed));
    console.assert(state.rounds.length === 3, "edge: 3 rounds generated");
    // Round 1: all mixed
    for (const g of gamesOf(state.rounds[0])) {
      for (const t of [g.team1, g.team2]) console.assert(isMixedTeam(t), "edge: r1 mixed");
    }
    // Round 3: all gender
    for (const g of gamesOf(state.rounds[2])) {
      for (const t of [g.team1, g.team2]) console.assert(!isMixedTeam(t), "edge: r3 gender", t);
    }
    state = newState();
  })();
```

- [ ] **Step 2: Run all tests**

Run: `npm run test:self && npm run test:simulate`

- [ ] **Step 3: Bump SW cache version in `sw.js`**

- [ ] **Step 4: Commit**

```bash
git add index.html sw.js
git commit -m "test(round-plan): edge cases, regression sweep, SW bump"
```

---

### Task 12: Update user-facing HTML documentation

**Files:**
- Modify: `guide.html`, `docs/how-standings-work.html`

This task documents the Round Plan feature in the user-facing guides. The guides already have basic mixed-mode documentation from the prior feature — this extends it with per-round modes and blend.

- [ ] **Step 1: Update `guide.html` setup walkthrough**

In the setup section (after the existing Mixed mode step), add:

```html
          <li><em>Optional:</em> customize the <b>Round Plan</b> to vary pairing by round — gender doubles for warmup rounds, mixed for social rounds, or <b>Blend</b> for some courts of each. Tap a quick preset or set each round individually.</li>
```

- [ ] **Step 2: Add a Round Plan tip to the flexibility section**

```html
      <div class="tip reveal" style="animation-delay:.29s"><span class="ti">🎭</span><div><b>Vary the format by round.</b> The Round Plan lets each round play differently — start with gender doubles, switch to mixed, or run a blend (some courts mixed, some gender). Perfect for a social night that wants variety.</div></div>
```

- [ ] **Step 3: Update `docs/how-standings-work.html`**

In the Round Robin card, update the mixed-mode note to mention per-round modes:

```html
      <p>Everyone plays a set number of rounds, with partners and opponents rotating so you mix with the whole group. <em>Mixed mode</em> constrains every team to 1&nbsp;man + 1&nbsp;woman — and the <em>Round Plan</em> lets you vary the pairing mode per round (Mixed, Gender, or Blend).</em></p>
```

- [ ] **Step 4: Commit**

```bash
git add guide.html docs/how-standings-work.html
git commit -m "docs: update guide + standings for round plan feature"
```

---

## Spec coverage checklist

- [x] §4 Data model → Task 1
- [x] §4.4 Explicit mode threading → Task 2
- [x] §4.8 Ladder plan edits → Task 9
- [x] §5 Setup UI → Task 7
- [x] §6.1-6.6 Scheduler (open/mixed/gender/blend/router) → Tasks 2-5
- [x] §6.7 Ladder formats → Task 5 (mode param threaded through)
- [x] §6.8 Bye allocation → Task 6
- [x] §6.9 Finals → No change needed (finals use rank-seeded, already mode-aware from prior fix)
- [x] §7 Surfaces → Task 8
- [x] §7.4 Settings view → Task 9
- [x] §8 Testing → Tasks 1-6 (unit), Task 10 (integration), Task 11 (edge)
- [x] HTML docs → Task 12
