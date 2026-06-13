# Adjusted Margin Ranking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Round Robin/Gauntlet's points-per-game primary ranking with a Strength-Adjusted Margin (diminishing-returns point margin, weighted by opponent and partner strength), so dominant wins rank above narrow high-scoring ones.

**Architecture:** All logic lives in the single-file app `index.html`. A new `computeMarginStats(throughRound)` does a two-pass margin computation on top of the existing `computeStats`. `rankPlayers` sorts by the new `adjScore`. The standings tables swap their PPG column for an AM column. The two in-browser test suites (`?test` → `runSelfTests`, `?simulate` → `runSimulation`) and player-facing copy are updated to match.

**Tech Stack:** Vanilla JS embedded in `index.html`. No build system. Tests are `console.assert` blocks gated by URL params, run in a browser.

**Reference spec:** `docs/superpowers/specs/2026-06-13-strength-adjusted-margin-ranking-design.md`

---

## How to run the tests (used by every task)

There is no CLI test runner. Tests run in a browser via URL params and log to the console:

```bash
# from the repo root, start a static server (leave running in a separate shell)
python3 -m http.server 8731
```

- **Unit suite:** open `http://localhost:8731/index.html?test` → console prints `[self-tests] complete — N failure(s)`. Must be `0`.
- **Simulation suite:** open `http://localhost:8731/index.html?simulate` → console prints `[simulate] complete — N failure(s) across …`. Must be `0`.

Headless option (if a browser isn't handy) — capture the console with the Playwright MCP `browser_navigate` + `browser_console_messages`, or any headless Chrome that can read `console`. Either way, the pass condition is the `0 failure(s)` line.

> **Important:** Failing `console.assert` calls only increment a counter and log — the page does not crash. Always read the final `complete — N failure(s)` line; `N` must be `0`.

---

## File Structure

Everything is in `index.html`. Key regions (line numbers approximate — grep to confirm before editing):

- **~6983–7030** `computeStats(throughRound, includeFinals)` — unchanged; still the source of `avgPoints`, `winRate`, `avgDiff`, `partnersUsed`, `gp`.
- **NEW, before `computeStats`** — metric constants + `marginScore` + `clampAdj` helpers.
- **NEW, after `computeStats` / before `rankPlayers`** — `computeMarginStats` + `addMarginCredit`.
- **~7049–7064** `rankPlayers(throughRound)` — sort changes.
- **~10056 `renderStandingsCard`** and **~11183 done-screen RR table** — PPG→AM column swap. (King table ~10005 and Stack table ~10117 are out of scope — do NOT touch.)
- **~1565 `runSelfTests`** — fix one display assertion; add a new AM test block.
- **~3835 `runSimulation`** — rewrite `expectedTable` and `checkTable`.
- **Copy/comments:** ~5559, ~7070, ~7760, ~3846.

---

## Task 1: Metric primitives (`marginScore`, `clampAdj`, constants)

**Files:**
- Modify: `index.html` (insert immediately before `function computeStats(` — confirm line with `grep -n "function computeStats(" index.html`)
- Test: `index.html` inside `runSelfTests` (insert a new block immediately before the closing `console.log(\`[self-tests] complete …\`)` line — confirm with `grep -n "self-tests] complete" index.html`)

- [ ] **Step 1: Write the failing test**

Insert this block near the end of `runSelfTests` (before the `console.log("[self-tests] complete …")` line):

```javascript
  // Adjusted Margin — metric primitives
  {
    const closeTo = (a, b) => Math.abs(a - b) < 1e-9;
    console.assert(closeTo(marginScore(2), Math.SQRT2), "marginScore(2)=√2", marginScore(2));
    console.assert(closeTo(marginScore(8), Math.sqrt(8)), "marginScore(8)=√8", marginScore(8));
    console.assert(closeTo(marginScore(-2), -Math.SQRT2), "marginScore(-2)=-√2", marginScore(-2));
    console.assert(marginScore(0) === 0, "marginScore(0)=0", marginScore(0));
    console.assert(clampAdj(2) === 1 && clampAdj(-2) === -1 && clampAdj(0.5) === 0.5,
      "clampAdj caps at ±1", [clampAdj(2), clampAdj(-2), clampAdj(0.5)]);
  }
```

- [ ] **Step 2: Run test to verify it fails**

Open `http://localhost:8731/index.html?test`.
Expected: console shows a ReferenceError / failures > 0 (`marginScore is not defined`).

- [ ] **Step 3: Write minimal implementation**

Insert immediately before `function computeStats(`:

```javascript
// === Adjusted Margin ranking primitives (RR + Gauntlet) ===
// Diminishing-returns point margin with light opponent/partner strength
// weighting. See docs/superpowers/specs/2026-06-13-strength-adjusted-margin-ranking-design.md
const MARGIN_STRENGTH_K = 0.5;   // opponent/partner sensitivity
const MARGIN_ADJ_CAP    = 1.0;   // max strength adjustment per game; < √2 keeps every win > 0 and every loss < 0
function marginScore(d) {        // signed square-root diminishing-returns curve
  return Math.sign(d) * Math.sqrt(Math.abs(d));
}
function clampAdj(x) {
  return Math.max(-MARGIN_ADJ_CAP, Math.min(MARGIN_ADJ_CAP, x));
}
```

- [ ] **Step 4: Run test to verify it passes**

Open `http://localhost:8731/index.html?test`.
Expected: `[self-tests] complete — 0 failure(s)`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(ranking): add Adjusted Margin metric primitives"
```

---

## Task 2: `computeMarginStats` (two-pass margin + strength)

**Files:**
- Modify: `index.html` (insert after `function computeStats(...) { … }` closes, before `function headToHead(` — confirm with `grep -n "function headToHead(" index.html`)
- Test: `index.html` inside `runSelfTests` (extend the block from Task 1 or add a new block in the same location)

- [ ] **Step 1: Write the failing test**

Add this block in `runSelfTests` (near the Task 1 block):

```javascript
  // Adjusted Margin — computeMarginStats
  {
    const savedState = state;
    const closeTo = (a, b) => Math.abs(a - b) < 1e-9;
    const makePlayers = n => Array.from({ length: n }, (_, i) => ({
      slot: i + 1, name: "P" + (i + 1), phone: "", status: "active",
      eligibleFromRound: 1, joinedRound: 1, leftRound: null,
    }));
    const sg = (court, team1, team2, score1, score2) => {
      const g = makeGame(court, team1, team2); g.score1 = score1; g.score2 = score2; return g;
    };
    const baseState = (players, courtCount, rounds) => ({
      phase: "playing", format: "rr", courtCount,
      slots: Array.from({ length: players }, (_, i) => "P" + (i + 1)), players: makePlayers(players),
      rounds, tiebreakRandom: Array.from({ length: players }, (_, i) => i),
      previousRanks: [], notifiedRounds: [], awardsShown: false, winScore: 11, finals: null,
    });
    const find = (stats, slot) => stats.find(s => s.slot === slot);

    // (a) A deuce win (13–11) and an 11–9 win have identical base margin score.
    state = baseState(8, 2, [
      makeRound(1, [sg(1, [1,2], [3,4], 13, 11), sg(2, [5,6], [7,8], 11, 9)], []),
    ]);
    {
      const ms = computeMarginStats(1);
      console.assert(closeTo(find(ms, 1).avgMargin, find(ms, 5).avgMargin),
        "deuce win and 11-9 win give equal base margin", { a: find(ms,1).avgMargin, b: find(ms,5).avgMargin });
    }

    // (b) Diminishing returns: three squeakers (3-0) outrank two blowouts + a blowout loss (2-1) on base margin.
    state = baseState(8, 2, [
      makeRound(1, [sg(1, [1,2], [3,4], 11, 0), sg(2, [5,6], [7,8], 11, 9)], []),
      makeRound(2, [sg(1, [1,3], [2,4], 11, 0), sg(2, [5,7], [6,8], 11, 9)], []),
      makeRound(3, [sg(1, [3,4], [1,2], 11, 0), sg(2, [5,8], [6,7], 11, 9)], []),
    ]);
    {
      const ms = computeMarginStats(3);
      // player 1: won 11-0, won 11-0, lost 0-11  → base = (√11 + √11 − √11)/3 = √11/3
      // player 5: won 11-9, 11-9, 11-9           → base = √2
      console.assert(find(ms, 5).avgMargin > find(ms, 1).avgMargin,
        "3-0 of squeakers beats 2-1 with blowouts on base margin",
        { p1: find(ms,1).avgMargin, p5: find(ms,5).avgMargin });
    }

    // (c) Sign invariant: every winner's adjScore-contributing credit stays positive, loser's negative.
    //     With CAP < √2, a single-game player's adjScore has the sign of their result.
    state = baseState(8, 2, [
      makeRound(1, [sg(1, [1,2], [3,4], 11, 9), sg(2, [5,6], [7,8], 11, 0)], []),
    ]);
    {
      const ms = computeMarginStats(1);
      console.assert(find(ms,1).adjScore > 0 && find(ms,5).adjScore > 0,
        "winners have positive adjScore", { p1: find(ms,1).adjScore, p5: find(ms,5).adjScore });
      console.assert(find(ms,3).adjScore < 0 && find(ms,7).adjScore < 0,
        "losers have negative adjScore", { p3: find(ms,3).adjScore, p7: find(ms,7).adjScore });
    }

    // (d) Opponent strength: beating a STRONG team beats the same margin vs a WEAK team.
    //     R1 makes {3,4} strong (11-1 win) and {7,8} weak (1-11 loss).
    //     R2: player 1 beats strong {3,4} 11-9; player 2 beats weak {7,8} 11-9.
    //     Players 1 and 2 are otherwise symmetric (both beat {7,8} 11-1 in R1).
    state = baseState(8, 2, [
      makeRound(1, [sg(1, [3,4], [5,6], 11, 1), sg(2, [1,2], [7,8], 11, 1)], []),
      makeRound(2, [sg(1, [1,5], [3,4], 11, 9), sg(2, [2,6], [7,8], 11, 9)], []),
    ]);
    {
      const ms = computeMarginStats(2);
      console.assert(find(ms, 1).adjScore > find(ms, 2).adjScore,
        "beating a strong team outscores beating a weak team (same margin)",
        { p1: find(ms,1).adjScore, p2: find(ms,2).adjScore });
    }

    // (e) Partner strength: the SAME win counts for LESS when partnered with a stronger player.
    //     Two states identical except player 1's R2 partner (strong P3 vs weak P5).
    //     (O − P) is invariant to field-centering, so this isolates partner strength.
    const partnerState = partner => baseState(8, 2, [
      makeRound(1, [sg(1, [3,4], [5,6], 11, 1), sg(2, [2,7], [8,1], 9, 11)], []),
      makeRound(2, [sg(1, [1,partner], [7,8], 11, 9), sg(2, [2,6], [3,4], 9, 11)], []),
    ]);
    {
      state = partnerState(3); const strongPartner = computeMarginStats(2).find(s => s.slot === 1).adjScore;
      state = partnerState(5); const weakPartner   = computeMarginStats(2).find(s => s.slot === 1).adjScore;
      console.assert(weakPartner > strongPartner,
        "same win counts less with a stronger partner", { strongPartner, weakPartner });
    }

    state = savedState;
  }
```

- [ ] **Step 2: Run test to verify it fails**

Open `http://localhost:8731/index.html?test`.
Expected: failures > 0 (`computeMarginStats is not defined`).

- [ ] **Step 3: Write minimal implementation**

Insert after `computeStats`'s closing brace (before `function headToHead(`):

```javascript
// Per-player Adjusted Margin stats through `throughRound` (regular rounds only).
// Builds on computeStats for display fields, then layers diminishing-returns
// margin (avgMargin) and strength-adjusted credit (adjScore).
function computeMarginStats(throughRound) {
  const stats = computeStats(throughRound, false);
  const n = stats.length;
  const sumMs = new Array(n + 1).fill(0);
  const sumCredit = new Array(n + 1).fill(0);
  const games = [];
  for (let i = 0; i < (throughRound || 0) && i < state.rounds.length; i++) {
    for (const g of gamesOf(state.rounds[i])) {
      if (isGameDecided(g)) games.push(g);
    }
  }
  // Pass 1 — base margin score per player.
  for (const g of games) {
    const m1 = marginScore(g.score1 - g.score2);
    for (const slot of g.team1) sumMs[slot] += m1;
    for (const slot of g.team2) sumMs[slot] -= m1;
  }
  const base = new Array(n + 1).fill(0);
  let fieldSum = 0, fieldCount = 0;
  for (const s of stats) {
    if (s.gp > 0) { base[s.slot] = sumMs[s.slot] / s.gp; fieldSum += base[s.slot]; fieldCount++; }
  }
  const fieldAvg = fieldCount ? fieldSum / fieldCount : 0;
  const strength = new Array(n + 1).fill(0);
  for (const s of stats) {
    if (s.gp > 0) strength[s.slot] = base[s.slot] - fieldAvg;
  }
  // Pass 2 — strength-adjusted credit per player.
  for (const g of games) {
    const m1 = marginScore(g.score1 - g.score2);
    addMarginCredit(g.team1, g.team2, m1, strength, sumCredit);
    addMarginCredit(g.team2, g.team1, -m1, strength, sumCredit);
  }
  for (const s of stats) {
    s.avgMargin = s.gp > 0 ? base[s.slot] : 0;
    s.adjScore  = s.gp > 0 ? sumCredit[s.slot] / s.gp : 0;
  }
  return stats;
}

// Adds `ms + clamp(k·(opponentStrength − partnerStrength))` to each player on `team`.
function addMarginCredit(team, opp, ms, strength, sumCredit) {
  const O = (strength[opp[0]] + strength[opp[1]]) / 2;
  for (let k = 0; k < team.length; k++) {
    const partner = team[k === 0 ? 1 : 0];
    const P = strength[partner];
    sumCredit[team[k]] += ms + clampAdj(MARGIN_STRENGTH_K * (O - P));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Open `http://localhost:8731/index.html?test`.
Expected: `[self-tests] complete — 0 failure(s)`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(ranking): add computeMarginStats (diminishing-returns margin + strength weighting)"
```

---

## Task 3: Switch `rankPlayers` to Adjusted Margin

**Files:**
- Modify: `index.html` `rankPlayers` (~7049–7064)
- Test: `index.html` inside `runSelfTests` (new block)

- [ ] **Step 1: Write the failing test**

Add this block in `runSelfTests`:

```javascript
  // Adjusted Margin — rankPlayers ordering
  {
    const savedState = state;
    const makePlayers = n => Array.from({ length: n }, (_, i) => ({
      slot: i + 1, name: "P" + (i + 1), phone: "", status: "active",
      eligibleFromRound: 1, joinedRound: 1, leftRound: null,
    }));
    const sg = (court, team1, team2, score1, score2) => {
      const g = makeGame(court, team1, team2); g.score1 = score1; g.score2 = score2; return g;
    };
    const idx = (ranked, slot) => ranked.findIndex(s => s.slot === slot);

    // A blowout win (11-3) ranks above a squeaker win (11-9) of an otherwise-symmetric player.
    state = {
      phase: "playing", format: "rr", courtCount: 2,
      slots: Array.from({ length: 8 }, (_, i) => "P" + (i + 1)), players: makePlayers(8),
      rounds: [ makeRound(1, [sg(1, [1,2], [3,4], 11, 3), sg(2, [5,6], [7,8], 11, 9)], []) ],
      tiebreakRandom: Array.from({ length: 8 }, (_, i) => i),
      previousRanks: [], notifiedRounds: [], awardsShown: false, winScore: 11, finals: null,
    };
    const ranked = rankPlayers(1);
    console.assert(idx(ranked, 1) < idx(ranked, 5),
      "blowout winner outranks squeaker winner", ranked.map(s => s.slot).join(","));
    console.assert(ranked[ranked.length - 1].slot >= 1,
      "rankPlayers returns all players", ranked.length);
    state = savedState;
  }
```

- [ ] **Step 2: Run test to verify it fails**

Open `http://localhost:8731/index.html?test`.
Expected: failure on "blowout winner outranks squeaker winner" (old `rankPlayers` sorts by points/game, where 11-9 = 11 pts ties 11-3 = 11 pts, so order is decided only by tiebreakRandom — not by margin).

- [ ] **Step 3: Write minimal implementation**

Replace the body of `rankPlayers`:

```javascript
function rankPlayers(throughRound) {
  const stats = computeMarginStats(throughRound);
  stats.sort((a, b) => {
    if (a.gp === 0 || b.gp === 0) {
      if (a.gp !== b.gp) return a.gp === 0 ? 1 : -1;
      return tiebreakOrder(a.slot) - tiebreakOrder(b.slot);
    }
    if (b.adjScore !== a.adjScore) return b.adjScore - a.adjScore;
    if (b.winRate  !== a.winRate)  return b.winRate  - a.winRate;
    const h2h = headToHead(a.slot, b.slot, throughRound);
    if (h2h !== 0) return -h2h;
    return tiebreakOrder(a.slot) - tiebreakOrder(b.slot);
  });
  return stats;
}
```

- [ ] **Step 4: Run test to verify it passes**

Open `http://localhost:8731/index.html?test`.
Expected: `[self-tests] complete — 0 failure(s)`. (The pre-existing RR block at ~2211–2225 still passes: winners still rank above losers, GP=0 still ranks last, and the round-1-only grouping still matches the totals grouping.)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(ranking): rank RR/Gauntlet by Adjusted Margin then win rate"
```

---

## Task 4: Swap the PPG column for AM in the two RR/Gauntlet standings tables

**Files:**
- Modify: `index.html` `renderStandingsCard` (live RR/Gauntlet table, ~10079–10110)
- Modify: `index.html` done-screen RR/Gauntlet table (~11178–11197)
- Test: `index.html` `runSelfTests` display assertion (~2226–2228)

> The header order is `# · Player · GP · [stat] · W/G · +/–G`. We swap the `[stat]` column from PPG (`avgPoints`) to **AM** (`adjScore`). Cell positions are unchanged, so `checkTable` (Task 5) only needs its cell *meaning* updated, not its indices. King (~10005) and Stack (~10117) tables keep PPG — do not touch them.

- [ ] **Step 1: Update the failing display assertion**

Find (~2226–2228):

```javascript
    const standings = renderStandingsCard(2);
    console.assert(/GP/.test(standings.textContent) && /11\.0/.test(standings.textContent),
      "RR standings show GP and per-game values", standings.textContent);
```

Replace with:

```javascript
    const standings = renderStandingsCard(2);
    console.assert(/GP/.test(standings.textContent) && /\bAM\b/.test(standings.textContent),
      "RR standings show GP and Adjusted Margin columns", standings.textContent);
```

- [ ] **Step 2: Run test to verify it fails**

Open `http://localhost:8731/index.html?test`.
Expected: failure on "RR standings show GP and Adjusted Margin columns" (the table still renders a `PPG` header, not `AM`).

- [ ] **Step 3: Update `renderStandingsCard`**

In `renderStandingsCard` (~10056), find the PPG header (~10083):

```javascript
    el("th", { class: "num", title: "Points per game" }, "PPG"),
```

Replace with:

```javascript
    el("th", { class: "num", title: "Adjusted Margin — diminishing-returns point margin, weighted by opponent and partner strength. Updates retroactively as the field's strength becomes clearer." }, "AM"),
```

Then find the matching cell (~10104):

```javascript
      el("td", { class: "num" }, s.avgPoints.toFixed(1)),
```

Replace with:

```javascript
      el("td", {
        class: "num",
        style: s.adjScore > 0 ? "color: var(--good);" : (s.adjScore < 0 ? "color: var(--bad);" : ""),
      }, s.adjScore.toFixed(1)),
```

- [ ] **Step 4: Update the done-screen RR/Gauntlet table**

In the done-screen RR/Gauntlet standings table (~11178–11197 — the one whose rows read `s.avgPoints.toFixed(1)` and that iterates `ranking.forEach`), first locate where `allStats` is defined just above the table (`const allStats = computeStats(totalRegularRounds(), true);`) and add an AM lookup right after it:

```javascript
    const marginBySlot = new Map(
      computeMarginStats(totalRegularRounds()).map(s => [s.slot, s.adjScore]));
```

Find the PPG header (~11183):

```javascript
      el("th", { class: "num", title: "Points per game" }, "PPG"),
```

Replace with:

```javascript
      el("th", { class: "num", title: "Adjusted Margin (regular rounds)" }, "AM"),
```

Find the matching cell (~11195):

```javascript
        el("td", { class: "num" }, s.avgPoints.toFixed(1)),
```

Replace with:

```javascript
        el("td", {
          class: "num",
          style: (marginBySlot.get(s.slot) || 0) > 0 ? "color: var(--good);"
               : ((marginBySlot.get(s.slot) || 0) < 0 ? "color: var(--bad);" : ""),
        }, (marginBySlot.get(s.slot) || 0).toFixed(1)),
```

- [ ] **Step 5: Run test to verify it passes**

Open `http://localhost:8731/index.html?test`.
Expected: `[self-tests] complete — 0 failure(s)`. (The `?simulate` suite will still fail until Task 5 — that's expected.)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(ranking): show Adjusted Margin (AM) column in RR/Gauntlet standings"
```

---

## Task 5: Update the `?simulate` suite (`expectedTable` + `checkTable`)

**Files:**
- Modify: `index.html` `expectedTable` (~3847–3877)
- Modify: `index.html` `checkTable` (~3899–3915)

> `expectedTable` is the simulation's independent re-derivation of the standings. It must now mirror the Adjusted Margin algorithm (regular-round games only) and `checkTable` must read the AM cell instead of PPG.

- [ ] **Step 1: Run the simulation to confirm it currently fails**

Open `http://localhost:8731/index.html?simulate`.
Expected: failures > 0 (rendered tables now show AM in cell 3 and are ordered by AM, but `expectedTable` still computes PPG order and `checkTable` still compares cell 3 to `ppg`).

- [ ] **Step 2: Rewrite `expectedTable`**

Replace the entire `expectedTable` function (from its `// Independent expectations …` comment through its closing brace, ~3845–3877) with:

```javascript
  // Independent expectations from the entered scores, following the Adjusted
  // Margin rules: adjScore (diminishing-returns margin + opponent/partner
  // strength, regular rounds only) → win rate → head-to-head → tiebreakRandom.
  function expectedTable(games, tieRand) {
    const st = {};
    for (let s = 1; s <= 8; s++) st[s] = { slot: s, pts: 0, w: 0, l: 0, diff: 0, gp: 0, rgp: 0, sumMs: 0 };
    const ms = g => Math.sign(g.s1 - g.s2) * Math.sqrt(Math.abs(g.s1 - g.s2));
    for (const g of games) {
      const t1w = g.s1 > g.s2, t2w = g.s2 > g.s1;
      const m1 = ms(g);
      for (const s of g.t1) { st[s].pts += g.s1; st[s].diff += g.s1 - g.s2; st[s].gp++; if (t1w) st[s].w++; if (t2w) st[s].l++; if (!g.final) { st[s].rgp++; st[s].sumMs += m1; } }
      for (const s of g.t2) { st[s].pts += g.s2; st[s].diff += g.s2 - g.s1; st[s].gp++; if (t2w) st[s].w++; if (t1w) st[s].l++; if (!g.final) { st[s].rgp++; st[s].sumMs -= m1; } }
    }
    const base = {}, strength = {};
    let fSum = 0, fCount = 0;
    for (let s = 1; s <= 8; s++) { if (st[s].rgp > 0) { base[s] = st[s].sumMs / st[s].rgp; fSum += base[s]; fCount++; } else base[s] = 0; }
    const fieldAvg = fCount ? fSum / fCount : 0;
    for (let s = 1; s <= 8; s++) strength[s] = st[s].rgp > 0 ? base[s] - fieldAvg : 0;
    const K = 0.5, CAP = 1.0, clamp = x => Math.max(-CAP, Math.min(CAP, x));
    const credit = {};
    for (let s = 1; s <= 8; s++) credit[s] = 0;
    const addC = (team, opp, m) => {
      const O = (strength[opp[0]] + strength[opp[1]]) / 2;
      for (let k = 0; k < team.length; k++) {
        const P = strength[team[k === 0 ? 1 : 0]];
        credit[team[k]] += m + clamp(K * (O - P));
      }
    };
    for (const g of games) { if (g.final) continue; const m1 = ms(g); addC(g.t1, g.t2, m1); addC(g.t2, g.t1, -m1); }
    const h2h = (a, b) => {                       // regular rounds only, like headToHead()
      let d = 0;
      for (const g of games) {
        if (g.final) continue;
        if (g.t1.includes(a) && g.t2.includes(b)) d += g.s1 - g.s2;
        else if (g.t2.includes(a) && g.t1.includes(b)) d += g.s2 - g.s1;
      }
      return d;
    };
    return Object.values(st).map(s => ({
      ...s,
      ppg: s.pts / Math.max(1, s.gp),
      wg: s.w / Math.max(1, s.gp),
      dg: s.diff / Math.max(1, s.gp),
      adjScore: s.rgp > 0 ? credit[s.slot] / s.rgp : 0,
    })).sort((x, y) => {
      if (x.gp === 0 || y.gp === 0) {
        if (x.gp !== y.gp) return x.gp === 0 ? 1 : -1;
        return tieRand.indexOf(x.slot - 1) - tieRand.indexOf(y.slot - 1);
      }
      return y.adjScore - x.adjScore || y.wg - x.wg || -h2h(x.slot, y.slot) ||
        (tieRand.indexOf(x.slot - 1) - tieRand.indexOf(y.slot - 1));
    });
  }
```

- [ ] **Step 3: Update `checkTable` to read the AM cell**

In `checkTable` (~3899–3915), find:

```javascript
        gp: tr.cells[2].textContent, ppg: tr.cells[3].textContent,
        wg: tr.cells[4].textContent, diff: tr.cells[5].textContent,
```

Replace with:

```javascript
        gp: tr.cells[2].textContent, am: tr.cells[3].textContent,
        wg: tr.cells[4].textContent, diff: tr.cells[5].textContent,
```

Then find:

```javascript
        r.name === e.name && r.gp === String(e.gp) && r.ppg === fmtRate(e.ppg)
          && r.wg === fmtRate(e.wg) && r.diff === fmtDiff(e.dg),
```

Replace with:

```javascript
        r.name === e.name && r.gp === String(e.gp) && r.am === fmtRate(e.adjScore)
          && r.wg === fmtRate(e.wg) && r.diff === fmtDiff(e.dg),
```

- [ ] **Step 4: Run the simulation to verify it passes**

Open `http://localhost:8731/index.html?simulate`.
Expected: `[simulate] complete — 0 failure(s) across …`.

> If a row mismatch appears only on the AM cell by a rounding edge (e.g. `1.2` vs `1.3`), it means the app and `expectedTable` accumulate the per-game credit in a different order. Confirm both iterate games in `state.rounds` order and sum `team1` before `team2` (they do as written); the arithmetic is identical, so a true mismatch indicates a real ordering bug to fix, not a tolerance to loosen.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "test(ranking): mirror Adjusted Margin in the simulation suite"
```

---

## Task 6: Update player-facing copy and code comments

**Files:**
- Modify: `index.html` format-description strings (~7740, ~7760)
- Modify: `index.html` comments (~5559, ~7070, ~3846 — the `expectedTable` comment was already updated in Task 5)

- [ ] **Step 1: Update the Gauntlet description string**

Find (~7760):

```javascript
  "After every round, players are re-ranked by per-game performance (points/game → wins/game → differential/game → head-to-head).",
```

Replace with:

```javascript
  "After every round, players are re-ranked by Adjusted Margin (diminishing-returns point margin, weighted by who they played with and against) → win rate → head-to-head.",
```

- [ ] **Step 2: Check the finals/tier tiebreaker string**

Find (~7740):

```javascript
  "Tiebreakers (within tier): match points → points scored → point differential → random draw.",
```

This describes the **finals/tier** tiebreaker, which is unchanged by this work. Leave it as-is. (No edit — this step is a verification that it is out of scope.)

- [ ] **Step 3: Update the Gauntlet code comment**

Find (~5559):

```javascript
// Reuses existing rankPlayers() (points scored → wins → diff → h2h) — no new stats needed.
```

Replace with:

```javascript
// Reuses existing rankPlayers() (Adjusted Margin → win rate → h2h) — no new stats needed.
```

- [ ] **Step 4: Update the rankPlayersForFormat comment**

Find (~7070):

```javascript
  return rankPlayers(throughRound); // rr, gauntlet: same ranking
```

Leave the code; this comment is still accurate. (No edit — verification step.)

- [ ] **Step 5: Verify no other stale ranking copy remains**

Run:

```bash
grep -nE "points/game|points scored → wins|points → wins|per-game performance" index.html
```

Expected: no remaining matches that describe the **RR/Gauntlet** ranking order as points-first. (Matches inside finals/tier tiebreaker copy or award text like "pts/game" MVP labels are out of scope and may remain.)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "docs(ranking): update in-app copy to describe Adjusted Margin"
```

---

## Task 7: Full verification & manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run both suites**

Open `http://localhost:8731/index.html?test` → expect `[self-tests] complete — 0 failure(s)`.
Open `http://localhost:8731/index.html?simulate` → expect `[simulate] complete — 0 failure(s) across …`.

- [ ] **Step 2: Manual smoke test — the original complaint**

Open `http://localhost:8731/index.html`. Start a Round Robin. Enter scores so that one player wins a deuce nail-biter (e.g. 13–11) and another wins a blowout (e.g. 11–3) in comparable spots. Confirm on the Live Standings that the **blowout winner ranks at or above the deuce winner**, and that the column header reads **AM** (not PPG).

- [ ] **Step 3: Manual smoke test — finals seeding**

Play through to finals. Confirm the Championship bracket is seeded 1+4 vs 2+3 from the AM standings, and that finishing the finals does not reorder the regular-season AM numbers shown on the done screen.

- [ ] **Step 4: Confirm the explainer page still matches**

Open `docs/how-standings-work.html`. Confirm the documented constants (`k = 0.5`, cap `C = 1.0`, √ curve) and tiebreaker chain match what was implemented. If anything was tuned during implementation, update the page and `docs/superpowers/specs/2026-06-13-strength-adjusted-margin-ranking-design.md` to match.

- [ ] **Step 5: Final commit (if Step 4 required doc edits)**

```bash
git add docs/how-standings-work.html docs/superpowers/specs/2026-06-13-strength-adjusted-margin-ranking-design.md
git commit -m "docs(ranking): sync explainer and spec with implemented constants"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** Layer 1 (Task 1–2), Layer 2/3 strength (Task 2), tiebreaker chain (Task 3), display headline (Task 4), finals seeding (inherited via `rankPlayers`, verified Task 7), decided-games-only & byes (inherited from `computeStats`, exercised in Task 2 tests), copy (Task 6). Stack/King explicitly untouched.
- **Out of scope (intentionally left):** the "pts/game" MVP/award labels and recap strings (~3416, ~6196, ~6559, ~6565, ~10232, ~10299, ~10351); the finals/tier tiebreaker copy (~7740). These are informational, not the RR/Gauntlet ranking. Flag to the user if they want them changed too.
- **Key invariant to preserve:** `MARGIN_ADJ_CAP` must stay `< Math.SQRT2` or the sign-invariant test (Task 2c) will fail by design.
