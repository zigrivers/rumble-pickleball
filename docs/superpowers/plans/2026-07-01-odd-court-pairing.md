# Odd-Court Pairing for Same-Gender RR Rounds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Round-Robin game manager choose, per same-gender round, how the odd court pairs (mixed `[A,B] vs [A,B]` by default, or same-group `[A,A] vs [B,B]`), and guarantee every player gets a same-gender (pure-court) game by deterministically staffing the odd court with the players who least need one.

**Architecture:** All work is in `index.html` (the single-file vanilla-JS PWA), plus `sw.js` and the two `version*.json` files for the cache bump. No build step. New state field `rrOddCourtModes` (per-round `"mixed"`|`"samegroup"`). Three pure helpers (`groupSet`, `isOddCourt`, `isMixedCapable`), one deterministic staffing function (`staffOddCourtForCoverage`), one mode lookup (`rrOddCourtModeForRound`), plus surgical wiring in the RR scheduler and the setup/court-card render code. Fairness is a deterministic preprocessing pass (not a cost-key tweak), so it is seed-independent and never sacrifices pairing quality.

**Tech Stack:** Vanilla JS, inline self-tests (`?test` harness, `?simulate` full-tournament runs). No test runner config.

## Global Constraints

- Single-file app: `index.html` is the entire app (HTML + CSS + JS inline). Do NOT report CI/build/lockfile concerns — none exist.
- Version/cache: every layout or functional change bumps `APP_VERSION` (index.html:2653), `VERSION` (sw.js:6), and prepends a `v59` entry to BOTH `version.json` and `version-metadata.json` (per AGENTS.md §7). Current value everywhere is `v58`.
- Mixed-mode vocabulary: group `"a"` is labeled Men (or first group), `"b"` Women (or second). `groupOf(slot)` returns `"a"`, `"b"`, or `""` (unset). `isMixedTeam(team)` = one-of-each (treating unset as wildcard).
- Baseline tests: `?test` must end with exactly 1 known keep-awake failure; `?simulate` must be 0 failures. Run both after the final task.
- DRY/YAGNI: reuse existing helpers (`bestRRSplit`, `bestSameGenderSplit`, `dealSingleGenderCourts`, `groupOf`, `isMixedTeam`, `gamesOf`, `rrPairingModeForRound`). Do not introduce new pairing math.

---

### Task 1: Migration — add `rrOddCourtModes` state field

**Files:**
- Modify: `index.html:7166-7169` (the `backfillStateDefaults` MLP backfill block)
- Test: `index.html` inside `mlpPairingTests` IIFE (~line 6200, the migration asserts at the top)

**Interfaces:**
- Produces: `state.rrOddCourtModes` — `Array<"mixed"|"samegroup">`, indexed by round−1. Default `[]` (= mixed for all rounds). Consumed by Task 4 (`rrOddCourtModeForRound`) and Task 6 (setup UI).

- [ ] **Step 1: Write the failing test**

Add this assert block to the TOP of the `mlpPairingTests` IIFE (right after the existing `legacy` migration asserts at ~line 6206):

```js
    // Odd-court pairing mode backfill (defaults to [] = mixed for all rounds)
    console.assert(Array.isArray(legacy.rrOddCourtModes) && legacy.rrOddCourtModes.length === 0,
      "migration: rrOddCourtModes defaults to []");
```

- [ ] **Step 2: Run test to verify it fails**

Open `index.html?test` in a browser (or run the app's test harness). Expected: a new assertion failure "migration: rrOddCourtModes defaults to []" because the field is not yet backfilled.

- [ ] **Step 3: Write minimal implementation**

In `backfillStateDefaults`, after line 7169 (`if (typeof obj.skipChampionship !== "boolean") obj.skipChampionship = false;`), add:

```js
  if (!Array.isArray(obj.rrOddCourtModes)) obj.rrOddCourtModes = [];
```

- [ ] **Step 4: Run test to verify it passes**

Reload `index.html?test`. Expected: the "rrOddCourtModes defaults to []" assertion now passes (the migration block has one more green check, no new failure).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Add rrOddCourtModes state field + migration backfill"
```

---

### Task 2: Odd-court predicates — `groupSet`, `isOddCourt`, `isMixedCapable`

**Files:**
- Modify: `index.html` — add three functions immediately AFTER `groupOf` (ends at line 8066) and BEFORE the `PAIRING_PRESETS` const (line 8068).
- Test: `index.html` inside `mlpPairingTests` IIFE.

**Interfaces:**
- Consumes: `groupOf(slot)` (index.html:8064) — returns `"a"|"b"|""`.
- Produces:
  - `groupSet(four)` → `Set<string>` of distinct non-empty groups among the four slots.
  - `isOddCourt(four)` → `boolean` — `four.length===4 && groupSet(four).size >= 2`. Unset (`""`) players do NOT by themselves make a court odd.
  - `isMixedCapable(four)` → `boolean` — `count("a")>=2 && count("b")>=2`.

- [ ] **Step 1: Write the failing tests**

Add this block inside `mlpPairingTests` (after the `pairSameGroupAware` asserts, ~line 6218):

```js
    // Odd-court predicates
    state = newState();
    state.mixedMode = true;
    state.slotGroups = ["a", "a", "a", "a", "b", "b", "b", "b", "", ""];
    console.assert(isOddCourt([1, 2, 5, 6]) === true,  "isOddCourt: mixed a/b court is odd");
    console.assert(isOddCourt([1, 2, 3, 4]) === false, "isOddCourt: single-group court is not odd");
    console.assert(isOddCourt([1, 2, 9, 10]) === false, "isOddCourt: unset players don't make a court odd");
    console.assert(isOddCourt([1, 2, 3]) === false,    "isOddCourt: not 4 players");
    console.assert(isMixedCapable([1, 2, 5, 6]) === true,  "isMixedCapable: 2a+2b");
    console.assert(isMixedCapable([1, 2, 3, 5]) === false, "isMixedCapable: 3a+1b cannot form two mixed teams");
```

- [ ] **Step 2: Run test to verify it fails**

Run `index.html?test`. Expected: ReferenceError / failures for the three undefined functions.

- [ ] **Step 3: Write minimal implementation**

Insert this block between line 8066 (end of `groupOf`) and line 8068 (`PAIRING_PRESETS`):

```js
// Distinct non-empty groups among four slots. Used by isOddCourt / staffing.
function groupSet(four) {
  const set = new Set();
  for (const s of four) { const g = groupOf(s); if (g) set.add(g); }
  return set;
}
// True when the court holds players from two or more groups — the "odd court" that a
// same-gender round's roster math couldn't keep single-group. Unset ("") players are
// wildcards and do NOT by themselves make a court odd.
function isOddCourt(four) {
  return four.length === 4 && groupSet(four).size >= 2;
}
// True when the four players can form two mixed [A,B] teams (>=2 of each main group).
// Guards the "mixed odd court" pairing: only promised when the math allows.
function isMixedCapable(four) {
  let na = 0, nb = 0;
  for (const s of four) { const g = groupOf(s); if (g === "a") na++; else if (g === "b") nb++; }
  return na >= 2 && nb >= 2;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run `index.html?test`. Expected: all six new assertions pass.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Add odd-court predicates (groupSet, isOddCourt, isMixedCapable)"
```

---

### Task 3: Odd-court mode lookup — `rrOddCourtModeForRound`

**Files:**
- Modify: `index.html` — add immediately AFTER `rrPairingModeForRound` (ends at line 8240).
- Test: `index.html` inside `mlpPairingTests`.

**Interfaces:**
- Consumes: `state.rrOddCourtModes` (from Task 1).
- Produces: `rrOddCourtModeForRound(roundNum)` → `"mixed"` (default) | `"samegroup"`. Consumed by Task 4 (scheduler) and Task 5 (caption).

- [ ] **Step 1: Write the failing test**

Add inside `mlpPairingTests`:

```js
    // Odd-court mode lookup (default mixed; samegroup only when explicitly set)
    state = newState();
    state.mixedMode = true; state.format = "rr";
    state.rrOddCourtModes = ["samegroup", "mixed"];
    console.assert(rrOddCourtModeForRound(1) === "samegroup", "rrOddCourtModeForRound: explicit samegroup");
    console.assert(rrOddCourtModeForRound(2) === "mixed",      "rrOddCourtModeForRound: explicit mixed");
    console.assert(rrOddCourtModeForRound(3) === "mixed",      "rrOddCourtModeForRound: absent entry defaults to mixed");
```

- [ ] **Step 2: Run test to verify it fails**

Run `index.html?test`. Expected: ReferenceError for `rrOddCourtModeForRound`.

- [ ] **Step 3: Write minimal implementation**

Insert after line 8240 (the closing brace of `rrPairingModeForRound`):

```js
// Returns the odd-court pairing for a 1-based round: "samegroup" only when explicitly
// set; otherwise "mixed" (the new default for the odd court in same-gender rounds).
function rrOddCourtModeForRound(roundNum) {
  return (state.rrOddCourtModes || [])[roundNum - 1] === "samegroup" ? "samegroup" : "mixed";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run `index.html?test`. Expected: the three new assertions pass.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Add rrOddCourtModeForRound lookup"
```

---

### Task 4: Deterministic odd-court staffing — `staffOddCourtForCoverage`

**Files:**
- Modify: `index.html` — add immediately AFTER `dealSingleGenderCourts` (ends at line 8282) and BEFORE `assignCourtsConstrained` (line 8289).
- Test: `index.html` inside `mlpPairingTests`.

**Interfaces:**
- Consumes: `isOddCourt`, `groupSet`, `groupOf` (Task 2 + existing); `gamesOf` (existing); `prior` rounds where `round.pairingMode === "samegender"` carry pure courts.
- Produces: `staffOddCourtForCoverage(courts, prior)` — mutates `courts` in place AND returns the same reference. Court STRUCTURE (group counts per court) is preserved; only WHICH specific players sit where changes. The odd court ends up staffed by the highest-coverage players of each group.

**Coverage definition:** a player's coverage = number of prior rounds in which they appeared on a PURE single-group court (a `samegender` round game whose 4 players share one group). Odd-court appearances never count.

- [ ] **Step 1: Write the failing tests**

Add inside `mlpPairingTests`. These use a hand-built `prior` with one samegender round where slots 1,2,5,6 played on pure courts (coverage 1) and 3,4,7,8 did not (coverage 0):

```js
    // staffOddCourtForCoverage: deterministically staffs the odd court with the
    // highest-coverage players (least need of a pure-court seat).
    state = newState();
    state.mixedMode = true;
    state.slotGroups = ["a","a","a","a","a","a","b","b","b","b","b","b"]; // 6a + 6b
    // Prior same-gender round: court1 = [1,2,3,4] (pure a), court2 = [5,6,7,8] is NOT pure
    // here we make two PURE courts: [1,2,3,4](a) and [9,10,11,12](b). Odd court [5,6,7,8](2a+2b).
    const priorCov = [{
      round: 5, pairingMode: "samegender",
      games: [
        makeGame(1, [1,2],[3,4]),       // pure a → coverage 1,2,3,4
        makeGame(2, [9,10],[11,12]),    // pure b → coverage 9,10,11,12
        makeGame(3, [5,6],[7,8]),       // odd court (2a+2b) → no coverage
      ],
      byes: [],
    }];
    const courtsCov = [[1,2,3,4],[9,10,11,12],[5,6,7,8]]; // 3 courts, odd = idx 2 (2a+2b)
    staffOddCourtForCoverage(courtsCov, priorCov);
    const oddRoster = courtsCov[2];
    // Odd court should now hold the 2 highest-coverage a's (1,2) and 2 highest b's (9,10).
    console.assert(oddRoster.includes(1) && oddRoster.includes(2),
      "staffOddCourt: odd court takes highest-coverage a's", oddRoster);
    console.assert(oddRoster.includes(9) && oddRoster.includes(10),
      "staffOddCourt: odd court takes highest-coverage b's", oddRoster);
    // Players with coverage 0 (5,6,7,8) must have moved to pure courts.
    console.assert(!oddRoster.includes(5) && !oddRoster.includes(6),
      "staffOddCourt: low-coverage a's displaced to pure courts", oddRoster);
    // No odd court → no-op
    const even = [[1,2,3,4],[5,6,7,8]];
    staffOddCourtForCoverage(even, []);
    console.assert(JSON.stringify(even) === JSON.stringify([[1,2,3,4],[5,6,7,8]]),
      "staffOddCourt: no odd court → unchanged");
```

- [ ] **Step 2: Run test to verify it fails**

Run `index.html?test`. Expected: ReferenceError for `staffOddCourtForCoverage`.

- [ ] **Step 3: Write minimal implementation**

Insert this block between line 8282 (end of `dealSingleGenderCourts`) and line 8284 (the `assignCourtsConstrained` comment):

```js
// Deterministic odd-court staffing. After dealSingleGenderCourts fixes the court
// STRUCTURE (how many A/B per court), this re-seats WHICH players sit where so the
// odd court is staffed by the players with the HIGHEST same-gender coverage so far
// (least need of a pure-court seat). Swaps are always within-group, so structure is
// preserved. O(n). Independent of RNG — the guarantee is exact, not probabilistic.
//
// Coverage = appearances on a PURE single-group court in prior same-gender rounds.
//   courts: Array<Array<slot>> (mutated in place; also returned)
//   prior:  prior rounds
function staffOddCourtForCoverage(courts, prior) {
  const oddIdx = courts.findIndex(c => isOddCourt(c));
  if (oddIdx < 0) return courts;
  // Count pure-court (single-group) appearances across prior same-gender rounds.
  const coverage = {};
  for (const r of prior || []) {
    if (!r || r.pairingMode !== "samegender") continue;
    for (const g of gamesOf(r)) {
      const four = [...(g.team1 || []), ...(g.team2 || [])];
      if (groupSet(four).size === 1) for (const s of four) coverage[s] = (coverage[s] || 0) + 1;
    }
  }
  // Bucket every seated player by group, then sort each bucket by coverage desc
  // (tie-broken by slot asc for determinism).
  const byGroup = {};
  for (const c of courts) for (const s of c) {
    const g = groupOf(s); if (g) (byGroup[g] = byGroup[g] || []).push(s);
  }
  for (const g of Object.keys(byGroup))
    byGroup[g].sort((a, b) => (coverage[b] || 0) - (coverage[a] || 0) || a - b);
  // Draw order: odd court FIRST (pulls the top-coverage players of each group),
  // then pure courts (draw the remainder). Because each slot keeps its own group
  // label, the map only ever replaces a player with a same-group player.
  const ptr = {}; for (const g of Object.keys(byGroup)) ptr[g] = 0;
  const order = [oddIdx, ...courts.map((_, i) => i).filter(i => i !== oddIdx)];
  for (const c of order) {
    courts[c] = courts[c].map(s => {
      const g = groupOf(s);
      if (!g) return s;               // unset stays put (edge case, rare)
      return byGroup[g][ptr[g]++];
    });
  }
  return courts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run `index.html?test`. Expected: all five new staffing assertions pass. If the "highest-coverage" assertion fails, re-check the sort order (desc = highest first) and the draw order (odd court first).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Add deterministic odd-court staffing (staffOddCourtForCoverage)"
```

---

### Task 5: Wire odd-court staffing + mode-based pairing into `generateRRSchedule`

**Files:**
- Modify: `index.html:10178-10198` (the samegender branch inside the restart loop).
- Test: `index.html` inside `mlpPairingTests`.

**Interfaces:**
- Consumes: `staffOddCourtForCoverage`, `isOddCourt`, `isMixedCapable`, `rrOddCourtModeForRound` (Tasks 2–4); existing `dealSingleGenderCourts`, `bestRRSplit`, `bestSameGenderSplit`.
- Produces: samegender rounds now (a) staff the odd court deterministically and (b) pair the odd court mixed when the mode is `"mixed"` and the court is mixed-capable. Pure courts and restrict-OFF rounds are byte-identical to today.

- [ ] **Step 1: Write the failing tests**

Add inside `mlpPairingTests`. These drive the full scheduler:

```js
    // Odd-court pairing through the full scheduler: 6a+6b / 3 courts.
    state = newState();
    state.format = "rr"; state.mixedMode = true; state.courtCount = 3;
    state.sameGenderOpponents = true;
    state.slotGroups = ["a","a","a","a","a","a","b","b","b","b","b","b"];
    state.mixedGroupLabels = { a: "Men", b: "Women" };

    // (a) odd-court "mixed" (default) → 2 pure single-group courts + 1 court with two mixed teams
    state.rrPairingModes = ["samegender"];
    state.rrOddCourtModes = ["mixed"];
    const sg1 = generateRRSchedule([1,2,3,4,5,6,7,8,9,10,11,12], 3, 1, [], mulberry32(7));
    let pure1 = 0, oddMixed1 = 0;
    for (const g of gamesOf(sg1[0])) {
      const four = [...g.team1, ...g.team2];
      if (groupSet(four).size === 1) pure1++;
      else if (isMixedTeam(g.team1) && isMixedTeam(g.team2)) oddMixed1++;
    }
    console.assert(pure1 === 2 && oddMixed1 === 1,
      "RR odd mixed: 2 pure courts + 1 court with two mixed teams", { pure1, oddMixed1 });

    // (b) odd-court "samegroup" → odd court pairs [a,a] vs [b,b] (today's behavior)
    state.rrOddCourtModes = ["samegroup"];
    const sg2 = generateRRSchedule([1,2,3,4,5,6,7,8,9,10,11,12], 3, 1, [], mulberry32(7));
    let oddSameGroup = false;
    for (const g of gamesOf(sg2[0])) {
      const four = [...g.team1, ...g.team2];
      if (groupSet(four).size >= 2) {
        // odd court: both teams same-group (one a-team, one b-team)
        oddSameGroup = (!isMixedTeam(g.team1) && !isMixedTeam(g.team2));
      }
    }
    console.assert(oddSameGroup, "RR odd samegroup: odd court is [a,a] vs [b,b]");

    // (c) Fairness across TWO same-gender rounds — every active player gets >=1 same-gender
    // (pure-court) game. Assert SEED-INDEPENDENT: staffing is deterministic.
    for (const seed of [1, 99, 12345]) {
      state.rrPairingModes = ["samegender", "samegender"];
      state.rrOddCourtModes = ["mixed", "mixed"];
      const two = generateRRSchedule([1,2,3,4,5,6,7,8,9,10,11,12], 3, 2, [], mulberry32(seed));
      const gotPure = new Set();
      for (const r of two) for (const g of gamesOf(r)) {
        const four = [...g.team1, ...g.team2];
        if (groupSet(four).size === 1) for (const s of four) gotPure.add(s);
      }
      console.assert(gotPure.size === 12,
        "RR fairness (seed " + seed + "): all 12 players get a pure-court game", gotPure.size);
    }

    // (d) Byte-identical baseline: evenly-tiling same-gender round (4a+4b / 2 courts) has no
    // odd court → unaffected by rrOddCourtModes.
    state.courtCount = 2;
    state.slotGroups = ["a","a","a","a","b","b","b","b"];
    state.rrPairingModes = ["samegender"];
    state.rrOddCourtModes = ["mixed"];
    const tiled = generateRRSchedule([1,2,3,4,5,6,7,8], 2, 1, [], mulberry32(7));
    let allPure = true;
    for (const g of gamesOf(tiled[0])) if (groupSet([...g.team1, ...g.team2]).size !== 1) allPure = false;
    console.assert(allPure, "RR no-odd-court: evenly tiling round stays all-pure");
```

- [ ] **Step 2: Run test to verify it fails**

Run `index.html?test`. Expected: the (a) assertion fails (odd court currently pairs `[a,a] vs [b,b]`, so `oddMixed1` is 0); the (c) fairness assertion may also fail (no staffing yet).

- [ ] **Step 3: Write minimal implementation**

In `generateRRSchedule` (the samegender branch, currently lines 10178–10198). The current code is:

```js
      if (roundMode === "samegender") {
        courts = state.sameGenderOpponents
          ? dealSingleGenderCourts(alloc.playing, alloc.activeCourts, rng)
          : dealBalancedCourts(alloc.playing, alloc.activeCourts, rng, prior);
      } else {
        courts = state.mixedMode
          ? dealBalancedCourts(alloc.playing, alloc.activeCourts, rng, prior)
          : null;
      }
      const shuffled = courts ? null : seededShuffle(alloc.playing, rng);
      const games = [];
      for (let c = 0; c < alloc.activeCourts; c++) {
        const four = courts ? courts[c] : shuffled.slice(c * 4, c * 4 + 4);
        if (four && four.length === 4) {
          games.push(roundMode === "samegender"
            ? bestSameGenderSplit(four, c + 1, prior, games)
            : bestRRSplit(four, c + 1, prior, games));
        }
      }
```

Replace with (adds: staffing call after restrict-ON dealing; mode-based odd-court pairing guarded by `sameGenderOpponents` so restrict-OFF rounds are untouched):

```js
      if (roundMode === "samegender") {
        courts = state.sameGenderOpponents
          ? dealSingleGenderCourts(alloc.playing, alloc.activeCourts, rng)
          : dealBalancedCourts(alloc.playing, alloc.activeCourts, rng, prior);
        // Deterministically staff the odd court with the players who least need a
        // pure-court seat. Only meaningful under restrict-ON (pure + odd structure).
        if (state.sameGenderOpponents) staffOddCourtForCoverage(courts, prior);
      } else {
        courts = state.mixedMode
          ? dealBalancedCourts(alloc.playing, alloc.activeCourts, rng, prior)
          : null;
      }
      const shuffled = courts ? null : seededShuffle(alloc.playing, rng);
      const games = [];
      for (let c = 0; c < alloc.activeCourts; c++) {
        const four = courts ? courts[c] : shuffled.slice(c * 4, c * 4 + 4);
        if (four && four.length === 4) {
          let game;
          if (roundMode === "samegender") {
            // Odd court (restrict-ON only) may pair mixed when the mode asks and the
            // roster allows two mixed teams; otherwise same-gender pairs as today.
            const oddMixed = state.sameGenderOpponents && isOddCourt(four)
              && rrOddCourtModeForRound(roundNum) === "mixed" && isMixedCapable(four);
            game = oddMixed
              ? bestRRSplit(four, c + 1, prior, games)
              : bestSameGenderSplit(four, c + 1, prior, games);
          } else {
            game = bestRRSplit(four, c + 1, prior, games);
          }
          games.push(game);
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run `index.html?test`. Expected: all four new scheduler assertions (a, b, c × 3 seeds, d) pass. If (c) fails for some seed, confirm `staffOddCourtForCoverage` is being called inside the loop (it must run each restart so the odd court is deterministic regardless of the random deal).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Wire odd-court staffing + mode-based pairing into RR scheduler"
```

---

### Task 6: Court-card caption for the odd court

**Files:**
- Modify: `index.html:15606-15607` (pass round number into `renderCourtCard`) and `index.html:15651-15660` (the same-gender caption block).
- Test: visual (verified in Task 8 via the app), plus the existing caption logic still labels pure courts "Men doubles"/"Women doubles".

**Interfaces:**
- Consumes: `rrOddCourtModeForRound`, `isOddCourt` (Tasks 2–3); `groupSet`, `groupOf`.
- Produces: odd-court caption reads "Mixed pairs — odd court" (mixed mode) or "Same-group pairs — odd court" (samegroup mode) instead of the generic "Mixed-group court — roster doesn't divide evenly".

- [ ] **Step 1: Pass the round number through to `renderCourtCard`**

At line 15606–15607, the current code is:

```js
    const sameGenderRound = !!(round && round.pairingMode === "samegender");
    for (const g of gamesOf(round)) wrap.appendChild(renderCourtCard(g, g.court, refreshes, { sameGenderRound }));
```

Change to also pass the round number:

```js
    const sameGenderRound = !!(round && round.pairingMode === "samegender");
    for (const g of gamesOf(round)) wrap.appendChild(renderCourtCard(g, g.court, refreshes, { sameGenderRound, roundNum: round ? round.round : 0 }));
```

- [ ] **Step 2: Update the same-gender caption block**

At lines 15651–15660, the current block is:

```js
  if (!isFinalCard && seedInfo && seedInfo.sameGenderRound) {
    const groups = [...(game.team1 || []), ...(game.team2 || [])].map(groupOf);
    const labels = state.mixedGroupLabels || { a: "Men", b: "Women" };
    const groupWord = detectPreset() === "gender" ? "gender" : "group";
    const allSame = groups.length === 4 && groups.every(gr => gr && gr === groups[0]);
    card.appendChild(el("div", { class: "pairing-caption" },
      allSame
        ? (groups[0] === "a" ? labels.a : labels.b) + " doubles"
        : "Mixed-" + groupWord + " court — roster doesn't divide evenly"));
  }
```

Replace the caption text for the `!allSame` (odd-court) branch to reflect the active odd-court mode:

```js
  if (!isFinalCard && seedInfo && seedInfo.sameGenderRound) {
    const groups = [...(game.team1 || []), ...(game.team2 || [])].map(groupOf);
    const labels = state.mixedGroupLabels || { a: "Men", b: "Women" };
    const allSame = groups.length === 4 && groups.every(gr => gr && gr === groups[0]);
    const four = [...(game.team1 || []), ...(game.team2 || [])];
    let caption;
    if (allSame) {
      caption = (groups[0] === "a" ? labels.a : labels.b) + " doubles";
    } else if (isOddCourt(four)) {
      // Odd court: caption reflects the GM's chosen odd-court pairing for this round.
      caption = rrOddCourtModeForRound(seedInfo.roundNum || 0) === "mixed"
        ? "Mixed pairs — odd court"
        : "Same-group pairs — odd court";
    } else {
      caption = "Mixed-group court — roster doesn't divide evenly";
    }
    card.appendChild(el("div", { class: "pairing-caption" }, caption));
  }
```

- [ ] **Step 3: Run `?test` to confirm no regressions**

Run `index.html?test`. Expected: same pass/fail count as after Task 5 (no new failures — the caption is render code, not exercised by unit asserts, but confirm nothing throws).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Caption odd courts by their active pairing mode"
```

---

### Task 7: Setup UI — per-round odd-court dropdown + rewritten warning

**Files:**
- Modify: `index.html:12125-12178` (the "Pairing by round" grid and the same-gender warning in `renderRRPairingControls`).

**Interfaces:**
- Consumes: `state.rrOddCourtModes`, `state.sameGenderOpponents`, `state.rrPairingModes`, `state.mixedGroupLabels`.
- Produces: each same-gender round row gets a second dropdown ("Odd court:") visible whenever `sameGenderOpponents` is true. The existing ⚠️ warning is rewritten to reference the dropdown.

- [ ] **Step 1: Add the odd-court dropdown to each same-gender round row**

In `renderRRPairingControls`, the grid is built at lines 12125–12140. The current loop body is:

```js
  const grid = el("div", { style: "display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;" });
  for (let i = 0; i < n; i++) {
    grid.appendChild(el("span", { style: "font-size:14px;color:var(--muted);" }, "Round " + (i + 1)));
    const sel = el("select", {
      style: "min-height:34px;font-size:14px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:4px 8px;",
      onchange: () => {
        if (!Array.isArray(state.rrPairingModes)) state.rrPairingModes = [];
        state.rrPairingModes[i] = sel.value;
        save();
        render();
      },
    });
    sel.appendChild(el("option", { value: "mixed", selected: modeFor(i) === "mixed" }, "Mixed (1 + 1)"));
    sel.appendChild(el("option", { value: "samegender", selected: modeFor(i) === "samegender" }, sameLabel));
    grid.appendChild(sel);
  }
  wrap.appendChild(grid);
```

Replace the loop body (keep the `grid` container line and the `wrap.appendChild(grid)` line) so that each row whose round is same-gender AND `sameGenderOpponents` is true gets a second dropdown:

```js
  const grid = el("div", { style: "display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;" });
  const oddModeFor = (i) => (state.rrOddCourtModes || [])[i] === "samegroup" ? "samegroup" : "mixed";
  for (let i = 0; i < n; i++) {
    grid.appendChild(el("span", { style: "font-size:14px;color:var(--muted);" }, "Round " + (i + 1)));
    const cell = el("div", { style: "display:flex;flex-direction:column;gap:4px;" });
    const sel = el("select", {
      style: "min-height:34px;font-size:14px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:4px 8px;",
      onchange: () => {
        if (!Array.isArray(state.rrPairingModes)) state.rrPairingModes = [];
        state.rrPairingModes[i] = sel.value;
        save(); render();
      },
    });
    sel.appendChild(el("option", { value: "mixed", selected: modeFor(i) === "mixed" }, "Mixed (1 + 1)"));
    sel.appendChild(el("option", { value: "samegender", selected: modeFor(i) === "samegender" }, sameLabel));
    cell.appendChild(sel);
    // Odd-court dropdown: shown for same-gender rounds under restrict-ON (where pure +
    // odd courts arise). Harmless no-op when a round tiles evenly.
    if (modeFor(i) === "samegender" && state.sameGenderOpponents) {
      const oddSel = el("select", {
        style: "min-height:30px;font-size:13px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:3px 8px;",
        onchange: () => {
          if (!Array.isArray(state.rrOddCourtModes)) state.rrOddCourtModes = [];
          state.rrOddCourtModes[i] = oddSel.value;
          save(); render();
        },
      });
      oddSel.appendChild(el("option", { value: "mixed", selected: oddModeFor(i) === "mixed" },
        "Odd court: Mixed (1 + 1)"));
      oddSel.appendChild(el("option", { value: "samegroup", selected: oddModeFor(i) === "samegroup" },
        "Odd court: " + sameLabel + " pairs"));
      cell.appendChild(oddSel);
    }
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
```

- [ ] **Step 2: Rewrite the ⚠️ warning to reference the dropdown**

The existing warning is at lines 12162–12178 (inside the `if (state.sameGenderOpponents) { ... }` block). The current text:

```js
      if (noByes && (nA % 4 !== 0 || nB % 4 !== 0)) {
        const groupWord = detectPreset() === "gender" ? "gender" : "group";
        wrap.appendChild(el("div", { style: "font-size:13px;margin-top:8px;line-height:1.45;color:var(--warn,#e0a341);border-left:2px solid var(--warn,#e0a341);padding-left:8px;" },
          "⚠️ With " + nA + " " + labels.a + " and " + nB + " " + labels.b + " on " + courts +
          " courts, each " + sameLabel.toLowerCase() + " round will have one mixed-" + groupWord + " court — " +
          "the counts don't split evenly into all-" + labels.a + " / all-" + labels.b + " courts of 4."));
      }
```

Replace the message string so it points at the new per-round control:

```js
      if (noByes && (nA % 4 !== 0 || nB % 4 !== 0)) {
        const groupWord = detectPreset() === "gender" ? "gender" : "group";
        wrap.appendChild(el("div", { style: "font-size:13px;margin-top:8px;line-height:1.45;color:var(--warn,#e0a341);border-left:2px solid var(--warn,#e0a341);padding-left:8px;" },
          "⚠️ With " + nA + " " + labels.a + " and " + nB + " " + labels.b + " on " + courts +
          " courts, each " + sameLabel.toLowerCase() + " round has one mixed-" + groupWord +
          " court. Its pairing defaults to Mixed (1 + 1) — set it per round above if you'd " +
          "rather keep " + sameLabel.toLowerCase() + " pairs there. Rumble also rotates who " +
          "sits on that court so everyone gets a " + sameLabel.toLowerCase() + " game."));
      }
```

- [ ] **Step 3: Run `?test` to confirm no regressions**

Run `index.html?test`. Expected: same pass/fail count as before (UI changes aren't unit-tested but must not throw).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add per-round odd-court dropdown + rewrite setup warning"
```

---

### Task 8: Version / cache bump (v58 → v59)

**Files:**
- Modify: `index.html:2653` (`APP_VERSION`)
- Modify: `sw.js:6` (`VERSION`)
- Modify: `version-metadata.json` (prepend a v59 entry)
- Modify: `version.json` (prepend the same v59 entry)

- [ ] **Step 1: Bump `APP_VERSION`**

At `index.html:2653`, change:

```js
const APP_VERSION    = "v58";
```

to:

```js
const APP_VERSION    = "v59";
```

- [ ] **Step 2: Bump the service-worker `VERSION`**

At `sw.js:6`, change:

```js
const VERSION = CACHE_PREFIX + "v58";
```

to:

```js
const VERSION = CACHE_PREFIX + "v59";
```

- [ ] **Step 3: Prepend the v59 changelog entry to `version-metadata.json`**

At the top of the JSON array (before the existing `v58` object), insert:

```json
  {
    "version": "v59",
    "changes": [
      "Let Round Robin same-gender rounds choose how the odd court pairs when the roster can't fill every court with same-gender teams (e.g. 6 Men + 6 Women on 3 courts): each same-gender round now has an 'Odd court' dropdown defaulting to Mixed (1 man + 1 woman per team), with Same-gender pairs as the alternative",
      "Rotate who sits on the odd court across same-gender rounds so every player gets a same-gender game before anyone plays the odd court twice — the app now deterministically seats the players who've already had a same-gender game onto the odd court, freeing pure same-gender courts for those who haven't",
      "Relabel the odd court's card caption to 'Mixed pairs — odd court' or 'Same-group pairs — odd court' so players can see why one court looks different, and rewrite the setup warning to point at the new per-round control"
    ]
  },
```

- [ ] **Step 4: Prepend the identical v59 entry to `version.json`**

`version.json` mirrors `version-metadata.json`. Prepend the same v59 object (identical JSON) as the new first array element, before `v58`.

- [ ] **Step 5: Commit**

```bash
git add index.html sw.js version-metadata.json version.json
git commit -m "v59: odd-court pairing + fairness for same-gender RR rounds"
```

---

### Task 9: Verify — `?test` + `?simulate` + manual app check

- [ ] **Step 1: Run the unit test harness**

Open `index.html?test` in a browser. Expected: the baseline of exactly **1 known keep-awake failure**, and NO new failures. All odd-court assertions from Tasks 1–5 pass.

- [ ] **Step 2: Run the full-tournament simulation**

Open `index.html?simulate` in a browser. Expected: **0 failures**. (This catches crashes/regressions across RR/Stack/King/Gauntlet and various roster sizes.)

- [ ] **Step 3: Manual dogfood of the motivating case**

1. Open the app. Players & Courts tab: Mixed mode ON, 12 players, 6 Men (group a) + 6 Women (group b), 3 courts.
2. Format tab: Round Robin, 6 rounds, Skip championship ON.
3. Pairing by round: set rounds 1–4 = Mixed, rounds 5–6 = Same-gender. Confirm each of rounds 5–6 shows an "Odd court: Mixed (1 + 1)" dropdown (the new default). Leave it Mixed.
4. Start the tournament. In round 5, confirm: 2 pure courts (Men doubles / Women doubles) + 1 court captioned "Mixed pairs — odd court" with two mixed teams.
5. Play through round 5 (enter any scores), advance to round 6. Confirm the odd court is now staffed by DIFFERENT players than round 5, and that across both rounds every player appeared on a pure same-gender court at least once.
6. (Optional) Change round 6's odd-court dropdown to "Same-gender pairs" and re-verify the odd court caption reads "Same-group pairs — odd court" and pairs `[M,M] vs [W,W]`.

- [ ] **Step 4: Ship**

Once green, follow the project's ship workflow (feature branch → PR → merge → prune). This is a substantive change to a protected base, so use a PR rather than pushing directly to `main`.

---

## Self-Review (completed)

**1. Spec coverage:** Every spec section maps to a task — state field (T1), predicates incl. isOddCourt/isMixedCapable (T2), mode lookup (T3), deterministic staffing + coverage definition (T4), scheduler wiring incl. graceful fallback via isMixedCapable guard (T5), court-card caption (T6), setup UI for all same-gender rounds + rewritten warning (T7), version bump (T8), verification incl. seed-independent fairness (T9). The non-2+2 fallback is covered by the `isMixedCapable` guard in T5 (falls through to `bestSameGenderSplit` → best-effort, no crash); unset-group edge is covered by T2's `groupSet` ignoring `""` and T4's `if (!g) return s`.

**2. Placeholder scan:** No TBD/TODO. Every code step shows the full code. Test steps include runnable asserts with expected results.

**3. Type consistency:** `rrOddCourtModeForRound` is spelled identically in T3 (definition), T5 (scheduler), T6 (caption). `staffOddCourtForCoverage` signature `(courts, prior) → courts` matches across T4 (def) and T5 (call). `isOddCourt`/`isMixedCapable`/`groupSet` match T2 def ↔ T4/T5/T6 use. `state.rrOddCourtModes` index is `round−1` everywhere; `rrOddCourtModeForRound` and `oddModeFor` both default absent → `"mixed"`.
