# Mixed Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-tournament mixed-mode toggle that guarantees 1-man-plus-1-woman team pairing across Round Robin, Stack, King, and Gauntlet whenever roster math allows, with best-effort fallback on lopsided rosters.

**Architecture:** A `mixedMode` boolean flag on tournament state gates all changes. Two parallel group arrays (`rawGroups` keyed by setup row, `slotGroups` keyed by post-shuffle slot) feed a `groupOf(slot)` helper that all scheduler functions consult. Four shared helpers — `dealBalancedCourts`, `pairMixedAware`, `assignCourtsConstrained`, and a mixed-feasibility bye filter — implement the constraint across all formats. Every addition is gated on `state.mixedMode` so existing behavior is byte-identical when off.

**Tech Stack:** Vanilla JS (single `index.html`, no build step). Inline `console.assert` self-tests run via `?test` URL. Tournament simulations run via `?simulate` URL. Playwright visual tests in `tests/visual/`.

## Global Constraints

- **Single file:** All JS/CSS/HTML lives in `index.html` (14,697 lines). No build step, no bundler, no external JS dependencies.
- **Code markers:** New core helpers go between `// RUMBLE:CORE:start` (line ~4775) and `// RUMBLE:CORE:end` (line ~6007). New format/scheduler helpers go between `// RUMBLE:FORMATS:start` (line ~6008) and `// RUMBLE:FORMATS:end` (line ~7775). New tests go between `// RUMBLE:TESTS:start` (line ~1606) and `// RUMBLE:TESTS:end` (line ~4774).
- **Gating:** Every mixed-aware code path must check `state.mixedMode` and return byte-identical behavior when `false`.
- **Test commands:** `npm run test:self` (expects exactly 1 baseline failure — the keep-awake test). `npm run test:simulate` (expects 0 failures). These require a local server on port 8765: `python3 -m http.server 8765`.
- **Group storage:** Groups are `"a"`, `"b"`, or `""` (unset). Labels default to `{ a: "Men", b: "Women" }` but are user-editable. Code never hardcodes "Men"/"Women" outside `mixedGroupLabels`.
- **Spec reference:** `docs/superpowers/specs/2026-06-28-mixed-mode-design.md`

---

### Task 1: State fields, migration, and core helpers

**Files:**
- Modify: `index.html` — `newState()` (~line 4776), `backfillStateDefaults()` (~line 5136), FORMATS section (~line 6008)
- Test: `index.html` — TESTS section (~line 1606)

**Interfaces:**
- Produces: `state.mixedMode` (boolean), `state.mixedGroupLabels` ({a, b}), `state.rawGroups` (Array), `state.slotGroups` (Array), `groupOf(slot)` → `"a"|"b"|""`, `mixedModeBadTeamCount(teams)` → `0|1|2`

- [ ] **Step 1: Add state fields to `newState()`**

In `newState()` (line ~4776), after the `setupAssistant` field (line ~4838), add before the closing `};`:

```js
    mixedMode: false,                                // when true, enforce 1-A + 1-B teams
    mixedGroupLabels: { a: "Men", b: "Women" },      // editable labels for the two groups
    rawGroups: [],                                   // parallel to rawNames: "a"|"b"|"" per setup row
    slotGroups: [],                                  // parallel to slots: "a"|"b"|"" per slot (post-shuffle)
```

- [ ] **Step 2: Add backfill to `backfillStateDefaults()`**

In `backfillStateDefaults()` (line ~5136), before the final `return obj;` (line ~5258), add:

```js
  // Mixed mode backfill
  if (typeof obj.mixedMode !== "boolean") obj.mixedMode = false;
  if (!obj.mixedGroupLabels || typeof obj.mixedGroupLabels !== "object") {
    obj.mixedGroupLabels = { a: "Men", b: "Women" };
  } else {
    if (typeof obj.mixedGroupLabels.a !== "string") obj.mixedGroupLabels.a = "Men";
    if (typeof obj.mixedGroupLabels.b !== "string") obj.mixedGroupLabels.b = "Women";
  }
  if (!Array.isArray(obj.rawGroups)) obj.rawGroups = [];
  if (!Array.isArray(obj.slotGroups)) obj.slotGroups = [];
```

- [ ] **Step 3: Add `groupOf` and `mixedModeBadTeamCount` helpers**

In the FORMATS section (line ~6008, right after `// RUMBLE:FORMATS:start`), add:

```js
// === Mixed mode helpers ===
// Returns the group ("a"|"b") for a slot number (1-based), or "" if unset/mixed-off.
function groupOf(slot) {
  return (state.slotGroups || [])[slot - 1] || "";
}
// Returns the count of teams in the proposed pairing that are NOT mixed (0, 1, or 2).
// Returns 0 unconditionally when mixed mode is off (byte-identical to pre-feature behavior).
function mixedModeBadTeamCount(teams) {
  if (!state.mixedMode) return 0;
  let bad = 0;
  for (const team of teams) {
    const g0 = groupOf(team[0]), g1 = groupOf(team[1]);
    if (g0 && g1 && g0 === g1) bad++;  // both set and same group = not mixed
  }
  return bad;
}
// True if a team is mixed (one A + one B), considering unset groups as wildcards.
function isMixedTeam(team) {
  const g0 = groupOf(team[0]), g1 = groupOf(team[1]);
  return !g0 || !g1 || g0 !== g1;
}
```

- [ ] **Step 4: Write migration + helper unit tests**

In the TESTS section (line ~4460, just before `// -------- tournament simulation`), add a new test block:

```js
  // ---- Mixed mode: state + helpers ----
  (function mixedModeStateTests() {
    // Migration: legacy state without mixed fields gets defaults
    const legacy = backfillStateDefaults({ phase: "setup", format: "rr", rawNames: ["A","B"] });
    console.assert(legacy.mixedMode === false, "migration: mixedMode defaults to false");
    console.assert(legacy.mixedGroupLabels.a === "Men" && legacy.mixedGroupLabels.b === "Women",
      "migration: default group labels");
    console.assert(Array.isArray(legacy.rawGroups) && legacy.rawGroups.length === 0,
      "migration: rawGroups defaults to []");
    console.assert(Array.isArray(legacy.slotGroups) && legacy.slotGroups.length === 0,
      "migration: slotGroups defaults to []");

    // newState includes the fields
    const ns = newState();
    console.assert(ns.mixedMode === false, "newState: mixedMode is false");
    console.assert(ns.mixedGroupLabels.a === "Men", "newState: default label a");

    // groupOf returns "" when slotGroups is empty
    state = newState();
    console.assert(groupOf(1) === "", "groupOf: returns empty when no slotGroups");

    // groupOf returns the group when set; slotGroups: [a,b,a,b,"",a] → slots 1-6
    state.slotGroups = ["a", "b", "a", "b", "", "a"];
    console.assert(groupOf(1) === "a", "groupOf: slot 1 is a");
    console.assert(groupOf(2) === "b", "groupOf: slot 2 is b");
    console.assert(groupOf(5) === "", "groupOf: slot 5 unset returns empty");
    console.assert(groupOf(99) === "", "groupOf: out-of-bounds returns empty");

    // mixedModeBadTeamCount: returns 0 when mixed off (byte-identical)
    state.mixedMode = false;
    console.assert(mixedModeBadTeamCount([[1,2],[3,4]]) === 0,
      "badTeamCount: 0 when mixed off");

    // mixedModeBadTeamCount: counts same-group teams when mixed on
    state.mixedMode = true;
    // slot 1=a, 2=b, 3=a, 4=b → [1,2] is mixed, [3,4] is mixed → 0 bad
    console.assert(mixedModeBadTeamCount([[1,2],[3,4]]) === 0,
      "badTeamCount: 0 when both teams mixed");
    // slot 1=a, 3=a → [1,3] is same-group → 1 bad
    console.assert(mixedModeBadTeamCount([[1,3],[2,4]]) === 1,
      "badTeamCount: 1 when one team is [A,A]");
    // slot 5 is unset → wildcard → [1,5] not bad even though 1=a
    console.assert(mixedModeBadTeamCount([[1,5],[2,4]]) === 0,
      "badTeamCount: 0 with unset-group wildcard");

    state = newState();
  })();
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python3 -m http.server 8765` (if not already running), then `npm run test:self`
Expected: PASS with exactly 1 failure (the baseline keep-awake test)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(mixed): state fields, migration, and core helpers

Add mixedMode, mixedGroupLabels, rawGroups, slotGroups to newState()
and backfillStateDefaults(). Add groupOf(), mixedModeBadTeamCount(),
and isMixedTeam() helpers in the FORMATS section. All gated on
state.mixedMode so existing behavior is byte-identical when off."
```

---

### Task 2: `dealBalancedCourts()` helper

**Files:**
- Modify: `index.html` — FORMATS section (~line 6008)
- Test: `index.html` — TESTS section (~line 4460)

**Interfaces:**
- Consumes: `groupOf(slot)` from Task 1
- Produces: `dealBalancedCourts(playing, activeCourts, rng)` → `Array<Array<slot>>` (one array of 4 slots per court)

- [ ] **Step 1: Write the failing test**

In the TESTS section, after the mixed-mode state tests from Task 1, add:

```js
  // ---- Mixed mode: dealBalancedCourts ----
  (function dealBalancedCourtsTests() {
    const rng = mulberry32(42);

    // Balanced 4A+4B, 2 courts → each court gets 2A+2B
    state.mixedMode = true;
    state.slotGroups = ["a","a","a","a","b","b","b","b"];
    const courts = dealBalancedCourts([1,2,3,4,5,6,7,8], 2, rng);
    console.assert(courts.length === 2, "deal: 2 courts");
    console.assert(courts[0].length === 4 && courts[1].length === 4, "deal: 4 per court");
    for (const court of courts) {
      const aCount = court.filter(s => groupOf(s) === "a").length;
      const bCount = court.filter(s => groupOf(s) === "b").length;
      console.assert(aCount === 2 && bCount === 2, "deal: court is 2A+2B", { aCount, bCount });
    }

    // Lopsided 7A+3B, 2 courts → no undefined, no player dropped
    state.slotGroups = ["a","a","a","a","a","a","a","b","b","b"];
    const courts2 = dealBalancedCourts([1,2,3,4,5,6,7,8,9,10], 2, rng);
    const allSlots = courts2.flat();
    console.assert(allSlots.length === 8, "deal: 8 slots placed (2 courts × 4)");
    console.assert(!allSlots.includes(undefined), "deal: no undefined slots");
    console.assert(new Set(allSlots).size === 8, "deal: no duplicate slots");
    // No court should exceed 4
    console.assert(courts2[0].length === 4 && courts2[1].length === 4, "deal: lopsided still 4 per court");

    // Unset groups → players placed in surplus, no crash
    state.slotGroups = ["a","a","","","b","b",""," ""];
    const courts3 = dealBalancedCourts([1,2,3,4,5,6,7,8], 2, rng);
    console.assert(courts3.flat().length === 8, "deal: unset groups still placed");
    console.assert(!courts3.flat().includes(undefined), "deal: no undefined with unset groups");

    state = newState();
  })();
```

Fix the typo in the test (line with `"" ""`):

```js
  // ---- Mixed mode: dealBalancedCourts ----
  (function dealBalancedCourtsTests() {
    const rng = mulberry32(42);

    // Balanced 4A+4B, 2 courts → each court gets 2A+2B
    state.mixedMode = true;
    state.slotGroups = ["a","a","a","a","b","b","b","b"];
    const courts = dealBalancedCourts([1,2,3,4,5,6,7,8], 2, rng);
    console.assert(courts.length === 2, "deal: 2 courts");
    console.assert(courts[0].length === 4 && courts[1].length === 4, "deal: 4 per court");
    for (const court of courts) {
      const aCount = court.filter(s => groupOf(s) === "a").length;
      const bCount = court.filter(s => groupOf(s) === "b").length;
      console.assert(aCount === 2 && bCount === 2, "deal: court is 2A+2B", { aCount, bCount });
    }

    // Lopsided 7A+3B, 2 courts → no undefined, no player dropped
    state.slotGroups = ["a","a","a","a","a","a","a","b","b","b"];
    const courts2 = dealBalancedCourts([1,2,3,4,5,6,7,8,9,10], 2, rng);
    const allSlots2 = courts2.flat();
    console.assert(allSlots2.length === 8, "deal: 8 slots placed (2 courts × 4)");
    console.assert(!allSlots2.includes(undefined), "deal: no undefined slots");
    console.assert(new Set(allSlots2).size === 8, "deal: no duplicate slots");

    // Unset groups → players placed in surplus, no crash
    state.slotGroups = ["a","a","","","b","b","",""];
    const courts3 = dealBalancedCourts([1,2,3,4,5,6,7,8], 2, rng);
    console.assert(courts3.flat().length === 8, "deal: unset groups still placed");
    console.assert(!courts3.flat().includes(undefined), "deal: no undefined with unset groups");

    state = newState();
  })();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:self`
Expected: FAIL — `dealBalancedCourts is not defined`

- [ ] **Step 3: Implement `dealBalancedCourts`**

In the FORMATS section, right after the `isMixedTeam` helper from Task 1, add:

```js
// Deals players to courts prioritizing 2A+2B per court. Safely handles empty
// pools (lopsided rosters) and unset groups — never returns undefined.
//   playing:      Array of slot numbers (the active/playing set)
//   activeCourts: Number of courts to fill
//   rng:          Seeded RNG function (e.g. mulberry32(seed))
// Returns: Array of arrays, one per court, each with 4 slot numbers.
function dealBalancedCourts(playing, activeCourts, rng) {
  const shuffle = (arr) => seededShuffle(arr.slice(), rng);
  const aPool = shuffle(playing.filter(s => groupOf(s) === "a"));
  const bPool = shuffle(playing.filter(s => groupOf(s) === "b"));
  const unset = shuffle(playing.filter(s => groupOf(s) === ""));
  const courts = Array.from({ length: activeCourts }, () => []);
  // Deal 2A + 2B per court
  for (let c = 0; c < activeCourts; c++) {
    while (courts[c].length < 2 && aPool.length) courts[c].push(aPool.pop());
    while (courts[c].length < 4 && bPool.length) courts[c].push(bPool.pop());
  }
  // Fill remaining seats from surplus (leftover A, B, then unset)
  const surplus = [...aPool, ...bPool, ...unset];
  for (let c = 0; c < activeCourts && surplus.length; c++) {
    while (courts[c].length < 4 && surplus.length) courts[c].push(surplus.pop());
  }
  return courts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:self`
Expected: PASS with exactly 1 failure (baseline keep-awake)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(mixed): dealBalancedCourts helper with safe pool handling"
```

---

### Task 3: `pairMixedAware()` + `pairingCost()` helpers

**Files:**
- Modify: `index.html` — FORMATS section (~line 6008)
- Test: `index.html` — TESTS section (~line 4460)

**Interfaces:**
- Consumes: `groupOf()`, `mixedModeBadTeamCount()` from Task 1; `rrTeamSplits()` (existing, line ~7708); `rrRoundCost()` (existing, line ~7690)
- Produces: `pairMixedAware(four, opts)` → `[team1, team2]`; `pairingCost(t1, t2, opts)` → `number`

- [ ] **Step 1: Write the failing test**

After the `dealBalancedCourts` tests, add:

```js
  // ---- Mixed mode: pairMixedAware ----
  (function pairMixedAwareTests() {
    state.mixedMode = true;

    // 2A+2B court → both teams mixed
    state.slotGroups = ["a","a","b","b"];  // slots 1=a, 2=a, 3=b, 4=b
    const [t1, t2] = pairMixedAware([1,2,3,4], {});
    console.assert(isMixedTeam(t1) && isMixedTeam(t2),
      "pairMixed: 2A+2B produces two mixed teams", { t1, t2 });

    // 3A+1B court → one mixed, one same-group (unavoidable)
    state.slotGroups = ["a","a","a","b"];  // slots 1,2,3=a; 4=b
    const [t1b, t2b] = pairMixedAware([1,2,3,4], {});
    const mixedCount = [t1b, t2b].filter(isMixedTeam).length;
    console.assert(mixedCount === 1, "pairMixed: 3A+1B produces exactly 1 mixed team", { t1b, t2b });

    // Mixed off → behaves like today (any split, no preference)
    state.mixedMode = false;
    state.slotGroups = ["a","a","a","a"];
    const [t1c, t2c] = pairMixedAware([1,2,3,4], {});
    console.assert(t1c.length === 2 && t2c.length === 2,
      "pairMixed: mixed-off still returns two teams of 2");

    // Pairing cost with repeat avoidance (RR-style)
    state.mixedMode = true;
    state.slotGroups = ["a","b","a","b"];
    state.rounds = [{ round: 1, games: [{ court: 1, team1: [1,4], team2: [2,3], score1: 11, score2: 5 }], byes: [] }];
    const [t1d, t2d] = pairMixedAware([1,2,3,4], { history: state.rounds, chosen: [], court: 1 });
    // Should avoid repeating [1,4] as partners since they partnered last round
    const isRepeat = (t) => t.includes(1) && t.includes(4);
    console.assert(!isRepeat(t1d) && !isRepeat(t2d),
      "pairMixed: avoids repeating last round's partnership when mixed split allows", { t1d, t2d });

    state = newState();
  })();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:self`
Expected: FAIL — `pairMixedAware is not defined`

- [ ] **Step 3: Implement `pairingCost` and `pairMixedAware`**

In the FORMATS section, after `dealBalancedCourts`, add:

```js
// Computes the within-court pairing cost for a proposed team split.
// Lower = better. Used by pairMixedAware as the secondary sort key.
//   opts.history:  prior rounds (for repeat partner/opponent cost)
//   opts.chosen:   games already chosen this round (for intra-round cost)
//   opts.court:    court number for the game being formed
//   opts.stackBySlot: Map<slot, stackScore> (Stack format only)
//   opts.prevSameCourt: previous round's game on this court (Stack repeat check)
function pairingCost(t1, t2, opts) {
  opts = opts || {};
  // RR / King / Gauntlet: use the existing repeat-partner/opponent cost
  if (opts.stackBySlot) {
    // Stack: measure skill imbalance between teams + repeat penalty
    const s1 = (opts.stackBySlot.get(t1[0]) || 0) + (opts.stackBySlot.get(t1[1]) || 0);
    const s2 = (opts.stackBySlot.get(t2[0]) || 0) + (opts.stackBySlot.get(t2[1]) || 0);
    let cost = Math.abs(s1 - s2);
    if (opts.prevSameCourt) {
      const wasPair = (a, b) => {
        for (const t of [opts.prevSameCourt.team1, opts.prevSameCourt.team2]) {
          if (t.includes(a) && t.includes(b)) return true;
        }
        return false;
      };
      if (wasPair(t1[0], t1[1]) || wasPair(t2[0], t2[1])) cost += 1000;
    }
    return cost;
  }
  // Default: repeat cost via rrRoundCost
  const game = { court: opts.court || 1, team1: t1, team2: t2 };
  return rrRoundCost([...(opts.chosen || []), game], opts.history || []);
}

// Returns [team1, team2] — mixed-aware pairing for 4 slots on a court.
// Sorts candidate splits lexicographically: (badTeams, cost).
// When mixedMode is off, badTeams is always 0 → reduces to pure cost (byte-identical).
function pairMixedAware(four, opts) {
  const splits = rrTeamSplits(four);
  const scored = splits.map(([team1, team2]) => ({
    teams: [team1, team2],
    badTeams: mixedModeBadTeamCount([team1, team2]),
    cost: pairingCost(team1, team2, opts),
  }));
  scored.sort((a, b) => a.badTeams - b.badTeams || a.cost - b.cost);
  return scored[0].teams;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:self`
Expected: PASS with exactly 1 failure (baseline)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(mixed): pairMixedAware + pairingCost helpers

Shared within-court pairing that sorts splits lexicographically:
(badTeams, cost). Format-specific cost via opts: Stack uses
stackImbalance + repeatPenalty; RR/King/Gauntlet use rrRoundCost."
```

---

### Task 4: `allocateByes` mixed-feasibility filter

**Files:**
- Modify: `index.html` — `allocateByes()` (~line 7614), `roundShapeFor` call
- Test: `index.html` — TESTS section

**Interfaces:**
- Consumes: `groupOf()` from Task 1, `allocateByes()` (existing)
- Produces: modified `allocateByes()` that prefers mixed-feasible bye sets when `state.mixedMode` is on

- [ ] **Step 1: Write the failing test**

After the `pairMixedAware` tests, add:

```js
  // ---- Mixed mode: allocateByes feasibility filter ----
  (function allocateByesMixedTests() {
    state.mixedMode = true;
    state.slotGroups = ["a","a","a","a","a","a","b","b","b","b"];  // 6A+4B
    // 10 players, 2 courts → 8 play, 2 sit. To keep mixed-feasible (4A+4B playing),
    // byes must be 2A (not 1A+1B which would leave 5A+3B = not feasible).
    const alloc = allocateByes("rotation", {
      activeSlots: [1,2,3,4,5,6,7,8,9,10],
      players: [1,2,3,4,5,6,7,8,9,10].map(s => ({ slot: s, status: "active", eligibleFromRound: 1 })),
      rounds: [],
      round: 1,
      courtCount: 2,
      rng: mulberry32(42),
    });
    const byeGroups = alloc.byes.map(s => groupOf(s));
    const aByes = byeGroups.filter(g => g === "a").length;
    const bByes = byeGroups.filter(g => g === "b").length;
    // The key assertion: byes should NOT sit a B when that breaks feasibility
    console.assert(bByes === 0, "allocByes: 6A+4B sits 2A not 1A+1B (feasibility)", { aByes, bByes });
    // Playing set should be 4A+4B (mixed-feasible)
    const playingGroups = alloc.playing.map(s => groupOf(s));
    const aPlaying = playingGroups.filter(g => g === "a").length;
    const bPlaying = playingGroups.filter(g => g === "b").length;
    console.assert(aPlaying === 4 && bPlaying === 4, "allocByes: playing set is 4A+4B", { aPlaying, bPlaying });

    // Lopsided 7A+3B → no feasible set, falls back to rotation (no crash)
    state.slotGroups = ["a","a","a","a","a","a","a","b","b","b"];
    const alloc2 = allocateByes("rotation", {
      activeSlots: [1,2,3,4,5,6,7,8,9,10],
      players: [1,2,3,4,5,6,7,8,9,10].map(s => ({ slot: s, status: "active", eligibleFromRound: 1 })),
      rounds: [],
      round: 1,
      courtCount: 2,
      rng: mulberry32(42),
    });
    console.assert(alloc2.byes.length === 2 && alloc2.playing.length === 8,
      "allocByes: lopsided fallback still returns correct counts");

    state = newState();
  })();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:self`
Expected: FAIL — the assertion `bByes === 0` fails because current `allocateByes` has no mixed awareness.

- [ ] **Step 3: Add mixed-feasibility filter to `allocateByes`**

At the end of `allocateByes()` (line ~7667), just before `const byes = selectSorted(pool);` on the last path — actually, the cleanest approach is to wrap the return. Find the final two `return` statements in `allocateByes` (the `rotation` path at ~7633 and the `losersSitCapped` path at ~7667). 

Add a helper function before `allocateByes`:

```js
// Checks if a playing set can form all-mixed courts (2A+2B per court).
function isMixedFeasible(playing, activeCourts) {
  const aCount = playing.filter(s => groupOf(s) === "a").length;
  const bCount = playing.filter(s => groupOf(s) === "b").length;
  return aCount >= 2 * activeCourts && bCount >= 2 * activeCourts;
}
```

Then modify `allocateByes` to wrap its return values. After both return paths compute `{ byes, playing }`, add a post-filter. The simplest surgical approach: at the very end of `allocateByes`, before each `return` statement that includes byes, add the filter. 

Actually, the cleanest surgical edit: modify the two `selectSorted` call sites to try multiple bye sets. But that's complex. Instead, add a wrapper function:

In the FORMATS section, after the `isMixedFeasible` helper, add:

```js
// Wraps allocateByes with a mixed-feasibility filter. When mixedMode is on,
// tries different bye orderings to find one that leaves a mixed-feasible
// playing set. Falls back to the original result if none is feasible.
function allocateByesMixed(policy, context) {
  const result = allocateByes(policy, context);
  if (!state.mixedMode || result.byes.length === 0) return result;
  const shape = roundShapeFor((context.activeSlots || []).length, context.courtCount || 2);
  if (isMixedFeasible(result.playing, shape.activeCourts || shape.courts)) return result;
  // Try swapping each bye with a non-bye player from the over-represented group
  // to find a feasible set. This is a bounded search over bye-set variants.
  const active = (context.activeSlots || []).slice();
  const rng = context.rng || Math.random;
  let best = result;
  let bestFeasible = false;
  // Generate variants by rotating which slots sit, biased toward the surplus group
  for (let attempt = 0; attempt < 60; attempt++) {
    const shuffled = seededShuffle(active, rng);
    const variantByes = shuffled.slice(0, result.byes.length);
    const variantPlaying = active.filter(s => !variantByes.includes(s));
    if (isMixedFeasible(variantPlaying, shape.activeCourts || shape.courts)) {
      // Feasible! But also check fairness — prefer variants closer to the
      // original rotation. For simplicity, take the first feasible found.
      return { ...result, byes: variantByes, playing: variantPlaying };
    }
  }
  // No feasible variant found → return original (best-effort)
  return result;
}
```

Then, in the four scheduler functions that call `allocateByes`, replace `allocateByes(` with `allocateByesMixed(`. These call sites are:
- `generateRRSchedule` (line ~7731): `const alloc = allocateByes("rotation", {...})`
- `assignInitialLadderCourts` (line ~5961): `const alloc = allocateByes("rotation", {...})`
- `buildNextLadderRound` (line ~6161): `const alloc = allocateByes("losersSitCapped", {...})`
- `buildGauntletPairing` (line ~6324): `const alloc = allocateByes("rotation", {...})`

At each of these four call sites, change `allocateByes(` to `allocateByesMixed(`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:self`
Expected: PASS with exactly 1 failure (baseline)

- [ ] **Step 5: Run simulation to verify no regressions**

Run: `npm run test:simulate`
Expected: PASS with 0 failures

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(mixed): allocateByes mixed-feasibility filter

When mixedMode is on, bye selection prefers sets that leave a
mixed-feasible playing set (2A+2B per court). Fixes the 6A/4B
counterexample where sitting one B breaks all mixed courts.
Falls back to rotation on lopsided rosters. Zero behavior change
when mixed off."
```

---

### Task 5: RR scheduler integration

**Files:**
- Modify: `index.html` — `startTournament` RR branch (~line 6635), `bestRRSplit` (~line 7715), `generateRRSchedule` (~line 7724)
- Test: `index.html` — TESTS section

**Interfaces:**
- Consumes: `dealBalancedCourts()` (Task 2), `pairMixedAware()` (Task 3), `allocateByesMixed()` (Task 4)
- Produces: RR scheduler that generates all-mixed schedules when `state.mixedMode` is on

- [ ] **Step 1: Write the failing test**

After the `allocateByesMixed` tests, add:

```js
  // ---- Mixed mode: RR scheduler integration ----
  (function rrMixedSchedulerTests() {
    // Wh(8) regression: mixed OFF + 8 players + 2 courts still uses Wh(8)
    state = newState();
    state.format = "rr";
    state.courtCount = 2;
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.slots = state.rawNames.slice();
    state.scheduleSeed = 12345;
    startTournament();
    console.assert(state.rrScheduleMode === "wh8",
      "RR regression: mixed-off 8/2 still uses Wh(8)", state.rrScheduleMode);
    console.assert(state.phase === "playing", "RR regression: started");

    // Wh(8) bypass: mixed ON + 8 players + 2 courts uses generated schedule
    state = newState();
    state.format = "rr";
    state.courtCount = 2;
    state.mixedMode = true;
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.rawGroups = ["a","b","a","b","a","b","a","b"];  // 4A+4B
    state.slots = state.rawNames.slice();
    state.slotGroups = state.rawGroups.slice();
    state.scheduleSeed = 12345;
    writePlayersFromSlots(8);
    startTournament();
    console.assert(state.rrScheduleMode === "generated",
      "RR mixed: 8/2 uses generated (not Wh8)", state.rrScheduleMode);

    // All teams should be mixed across all rounds (4A+4B, 2 courts)
    for (const round of state.rounds) {
      for (const game of gamesOf(round)) {
        for (const team of [game.team1, game.team2]) {
          console.assert(isMixedTeam(team),
            "RR mixed: every team is mixed", { round: round.round, team });
        }
      }
    }

    // Mixed off → byte-identical schedule (same seed)
    state = newState();
    state.format = "rr";
    state.courtCount = 2;
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.slots = state.rawNames.slice();
    state.scheduleSeed = 12345;
    writePlayersFromSlots(8);
    startTournament();
    const offRounds = JSON.parse(JSON.stringify(state.rounds));
    state = newState();
    state.format = "rr";
    state.courtCount = 2;
    state.mixedMode = false;
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.slots = state.rawNames.slice();
    state.scheduleSeed = 12345;
    writePlayersFromSlots(8);
    startTournament();
    console.assert(JSON.stringify(state.rounds) === JSON.stringify(offRounds),
      "RR regression: mixed-off produces identical schedule");

    state = newState();
  })();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:self`
Expected: FAIL — the Wh(8) bypass assertion fails (mixed mode doesn't change schedule yet)

- [ ] **Step 3: Add Wh(8) bypass in `startTournament`**

In `startTournament` (~line 6635), change:

```js
    if (count === 8 && state.courtCount === 2) {
```

to:

```js
    if (count === 8 && state.courtCount === 2 && !state.mixedMode) {
```

- [ ] **Step 4: Modify `bestRRSplit` to delegate to `pairMixedAware`**

In `bestRRSplit` (~line 7715), replace the entire function body:

```js
function bestRRSplit(four, court, history, chosen) {
  if (state.mixedMode) {
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

- [ ] **Step 5: Modify `generateRRSchedule` to use `dealBalancedCourts`**

In `generateRRSchedule` (~line 7724), find the inner loop (~line 7735):

```js
      const shuffled = seededShuffle(alloc.playing, rng);
      const games = [];
      for (let c = 0; c < alloc.activeCourts; c++) {
        const four = shuffled.slice(c * 4, c * 4 + 4);
        games.push(bestRRSplit(four, c + 1, prior, games));
      }
```

Replace with:

```js
      const courts = state.mixedMode
        ? dealBalancedCourts(alloc.playing, alloc.activeCourts, rng)
        : null;
      const shuffled = courts ? null : seededShuffle(alloc.playing, rng);
      const games = [];
      for (let c = 0; c < alloc.activeCourts; c++) {
        const four = courts ? courts[c] : shuffled.slice(c * 4, c * 4 + 4);
        if (four && four.length === 4) games.push(bestRRSplit(four, c + 1, prior, games));
      }
```

- [ ] **Step 6: Populate `slotGroups` at Start time**

In `startTournament`, after the line `state.slots = shuffled;` in the RR else-branch (~line 6636), and in the stack/king/gauntlet branches, add `slotGroups` population. Find the common code after the format branches — after the `} else {` block ends (~line 6656), before `// Derive per-slot phones`, add:

```js
  // Populate slotGroups from rawGroups via name lookup (mirrors phoneByName pattern)
  if (state.mixedMode) {
    const groupByName = {};
    entries.forEach((e, i) => { if (e.name) groupByName[e.name] = (state.rawGroups || [])[i] || ""; });
    state.slotGroups = state.slots.map(name => groupByName[name] || "");
  }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test:self`
Expected: PASS with exactly 1 failure (baseline)

- [ ] **Step 8: Run simulation to verify no regressions**

Run: `npm run test:simulate`
Expected: PASS with 0 failures

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat(mixed): RR scheduler integration

- Wh(8) bypass: mixed-on 8/2 uses generated schedule
- bestRRSplit delegates to pairMixedAware when mixed on
- generateRRSchedule uses dealBalancedCourts for court assignment
- slotGroups populated at Start time via name→group lookup
- Wh(8) regression guard: mixed-off 8/2 still uses Wh(8)"
```

---

### Task 6: Ladder round-1 balanced dealing

**Files:**
- Modify: `index.html` — `assignInitialLadderCourts()` (~line 5956)
- Test: `index.html` — TESTS section

**Interfaces:**
- Consumes: `dealBalancedCourts()` (Task 2), `pairMixedAware()` (Task 3), `allocateByesMixed()` (Task 4)
- Produces: round-1 courts dealt 2A+2B when mixed on

- [ ] **Step 1: Write the failing test**

After the RR tests, add:

```js
  // ---- Mixed mode: ladder round-1 dealing ----
  (function ladderRound1MixedTests() {
    // Stack 8/2, 4A+4B → round 1 courts are 2A+2B, all teams mixed
    state = newState();
    state.format = "stack";
    state.courtCount = 2;
    state.mixedMode = true;
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.rawGroups = ["a","b","a","b","a","b","a","b"];
    state.slots = state.rawNames.slice();
    state.slotGroups = state.rawGroups.slice();
    state.scheduleSeed = 999;
    writePlayersFromSlots(8);
    startTournament();
    const r1 = state.rounds[0];
    for (const game of gamesOf(r1)) {
      for (const team of [game.team1, game.team2]) {
        console.assert(isMixedTeam(team), "Stack r1: team is mixed", { team });
      }
    }

    // King 8/2, 4A+4B → same
    state = newState();
    state.format = "king";
    state.courtCount = 2;
    state.mixedMode = true;
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.rawGroups = ["a","b","a","b","a","b","a","b"];
    state.slots = state.rawNames.slice();
    state.slotGroups = state.rawGroups.slice();
    state.scheduleSeed = 999;
    writePlayersFromSlots(8);
    startTournament();
    const r1k = state.rounds[0];
    for (const game of gamesOf(r1k)) {
      for (const team of [game.team1, game.team2]) {
        console.assert(isMixedTeam(team), "King r1: team is mixed", { team });
      }
    }

    state = newState();
  })();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:self`
Expected: FAIL — round-1 teams are not mixed because `assignInitialLadderCourts` doesn't use `dealBalancedCourts` yet.

- [ ] **Step 3: Modify `assignInitialLadderCourts` to use balanced dealing**

In `assignInitialLadderCourts` (~line 5956), replace the court-dealing section (~lines 5969-5977):

```js
  const preserveLegacyShuffle = active.length === 8 && courtCount === 2 && alloc.byes.length === 0;
  const ordered = preserveLegacyShuffle ? shuffle(alloc.playing) : seededShuffle(alloc.playing, rng);
  const games = [];
  for (let c = 0; c < alloc.activeCourts; c++) {
    const four = ordered.slice(c * 4, c * 4 + 4);
    const courtSlots = preserveLegacyShuffle ? shuffle(four) : seededShuffle(four, rng);
    games.push(makeGame(c + 1, [courtSlots[0], courtSlots[1]], [courtSlots[2], courtSlots[3]]));
  }
```

with:

```js
  const preserveLegacyShuffle = !state.mixedMode && active.length === 8 && courtCount === 2 && alloc.byes.length === 0;
  const games = [];
  if (state.mixedMode) {
    const courts = dealBalancedCourts(alloc.playing, alloc.activeCourts, rng);
    for (let c = 0; c < alloc.activeCourts; c++) {
      const [t1, t2] = pairMixedAware(courts[c], {});
      games.push(makeGame(c + 1, t1, t2));
    }
  } else {
    const ordered = preserveLegacyShuffle ? shuffle(alloc.playing) : seededShuffle(alloc.playing, rng);
    for (let c = 0; c < alloc.activeCourts; c++) {
      const four = ordered.slice(c * 4, c * 4 + 4);
      const courtSlots = preserveLegacyShuffle ? shuffle(four) : seededShuffle(four, rng);
      games.push(makeGame(c + 1, [courtSlots[0], courtSlots[1]], [courtSlots[2], courtSlots[3]]));
    }
  }
```

- [ ] **Step 4: Populate `slotGroups` in the ladder Start branches**

In `startTournament`, in the stack/king/gauntlet branches (~lines 6602-6634), each has `state.slots = shuffled;`. After each, the common `slotGroups` population from Task 5 Step 6 should already handle this since it runs after all branches. Verify the slotGroups code from Task 5 runs for all formats.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:self`
Expected: PASS with exactly 1 failure (baseline)

- [ ] **Step 6: Run simulation to verify no regressions**

Run: `npm run test:simulate`
Expected: PASS with 0 failures

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(mixed): ladder round-1 balanced dealing

assignInitialLadderCourts uses dealBalancedCourts + pairMixedAware
when mixed on. preserveLegacyShuffle gated off when mixed. All
ladder formats (Stack, King, Gauntlet) get 2A+2B round-1 courts."
```

---

### Task 7: `assignCourtsConstrained()` — the ladder optimizer

**Files:**
- Modify: `index.html` — FORMATS section (~line 6008)
- Test: `index.html` — TESTS section

**Interfaces:**
- Consumes: `groupOf()`, `mixedModeBadTeamCount()` (Task 1), `allocateByesMixed()` (Task 4)
- Produces: `assignCourtsConstrained(playing, naturalCourt, activeCourts, history, rng)` → `{ courts: Array<Array<slot>>, badTeams: number }`

This is the core algorithm that replaces the rejected two-pass repair. It assigns players to courts via multi-restart search, optimizing lexicographically: (1) minimize badTeams, (2) minimize total court deviation, (3) minimize repeat cost.

- [ ] **Step 1: Write the failing test**

After the ladder round-1 tests, add:

```js
  // ---- Mixed mode: assignCourtsConstrained ----
  (function assignCourtsConstrainedTests() {
    state.mixedMode = true;

    // 4A+4B, 2 courts, natural courts from perfect movement → finds 0-badTeam assignment
    state.slotGroups = ["a","b","a","b","a","b","a","b"];  // 4A+4B
    const result = assignCourtsConstrained(
      [1,2,3,4,5,6,7,8],
      { 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 2 },  // naturalCourt per slot
      2, [], mulberry32(42)
    );
    console.assert(result.badTeams === 0, "constrained: 4A+4B finds 0 badTeams", result);
    for (const court of result.courts) {
      const aCount = court.filter(s => groupOf(s) === "a").length;
      const bCount = court.filter(s => groupOf(s) === "b").length;
      console.assert(aCount === 2 && bCount === 2, "constrained: court is 2A+2B", { aCount, bCount });
    }

    // 5A+3B → no fully-mixed assignment exists → best-effort (badTeams > 0 but minimized)
    state.slotGroups = ["a","a","a","a","a","b","b","b"];
    const result2 = assignCourtsConstrained(
      [1,2,3,4,5,6,7,8],
      { 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 2 },
      2, [], mulberry32(42)
    );
    console.assert(result2.badTeams <= 2, "constrained: 5A+3B minimizes badTeams", result2);
    console.assert(result2.courts.length === 2, "constrained: returns 2 courts");

    // No crash with unset groups
    state.slotGroups = ["a","","b","","a","","b",""];
    const result3 = assignCourtsConstrained(
      [1,2,3,4,5,6,7,8],
      { 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 2 },
      2, [], mulberry32(42)
    );
    console.assert(result3.courts.length === 2 && result3.courts[0].length === 4,
      "constrained: unset groups no crash");

    state = newState();
  })();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:self`
Expected: FAIL — `assignCourtsConstrained is not defined`

- [ ] **Step 3: Implement `assignCourtsConstrained`**

In the FORMATS section, after `pairMixedAware`, add:

```js
// Assigns players to courts via multi-restart search. Optimizes lexicographically:
//   (1) totalBadTeams — number of same-gender teams forced across all courts
//   (2) totalDeviation — sum of |assignedCourt - naturalCourt| per player
//   (3) repeatCost — rrRoundCost for the proposed games
// Returns { courts: Array<Array<slot>>, badTeams: number }.
function assignCourtsConstrained(playing, naturalCourt, activeCourts, history, rng) {
  if (!state.mixedMode || playing.length < activeCourts * 4) {
    // Fallback: simple slice (mixed off, or not enough players for full courts)
    const shuffled = seededShuffle(playing, rng);
    const courts = [];
    for (let c = 0; c < activeCourts; c++) courts.push(shuffled.slice(c * 4, c * 4 + 4));
    return { courts, badTeams: 0 };
  }
  let best = null;
  let bestKey = [Infinity, Infinity, Infinity];
  const restarts = 80;
  for (let attempt = 0; attempt < restarts; attempt++) {
    const shuffled = seededShuffle(playing, rng);
    const courts = [];
    for (let c = 0; c < activeCourts; c++) courts.push(shuffled.slice(c * 4, c * 4 + 4));
    // Score the assignment
    let badTeams = 0, deviation = 0;
    const games = [];
    for (let c = 0; c < activeCourts; c++) {
      const four = courts[c];
      if (four.length !== 4) continue;
      const [t1, t2] = pairMixedAware(four, { court: c + 1, history, chosen: games });
      games.push({ court: c + 1, team1: t1, team2: t2 });
      badTeams += mixedModeBadTeamCount([t1, t2]);
      for (const s of four) deviation += Math.abs((c + 1) - (naturalCourt[s] || (c + 1)));
    }
    const repeatCost = rrRoundCost(games, history);
    const key = [badTeams, deviation, repeatCost];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
        (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])) {
      best = courts; bestKey = key;
    }
    if (badTeams === 0) break;  // found a perfect assignment, stop early
  }
  return { courts: best, badTeams: bestKey[0] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:self`
Expected: PASS with exactly 1 failure (baseline)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(mixed): assignCourtsConstrained — lexicographic court optimizer

Multi-restart search that assigns players to courts optimizing:
(1) minimize same-gender teams, (2) minimize court deviation from
natural movement, (3) minimize repeat partner/opponent cost.
Replaces the rejected two-pass repair approach."
```

---

### Task 8: Per-format ladder integration (rounds 2+)

**Files:**
- Modify: `index.html` — `buildNextLadderRound` (~line 6153), `buildGauntletPairing` (~line 6319), `pairForStackCourt` (~line 6123)
- Test: `index.html` — TESTS section

**Interfaces:**
- Consumes: `assignCourtsConstrained()` (Task 7), `pairMixedAware()` (Task 3), `allocateByesMixed()` (Task 4)

- [ ] **Step 1: Write the failing test**

After the `assignCourtsConstrained` tests, add:

```js
  // ---- Mixed mode: ladder rounds 2+ ----
  (function ladderRounds2PlusTests() {
    // Stack 8/2, 4A+4B: build round 2 from round 1, all teams mixed
    state = newState();
    state.format = "stack";
    state.courtCount = 2;
    state.mixedMode = true;
    state.stackRounds = 6;
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.rawGroups = ["a","b","a","b","a","b","a","b"];
    state.slots = state.rawNames.slice();
    state.slotGroups = state.rawGroups.slice();
    state.scheduleSeed = 777;
    state.tiebreakRandom = [0,1,2,3,4,5,6,7];
    writePlayersFromSlots(8);
    state.rounds = [assignInitialStackCourts()];
    state.phase = "playing";
    // Complete round 1 with decisive scores
    for (const g of gamesOf(state.rounds[0])) { g.score1 = 11; g.score2 = 7; }
    // Build round 2
    const r2 = buildNextStackRound(state.rounds[0]);
    for (const game of gamesOf(r2)) {
      for (const team of [game.team1, game.team2]) {
        console.assert(isMixedTeam(team), "Stack r2: team is mixed", { team });
      }
    }

    // Gauntlet 8/2, 4A+4B: build round 2, all teams mixed
    state = newState();
    state.format = "gauntlet";
    state.courtCount = 2;
    state.mixedMode = true;
    state.gauntletRounds = 6;
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.rawGroups = ["a","b","a","b","a","b","a","b"];
    state.slots = state.rawNames.slice();
    state.slotGroups = state.rawGroups.slice();
    state.scheduleSeed = 777;
    state.tiebreakRandom = [0,1,2,3,4,5,6,7];
    writePlayersFromSlots(8);
    state.rounds = [assignInitialGauntletCourts()];
    state.phase = "playing";
    for (const g of gamesOf(state.rounds[0])) { g.score1 = 11; g.score2 = 7; }
    const r2g = buildNextGauntletRound(state.rounds[0]);
    for (const game of gamesOf(r2g)) {
      for (const team of [game.team1, game.team2]) {
        console.assert(isMixedTeam(team), "Gauntlet r2: team is mixed", { team });
      }
    }

    state = newState();
  })();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:self`
Expected: FAIL — round-2 teams are not mixed because ladder building functions don't use the constrained assignment yet.

- [ ] **Step 3: Modify `buildNextLadderRound` to use constrained assignment**

In `buildNextLadderRound` (~line 6153), find the section after movement + seat filling that builds games (~lines 6217-6231). Replace the game-building loop:

```js
  const games = [];
  const stackStats = format === "stack" ? computeStackStats(prevRound.round) : null;
  const stackBySlot = stackStats ? new Map(stackStats.map(s => [s.slot, s.stackScore])) : null;
  for (let court = 1; court <= alloc.activeCourts; court++) {
    const slots = seats[court - 1];
    if (slots.length !== 4) continue;
    if (format === "stack") {
      const [team1, team2] = pairForStackCourt(slots, gameForCourt(prevRound, court), stackBySlot);
      games.push(makeGame(court, team1, team2));
    } else {
      const s = shuffle(slots);
      games.push(makeGame(court, [s[0], s[1]], [s[2], s[3]]));
    }
  }
```

with a mixed-aware version:

```js
  const games = [];
  const stackStats = format === "stack" ? computeStackStats(prevRound.round) : null;
  const stackBySlot = stackStats ? new Map(stackStats.map(s => [s.slot, s.stackScore])) : null;
  if (state.mixedMode) {
    // Mixed mode: use constrained assignment instead of movement-based seats
    const naturalCourt = {};
    const movers = new Map();  // slot → target court from movement
    for (const g of gamesOf(prevRound)) {
      const t1Won = g.score1 > g.score2;
      const winners = t1Won ? g.team1 : g.team2;
      const losers = t1Won ? g.team2 : g.team1;
      const court = g.court || 1;
      winners.forEach(s => movers.set(s, clampCourt(court - 1, alloc.activeCourts)));
      losers.forEach(s => movers.set(s, clampCourt(court + 1, alloc.activeCourts)));
    }
    alloc.playing.forEach(s => { if (!movers.has(s)) movers.set(s, Math.floor((alloc.activeCourts + 1) / 2)); });
    alloc.playing.forEach(s => { naturalCourt[s] = movers.get(s); });
    const result = assignCourtsConstrained(alloc.playing, naturalCourt, alloc.activeCourts, history, rng);
    for (let c = 0; c < result.courts.length; c++) {
      const four = result.courts[c];
      if (four.length !== 4) continue;
      const opts = format === "stack"
        ? { stackBySlot, prevSameCourt: gameForCourt(prevRound, c + 1) }
        : { history, chosen: games, court: c + 1 };
      const [t1, t2] = pairMixedAware(four, opts);
      games.push(makeGame(c + 1, t1, t2));
    }
  } else {
    for (let court = 1; court <= alloc.activeCourts; court++) {
      const slots = seats[court - 1];
      if (slots.length !== 4) continue;
      if (format === "stack") {
        const [team1, team2] = pairForStackCourt(slots, gameForCourt(prevRound, court), stackBySlot);
        games.push(makeGame(court, team1, team2));
      } else {
        const s = shuffle(slots);
        games.push(makeGame(court, [s[0], s[1]], [s[2], s[3]]));
      }
    }
  }
```

- [ ] **Step 4: Modify `buildGauntletPairing` to use constrained assignment**

In `buildGauntletPairing` (~line 6319), find the game-building loop (~lines 6333-6338):

```js
  const playing = rankedActive.filter(slot => !alloc.byes.includes(slot));
  const games = [];
  for (let c = 0; c < alloc.activeCourts; c++) {
    const block = playing.slice(c * 4, c * 4 + 4);
    if (block.length === 4) games.push(makeGame(c + 1, [block[0], block[3]], [block[1], block[2]]));
  }
```

Replace with:

```js
  const playing = rankedActive.filter(slot => !alloc.byes.includes(slot));
  const games = [];
  if (state.mixedMode) {
    const naturalCourt = {};
    playing.forEach((s, i) => { naturalCourt[s] = Math.floor(i / 4) + 1; });
    const result = assignCourtsConstrained(playing, naturalCourt, alloc.activeCourts,
      ladderHistoryThrough(roundNum - 1), rng);
    for (let c = 0; c < result.courts.length; c++) {
      const four = result.courts[c];
      if (four.length !== 4) continue;
      const [t1, t2] = pairMixedAware(four, { history: ladderHistoryThrough(roundNum - 1), chosen: games, court: c + 1 });
      games.push(makeGame(c + 1, t1, t2));
    }
  } else {
    for (let c = 0; c < alloc.activeCourts; c++) {
      const block = playing.slice(c * 4, c * 4 + 4);
      if (block.length === 4) games.push(makeGame(c + 1, [block[0], block[3]], [block[1], block[2]]));
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:self`
Expected: PASS with exactly 1 failure (baseline)

- [ ] **Step 6: Run simulation to verify no regressions**

Run: `npm run test:simulate`
Expected: PASS with 0 failures

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(mixed): ladder rounds 2+ constrained assignment

buildNextLadderRound and buildGauntletPairing use
assignCourtsConstrained when mixed on: computes natural court
from movement, then optimizes for mixed teams with minimal
deviation. Stack uses stackBySlot-aware pairingCost."
```

---

### Task 9: Mid-event join group capture

**Files:**
- Modify: `index.html` — `addMidEventPlayer` function (search for it)
- Test: `index.html` — TESTS section

**Interfaces:**
- Consumes: `state.rawGroups`, `state.slotGroups` from Task 1

- [ ] **Step 1: Find `addMidEventPlayer`**

Search: `grep -n "function addMidEventPlayer\|addMidEventPlayer" index.html`

- [ ] **Step 2: Write the failing test**

After the ladder rounds 2+ tests, add:

```js
  // ---- Mixed mode: mid-event join ----
  (function midEventJoinTests() {
    state = newState();
    state.format = "rr";
    state.courtCount = 2;
    state.mixedMode = true;
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.rawGroups = ["a","b","a","b","a","b","a","b"];
    state.slots = state.rawNames.slice();
    state.slotGroups = state.rawGroups.slice();
    state.scheduleSeed = 333;
    writePlayersFromSlots(8);
    startTournament();
    // Add a 9th player (group "a")
    const result = addMidEventPlayer("Player 9", "", "a");
    console.assert(result.ok, "join: player 9 added", result);
    // slotGroups should include the new player's group
    const newSlot = state.slots.findIndex(s => s === "Player 9") + 1;
    console.assert(groupOf(newSlot) === "a", "join: new player has group a", { newSlot, group: groupOf(newSlot) });

    state = newState();
  })();
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:self`
Expected: FAIL — `addMidEventPlayer` doesn't accept a group parameter yet.

- [ ] **Step 4: Add group parameter to `addMidEventPlayer`**

Find `addMidEventPlayer` and add a third parameter `group` (defaulting to `""`). At the point where the function assigns the new player to a slot, also set `state.rawGroups.push(group || "")` and update `state.slotGroups` for the new slot. The exact edit depends on the function's current structure — read it first, then add `group` capture parallel to how `rawNames`/`rawPhones` are extended.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:self`
Expected: PASS with exactly 1 failure (baseline)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(mixed): mid-event join captures group

addMidEventPlayer accepts a group parameter, stores it in both
rawGroups and slotGroups so the regenerated schedule reads it."
```

---

### Task 10: Setup UI — mixed toggle + per-player group control

**Files:**
- Modify: `index.html` — `renderRulesBlock()` (search for it), `renderSetup()` (~line 10377)
- Test: `index.html` — TESTS section (manual verification + visual test in Task 13)

**Interfaces:**
- Consumes: `state.mixedMode`, `state.mixedGroupLabels`, `state.rawGroups`

This task adds the UI controls. No scheduler changes — purely the setup screen.

- [ ] **Step 1: Add the mixed-mode toggle to `renderRulesBlock`**

Find `renderRulesBlock` and add a toggle row (styled like existing rule rows). The toggle sets `state.mixedMode` and calls `save()` + `render()`:

```js
  // Mixed mode toggle (hidden for Crown)
  if (state.format !== "crown") {
    rulesWrap.appendChild(el("label", { class: "rule-row", style: "display:flex;align-items:center;gap:8px;" },
      el("span", { style: "flex:1;" }, "Mixed mode (pair 1 + 1)"),
      el("button", {
        class: state.mixedMode ? "primary" : "",
        style: "min-height:40px;padding:8px 16px;font-size:16px;",
        onclick: () => {
          state.mixedMode = !state.mixedMode;
          save();
          render();
        },
      }, state.mixedMode ? "ON" : "OFF")
    ));
  }
```

- [ ] **Step 2: Add per-player group toggle to `renderSetup`**

In `renderSetup` (~line 10373), inside the roster row loop, after the `phoneInput` is appended and when `state.mixedMode` is true, add a group toggle:

```js
      if (state.mixedMode) {
        const groupBtn = (groupVal, label) => {
          const isSet = (state.rawGroups[i] || "") === groupVal;
          return el("button", {
            class: isSet ? "primary" : "",
            style: "min-height:40px;min-width:40px;padding:4px 8px;font-size:14px;",
            "aria-label": "Set group " + label + " for player " + (i + 1),
            onclick: () => {
              state.rawGroups[i] = isSet ? "" : groupVal;
              save();
              render();
            },
          }, label);
        };
        const labels = mixedToggleLabels();
        const groupWrap = el("div", { style: "display:flex;gap:4px;" },
          groupBtn("a", labels.a),
          groupBtn("b", labels.b)
        );
        groupWrap.style.cssText = "flex:0.6;display:flex;gap:4px;";
        row.appendChild(groupWrap);
      }
```

- [ ] **Step 3: Add the `mixedToggleLabels` helper**

In the CORE section, add:

```js
function mixedToggleLabels() {
  const a = (state.mixedGroupLabels || {}).a || "A";
  const b = (state.mixedGroupLabels || {}).b || "B";
  const aChar = a.charAt(0).toUpperCase();
  const bChar = b.charAt(0).toUpperCase();
  if (aChar !== bChar) return { a: aChar, b: bChar };
  // Collision — try truncated full label
  const aTrunc = a.substring(0, 4);
  const bTrunc = b.substring(0, 4);
  if (aTrunc !== bTrunc) return { a: aTrunc, b: bTrunc };
  // Still collides — numeric fallback
  return { a: "1", b: "2" };
}
```

- [ ] **Step 4: Add setup warning when groups incomplete or roster lopsided**

In `renderSetup`, after the player list and before the Start button, add:

```js
  if (state.mixedMode) {
    const groups = (state.rawGroups || []).slice(0, playerCount);
    const aCount = groups.filter(g => g === "a").length;
    const bCount = groups.filter(g => g === "b").length;
    const unsetCount = groups.filter(g => !g).length;
    const activeCourts = effectiveCourtCountForFormat(state.format, state.courtCount);
    if (unsetCount > 0) {
      card.appendChild(el("p", { class: "muted", style: "color:var(--accent);margin:8px 0;" },
        "Set a group for all players, or mixed pairing may be uneven."));
    } else if (Math.min(aCount, bCount) < activeCourts * 2) {
      const labels = state.mixedGroupLabels || { a: "Men", b: "Women" };
      card.appendChild(el("p", { class: "muted", style: "color:var(--accent);margin:8px 0;" },
        aCount + " " + labels.a + " / " + bCount + " " + labels.b +
        ": some same-gender teams needed. Up to " + (activeCourts * 4) + " players may play per round."));
    }
  }
```

- [ ] **Step 5: Manual verification**

Start the server: `python3 -m http.server 8765`
Open `http://localhost:8765/` in a browser.
- Confirm the Mixed mode toggle appears in the rules block (not on Crown).
- Toggle it ON — confirm per-player M/W toggles appear.
- Tap M on a few players — confirm the toggle highlights and persists on re-render.
- Add/remove players — confirm `rawGroups` stays parallel to `rawNames`.

- [ ] **Step 6: Run self-tests to verify no regressions**

Run: `npm run test:self`
Expected: PASS with exactly 1 failure (baseline)

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(mixed): setup UI — toggle, per-player group control, warning

- Mixed mode toggle in rules block (hidden for Crown)
- Per-player M/W toggle with collision-safe labels
- Setup warning for incomplete groups or lopsided rosters
- mixedToggleLabels helper: first-char → truncated → numeric fallback"
```

---

### Task 11: Surfaces — mixed badge, bye banner tally, recap

**Files:**
- Modify: `index.html` — court rendering (search for `teamName`), bye banner rendering (~line 218 CSS), recap function (~line 7310)
- Test: `index.html` — TESTS section

**Interfaces:**
- Consumes: `state.mixedMode`, `groupOf()`, `isMixedTeam()` from Task 1, `state.mixedGroupLabels`

- [ ] **Step 1: Add CSS for mixed badge and same-gender indicator**

In the `<style>` section, after the `.partner-chip` rules (~line 936), add:

```css
  .mixed-badge {
    display: inline-block;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 999px;
    margin-left: 6px;
    color: var(--good);
    background: rgba(16, 185, 129, 0.15);
  }
  .same-group-team {
    border: 1px dashed var(--muted);
    border-radius: 8px;
    padding: 2px 4px;
  }
  .bye-group-tally {
    font-size: 14px;
    color: var(--muted);
    margin-top: 4px;
  }
```

- [ ] **Step 2: Add mixed badge to team rendering**

Find where `teamName()` is called to render court cards. After each team name, when `state.mixedMode` is on, append a badge:

```js
function mixedBadgeForTeam(team) {
  if (!state.mixedMode) return "";
  if (isMixedTeam(team)) {
    const labels = mixedToggleLabels();
    const g0 = groupOf(team[0]), g1 = groupOf(team[1]);
    if (g0 && g1) return " " + (g0 === "a" ? labels.a : labels.b) + "·" + (g1 === "a" ? labels.a : labels.b);
    return " ✓";  // mixed with a wildcard
  }
  return "";  // same-group team — indicator added by caller
}
```

Integrate this at the call sites where team names are displayed on court cards. Add the `same-group-team` class wrapper when `!isMixedTeam(team)`.

- [ ] **Step 3: Add group tally to bye banner**

Find the bye banner rendering (search for `bye-banner` or `byesOf`). After the bye names, append:

```js
  if (state.mixedMode) {
    const byes = byesOf(round);
    const labels = state.mixedGroupLabels || { a: "Men", b: "Women" };
    const aByes = byes.filter(s => groupOf(s) === "a").length;
    const bByes = byes.filter(s => groupOf(s) === "b").length;
    banner.appendChild(el("div", { class: "bye-group-tally" },
      aByes + " " + labels.a + " · " + bByes + " " + labels.b));
  }
```

- [ ] **Step 4: Add same-gender note to recap**

In the recap function (~line 7310), when generating a player's recap and they played on a same-gender team, add a line. Find the game-by-game loop in the recap and add:

```js
  if (state.mixedMode && !isMixedTeam(team)) {
    recapLines.push("You teamed with " + nameOf(partner) + " (same group — not enough of the other group to pair everyone).");
  }
```

- [ ] **Step 5: Run self-tests**

Run: `npm run test:self`
Expected: PASS with exactly 1 failure (baseline)

- [ ] **Step 6: Manual verification**

Open browser, start a mixed tournament, verify badges appear on teams and the bye banner shows a group tally.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(mixed): surfaces — badge, bye tally, recap note

- Mixed badge next to team names on court cards
- Dashed outline for same-gender fallback teams
- Group tally appended to bye banner
- Recap explains same-gender team when best-effort fallback"
```

---

### Task 12: Integration tests — mixed tournament simulations

**Files:**
- Modify: `index.html` — `simulationConfigs()` (~line 4468), `initFlexibleScenario` (~line 4600)
- Test: `index.html` — TESTS section

**Interfaces:**
- Consumes: all scheduler tasks (1-8)

- [ ] **Step 1: Extend `initFlexibleScenario` to support mixed mode**

In `initFlexibleScenario` (~line 4600), after setting up `state.rawNames`, add group setup when `cfg.mixed` is true:

```js
    if (cfg.mixed) {
      state.mixedMode = true;
      // Alternate groups: odd-indexed = "a", even-indexed = "b"
      state.rawGroups = state.rawNames.map((_, i) => i % 2 === 0 ? "a" : "b");
      state.slotGroups = state.slots.map(name => {
        const idx = state.rawNames.indexOf(name);
        return idx >= 0 ? state.rawGroups[idx] : "";
      });
    }
```

- [ ] **Step 2: Add mixed simulation configs**

In `simulationConfigs()` (~line 4468), add to the returned array:

```js
    { label: "Mixed RR 10/2", format: "rr", players: 10, courts: 2, rounds: 5, mixed: true, seed: 4201 },
    { label: "Mixed Stack 8/2", format: "stack", players: 8, courts: 2, rounds: 6, mixed: true, seed: 4202 },
    { label: "Mixed King 8/2", format: "king", players: 8, courts: 2, rounds: 6, mixed: true, seed: 4203 },
    { label: "Mixed Gauntlet 8/2", format: "gauntlet", players: 8, courts: 2, rounds: 6, mixed: true, seed: 4204 },
```

- [ ] **Step 3: Add mixed assertions to `runFlexibleScenario`**

In `runFlexibleScenario` (~line 4645), after `initFlexibleScenario`, add a check that runs after each round:

```js
    if (cfg.mixed) {
      const round = state.rounds[state.currentRound - 1];
      for (const game of gamesOf(round)) {
        for (const team of [game.team1, game.team2]) {
          console.assert(isMixedTeam(team),
            cfg.label + " round " + state.currentRound + ": team is mixed", team);
        }
      }
    }
```

- [ ] **Step 4: Run simulation to verify mixed tournaments pass**

Run: `npm run test:simulate`
Expected: PASS with 0 failures (all mixed tournaments have all-mixed teams for the balanced rosters)

- [ ] **Step 5: Run self-tests**

Run: `npm run test:self`
Expected: PASS with exactly 1 failure (baseline)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "test(mixed): integration tests for mixed tournaments

Add simulation configs for Mixed RR 10/2, Stack 8/2, King 8/2,
Gauntlet 8/2. All use balanced 50/50 rosters and assert every
team in every round is mixed. initFlexibleScenario gains mixed
group setup."
```

---

### Task 13: Visual test — setup with mixed on

**Files:**
- Modify: `tests/visual/rumble.visual.spec.mjs`
- Test: Playwright visual test

- [ ] **Step 1: Read the existing visual test file**

Read `tests/visual/rumble.visual.spec.mjs` to understand the pattern (how it navigates, sets state, takes screenshots).

- [ ] **Step 2: Add a visual test for the mixed setup screen**

Add a test that:
1. Navigates to the app
2. Enables mixed mode via state injection (localStorage) or UI interaction
3. Sets up a roster with some players and groups
4. Takes a screenshot of the setup screen with mixed controls visible

Follow the existing test's pattern for state setup and screenshot comparison.

- [ ] **Step 3: Run the visual test**

Run: `npm run test:visual`
Expected: PASS (or generate baseline with `npm run test:visual:update` on first run)

- [ ] **Step 4: Commit**

```bash
git add tests/visual/rumble.visual.spec.mjs
git commit -m "test(mixed): visual snapshot of setup with mixed on"
```

---

### Task 14: Final regression sweep + edge-case tests

**Files:**
- Modify: `index.html` — TESTS section

- [ ] **Step 1: Add edge-case tests**

After the mixed integration tests, add:

```js
  // ---- Mixed mode: edge cases ----
  (function mixedEdgeCaseTests() {
    // All players unset group → no crash, schedule generates normally
    state = newState();
    state.format = "rr";
    state.courtCount = 2;
    state.mixedMode = true;
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.rawGroups = ["","","","","","","",""];
    state.slots = state.rawNames.slice();
    state.slotGroups = state.rawGroups.slice();
    state.scheduleSeed = 111;
    writePlayersFromSlots(8);
    startTournament();
    console.assert(state.rounds.length > 0, "edge: unset groups generates schedule");

    // 7A+3B lopsided → schedule generates, mixed maximized, no crash
    state = newState();
    state.format = "rr";
    state.courtCount = 2;
    state.mixedMode = true;
    state.rawNames = ["A","B","C","D","E","F","G","H","I","J"];
    state.rawGroups = ["a","a","a","a","a","a","a","b","b","b"];
    state.slots = state.rawNames.slice();
    state.slotGroups = state.rawGroups.slice();
    state.scheduleSeed = 222;
    writePlayersFromSlots(10);
    startTournament();
    console.assert(state.rounds.length > 0, "edge: lopsided 7A+3B generates schedule");

    // Mixed off → identical to pre-feature (regression golden)
    state = newState();
    state.format = "rr";
    state.courtCount = 2;
    state.rawNames = ["A","B","C","D","E","F","G","H"];
    state.slots = state.rawNames.slice();
    state.scheduleSeed = 12345;
    writePlayersFromSlots(8);
    startTournament();
    console.assert(state.rrScheduleMode === "wh8", "edge: mixed-off 8/2 uses Wh(8)");

    state = newState();
  })();
```

- [ ] **Step 2: Run all tests**

Run: `npm run test:self && npm run test:simulate`
Expected: 1 failure (baseline) for self-tests, 0 for simulation.

- [ ] **Step 3: Bump the service worker cache version**

In `sw.js`, find the `CACHE_PREFIX` or version string and bump it (e.g., `v37` → `v38`) so PWA clients pick up the new `index.html`.

- [ ] **Step 4: Commit**

```bash
git add index.html sw.js
git commit -m "test(mixed): edge-case tests + SW cache bump

- Unset groups: schedule generates without crash
- Lopsided 7A+3B: schedule generates, mixed maximized
- Mixed-off regression: Wh(8) still used for 8/2
- SW cache version bumped for PWA update"
```

---

## Spec coverage checklist

- [x] §4 Data model → Task 1
- [x] §4.5 Group population at Start → Task 5 (Step 6)
- [x] §4.6 Mid-tournament joins → Task 9
- [x] §5.1 Mixed toggle → Task 10
- [x] §5.2 Per-player group control → Task 10
- [x] §5.3 Start-button warning → Task 10
- [x] §6.1 Wh(8) bypass → Task 5
- [x] §6.2 bestRRSplit → Task 5
- [x] §6.3 dealBalancedCourts → Task 2
- [x] §6.4 allocateByes filter → Task 4
- [x] §7.1 Ladder round-1 → Task 6
- [x] §7.2 assignCourtsConstrained → Task 7
- [x] §7.3 pairMixedAware → Task 3
- [x] §7.4-7.5 Per-format integration → Task 8
- [x] §8.1 Mixed badge → Task 11
- [x] §8.2 Bye banner tally → Task 11
- [x] §8.3 Recap/Why → Task 11
- [x] §10 Testing → Tasks 1-9 (unit), Task 12 (integration), Task 13 (visual), Task 14 (edge)
