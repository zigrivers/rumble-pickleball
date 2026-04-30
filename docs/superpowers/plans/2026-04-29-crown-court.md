# Crown Court Format — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4-player "Crown Court" tournament format to pickleball.html — 3 best-of-3 round-robin matches with themed scoring, followed by a Championship Crown Match.

**Architecture:** All code lives in the single `pickleball.html` file. Crown Court adds a parallel code path (new functions prefixed `crown*`) that activates when `state.format === "crown"`. The phase machine gains a `"crown"` phase. Storage key bumps to v3 with v2 migration.

**Tech Stack:** Vanilla JS, single HTML file, `el()` DOM helper, localStorage persistence, `?test` self-test harness.

---

## Key State Shape for Crown Court

```js
// newState() when format === "crown":
// NOTE: rawNames and slots remain 8-element arrays (same as RR/Stack) to avoid
// data loss when switching formats. Crown only reads/displays the first 4 elements.
{
  phase: "setup" | "playing" | "crown" | "done",
  format: "crown",
  rawNames: ["","","","","","","",""],  // always 8 elements; Crown displays first 4
  slots: ["A","B","C","D","","","",""], // always 8 elements; Crown fills [0..3], rest ""
  tiebreakRandom: [0,1,2,3],
  crownMatches: [               // 3 matches, populated on Start
    {
      team1: [1,2], team2: [3,4],   // slots, fixed by CROWN_SCHEDULE
      games: [
        {score1:null,score2:null},   // Game 1
        {score1:null,score2:null},   // Game 2
        {score1:null,score2:null},   // Game 3 (may not be entered)
      ],
    },
    { team1:[1,3], team2:[2,4], games:[...] },
    { team1:[1,4], team2:[2,3], games:[...] },
  ],
  currentMatch: 0,  // 0-based index into crownMatches (playing phase only)
  crownFinal: null, // { team1:[], team2:[], games:[{s1,s2}×3] }
  awardsShown: false,
  winScore: 11,
}
```

## Match Points Logic

```js
// matchPointsForMatch(gamesWonA, gamesWonB, theme) → {perWinner, perLoser}
// theme: "Opening" | "Power Round" | "Sudden Death" | "Crown"
const multiplier = theme === "Power Round" ? 1.5 : theme === "Crown" ? 2 : 1;
// sweep = 3 × multiplier per winner, 0 per loser
// close = 2 × multiplier per winner, 1 × multiplier per loser
```

---

## Task 1: Constants, State Model, Storage Migration

**Files:**
- Modify: `pickleball.html` (lines ~1017–1501)

- [ ] **Step 1.1: Add CROWN_SCHEDULE and CROWN_THEMES constants** (after SCHEDULE const, ~line 1029)

```js
const CROWN_SCHEDULE = [
  { team1: [1,2], team2: [3,4], theme: "Opening",      name: "Round 1 — Opening" },
  { team1: [1,3], team2: [2,4], theme: "Power Round",  name: "Round 2 — Power Round" },
  { team1: [1,4], team2: [2,3], theme: "Sudden Death", name: "Round 3 — Sudden Death" },
];
const CROWN_THEMES = {
  "Opening":     { winScore: 11, winBy: 2, scoring: "sideout", matchPointMultiplier: 1 },
  "Power Round": { winScore: 11, winBy: 2, scoring: "sideout", matchPointMultiplier: 1.5 },
  "Sudden Death":{ winScore: 7,  winBy: 2, scoring: "rally",   matchPointMultiplier: 1 },
  "Crown":       { winScore: 11, winBy: 2, scoring: "sideout", matchPointMultiplier: 2 },
};
```

- [ ] **Step 1.2: Bump STORAGE_KEY to v3, add v2 key**

```js
const STORAGE_KEY    = "pb_tourney_v3";
const STORAGE_KEY_V2 = "pb_tourney_v2";
const STORAGE_KEY_V1 = "pb_tourney_v1";
```

- [ ] **Step 1.3: Update newState() to support crown format**

Add to newState() return object:
```js
crownMatches: [],
currentMatch: 0,
crownFinal: null,
```
Keep rawNames/slots as 8-element arrays in newState() — Crown setup will trim them to 4.

- [ ] **Step 1.4: Update backfillStateDefaults() for v3**

```js
function backfillStateDefaults(obj) {
  if (typeof obj.awardsShown !== "boolean") obj.awardsShown = false;
  if (typeof obj.winScore !== "number") obj.winScore = 11;
  if (!Array.isArray(obj.notifiedRounds)) obj.notifiedRounds = [];
  if (!["stack","crown"].includes(obj.format)) obj.format = "rr";
  if (typeof obj.stackRounds !== "number") obj.stackRounds = 8;
  if (!Array.isArray(obj.previousRanks)) obj.previousRanks = [];
  if (typeof obj.keepAwake !== "boolean") obj.keepAwake = true;
  if (typeof obj.keepAwakeAggressive !== "boolean") obj.keepAwakeAggressive = false;
  // Crown fields
  if (!Array.isArray(obj.crownMatches)) obj.crownMatches = [];
  if (typeof obj.currentMatch !== "number") obj.currentMatch = 0;
  if (obj.crownFinal === undefined) obj.crownFinal = null;
  return obj;
}
```

- [ ] **Step 1.5: Update load() for v2 → v3 migration**

```js
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && obj.phase) return backfillStateDefaults(obj);
    }
    // v2 migration: load as-is (backfill handles missing crown fields)
    const v2raw = localStorage.getItem(STORAGE_KEY_V2);
    if (v2raw) {
      const v2 = JSON.parse(v2raw);
      if (v2 && v2.phase) {
        const migrated = backfillStateDefaults(v2);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          localStorage.removeItem(STORAGE_KEY_V2);
        } catch (e) {}
        return migrated;
      }
    }
    // v1 migration (existing code, unchanged)
    const v1raw = localStorage.getItem(STORAGE_KEY_V1);
    if (v1raw) {
      const v1 = JSON.parse(v1raw);
      if (v1 && v1.phase) {
        const migrated = backfillStateDefaults(v1);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          localStorage.removeItem(STORAGE_KEY_V1);
        } catch (e) {}
        return migrated;
      }
    }
    return null;
  } catch (e) { return null; }
}
```

---

## Task 2: Pure Logic Functions

**Files:**
- Modify: `pickleball.html` (after Stack engine section, ~line 1975)

- [ ] **Step 2.1: Add matchPointsForMatch()**

```js
function matchPointsForMatch(gamesWonA, gamesWonB, theme) {
  const m = (CROWN_THEMES[theme] || {}).matchPointMultiplier || 1;
  if (gamesWonA === 2 && gamesWonB === 0) return { perWinner: 3 * m, perLoser: 0 };
  if (gamesWonB === 2 && gamesWonA === 0) return { perWinner: 3 * m, perLoser: 0 };
  if (gamesWonA === 2 && gamesWonB === 1) return { perWinner: 2 * m, perLoser: 1 * m };
  if (gamesWonB === 2 && gamesWonA === 1) return { perWinner: 2 * m, perLoser: 1 * m };
  return { perWinner: 0, perLoser: 0 };
}
```

Note: returns per-player points. Caller determines which team won.

- [ ] **Step 2.2: Add crown match helper functions**

```js
// Returns { gamesWon1, gamesWon2 } from a crown match's games array.
// Processes games strictly in order; stops at the first incomplete OR tied game.
// This prevents: (a) out-of-order score entry polluting counts, (b) stale Game 3 scores
// remaining after Game 2 is edited into a sweep, (c) a tied game counting as a "game played".
function crownGamesWon(match) {
  let w1 = 0, w2 = 0;
  for (const g of match.games) {
    if (!Number.isInteger(g.score1) || !Number.isInteger(g.score2)) break; // stop at incomplete
    if (g.score1 === g.score2) break; // stop at tie (tie must be resolved before proceeding)
    if (g.score1 > g.score2) w1++;
    else w2++;
    if (w1 === 2 || w2 === 2) break; // match decided
  }
  return { gamesWon1: w1, gamesWon2: w2 };
}

// Is match complete? (team won 2 games, or both teams won 1 and game 3 complete)
// Design note: Like the existing RR/Stack code, the app accepts any non-tied integer scores
// entered by players. The win target (11 or 7) is advisory/social, not technically enforced.
// isCrownMatchComplete only checks that a non-tied score pair exists for the games played.
function isCrownMatchComplete(match) {
  const { gamesWon1, gamesWon2 } = crownGamesWon(match);
  if (gamesWon1 === 2 || gamesWon2 === 2) return true;
  // 1-1 tie: check if game 3 is complete
  if (gamesWon1 === 1 && gamesWon2 === 1) {
    const g3 = match.games[2];
    return Number.isInteger(g3.score1) && Number.isInteger(g3.score2) && g3.score1 !== g3.score2;
  }
  return false;
}

// Which team won the match? "team1" | "team2" | null (incomplete or tied)
function crownMatchWinner(match) {
  if (!isCrownMatchComplete(match)) return null;
  const { gamesWon1, gamesWon2 } = crownGamesWon(match);
  if (gamesWon1 === gamesWon2) return null; // defensive — should not occur if match is complete
  return gamesWon1 > gamesWon2 ? "team1" : "team2";
}
```

- [ ] **Step 2.3: Add crownPlayerStats() — per-player regular-season stats**

```js
// Returns array of 4 stat objects, one per Crown slot (1-4).
function crownPlayerStats() {
  const stats = [1,2,3,4].map(slot => ({
    slot, name: nameOf(slot),
    matchPoints: 0,
    gamesWon: 0, gamesLost: 0,
    pointsScored: 0, pointDiff: 0,
  }));

  for (const match of state.crownMatches) {
    if (!isCrownMatchComplete(match)) continue;
    const { gamesWon1, gamesWon2 } = crownGamesWon(match);
    const theme = CROWN_SCHEDULE[state.crownMatches.indexOf(match)].theme;
    const winner = crownMatchWinner(match);
    const pts = matchPointsForMatch(gamesWon1, gamesWon2, theme);
    const winTeam  = winner === "team1" ? match.team1 : match.team2;
    const loseTeam = winner === "team1" ? match.team2 : match.team1;
    for (const slot of winTeam) {
      const s = stats[slot - 1];
      s.matchPoints += pts.perWinner;
    }
    for (const slot of loseTeam) {
      const s = stats[slot - 1];
      s.matchPoints += pts.perLoser;
    }
    // Game records + points scored — only count games up to the decided point.
    // crownGamesWon already breaks early, but stat accumulation needs the same boundary.
    // Re-derive valid games by replaying the same early-exit logic:
    const games = [];
    let _w1 = 0, _w2 = 0;
    for (const g of match.games) {
      if (!Number.isInteger(g.score1) || !Number.isInteger(g.score2)) break; // stop at gap, don't skip
      games.push(g);
      if (g.score1 > g.score2) _w1++; else if (g.score2 > g.score1) _w2++;
      if (_w1 === 2 || _w2 === 2) break;
    }
    for (const g of games) {
      const t1Win = g.score1 > g.score2;
      for (const slot of match.team1) {
        const s = stats[slot - 1];
        s.pointsScored += g.score1;
        s.pointDiff += (g.score1 - g.score2);
        if (t1Win) s.gamesWon++; else if (g.score2 > g.score1) s.gamesLost++;
      }
      for (const slot of match.team2) {
        const s = stats[slot - 1];
        s.pointsScored += g.score2;
        s.pointDiff += (g.score2 - g.score1);
        if (!t1Win && g.score2 > g.score1) s.gamesWon++; else if (t1Win) s.gamesLost++;
      }
    }
  }
  return stats;
}
```

- [ ] **Step 2.4: Add crownLeaderboard() — sorted regular-season ranking**

```js
function crownLeaderboard() {
  const stats = crownPlayerStats();
  const tieRand = state.tiebreakRandom || [0,1,2,3];
  stats.sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    if (b.pointsScored !== a.pointsScored) return b.pointsScored - a.pointsScored;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    return tieRand.indexOf(a.slot - 1) - tieRand.indexOf(b.slot - 1);
  });
  return stats;
}
```

- [ ] **Step 2.5: Add crownPairings() — Crown Match team assignments**

```js
// Returns { team1: [rank1Slot, rank4Slot], team2: [rank2Slot, rank3Slot] }
function crownPairings(leaderboard) {
  return {
    team1: [leaderboard[0].slot, leaderboard[3].slot],
    team2: [leaderboard[1].slot, leaderboard[2].slot],
  };
}
```

- [ ] **Step 2.6: Add finalRankingCrown() — post-Crown final ranking**

```js
// Returns 4 stat objects in final rank order.
// Crown Match winners outrank losers; within each tier, order by total match pts
// (regular + Crown Match) → points scored → point diff → tiebreakRandom.
function finalRankingCrown() {
  if (!state.crownFinal || !isCrownMatchComplete(state.crownFinal)) {
    return crownLeaderboard();
  }
  const winner = crownMatchWinner(state.crownFinal);
  const crownWinTeam  = winner === "team1" ? state.crownFinal.team1 : (winner === "team2" ? state.crownFinal.team2 : null);
  const crownLoseTeam = winner === "team1" ? state.crownFinal.team2 : (winner === "team2" ? state.crownFinal.team1 : null);
  if (!crownWinTeam || !crownLoseTeam) return crownLeaderboard(); // defensive: tied match

  // Compute total match points including Crown Match
  const stats = crownPlayerStats();
  const { gamesWon1: cw1, gamesWon2: cw2 } = crownGamesWon(state.crownFinal);
  const crownPts = matchPointsForMatch(cw1, cw2, "Crown");
  for (const slot of crownWinTeam) stats[slot-1].matchPoints += crownPts.perWinner;
  for (const slot of crownLoseTeam) stats[slot-1].matchPoints += crownPts.perLoser;
  // Add Crown Match game stats — apply the same early-exit boundary as crownGamesWon()
  // to prevent stale Game 3 scores from inflating stats after a sweep edit.
  const crownFinalValidGames = [];
  { let _cw1 = 0, _cw2 = 0;
    for (const g of state.crownFinal.games) {
      if (!Number.isInteger(g.score1) || !Number.isInteger(g.score2)) break; // stop at gap
      crownFinalValidGames.push(g);
      if (g.score1 > g.score2) _cw1++; else if (g.score2 > g.score1) _cw2++;
      if (_cw1 === 2 || _cw2 === 2) break;
    }
  }
  for (const g of crownFinalValidGames) {
    const t1win = g.score1 > g.score2;
    for (const slot of state.crownFinal.team1) {
      stats[slot-1].pointsScored += g.score1;
      stats[slot-1].pointDiff += (g.score1 - g.score2);
      if (t1win) stats[slot-1].gamesWon++; else if (g.score2 > g.score1) stats[slot-1].gamesLost++;
    }
    for (const slot of state.crownFinal.team2) {
      stats[slot-1].pointsScored += g.score2;
      stats[slot-1].pointDiff += (g.score2 - g.score1);
      if (!t1win && g.score2 > g.score1) stats[slot-1].gamesWon++; else if (t1win) stats[slot-1].gamesLost++;
    }
  }

  const bySlot = new Map(stats.map(s => [s.slot, s]));
  const tieRand = state.tiebreakRandom || [0,1,2,3];
  const sortWithin = arr => arr.slice().sort((a, b) => {
    const sa = bySlot.get(a), sb = bySlot.get(b);
    if (sb.matchPoints !== sa.matchPoints) return sb.matchPoints - sa.matchPoints;
    if (sb.pointsScored !== sa.pointsScored) return sb.pointsScored - sa.pointsScored;
    if (sb.pointDiff !== sa.pointDiff) return sb.pointDiff - sa.pointDiff;
    return tieRand.indexOf(a - 1) - tieRand.indexOf(b - 1);
  });
  const ordered = [...sortWithin(crownWinTeam), ...sortWithin(crownLoseTeam)];
  return ordered.map(slot => bySlot.get(slot));
}
```

---

## Task 3: Self-Tests

**Files:**
- Modify: `pickleball.html` (inside `runSelfTests()`, after existing tests, ~line 1432)

- [ ] **Step 3.1: Add matchPointsForMatch tests**

```js
// matchPointsForMatch
{
  const r1 = matchPointsForMatch(2, 0, "Opening");
  console.assert(r1.perWinner === 3 && r1.perLoser === 0, "matchPointsForMatch(2,0,Opening)", r1);
  const r2 = matchPointsForMatch(2, 1, "Opening");
  console.assert(r2.perWinner === 2 && r2.perLoser === 1, "matchPointsForMatch(2,1,Opening)", r2);
  const r3 = matchPointsForMatch(2, 0, "Power Round");
  console.assert(r3.perWinner === 4.5 && r3.perLoser === 0, "matchPointsForMatch(2,0,PowerRound)", r3);
  const r4 = matchPointsForMatch(2, 1, "Power Round");
  console.assert(r4.perWinner === 3 && r4.perLoser === 1.5, "matchPointsForMatch(2,1,PowerRound)", r4);
  const r5 = matchPointsForMatch(2, 0, "Sudden Death");
  console.assert(r5.perWinner === 3 && r5.perLoser === 0, "matchPointsForMatch(2,0,SuddenDeath)", r5);
  const r6 = matchPointsForMatch(2, 0, "Crown");
  console.assert(r6.perWinner === 6 && r6.perLoser === 0, "matchPointsForMatch(2,0,Crown)", r6);
  const r7 = matchPointsForMatch(2, 1, "Crown");
  console.assert(r7.perWinner === 4 && r7.perLoser === 2, "matchPointsForMatch(2,1,Crown)", r7);
}
```

- [ ] **Step 3.2: Add crown pairings tests**

```js
// crownPairings: rank1+4 vs rank2+3
{
  const lb = [
    { slot: 1, matchPoints: 8, pointsScored: 100, pointDiff: 20 },
    { slot: 2, matchPoints: 6, pointsScored: 90, pointDiff: 10 },
    { slot: 3, matchPoints: 5, pointsScored: 80, pointDiff: 5 },
    { slot: 4, matchPoints: 3, pointsScored: 60, pointDiff: -5 },
  ];
  const p = crownPairings(lb);
  console.assert(p.team1.includes(1) && p.team1.includes(4), "crownPairings team1 = rank1+4", p);
  console.assert(p.team2.includes(2) && p.team2.includes(3), "crownPairings team2 = rank2+3", p);
}
```

- [ ] **Step 3.3: Add isCrownMatchComplete and match winner tests**

```js
// Match completion: 2-0 ends early, 1-1 forces game 3
{
  const sweep = {
    team1: [1,2], team2: [3,4],
    games: [
      { score1: 11, score2: 5 },
      { score1: 11, score2: 7 },
      { score1: null, score2: null },
    ],
  };
  console.assert(isCrownMatchComplete(sweep), "2-0 sweep is complete");
  console.assert(crownMatchWinner(sweep) === "team1", "2-0 sweep winner is team1");

  const tied = {
    team1: [1,2], team2: [3,4],
    games: [
      { score1: 11, score2: 5 },
      { score1: 5, score2: 11 },
      { score1: null, score2: null },
    ],
  };
  console.assert(!isCrownMatchComplete(tied), "1-1 with no game 3 is not complete");

  const decided = {
    team1: [1,2], team2: [3,4],
    games: [
      { score1: 11, score2: 5 },
      { score1: 5, score2: 11 },
      { score1: 11, score2: 9 },
    ],
  };
  console.assert(isCrownMatchComplete(decided), "1-1 game3 complete is done");
  console.assert(crownMatchWinner(decided) === "team1", "team1 wins game3");
}
```

- [ ] **Step 3.4: Add finalRankingCrown tests**

```js
// finalRankingCrown: Crown winners rank above losers regardless of regular-season pts
{
  const saved = state;
  // Set up 3 complete RR matches where slots 3,4 dominate regular season
  const makeCrownMatch = (t1, t2, gw1, gw2, theme) => ({
    team1: t1, team2: t2,
    games: gw1 === 2 && gw2 === 0
      ? [{ score1:11, score2:5 }, { score1:11, score2:5 }, { score1:null, score2:null }]
      : gw1 === 0 && gw2 === 2
        ? [{ score1:5, score2:11 }, { score1:5, score2:11 }, { score1:null, score2:null }]
        : [{ score1:11, score2:5 }, { score1:5, score2:11 }, { score1:11, score2:9 }],
  });
  state = {
    phase: "done",
    format: "crown",
    slots: ["A","B","C","D"],
    crownMatches: [
      makeCrownMatch([1,2],[3,4], 0, 2, "Opening"),     // 3,4 sweep
      makeCrownMatch([1,3],[2,4], 0, 2, "Power Round"),  // 2,4 sweep (1.5x)
      makeCrownMatch([1,4],[2,3], 0, 2, "Sudden Death"), // 2,3 sweep
    ],
    crownFinal: {
      // Crown match: leaderboard would put 3,4 at top; pairing = {1+4} vs {2+3} maybe
      // Let's just say team1=[1,2] beats team2=[3,4] in Crown
      team1: [1,2], team2: [3,4],
      games: [
        { score1: 11, score2: 5 },
        { score1: 11, score2: 7 },
        { score1: null, score2: null },
      ],
    },
    tiebreakRandom: [0,1,2,3],
    awardsShown: false,
  };
  const ranking = finalRankingCrown();
  console.assert(ranking.length === 4, "finalRankingCrown returns 4 players");
  // Crown winners (1,2) must be in positions 0,1
  const topTwo = [ranking[0].slot, ranking[1].slot].sort();
  console.assert(topTwo[0] === 1 && topTwo[1] === 2, "Crown winners rank top 2", topTwo);
  const bottomTwo = [ranking[2].slot, ranking[3].slot].sort();
  console.assert(bottomTwo[0] === 3 && bottomTwo[1] === 4, "Crown losers rank bottom 2", bottomTwo);
  state = saved;
}
```

- [ ] **Step 3.5: Add v2 → v3 migration test**

```js
// v2 → v3 migration: existing v2 state loads as rr/stack with no data loss
{
  const savedV3 = localStorage.getItem(STORAGE_KEY);
  const savedV2 = localStorage.getItem(STORAGE_KEY_V2); // preserve any real v2 tournament
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY_V2);
  const v2state = {
    phase: "playing",
    format: "rr",
    rawNames: ["A","B","C","D","E","F","G","H"],
    slots:    ["A","B","C","D","E","F","G","H"],
    currentRound: 3,
    rounds: SCHEDULE.slice(0,3).map((rd, i) => ({
      round: i + 1,
      court1: { team1: rd[0][0].slice(), team2: rd[0][1].slice(), score1: 11, score2: 5 },
      court2: { team1: rd[1][0].slice(), team2: rd[1][1].slice(), score1: 11, score2: 7 },
    })),
    finals: null,
    tiebreakRandom: [0,1,2,3,4,5,6,7],
    awardsShown: false, winScore: 11, notifiedRounds: [],
    stackRounds: 8, previousRanks: [], keepAwake: true, keepAwakeAggressive: false,
  };
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(v2state));
  const migrated = load();
  console.assert(migrated && migrated.format === "rr", "v2→v3 migration: format preserved", migrated?.format);
  console.assert(migrated && migrated.currentRound === 3, "v2→v3 migration: currentRound preserved");
  console.assert(migrated && Array.isArray(migrated.crownMatches), "v2→v3 migration: crownMatches backfilled");
  console.assert(localStorage.getItem(STORAGE_KEY_V2) === null, "v2 key cleared after migration");
  console.assert(localStorage.getItem(STORAGE_KEY) !== null, "v3 key written after migration");
  localStorage.removeItem(STORAGE_KEY_V2);
  localStorage.removeItem(STORAGE_KEY);
  if (savedV3 !== null) localStorage.setItem(STORAGE_KEY, savedV3);
  if (savedV2 !== null) localStorage.setItem(STORAGE_KEY_V2, savedV2); // restore real v2 if any
}
```

---

## Task 4: Setup UI (Crown-Aware)

**Files:**
- Modify: `pickleball.html` (parsePastedNames, canStart, renderFormatChooser, renderSetup)

- [ ] **Step 4.1: Update parsePastedNames() to accept count parameter**

```js
function parsePastedNames(text, count) {
  count = count || 8;
  const parts = String(text || "")
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(Boolean);
  const lower = parts.map(s => s.toLowerCase());
  const uniqueCount = new Set(lower).size;
  if (parts.length !== count || uniqueCount !== count) {
    return { ok: false, count: parts.length, error:
      `found ${parts.length}${parts.length === uniqueCount ? "" : ` (${parts.length - uniqueCount} duplicate)`} — need ${count} unique names` };
  }
  return { ok: true, names: parts };
}
```

Existing tests don't pass a count, so they still validate for 8. No regression.

- [ ] **Step 4.2: Update canStart() for Crown (4 names)**

```js
function canStart() {
  const count = state.format === "crown" ? 4 : 8;
  const trimmed = (state.rawNames || []).slice(0, count).map(n => (n || "").trim());
  if (trimmed.length < count || trimmed.some(n => !n)) return false;
  return new Set(trimmed.map(n => n.toLowerCase())).size === count;
}
```

- [ ] **Step 4.3: Update renderFormatChooser() to add Crown Court option**

Add to opts array:
```js
{ id: "crown", title: "Crown Court", blurb: "4 players, 3 themed rounds + a Championship Crown Match." },
```

Change grid to 3 options (or keep 1fr 1fr and let Crown wrap — either works). Add `grid-template-columns: 1fr 1fr 1fr` or keep as-is with `format-options` auto-wrapping.

- [ ] **Step 4.4: Update renderSetup() for 4-slot Crown**

In renderSetup(), make the player count dynamic:
```js
const playerCount = state.format === "crown" ? 4 : 8;
const pasteCount = playerCount;
// Ensure rawNames has at least playerCount entries
while (state.rawNames.length < playerCount) state.rawNames.push("");

card.querySelector("h2").textContent = "Enter " + playerCount + " Players";
// Loop for playerCount instead of 8
for (let i = 0; i < playerCount; i++) { ... }
```

**Do NOT modify rawNames length for Crown.** Keep rawNames as an 8-element array at all times. Only display the first 4 input fields when format === "crown". This preserves players 5–8 if the user switches formats mid-setup.

Update paste modal to use `parsePastedNames(text, playerCount)` and show "Paste 4 names" for Crown. In the paste result handler, only write to `rawNames[0..playerCount-1]` — do not touch indices beyond `playerCount`:

```js
// Paste result handler (Crown-safe):
for (let i = 0; i < playerCount; i++) {
  state.rawNames[i] = result.names[i] || "";
}
// rawNames[playerCount..7] are intentionally left unchanged
```

- [ ] **Step 4.5: Update renderRulesBlock() and rulesForActiveFormat() for Crown**

```js
function rulesForActiveFormat() {
  if (state.format === "stack") return RULES_STACK;
  if (state.format === "crown") return RULES_CROWN;
  return RULES_RR;
}
```

Add RULES_CROWN constant (see Task 10 for full text).

---

## Task 5: Tournament Start — Crown Path

**Files:**
- Modify: `pickleball.html` (startTournament, runShuffleReveal)

- [ ] **Step 5.1: Make runShuffleReveal() cell-count dynamic**

Change the hardcoded `8` references to `finalSlots.length`:
```js
// In the non-groups branch:
for (let i = 0; i < finalSlots.length; i++) { ... }
// In finish():
for (let i = 0; i < cells.length; i++) { ... }
// In tick():
const perm = shuffle(finalSlots);
for (let i = 0; i < cells.length; i++) cells[i].textContent = perm[i];
// Progressive lock-in:
const lockedCount = Math.min(cells.length, Math.floor((progress - 0.65) / 0.35 * cells.length) + 1);
for (let i = 0; i < lockedCount; i++) { ... }
```

- [ ] **Step 5.2: Add Crown path to startTournament()**

```js
function startTournament() {
  const isCrown = state.format === "crown";
  const count = isCrown ? 4 : 8;
  const names = state.rawNames.slice(0, count).map(s => s.trim());
  const shuffled = shuffle(names);
  // slots assignment is done inside the format branch below to ensure correct padding
  state.tiebreakRandom = shuffle(isCrown ? [0,1,2,3] : [0,1,2,3,4,5,6,7]);
  state.currentRound = 1;
  state.notifiedRounds = [];
  state.awardsShown = false;
  state.previousRanks = [];
  state.finals = null;

  if (isCrown) {
    // Store team1/team2 directly on each game object so renderTeamRow can reference them
    // without a spread-copy wrapper (which would break score mutations).
    state.crownMatches = CROWN_SCHEDULE.map(s => ({
      team1: s.team1.slice(),
      team2: s.team2.slice(),
      games: [
        { score1: null, score2: null, team1: s.team1.slice(), team2: s.team2.slice() },
        { score1: null, score2: null, team1: s.team1.slice(), team2: s.team2.slice() },
        { score1: null, score2: null, team1: s.team1.slice(), team2: s.team2.slice() },
      ],
    }));
    state.currentMatch = 0;
    state.crownFinal = null;
    // slots must always be 8 elements to avoid breaking nameOf() and format switching
    state.slots = [...shuffled, "", "", "", ""];
    state.phase = "playing";
    save();
    runShuffleReveal(shuffled.slice(), () => render());
  } else if (state.format === "stack") {
    state.slots = shuffled; // REQUIRED: assign before assignInitialStackCourts()
    // ... existing stack code unchanged ...
  } else {
    state.slots = shuffled; // REQUIRED: assign before generateRounds()
    // ... existing RR code unchanged ...
  }
}
```

---

## Task 6: Crown Playing Screen

**Files:**
- Modify: `pickleball.html` (renderPlaying, new renderCrownPlaying function)

The Crown playing screen shows one match at a time. Each match is best-of-3.

- [ ] **Step 6.0: Refactor renderTeamRow() 6th argument from seedInfo to opts object**

The existing `renderTeamRow(game, teamKey, scoreKey, otherScoreKey, refreshes, seedInfo)` treats the 6th argument as seed metadata and immediately dereferences `seedInfo.seeds.get(...)`. Passing `{ winScore: 7 }` without a `seeds` property will throw.

Refactor the 6th parameter from `seedInfo` → `opts`:

```js
// Old signature (do not use after this step):
function renderTeamRow(game, teamKey, scoreKey, otherScoreKey, refreshes, seedInfo) {
  // ... seedInfo.seeds.get(slot) ...
}

// New signature (return type is UNCHANGED — still `{ node, applyWinnerStyle }`):
function renderTeamRow(game, teamKey, scoreKey, otherScoreKey, refreshes, opts) {
  // Seed pills: opts.seeds replaces seedInfo.seeds
  const seeds = opts && opts.seeds ? opts.seeds : null;
  // Seed pill kind (e.g. "rr", "stack"): opts.kind replaces seedInfo.kind — passed to seedPill()
  const kind = opts && opts.kind != null ? opts.kind : null;
  // Quick-fill target: opts.winScore overrides global state.winScore
  const quickFillTarget = (opts && opts.winScore != null) ? opts.winScore : state.winScore;
  // Quick-fill pill phase guard: the existing code likely has `if (state.phase !== "playing") return;`
  // Update that guard to also allow Crown Match: `if (state.phase !== "playing" && state.phase !== "crown") return;`
  // This ensures quick-fill pills appear in Crown match cards (phase === "crown").
  // ... rest of function uses `seeds`, `kind`, and `quickFillTarget` instead of `seedInfo.seeds`, `seedInfo.kind`, and `state.winScore` ...
}
```

- [ ] **Sub-step: Update ALL existing callers (do this before moving to Step 6.1)**

Run `grep -n "renderTeamRow(" pickleball.html` and inspect every result. Update each call that currently passes a non-null 6th argument (the seedInfo object). Missing even one will throw a runtime error in RR and Stack tournaments. Change each one:

```js
// Old (example — actual call sites may differ slightly):
renderTeamRow(game, "team1", "score1", "score2", refreshes, seedInfo)
// New:
renderTeamRow(game, "team1", "score1", "score2", refreshes, { seeds: seedInfo.seeds })
// or if seedInfo also has a kind field:
renderTeamRow(game, "team1", "score1", "score2", refreshes, { seeds: seedInfo.seeds, kind: seedInfo.kind })
```

Callers that currently pass `null` or nothing as the 6th arg require no change.

Crown callers pass `{ winScore: themeConfig.winScore }` with no `seeds` key — correct, seed pills are skipped automatically.

**After the refactor, verify existing formats work before moving on:** Start an RR tournament and confirm seed pills appear in the court cards. Start a Stack tournament and confirm the same. A missed caller will throw a runtime error immediately on that screen.

- [ ] **Step 6.1: Route renderPlaying() to crown path**

```js
function renderPlaying() {
  if (state.format === "crown") return renderCrownPlaying();
  // ... existing code ...
}
```

- [ ] **Step 6.2: Add renderCrownPlaying()**

```js
function renderCrownPlaying() {
  const wrap = el("div");
  const match = state.crownMatches[state.currentMatch];
  const sched = CROWN_SCHEDULE[state.currentMatch];
  const theme = sched.theme;
  const themeConfig = CROWN_THEMES[theme];
  // Shared refreshes array passed to renderCrownMatchCard AND used by nav buttons below,
  // so button disabled state stays live as scores change (without a full render()).
  const refreshes = [];

  // Theme banner
  if (theme === "Power Round") {
    wrap.appendChild(el("div", {
      class: "card",
      style: "text-align:center;background:rgba(251,191,36,0.1);border-color:var(--accent);margin-bottom:14px;padding:12px;"
    }, "⚡ Power Round — match points worth 1.5×"));
  } else if (theme === "Sudden Death") {
    wrap.appendChild(el("div", {
      class: "card",
      style: "text-align:center;background:rgba(239,68,68,0.08);border-color:var(--bad);margin-bottom:14px;padding:12px;"
    }, "🔥 Sudden Death — rally scoring to 7, win by 2"));
  }

  // Match card — pass shared refreshes so nav buttons below can stay in sync
  wrap.appendChild(renderCrownMatchCard(match, sched, refreshes));

  // Navigation + advance
  // ... (see Step 6.5)

  // Match history (past completed matches, collapsible)
  const hist = renderCrownHistory();
  if (hist) wrap.appendChild(hist);

  // Live leaderboard — store reference so refresh callbacks can replace it in-place
  let standingsNode = renderCrownStandingsCard();
  wrap.appendChild(standingsNode);
  refreshes.push(() => {
    const updated = renderCrownStandingsCard();
    wrap.replaceChild(updated, standingsNode);
    standingsNode = updated;
  });

  return wrap;
}
```

- [ ] **Step 6.3: Add renderCrownMatchCard()**

The match card shows all 3 game input rows at once, matching the existing app pattern where all court scores are visible simultaneously. Game 3 row shows "Game 3 (if needed)" and is dimmed when not applicable. No dynamic game progression via render() — full re-renders only happen on explicit navigation buttons, preventing focus loss mid-input.

```js
// externalRefreshes: optional array — callers can push callbacks here to react to score changes
// without triggering a full render(). Used by renderCrownPlaying (nav buttons) and
// renderCrownPhaseScreen (finish button) to keep button disabled states live.
function renderCrownMatchCard(match, sched, externalRefreshes) {
  const refreshes = externalRefreshes || [];
  const themeConfig = CROWN_THEMES[sched.theme] || CROWN_THEMES["Opening"];
  const { gamesWon1, gamesWon2 } = crownGamesWon(match);
  const matchComplete = isCrownMatchComplete(match);
  const isSweep = (gamesWon1 === 2 && gamesWon2 === 0) || (gamesWon2 === 2 && gamesWon1 === 0);

  const card = el("div", { class: "court-card crown c1", style: "max-width:560px;margin:0 auto 14px;" });
  card.appendChild(el("div", { class: "court-label" }, "👑 " + sched.name.toUpperCase()));

  // Match score indicator — updated in-place by refreshes (no render() needed)
  const scoreIndicator = el("div", {
    style: "text-align:center;font-size:14px;color:var(--muted);margin-bottom:12px;"
  }, "Match score: " + gamesWon1 + "–" + gamesWon2);
  card.appendChild(scoreIndicator);

  if (sched.theme === "Sudden Death") {
    card.appendChild(renderRallyScoringHelp());
  }

  const crownOpts = { winScore: themeConfig.winScore };

  // Render all 3 game rows at once (same pattern as existing court score cards).
  // Game 3 is always rendered but labeled "if needed" and visually dimmed when a sweep happened.
  const gamesWrap = el("div");
  for (let gi = 0; gi < 3; gi++) {
    const game = match.games[gi];
    const isGame3 = gi === 2;
    const game3Needed = gamesWon1 === 1 && gamesWon2 === 1;
    const game3NotNeeded = isSweep;

    const gameCard = el("div", {
      style: "margin-bottom:10px;" + (isGame3 && game3NotNeeded ? "opacity:0.4;pointer-events:none;" : "")
    });
    const labelText = isGame3
      ? "Game 3" + (game3NotNeeded ? " (not needed — sweep)" : game3Needed ? " (play now)" : " (if needed)")
      : "Game " + (gi + 1);
    const labelEl = el("div", {
      class: "muted",
      style: "font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;"
    }, labelText);
    gameCard.appendChild(labelEl);

    const matchup = el("div", { class: "matchup" });
    const t1Wrap = renderTeamRow(game, "team1", "score1", "score2", refreshes, crownOpts);
    const t2Wrap = renderTeamRow(game, "team2", "score2", "score1", refreshes, crownOpts);
    matchup.appendChild(t1Wrap.node);
    matchup.appendChild(t2Wrap.node);
    gameCard.appendChild(matchup);

    const summary = el("div", { class: "court-summary" });
    gameCard.appendChild(summary);
    const capturedGame = game; // close over this game
    const updateSummary = () => {
      const s1 = capturedGame.score1, s2 = capturedGame.score2;
      if (Number.isInteger(s1) && Number.isInteger(s2)) {
        if (s1 > s2) { summary.className = "court-summary winmsg"; summary.textContent = "🎉 " + teamName(match.team1) + " win"; }
        else if (s2 > s1) { summary.className = "court-summary winmsg"; summary.textContent = "🎉 " + teamName(match.team2) + " win"; }
        else { summary.className = "court-summary tiemsg"; summary.textContent = "Tied — enter a tiebreaker"; }
      } else {
        summary.className = "court-summary";
        summary.textContent = "Awaiting scores";
      }
      t1Wrap.applyWinnerStyle();
      t2Wrap.applyWinnerStyle();
      // Update match score indicator in-place (no render() — avoids focus loss)
      const { gamesWon1: w1, gamesWon2: w2 } = crownGamesWon(match);
      scoreIndicator.textContent = "Match score: " + w1 + "–" + w2;
    };
    updateSummary();
    refreshes.push(updateSummary);
    // Note: do NOT call render() in refresh callbacks — it rebuilds the DOM and steals
    // input focus mid-entry (e.g., after typing "1" in "11"). Navigation buttons handle re-renders.

    gamesWrap.appendChild(gameCard);

    // Game 3 dim state must update live as scores change (sweep can happen without re-render)
    if (isGame3) {
      const capturedCard = gameCard;
      refreshes.push(() => {
        const { gamesWon1: cw1, gamesWon2: cw2 } = crownGamesWon(match);
        const nowSweep = (cw1 === 2 && cw2 === 0) || (cw2 === 2 && cw1 === 0);
        const nowNeeded = cw1 === 1 && cw2 === 1;
        capturedCard.style.opacity = nowSweep ? "0.4" : "";
        capturedCard.style.pointerEvents = nowSweep ? "none" : "";
        labelEl.textContent = "Game 3" + (nowSweep ? " (not needed — sweep)" : nowNeeded ? " (play now)" : " (if needed)");
      });
    }
  }
  card.appendChild(gamesWrap);

  // Match complete — show next match preview
  if (matchComplete && state.currentMatch < 2) {
    const nextSched = CROWN_SCHEDULE[state.currentMatch + 1];
    card.appendChild(el("div", {
      style: "margin-top:12px;padding:10px 12px;background:var(--panel-2);border-radius:10px;text-align:center;color:var(--muted);font-size:14px;"
    },
      el("div", { style: "margin-bottom:4px;color:var(--good);font-weight:700;" }, "Match Complete!"),
      el("div", null, "Next: " + nextSched.name + " — " + teamName(state.crownMatches[state.currentMatch + 1].team1) + " vs " + teamName(state.crownMatches[state.currentMatch + 1].team2)),
    ));
  }

  return card;
}
```

Note: Each game object has `team1/team2` stored directly at creation (see Task 5 Step 5.2). Pass `game` directly to `renderTeamRow` — no spread wrapper needed.

- [ ] **Step 6.4: Add renderRallyScoringHelp() collapsible block**

```js
function renderRallyScoringHelp() {
  const det = el("details", { class: "rules", style: "margin-bottom:12px;" });
  det.appendChild(el("summary", null, "How rally scoring works"));
  const body = el("div", { class: "rules-body" });
  const ul = el("ul");
  // Use verbatim wording from spec
  [
    "Every rally scores a point — the team that wins the rally gets the point, whether or not they served.",
    "There is NO second server. Each team gets one server per service turn (no \"0-0-2\" start).",
    "Serving team's score determines which side they serve from: even score = right side, odd score = left side.",
    "If the serving team wins the rally: same server, switches sides, serves again.",
    "If the receiving team wins the rally: they get the point AND the serve (side-out). After a side-out, the new serving team's player on the right side serves first.",
    "Score is called as two numbers (server score, receiver score) — no third number.",
    "Receiving team does NOT switch sides when they score.",
    "Game-point exception: the winning point must be won on your own serve. If you're at game point (6 in a game to 7) and your opponent loses their serve, you only get the serve — not the winning point. Game continues.",
    "Win by 2 — so a 6-6 game keeps going (7-6 isn't enough; you'd need 8-6, or play on to 9-7, etc.).",
    "The winning point must still be won on your own serve.",
  ].forEach(text => ul.appendChild(el("li", null, text)));
  body.appendChild(ul);
  det.appendChild(body);
  return det;
}
```

- [ ] **Step 6.5: Add match navigation buttons in renderCrownPlaying()**

```js
// After renderCrownMatchCard, add navigation buttons
const actions = el("div", { class: "row-actions" });
const matchComplete = isCrownMatchComplete(match);
const allMatchesComplete = state.crownMatches.every(isCrownMatchComplete);

if (state.currentMatch > 0) {
  actions.appendChild(el("button", {
    class: "secondary",
    onclick: () => { state.currentMatch--; save(); render(); }
  }, "← Match " + state.currentMatch));
}

let primaryBtn;
if (state.currentMatch < 2) {
  primaryBtn = el("button", {
    class: "primary",
    disabled: !matchComplete,
    onclick: () => {
      // Re-evaluate at click time — score edits don't trigger render(), so captured value may be stale
      if (!isCrownMatchComplete(state.crownMatches[state.currentMatch])) return;
      state.currentMatch++;
      save();
      render();
    }
  }, "Match " + (state.currentMatch + 2) + " →");
  // Keep disabled state in sync as scores change (no render(), so must update in-place)
  refreshes.push(() => {
    primaryBtn.disabled = !isCrownMatchComplete(state.crownMatches[state.currentMatch]);
  });
} else {
  primaryBtn = el("button", {
    class: "primary",
    disabled: !allMatchesComplete,
    onclick: () => {
      // Re-evaluate at click time
      if (!state.crownMatches.every(isCrownMatchComplete)) return;
      buildCrownMatch();
      render();
    }
  }, "Advance to Crown Match →");
  // Keep disabled state in sync
  refreshes.push(() => {
    primaryBtn.disabled = !state.crownMatches.every(isCrownMatchComplete);
  });
}
if (primaryBtn) actions.appendChild(primaryBtn);
wrap.appendChild(actions);
```

---

## Task 7: Crown Standings Card

**Files:**
- Modify: `pickleball.html` (renderStandingsCard dispatch, new renderCrownStandingsCard)

- [ ] **Step 7.1: Update renderStandingsCard() dispatch**

```js
function renderStandingsCard(throughRound, opts) {
  if (state.format === "stack") return renderStackStandingsCard(throughRound, opts);
  if (state.format === "crown") return renderCrownStandingsCard();
  // ... existing RR code ...
}
```

- [ ] **Step 7.2: Add renderCrownStandingsCard()**

Columns: Rank · Name · Match Points · Game Record (W-L) · Points Scored · Point Diff
Top 2 get a "🏆 Top 2" badge hint.

```js
function renderCrownStandingsCard() {
  const stats = crownLeaderboard();
  const completedMatches = state.crownMatches.filter(isCrownMatchComplete).length;
  const card = el("div", { class: "card" });
  const head = el("div", { style: "display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;gap:10px;flex-wrap:wrap;" },
    el("h3", { style: "margin:0;" }, "Live Standings"),
    el("span", { class: "muted" }, completedMatches + " of 3 matches complete"),
  );
  card.appendChild(head);

  const table = el("table", { class: "standings" });
  table.appendChild(el("thead", null, el("tr", null,
    el("th", { style: "text-align:center;" }, "#"),
    el("th", null, "Player"),
    el("th", { class: "num" }, "MP"),
    el("th", { class: "num" }, "G W–L"),
    el("th", { class: "num" }, "PTS"),
    el("th", { class: "num" }, "+/–"),
  )));
  const tbody = el("tbody");
  stats.forEach((s, i) => {
    const top2badge = i < 2 ? el("span", {
      style: "display:inline-block;margin-left:6px;font-size:11px;padding:2px 6px;border-radius:999px;background:rgba(251,191,36,0.15);color:var(--gold);font-weight:700;vertical-align:middle;"
    }, "🏆 Top 2") : null;
    tbody.appendChild(el("tr", { class: "r" + (i + 1) },
      rankCell(i),
      el("td", { class: "name" }, s.name, top2badge),
      el("td", { class: "num" }, s.matchPoints.toFixed(1)),
      el("td", { class: "num" }, s.gamesWon + "–" + s.gamesLost),
      el("td", { class: "num" }, "" + s.pointsScored),
      el("td", { class: "num", style: s.pointDiff > 0 ? "color:var(--good);" : (s.pointDiff < 0 ? "color:var(--bad);" : "") },
        (s.pointDiff > 0 ? "+" : "") + s.pointDiff),
    ));
  });
  table.appendChild(tbody);
  card.appendChild(table);
  return card;
}
```

---

## Task 8: Crown Phase (Crown Match)

**Files:**
- Modify: `pickleball.html` (render dispatch, new renderCrownPhaseScreen, buildCrownMatch)

- [ ] **Step 8.1: Add "crown" to render() dispatch**

```js
function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.appendChild(renderHeader());
  if (state.phase === "setup")        app.appendChild(renderSetup());
  else if (state.phase === "playing") app.appendChild(renderPlaying());
  else if (state.phase === "finals")  app.appendChild(renderFinalsScreen());
  else if (state.phase === "crown")   app.appendChild(renderCrownPhaseScreen());
  else if (state.phase === "done")    app.appendChild(renderDoneScreen());
  window.scrollTo({ top: 0, behavior: "auto" });
}
```

- [ ] **Step 8.2: Add buildCrownMatch()**

```js
function buildCrownMatch() {
  const lb = crownLeaderboard();
  const { team1, team2 } = crownPairings(lb);
  // team1/team2 on game objects is intentionally redundant with the match-level fields.
  // renderTeamRow does game[teamKey] (where teamKey is "team1" or "team2"), so
  // game-level team arrays are REQUIRED — not optional — for that function to work.
  state.crownFinal = {
    team1, team2,
    games: [
      { score1: null, score2: null, team1: team1.slice(), team2: team2.slice() },
      { score1: null, score2: null, team1: team1.slice(), team2: team2.slice() },
      { score1: null, score2: null, team1: team1.slice(), team2: team2.slice() },
    ],
  };
  state.phase = "crown";
  save();
}
```

- [ ] **Step 8.3: Add renderCrownPhaseScreen()**

Shows:
1. "Crown Match Preview" card with leaderboard and pairings (before match starts)
2. Crown Match card (while playing)
3. "Crown Champions" button when done

```js
function renderCrownPhaseScreen() {
  if (!state.crownFinal) return el("div", { class: "card" }, "Error: Crown Match data not found.");
  const wrap = el("div");
  const lb = crownLeaderboard();
  const { gamesWon1, gamesWon2 } = crownGamesWon(state.crownFinal);
  const matchComplete = isCrownMatchComplete(state.crownFinal);

  // Crown Match banner
  const banner = el("div", { class: "court-card crown gold", style: "text-align:center;margin-bottom:14px;padding:20px;" });
  banner.appendChild(el("div", { style: "font-size:48px;margin-bottom:8px;" }, "👑"));
  banner.appendChild(el("h2", { style: "margin:0;color:var(--gold);" }, "The Crown Match"));
  banner.appendChild(el("div", { style: "margin-top:8px;font-size:16px;color:var(--muted);" },
    // Show seed pills + team names: e.g. "#1 Ken & #4 Sam  vs  #2 Alex & #3 Joe"
    renderCrownMatchupDisplay(state.crownFinal, lb),
  ));
  wrap.appendChild(banner);

  // Crown Match Card — pass crownRefreshes so finish button stays live as scores change
  const crownRefreshes = [];
  const crownSched = { name: "Crown Match", theme: "Crown" };
  wrap.appendChild(renderCrownMatchCard(state.crownFinal, crownSched, crownRefreshes));

  const finishBtn = el("button", {
    class: "primary",
    style: "width:100%;margin-bottom:8px;",
    onclick: () => {
      // Re-evaluate at click time — score updates don't re-render, so matchComplete is stale
      if (!isCrownMatchComplete(state.crownFinal)) return;
      state.phase = "done"; save(); render();
    }
  }, "👑 Crown Champions");
  finishBtn.disabled = !matchComplete;
  // Keep disabled state in sync as Crown Match scores are entered
  crownRefreshes.push(() => { finishBtn.disabled = !isCrownMatchComplete(state.crownFinal); });
  wrap.appendChild(finishBtn);

  wrap.appendChild(el("button", {
    class: "ghost",
    style: "width:100%;",
    onclick: () => {
      state.phase = "playing"; state.currentMatch = 2;
      // Do NOT null crownFinal here — preserve any entered Crown Match scores.
      // If the user changes Match 3 results, buildCrownMatch() will overwrite crownFinal on next advance.
      save(); render();
    }
  }, "← Back to Match 3"));

  // Final leaderboard (regular season)
  wrap.appendChild(renderCrownStandingsCard());
  return wrap;
}

function renderCrownMatchupDisplay(crownFinal, lb) {
  const rankBySlot = new Map();
  lb.forEach((s, i) => rankBySlot.set(s.slot, i + 1));
  const renderTeamPill = (team) =>
    team.map(slot => "#" + rankBySlot.get(slot) + " " + nameOf(slot)).join(" & ");
  const wrap = el("div", { style: "display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;margin-top:8px;" });
  wrap.appendChild(el("span", { style: "font-weight:700;font-size:18px;" }, renderTeamPill(crownFinal.team1)));
  wrap.appendChild(el("span", { style: "color:var(--muted);" }, "vs"));
  wrap.appendChild(el("span", { style: "font-weight:700;font-size:18px;" }, renderTeamPill(crownFinal.team2)));
  return wrap;
}
```

- [ ] **Step 8.4: Update renderHeader() for Crown progress**

```js
function renderHeader() {
  let progressText = "Setup";
  if (state.phase === "playing") {
    if (state.format === "crown") {
      progressText = "Match " + (state.currentMatch + 1) + " of 3";
    } else {
      progressText = "Round " + state.currentRound + " of " + totalRegularRounds();
    }
  } else if (state.phase === "finals") progressText = "Finals";
  else if (state.phase === "crown")   progressText = "👑 Crown Match";
  else if (state.phase === "done")    progressText = "🏆 Champions";
  return el("header", { class: "top" },
    el("div", { class: "title" }, "🏓 Rumble Pickleball"),
    el("div", { class: "progress" }, progressText),
    el("button", { class: "icon-btn", onclick: openSettings, "aria-label": "Settings" }, "⚙"),
  );
}
```

- [ ] **Step 8.5: Update totalRegularRounds() for Crown**

```js
function totalRegularRounds() {
  if (state.format === "stack") return state.stackRounds;
  if (state.format === "crown") return 3;
  return 7;
}
```

---

## Task 9: Crown Done Screen

**Files:**
- Modify: `pickleball.html` (renderDoneScreen dispatch, new renderDoneScreenCrown)

- [ ] **Step 9.1: Route renderDoneScreen() to Crown path**

```js
function renderDoneScreen() {
  if (state.format === "crown") return renderDoneScreenCrown();
  // ... existing code ...
}
```

- [ ] **Step 9.2: Add renderDoneScreenCrown()**

Key elements:
- Confetti (first view, gates on awardsShown)
- Crown champion display (Crown Match winners + scorecard)
- Regular Season MVP (highest pre-Crown match points; if also champion, show "Champion · Regular Season MVP")
- renderPodiumCrown(finalRankingCrown()) — 4-player podium
- renderCrownAwardsStrip()
- Final standings table (4 players, Crown Match included)
- New Tournament button

```js
function renderDoneScreenCrown() {
  const wrap = el("div");

  if (!state.awardsShown) {
    state.awardsShown = true;
    save();
    queueMicrotask(runConfetti);
  }

  const ranking = finalRankingCrown();
  const crownWinner = crownMatchWinner(state.crownFinal);
  const champTeam = crownWinner === "team1" ? state.crownFinal.team1 : state.crownFinal.team2;

  // Regular Season MVP (pre-Crown leaderboard)
  const rsMVP = crownLeaderboard()[0]; // top regular-season slot

  const card = el("div", { class: "card" });
  const champions = el("div", { class: "champions" });
  champions.appendChild(el("div", { class: "crown" }, "👑"));
  champions.appendChild(el("h1", null, "CHAMPIONS"));
  champions.appendChild(el("div", { class: "winners" }, teamName(champTeam)));
  champions.appendChild(renderCrownMatchScorecard(state.crownFinal));

  // Regular Season MVP block
  const mvpOnChampTeam = champTeam.includes(rsMVP.slot);
  const mvpBlock = el("div", { style: "margin-top:24px;padding:14px;background:var(--panel-2);border-radius:12px;" });
  mvpBlock.appendChild(el("div", { style: "font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px;" }, "🌟 Regular Season MVP"));
  mvpBlock.appendChild(el("div", { style: "font-size:22px;font-weight:800;" }, rsMVP.name));
  if (mvpOnChampTeam) {
    mvpBlock.appendChild(el("div", { style: "font-size:12px;color:var(--gold);font-weight:700;margin-top:4px;" }, "Champion · Regular Season MVP"));
  }
  mvpBlock.appendChild(el("div", { style: "font-size:13px;color:var(--muted);margin-top:2px;" }, rsMVP.matchPoints.toFixed(1) + " match pts (regular season)"));
  champions.appendChild(mvpBlock);

  card.appendChild(champions);
  wrap.appendChild(card);

  // 4-player podium
  wrap.appendChild(renderPodiumCrown(ranking));

  // Awards
  wrap.appendChild(renderCrownAwardsStrip());

  // Final standings table (4-player, Crown Match included, tier divider at position 2)
  const standings = el("div", { class: "card", style: "margin-top:14px;" });
  standings.appendChild(el("h3", { style: "margin:0 0 12px;" }, "Final Standings"));
  const table = el("table", { class: "standings" });
  table.appendChild(el("thead", null, el("tr", null,
    el("th", { style: "text-align:center;" }, "#"),
    el("th", null, "Player"),
    el("th", { class: "num" }, "Total MP"),
    el("th", { class: "num" }, "G W–L"),
    el("th", { class: "num" }, "PTS"),
    el("th", { class: "num" }, "+/–"),
  )));
  const standingsTbody = el("tbody");
  ranking.forEach((s, i) => {
    if (i === 2) {
      standingsTbody.appendChild(el("tr", null,
        el("td", {
          colspan: "6",
          style: "text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:8px 0 4px;border-top:1px dashed var(--border);"
        }, "Crown Match Runners-Up")
      ));
    }
    standingsTbody.appendChild(el("tr", { class: "r" + (i + 1) },
      rankCell(i),
      el("td", { class: "name" }, s.name),
      el("td", { class: "num" }, s.matchPoints.toFixed(1)),
      el("td", { class: "num" }, s.gamesWon + "–" + s.gamesLost),
      el("td", { class: "num" }, "" + s.pointsScored),
      el("td", {
        class: "num",
        style: s.pointDiff > 0 ? "color:var(--good);" : (s.pointDiff < 0 ? "color:var(--bad);" : "")
      }, (s.pointDiff > 0 ? "+" : "") + s.pointDiff),
    ));
  });
  table.appendChild(standingsTbody);
  standings.appendChild(table);
  wrap.appendChild(standings);

  wrap.appendChild(el("button", {
    class: "ghost", style: "width:100%;margin-bottom:10px;",
    onclick: () => { state.phase = "crown"; save(); render(); }
  }, "← Edit Crown Match Scores"));

  wrap.appendChild(el("button", {
    class: "primary", style: "width:100%;",
    onclick: () => {
      if (confirm("Start a new tournament? This clears all scores and names.")) {
        state = newState(); save(); render();
      }
    }
  }, "Start New Tournament"));

  return wrap;
}

function renderCrownMatchScorecard(crownFinal) {
  // Use the same early-exit game boundary as crownGamesWon() to exclude stale Game 3
  const games = [];
  let _w1 = 0, _w2 = 0;
  for (const g of crownFinal.games) {
    if (!Number.isInteger(g.score1) || !Number.isInteger(g.score2) || g.score1 === g.score2) break;
    games.push(g);
    if (g.score1 > g.score2) _w1++; else _w2++;
    if (_w1 === 2 || _w2 === 2) break;
  }
  const wrap = el("div", { style: "margin:12px auto 0;max-width:480px;" });
  games.forEach((g, i) => {
    const t1win = g.score1 > g.score2;
    wrap.appendChild(el("div", { class: "scorecard", style: "margin-bottom:8px;" },
      el("div", { class: "sc-team left" + (t1win ? " win" : "") }, teamName(crownFinal.team1)),
      el("div", { class: "sc-score" }, g.score1 + " – " + g.score2),
      el("div", { class: "sc-team right" + (!t1win ? " win" : "") }, teamName(crownFinal.team2)),
    ));
  });
  return wrap;
}
```

- [ ] **Step 9.3: Add renderPodiumCrown() for 4 players**

```js
function renderPodiumCrown(ranking) {
  // ranking: 4 stat objects in order (rank 0..3)
  // Podium visual: [silver=rank2, gold=rank1, bronze=rank3]; rank 4 shown below
  const stats = crownPlayerStats();
  const matchPts = new Map(stats.map(s => [s.slot, s.matchPoints]));
  const crownFinalStats = (() => {
    const { gamesWon1, gamesWon2 } = crownGamesWon(state.crownFinal);
    const pts = matchPointsForMatch(gamesWon1, gamesWon2, "Crown");
    const winner = crownMatchWinner(state.crownFinal);
    const winTeam = winner === "team1" ? state.crownFinal.team1 : state.crownFinal.team2;
    const loseTeam = winner === "team1" ? state.crownFinal.team2 : state.crownFinal.team1;
    return { winTeam, loseTeam, winPts: pts.perWinner, losePts: pts.perLoser };
  })();

  const order = ["silver", "gold", "bronze"];
  const podiumRanks = [ranking[1], ranking[0], ranking[2]];
  const emojis = { silver: "🥈", gold: "👑", bronze: "🥉" };
  const podium = el("div", { class: "podium" });
  order.forEach((kind, i) => {
    const r = podiumRanks[i];
    const totalMp = (matchPts.get(r.slot) || 0) +
      (crownFinalStats.winTeam.includes(r.slot) ? crownFinalStats.winPts : crownFinalStats.losePts);
    const step = el("div", { class: "podium-step " + kind });
    step.appendChild(el("div", { class: "podium-name" }, r.name));
    step.appendChild(el("div", { class: "podium-points" }, totalMp.toFixed(1) + " mp"));
    step.appendChild(el("div", { class: "podium-bar" }, emojis[kind]));
    podium.appendChild(step);
  });

  const wrap = el("div");
  wrap.appendChild(podium);
  // 4th place below podium
  if (ranking[3]) {
    const r4 = ranking[3];
    const totalMp = (matchPts.get(r4.slot) || 0) + crownFinalStats.losePts;
    wrap.appendChild(el("div", { style: "text-align:center;padding:8px;color:var(--muted);font-size:15px;" },
      "4th: " + r4.name + " · " + totalMp.toFixed(1) + " mp"
    ));
  }
  return wrap;
}
```

---

## Task 10a: Crown Performance Awards

**Files:**
- Modify: `pickleball.html` (new computeCrownPerformanceAwards, called from computeCrownAwards)

Performance awards are computed from the flat game list: MVP, Biggest Win, Closest Game, Hot Streak, The Wall, The Engine.

- [ ] **Step 10a.1: Add computeCrownPerformanceAwards(allGames)**

```js
// allGames: flat array of { score1, score2, team1, team2, matchIdx, gameIdx }
function computeCrownPerformanceAwards(allGames) {
  const decided = allGames.filter(g => g.score1 !== g.score2);

  // MVP (highest regular-season match points)
  const lb = crownLeaderboard();
  const mvp = { names: [nameOf(lb[0].slot)], detail: lb[0].matchPoints.toFixed(1) + " mp" };

  // Biggest Win / Closest Game
  const summarized = decided.map(g => {
    const t1win = g.score1 > g.score2;
    return {
      diff: Math.abs(g.score1 - g.score2),
      winTeam: t1win ? g.team1 : g.team2,
      loseTeam: t1win ? g.team2 : g.team1,
      winScore: t1win ? g.score1 : g.score2,
      loseScore: t1win ? g.score2 : g.score1,
    };
  });
  const maxDiff = summarized.length ? Math.max(...summarized.map(s => s.diff)) : 0;
  const biggestWin = summarized.length
    ? { names: summarized.filter(s => s.diff === maxDiff).map(w => teamName(w.winTeam) + " +" + w.diff), detail: null }
    : { names: [], detail: null };
  const minDiff = summarized.length ? Math.min(...summarized.map(s => s.diff)) : Infinity;
  const closestGames = summarized.filter(s => s.diff === minDiff);
  const closestGame = closestGames.length
    ? { names: closestGames.map(g => teamName(g.winTeam)), detail: closestGames[0].winScore + "–" + closestGames[0].loseScore }
    : { names: [], detail: null };

  // Hot Streak (longest consecutive game win streak across all games in order)
  const streaks = new Map(), best = new Map();
  for (const g of allGames) {
    if (g.score1 === g.score2) {
      for (const slot of [...g.team1, ...g.team2]) {
        best.set(slot, Math.max(best.get(slot)||0, streaks.get(slot)||0));
        streaks.set(slot, 0);
      }
      continue;
    }
    const t1win = g.score1 > g.score2;
    const winners = t1win ? g.team1 : g.team2;
    const losers  = t1win ? g.team2 : g.team1;
    for (const slot of winners) { streaks.set(slot, (streaks.get(slot)||0)+1); best.set(slot, Math.max(best.get(slot)||0, streaks.get(slot))); }
    for (const slot of losers)  { best.set(slot, Math.max(best.get(slot)||0, streaks.get(slot)||0)); streaks.set(slot, 0); }
  }
  for (const [slot, cur] of streaks) best.set(slot, Math.max(best.get(slot)||0, cur));
  const maxStreak = best.size ? Math.max(...best.values()) : 0;
  const hotStreak = maxStreak > 0
    ? { names: [...best.entries()].filter(([,v])=>v===maxStreak).map(([s])=>nameOf(s)), detail: maxStreak + " in a row" }
    : { names: [], detail: null };

  // The Wall (fewest points conceded per game)
  const conceded = new Map([1,2,3,4].map(s => [s, { total: 0, games: 0 }]));
  for (const g of allGames) {
    for (const slot of g.team1) { const e = conceded.get(slot); if (e) { e.total += g.score2; e.games++; } }
    for (const slot of g.team2) { const e = conceded.get(slot); if (e) { e.total += g.score1; e.games++; } }
  }
  const wallEntries = [...conceded.entries()].filter(([,v]) => v.games > 0)
    .map(([slot, v]) => ({ slot, avg: v.total / v.games }));
  const minWall = wallEntries.length ? Math.min(...wallEntries.map(e => e.avg)) : Infinity;
  const theWall = wallEntries.length
    ? { names: wallEntries.filter(e => e.avg === minWall).map(e => nameOf(e.slot)), detail: minWall.toFixed(1) + " allowed/game" }
    : { names: [], detail: null };

  // The Engine (most total points scored)
  const scored = new Map([1,2,3,4].map(s => [s, 0]));
  for (const g of allGames) {
    for (const slot of g.team1) scored.set(slot, scored.get(slot) + g.score1);
    for (const slot of g.team2) scored.set(slot, scored.get(slot) + g.score2);
  }
  const maxScored = Math.max(...scored.values());
  const theEngine = maxScored > 0
    ? { names: [...scored.entries()].filter(([,v]) => v === maxScored).map(([s]) => nameOf(s)), detail: maxScored + " total pts" }
    : { names: [], detail: null };

  return { mvp, biggestWin, closestGame, hotStreak, theWall, theEngine };
}
```

---

## Task 10b: Crown Match-Structure Awards

**Files:**
- Modify: `pickleball.html` (new computeCrownMatchAwards, then combined computeCrownAwards)

Match-structure awards require per-match analysis: The Closer, The Sweeper, Comeback Kid, MVP Partner, Money Game Champ.

- [ ] **Step 10b.1: Add computeCrownMatchAwards(allGames, allMatches)**

```js
// allMatches: [...state.crownMatches, state.crownFinal] (if complete)
function computeCrownMatchAwards(allGames, allMatches) {
  const decided = allGames.filter(g => g.score1 !== g.score2);

  // The Closer (best W-L in close-finish games: margin ≤ 2 at win score)
  // Note: allGames only contains fully-scored games from the early-exit boundary — mid-game
  // scores are never present, so `maxScore >= 7 && diff <= 2` correctly identifies completed
  // close-finish games (covering SD target 7+, regular target 11+, and overtime 12-10, 8-6, etc.)
  const closerWL = new Map([1,2,3,4].map(s => [s, { wins: 0, losses: 0 }]));
  let anyClose = false;
  for (const g of decided) {
    const maxScore = Math.max(g.score1, g.score2);
    const diff = Math.abs(g.score1 - g.score2);
    if (!(maxScore >= 7 && diff <= 2)) continue;
    anyClose = true;
    const t1win = g.score1 > g.score2;
    for (const slot of g.team1) { if (t1win) closerWL.get(slot).wins++; else closerWL.get(slot).losses++; }
    for (const slot of g.team2) { if (!t1win) closerWL.get(slot).wins++; else closerWL.get(slot).losses++; }
  }
  let theCloser = { names: [], detail: null };
  if (anyClose) {
    const cands = [...closerWL.entries()].map(([slot, v]) => ({ slot, ...v })).filter(c => c.wins > 0);
    cands.sort((a,b) => b.wins !== a.wins ? b.wins - a.wins : a.losses - b.losses);
    if (cands.length) {
      const top = cands[0];
      const tied = cands.filter(c => c.wins === top.wins && c.losses === top.losses);
      theCloser = { names: tied.map(c => nameOf(c.slot)), detail: top.wins + "–" + top.losses + " in close games" };
    }
  }

  // The Sweeper (most 2-0 match wins)
  const sweepCount = new Map([1,2,3,4].map(s => [s, 0]));
  for (const match of allMatches) {
    const { gamesWon1, gamesWon2 } = crownGamesWon(match);
    if (gamesWon1 === 2 && gamesWon2 === 0) {
      for (const slot of match.team1) sweepCount.set(slot, sweepCount.get(slot) + 1);
    } else if (gamesWon2 === 2 && gamesWon1 === 0) {
      for (const slot of match.team2) sweepCount.set(slot, sweepCount.get(slot) + 1);
    }
  }
  const maxSweeps = Math.max(...sweepCount.values());
  const theSweeper = maxSweeps > 0
    ? { names: [...sweepCount.entries()].filter(([,v]) => v === maxSweeps).map(([s]) => nameOf(s)), detail: maxSweeps + " sweep" + (maxSweeps > 1 ? "s" : "") }
    : { names: [], detail: null };

  // Comeback Kid (won a match after losing Game 1)
  const comebackCount = new Map([1,2,3,4].map(s => [s, 0]));
  for (const match of allMatches) {
    if (!isCrownMatchComplete(match)) continue;
    const g0 = match.games[0];
    if (!Number.isInteger(g0.score1) || !Number.isInteger(g0.score2)) continue;
    if (g0.score1 === g0.score2) continue; // tied game 1 is not a comeback setup
    const g0winner = g0.score1 > g0.score2 ? "team1" : "team2";
    const matchW = crownMatchWinner(match);
    if (matchW && g0winner !== matchW) {
      const winSlots = matchW === "team1" ? match.team1 : match.team2;
      for (const slot of winSlots) comebackCount.set(slot, comebackCount.get(slot) + 1);
    }
  }
  const maxComebacks = Math.max(...comebackCount.values());
  const comebackKid = maxComebacks > 0
    ? { names: [...comebackCount.entries()].filter(([,v]) => v === maxComebacks).map(([s]) => nameOf(s)), detail: maxComebacks + " comeback" + (maxComebacks > 1 ? "s" : "") }
    : { names: [], detail: null };

  // MVP Partner: total games won / total games played across all matches.
  // Using a flat ratio (not avg-of-ratios) to avoid 2-0 matches counting the same as 2-1.
  const partnerWR = new Map([1,2,3,4].map(s => [s, { won: 0, played: 0 }]));
  for (let s = 1; s <= 4; s++) {
    for (const match of allMatches) {
      if (!isCrownMatchComplete(match)) continue;
      const teamIsTeam1 = match.team1.includes(s);
      const teamIsTeam2 = match.team2.includes(s);
      if (!teamIsTeam1 && !teamIsTeam2) continue;
      const { gamesWon1, gamesWon2 } = crownGamesWon(match);
      const e = partnerWR.get(s);
      e.won += teamIsTeam1 ? gamesWon1 : gamesWon2;
      e.played += gamesWon1 + gamesWon2;
    }
  }
  const partnerRatio = (e) => e.played > 0 ? e.won / e.played : 0;
  const maxPWR = Math.max(...[...partnerWR.values()].map(partnerRatio));
  const mvpPartner = maxPWR > 0
    ? { names: [...partnerWR.entries()].filter(([,v]) => partnerRatio(v) === maxPWR).map(([s]) => nameOf(s)),
        detail: Math.round(maxPWR * 100) + "% game win rate" }
    : { names: [], detail: null };

  // Money Game Champ (best W-L in Game 3s)
  // Derive from allGames (which already excludes stale games via early-exit) filtered by gameIdx === 2.
  // Do NOT read match.games[2] directly — that bypasses the valid-game boundary.
  const g3WL = new Map([1,2,3,4].map(s => [s, { wins: 0, losses: 0 }]));
  const g3Games = allGames.filter(g => g.gameIdx === 2 && g.score1 !== g.score2);
  const anyG3 = g3Games.length > 0;
  for (const g of g3Games) {
    const t1win = g.score1 > g.score2;
    for (const slot of g.team1) { const e = g3WL.get(slot); if (e) { if (t1win) e.wins++; else e.losses++; } }
    for (const slot of g.team2) { const e = g3WL.get(slot); if (e) { if (!t1win) e.wins++; else e.losses++; } }
  }
  let moneyGame = { names: [], detail: null };
  if (anyG3) {
    const cands = [...g3WL.entries()].map(([slot, v]) => ({ slot, ...v })).filter(c => c.wins > 0);
    cands.sort((a,b) => b.wins !== a.wins ? b.wins - a.wins : a.losses - b.losses);
    if (cands.length) {
      const top = cands[0];
      const tied = cands.filter(c => c.wins === top.wins && c.losses === top.losses);
      moneyGame = { names: tied.map(c => nameOf(c.slot)), detail: top.wins + "–" + top.losses + " in Game 3s" };
    }
  }

  return { theCloser, theSweeper, comebackKid, mvpPartner, moneyGame, anyG3 };
}
```

- [ ] **Step 10b.2: Add combined computeCrownAwards() wrapper**

```js
function computeCrownAwards() {
  // Build flat game list using the same early-exit boundary as crownGamesWon() so
  // stale Game 3 scores (entered during 1-1, later invalidated by a sweep edit) are excluded.
  const allGames = [];
  for (let mi = 0; mi < state.crownMatches.length; mi++) {
    const match = state.crownMatches[mi];
    let _w1 = 0, _w2 = 0;
    for (let gi = 0; gi < match.games.length; gi++) {
      const g = match.games[gi];
      if (!Number.isInteger(g.score1) || !Number.isInteger(g.score2)) break; // stop at gap
      if (g.score1 === g.score2) break; // stop at tie (matches crownGamesWon boundary)
      allGames.push({ score1: g.score1, score2: g.score2, team1: match.team1, team2: match.team2, matchIdx: mi, gameIdx: gi });
      if (g.score1 > g.score2) _w1++; else _w2++;
      if (_w1 === 2 || _w2 === 2) break; // stop at match-deciding game
    }
  }
  if (state.crownFinal) {
    let _w1 = 0, _w2 = 0;
    for (let gi = 0; gi < state.crownFinal.games.length; gi++) {
      const g = state.crownFinal.games[gi];
      if (!Number.isInteger(g.score1) || !Number.isInteger(g.score2)) break; // stop at gap
      if (g.score1 === g.score2) break; // stop at tie
      allGames.push({ score1: g.score1, score2: g.score2, team1: state.crownFinal.team1, team2: state.crownFinal.team2, matchIdx: -1, gameIdx: gi });
      if (g.score1 > g.score2) _w1++; else _w2++;
      if (_w1 === 2 || _w2 === 2) break;
    }
  }

  const allMatches = [...state.crownMatches];
  if (state.crownFinal && isCrownMatchComplete(state.crownFinal)) allMatches.push(state.crownFinal);

  const perf  = computeCrownPerformanceAwards(allGames);
  const match = computeCrownMatchAwards(allGames, allMatches);
  return { ...perf, ...match };
}
```

- [ ] **Step 10b.3: Add renderCrownAwardsStrip() and route renderAwardsStrip()**

```js
function renderCrownAwardsStrip() {
  const a = computeCrownAwards();
  const wrap = el("div", { class: "awards-section" });
  const chip = (label, item, inlineDetail) => {
    const node = el("div", { class: "award-chip" });
    node.appendChild(el("div", { class: "award-label" }, label));
    const valueText = item.names.length ? item.names.join(", ") : "—";
    const valueEl = el("div", { class: "award-value" }, valueText);
    if (item.detail && item.names.length && inlineDetail) valueEl.appendChild(document.createTextNode(" · " + item.detail));
    node.appendChild(valueEl);
    if (item.detail && item.names.length && !inlineDetail) node.appendChild(el("div", { class: "award-detail" }, item.detail));
    return node;
  };
  // Marquee
  const marquee = el("div", { class: "awards-strip marquee" });
  marquee.appendChild(chip("🎯 MVP", a.mvp, true));
  marquee.appendChild(chip("💥 BIGGEST WIN", a.biggestWin, false));
  marquee.appendChild(chip("🤏 CLOSEST GAME", a.closestGame, false));
  marquee.appendChild(chip("🔥 HOT STREAK", a.hotStreak, true));
  wrap.appendChild(marquee);
  // Secondary (Crown-specific, only shown if qualified)
  const secondary = el("div", { class: "awards-strip secondary" });
  if (a.theCloser.names.length)   secondary.appendChild(chip("🎯 THE CLOSER", a.theCloser, true));
  if (a.theSweeper.names.length)  secondary.appendChild(chip("🧹 THE SWEEPER", a.theSweeper, true));
  if (a.comebackKid.names.length) secondary.appendChild(chip("💪 COMEBACK KID", a.comebackKid, true));
  if (a.mvpPartner.names.length)  secondary.appendChild(chip("🤝 MVP PARTNER", a.mvpPartner, true));
  if (a.theWall.names.length)     secondary.appendChild(chip("🧱 THE WALL", a.theWall, true));
  if (a.theEngine.names.length)   secondary.appendChild(chip("🚂 THE ENGINE", a.theEngine, true));
  if (a.anyG3 && a.moneyGame.names.length) secondary.appendChild(chip("💰 MONEY GAME CHAMP", a.moneyGame, true));
  if (secondary.children.length) wrap.appendChild(secondary);
  return wrap;
}

function renderAwardsStrip() {
  if (state.format === "crown") return renderCrownAwardsStrip();
  // ... existing code ...
}
```

---

## Task 11: Rules Block + Settings Updates

**Files:**
- Modify: `pickleball.html` (RULES_CROWN const, renderRulesBlock, openHowItWorksModal, openSettings)

- [ ] **Step 11.1: Add RULES_CROWN constant**

```js
const RULES_CROWN = [
  "4 players, 1 court, doubles. 3 themed round-robin matches (best-of-3 each), then a Championship Crown Match.",
  "Match 1 — Opening: games to 11, win by 2, side-out scoring. Sweep (2-0) = 3 match pts/player; close (2-1) = 2/1.",
  "Match 2 — Power Round: same rules but match points are 1.5×. Sweep = 4.5 pts, close = 3/1.5.",
  "Match 3 — Sudden Death: games to 7, win by 2, RALLY SCORING. Standard scoring (3 sweep, 2/1 close).",
  "Rally scoring: every rally scores a point regardless of who served. See the 'How rally scoring works' help block on the Round 3 screen.",
  "Crown Match: rank 1 partners with rank 4, rank 2 partners with rank 3 (rank 1+4 vs rank 2+3). Best-of-3, games to 11, DOUBLE points (sweep = 6/player, close = 4/2).",
  "Champion = Crown Match winner. Regular Season MVP = highest match-point total before the Crown Match (displayed separately).",
  "Final ranking: Crown Match winners form the top tier (ranks 1–2); losers form the bottom tier (ranks 3–4). Within each tier: total match points (regular + Crown) → points scored → point differential → coin flip.",
];
```

- [ ] **Step 11.2: Update openHowItWorksModal() for 3 formats**

```js
const sections = [
  { id: "rr",    label: "Round Robin",  bullets: RULES_RR },
  { id: "stack", label: "Stack Format", bullets: RULES_STACK },
  { id: "crown", label: "Crown Court",  bullets: RULES_CROWN },
];
```

- [ ] **Step 11.3: Update openSettings() format switcher for 3 formats**

Current code only switches between rr↔stack. Update to cycle through all 3 or show a select. Simplest: show a "Switch to X" for each non-current format (up to 2 buttons), or use a select for the format change.

For minimal change, replace the single button with:
```js
const formats = [
  { id: "rr",    label: "Round Robin" },
  { id: "stack", label: "Stack Format" },
  { id: "crown", label: "Crown Court" },
];
for (const f of formats) {
  if (f.id === state.format) continue;
  modal.appendChild(el("button", {
    style: "width: 100%; margin-top: 8px;",
    onclick: () => {
      if (state.phase !== "setup" && !confirm("Switching formats will reset your current tournament. Continue?")) return;
      // Sync rawNames from slots before reset — in-tournament name edits live in slots, not rawNames.
      // Crown only populates slots[0..3]; slots[4..7] are blank, so rawNames[4..7] must be preserved.
      if (state.phase !== "setup") {
        const syncCount = state.format === "crown" ? 4 : 8;
        for (let i = 0; i < syncCount; i++) state.rawNames[i] = state.slots[i] || "";
        // rawNames[syncCount..7] are intentionally left unchanged
      }
      const prevFormat = state.format;
      state.format = f.id;
      // Always reset to setup and clear in-progress game state
      state.phase = "setup";
      state.rounds = [];
      state.finals = null;
      state.currentRound = 1;
      state.crownMatches = [];
      state.currentMatch = 0;
      state.crownFinal = null;
      state.awardsShown = false;
      // rawNames stays 8 elements always; Crown just displays first 4
      // No truncation needed — canStart() and renderSetup() are format-aware
      save();
      close(); // use the existing local close() defined in openSettings()
      render();
    }
  }, "Switch to " + f.label));
}
```

- [ ] **Step 11.4: Update Reset Tournament handler for Crown**

The existing Reset Tournament button in settings rebuilds `rounds` using `SCHEDULE` (8-player RR). Crown uses `crownMatches` instead. Locate the reset handler and add a Crown branch:

```js
// In the Reset Tournament onclick handler:
if (state.format === "crown") {
  // Use current slot names (not rawNames) — in-tournament edits live in slots, not rawNames
  const names = state.slots.slice(0, 4);
  state.slots = [...shuffle(names), "", "", "", ""]; // re-shuffle to give fresh pairing draw
  state.tiebreakRandom = shuffle([0, 1, 2, 3]);
  state.crownMatches = CROWN_SCHEDULE.map(s => ({
    team1: s.team1.slice(),
    team2: s.team2.slice(),
    games: [
      { score1: null, score2: null, team1: s.team1.slice(), team2: s.team2.slice() },
      { score1: null, score2: null, team1: s.team1.slice(), team2: s.team2.slice() },
      { score1: null, score2: null, team1: s.team1.slice(), team2: s.team2.slice() },
    ],
  }));
  state.currentMatch = 0;
  state.crownFinal = null;
  state.rounds = [];     // leave empty so RR code can't accidentally use it
  state.finals = null;
  state.phase = "playing";
  state.awardsShown = false;
  save();
  close(); // close the settings modal (same as existing reset handler)
  render();
} else {
  // ... existing RR / Stack reset logic, unchanged ...
}
```

- [ ] **Step 11.5: Update Edit Names in Settings for Crown (4 slots)**

In the settings modal, loop for `count = state.format === "crown" ? 4 : 8` when showing name inputs.

- [ ] **Step 11.6: Hide "View full schedule" button for Crown**

The settings modal shows a "View full schedule" button that calls `openScheduleModal`. That function renders `state.rounds` which is always empty for Crown (Crown uses `state.crownMatches` instead). Hide the button rather than adding a Crown branch to the schedule modal:

```js
// In openSettings(), where the schedule button is rendered:
if (state.format !== "crown") {
  modal.appendChild(el("button", { onclick: openScheduleModal }, "View full schedule"));
}
```

---

## Task 12: History for Crown Court

**Files:**
- Modify: `pickleball.html` (renderHistory)

- [ ] **Step 12.1: Add Crown history in renderCrownPlaying()**

Show past completed matches (before currentMatch) as collapsible history.

```js
function renderCrownHistory() {
  const past = state.crownMatches.slice(0, state.currentMatch).filter(isCrownMatchComplete);
  if (past.length === 0) return null;
  const details = el("details", { class: "history" });
  details.appendChild(el("summary", null,
    el("span", null, "Match History (" + past.length + " match" + (past.length > 1 ? "es" : "") + ")")
  ));
  const body = el("div", { class: "body" });
  past.forEach((match, mi) => {
    const sched = CROWN_SCHEDULE[state.crownMatches.indexOf(match)];
    const block = el("div", { class: "history-round" });
    block.appendChild(el("div", { class: "history-round-title" }, sched.name));
    // Use same early-exit boundary as crownGamesWon to exclude stale Game 3 after sweep edits
    const games = [];
    { let _w1 = 0, _w2 = 0;
      for (const g of match.games) {
        if (!Number.isInteger(g.score1) || !Number.isInteger(g.score2)) break;
        if (g.score1 === g.score2) break;
        games.push(g);
        if (g.score1 > g.score2) _w1++; else _w2++;
        if (_w1 === 2 || _w2 === 2) break;
      }
    }
    games.forEach((g, gi) => {
      const t1win = g.score1 > g.score2;
      block.appendChild(el("div", { class: "history-game" },
        el("span", { class: "court-tag c1", style: "background:rgba(251,191,36,.15);color:var(--gold);" }, "G" + (gi + 1)),
        el("span", { class: "game-text" },
          el("span", { class: t1win ? "winning-team" : "" }, teamName(match.team1)),
          " vs ",
          el("span", { class: !t1win ? "winning-team" : "" }, teamName(match.team2)),
        ),
        el("span", { class: "game-score" }, g.score1 + "–" + g.score2),
      ));
    });
    body.appendChild(block);
  });
  details.appendChild(body);
  return details;
}
```

---

## Task 13: CSS Additions

**Files:**
- Modify: `pickleball.html` (`<style>` block)

- [ ] **Step 13.1: Add Crown Court CSS**

> **Note:** `.champions`, `.winners`, `.podium`, `.podium-step`, `.podium-name`, `.podium-bar`, `.podium-points`, `.awards-section`, `.awards-strip`, `.awards-strip.secondary`, `.award-chip` all already exist in the `<style>` block for RR/Stack. Crown's done screen reuses them without change. Only add the following new Crown-specific rules:

```css
/* Crown Court format */
.court-card.crown {
  border-top-color: var(--gold);
  border-top-width: 8px;
  box-shadow: 0 0 32px rgba(251, 191, 36, 0.15);
}
.court-card.crown .court-label { color: var(--gold); }

/* Format options: 3-column on wide screens */
@media (min-width: 600px) {
  .format-options { grid-template-columns: 1fr 1fr 1fr; }
}

/* Crown Match scorecard (renderCrownMatchScorecard) */
.scorecard { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--panel-2); border-radius: 8px; }
.sc-team { flex: 1; font-weight: 700; font-size: 14px; }
.sc-team.win { color: var(--good); }
.sc-team.right { text-align: right; }
.sc-score { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }

/* Crown podium extensions */
.podium-bar { font-size: 32px; margin-top: 4px; }
.podium-points { font-size: 12px; color: var(--muted); margin-top: 2px; }
```

---

## Task 14: Integration, Testing, and Final Checks

**Files:**
- Modify: `pickleball.html`

- [ ] **Step 14.1: Run `?test` harness** — open the file in a browser with `?test` and verify 0 failures.

- [ ] **Step 14.2: Manual test plan** (see Deliverable section of spec).

- [ ] **Step 14.3: Verify v2 → v3 migration** — set localStorage with old v2 JSON, reload, verify it's migrated correctly as Round Robin.

- [ ] **Step 14.4: Verify existing RR and Stack formats still work** — Start an RR tournament, play through it. Start a Stack tournament, play through it. Ensure no regressions.

---

## Self-Review

**Spec coverage check:**
- ✅ Crown Court in format chooser
- ✅ 4-slot setup screen
- ✅ Paste-names for 4
- ✅ Shuffle reveal for 4 cards
- ✅ v2→v3 migration
- ✅ 3 RR matches with themes (Opening, Power Round, Sudden Death)
- ✅ Best-of-3 per match, game-by-game tracking
- ✅ Auto-advance after 2-0 sweep
- ✅ Game 3 prompt on 1-1
- ✅ Power Round 1.5× banner + scoring
- ✅ Sudden Death banner + rally scoring help
- ✅ Crown Match phase with pairings
- ✅ Crown Match doubled points
- ✅ Champions screen with Regular Season MVP
- ✅ Crown-specific awards (all 7)
- ✅ Awards hidden when no qualifiers
- ✅ Live leaderboard with Top 2 badge
- ✅ Crown Court rules block
- ✅ Rally scoring help (verbatim wording)
- ✅ Settings: 3-format switcher
- ✅ History for Crown Court
- ✅ Self-tests for all pure functions

**Type consistency check:** All functions use `match.team1`/`match.team2` consistently. `crownGamesWon`, `isCrownMatchComplete`, `crownMatchWinner` all take a `match` object with `{ team1, team2, games }`. `crownPlayerStats` returns 4-element arrays indexed by slot 1-4.

**Placeholder scan:** No TBD or TODO items that aren't elaborated.
