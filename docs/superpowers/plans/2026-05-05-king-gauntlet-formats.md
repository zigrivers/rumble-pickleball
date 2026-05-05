# King of the Court & Gauntlet Formats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add King of the Court (`king`) and Gauntlet (`gauntlet`) as first-class tournament formats in `pickleball.html`, with full UX parity alongside the existing `rr`, `stack`, and `crown` formats.

**Architecture:** Single-file vanilla JS app (~5600 lines). Each new format gets a labeled engine block (`// === KING FORMAT ===` / `// === GAUNTLET FORMAT ===`). A thin dispatch layer adds new branches to ~25 existing `if (state.format === "stack")` checks throughout the file. Both formats reuse the existing `{ round, court1, court2 }` round shape and `buildFinals()` / `finalRanking()` pipeline unchanged.

**Tech Stack:** Vanilla JS, no build step, no dependencies. Open `pickleball.html` directly in a browser to test.

---

## File structure (changes only)

**Modify:** `pickleball.html` — the only file.

**New code inserted (in order):**
1. `RULES_KING`, `RULES_GAUNTLET` constants — after `RULES_STACK` (Task 2)
2. `// === KING FORMAT ===` block — after `buildNextStackRound`, before Crown logic (Task 3)
3. `// === GAUNTLET FORMAT ===` block — after King block, before Crown logic (Task 4)
4. `renderKingStandingsCard()` — just before `renderStandingsCard()` (Task 10)

**Existing functions modified:**
`newState`, `backfillStateDefaults`, `totalRegularRounds`, `rankPlayersForFormat`, `nextPartnerInfo`, `startTournament`, `maybeFireRoundComplete`, `renderPlaying`, `renderCourtCard`, `renderStandingsCard`, `renderFormatChooser`, `renderHistory`, `openScheduleModal`, `openHowItWorksModal`, `rulesForActiveFormat`, `renderPodium`, `computeAwards`, `renderDoneScreen`, `openSettings`

---

## Task 1: State Foundation

**Files:**
- Modify: `pickleball.html` — `newState()` and `backfillStateDefaults()`

### Context
`newState()` is at line ~1767. `backfillStateDefaults()` follows it at line ~1790.

- [ ] **Step 1: Add King and Gauntlet round-count fields to `newState()`**

Find the line `stackRounds: 8,` inside `newState()` and add the two new fields directly after it:

```js
stackRounds:    8,                                  // only used when format === "stack"
kingRounds:     9,                                  // only used when format === "king"
gauntletRounds: 8,                                  // only used when format === "gauntlet"
```

- [ ] **Step 2: Update `backfillStateDefaults()` — format validation**

Find this line inside `backfillStateDefaults()`:
```js
if (!["stack","crown"].includes(obj.format)) obj.format = "rr";
```
Replace it with:
```js
if (!["rr","stack","crown","king","gauntlet"].includes(obj.format)) obj.format = "rr";
```

- [ ] **Step 3: Add `kingRounds` and `gauntletRounds` backfill in `backfillStateDefaults()`**

Find the line `if (typeof obj.stackRounds !== "number") obj.stackRounds = 8;` and add after it:

```js
if (!Number.isInteger(obj.kingRounds)     || obj.kingRounds     < 6 || obj.kingRounds     > 12) obj.kingRounds     = 9;
if (!Number.isInteger(obj.gauntletRounds) || obj.gauntletRounds < 6 || obj.gauntletRounds > 12) obj.gauntletRounds = 8;
```

- [ ] **Step 4: Verify in browser console**

Open `pickleball.html` in a browser. Open DevTools → Console. Run:
```js
const s = newState();
console.log(s.kingRounds, s.gauntletRounds);
// Expected: 9 8
```

- [ ] **Step 5: Commit**

```bash
git add pickleball.html
git commit -m "feat: add kingRounds and gauntletRounds to state"
```

---

## Task 2: RULES Constants

**Files:**
- Modify: `pickleball.html` — insert `RULES_KING` and `RULES_GAUNTLET` constants after `RULES_STACK`

### Context
`RULES_STACK` ends around line 2894, followed immediately by `function rulesForActiveFormat()`. Insert the two new constants between them.

- [ ] **Step 1: Add `RULES_KING` and `RULES_GAUNTLET` constants**

Find `const RULES_STACK = [` and locate its closing `];`. Insert the two new constants immediately after:

```js
const RULES_KING = [
  "8 players, 2 courts. Court 1 is the 👑 King's Court; Court 2 is the Bottom Court.",
  "All 8 players play every round.",
  "After each round: Court 1 winners stay on Court 1, Court 2 winners climb to Court 1. Court 1 losers drop to Court 2, Court 2 losers stay on Court 2. All players on each court are then randomly re-paired into two new teams.",
  "Ranking: King Score = wins + points scored + Court 1 wins. Highest King Score after all rounds = #1 seed.",
  "After regular rounds, top 4 by King Score play the 🏆 Championship (#1+#4 vs #2+#3); bottom 4 play the 🥈 Consolation.",
  "Tiebreaker: the initial random seed drawn at tournament start.",
];
const RULES_GAUNTLET = [
  "8 players, 2 courts, doubles.",
  "After every round, all 8 players are re-ranked by performance (points scored → wins → point differential → head-to-head).",
  "Pairing rule: Court 1 gets #1+#4 vs #2+#3; Court 2 gets #5+#8 vs #6+#7 — the best play the best, the rest play the rest.",
  "Round 1 uses a random seed order.",
  "Standard scoring (default first to 11, win by 2). Standings use the same points/wins/differential ranking as Round Robin.",
  "After all rounds, top 4 play the 🏆 Championship, bottom 4 play the 🥈 Consolation.",
];
```

- [ ] **Step 2: Verify in browser console**

Open `pickleball.html` in a browser. In DevTools Console:
```js
console.log(RULES_KING[0]);
// Expected: "8 players, 2 courts. Court 1 is the 👑 King's Court; Court 2 is the Bottom Court."
console.log(RULES_GAUNTLET.length);
// Expected: 6
```

- [ ] **Step 3: Commit**

```bash
git add pickleball.html
git commit -m "feat: add RULES_KING and RULES_GAUNTLET constants"
```

---

## Task 3: King Engine Block

**Files:**
- Modify: `pickleball.html` — insert King engine block after `buildNextStackRound`

### Context
`buildNextStackRound` ends around line 2397. After it there is a blank line then `// ---------- Crown Court logic ----------`. Insert the King block in that gap. All helper functions (`shuffle`, `nameOf`, `teamName`, `isGameComplete`, `isRoundDecided`) are JS function declarations so they are hoisted and available regardless of definition order in the file.

- [ ] **Step 1: Insert the King engine block**

Find the closing brace of `buildNextStackRound` — it's followed by a blank line and then `// ---------- Crown Court logic ----------`. Insert the entire King block in that gap:

```js
// === KING FORMAT ===
// Court 1 = King's Court (top). After each round: winners move/stay up, losers move/stay down.
// Random re-pairing on each court every round. Ranking = composite King Score.

function assignInitialKingCourts() {
  const slots = shuffle([1,2,3,4,5,6,7,8]);
  const c1 = shuffle(slots.slice(0, 4));
  const c2 = shuffle(slots.slice(4));
  return {
    round: 1,
    court1: { team1: [c1[0], c1[1]], team2: [c1[2], c1[3]], score1: null, score2: null },
    court2: { team1: [c2[0], c2[1]], team2: [c2[2], c2[3]], score1: null, score2: null },
  };
}

function computeKingStats(throughRound) {
  const stats = [];
  for (let s = 1; s <= 8; s++) {
    stats.push({ slot: s, name: nameOf(s), wins: 0, pointsScored: 0, kingCourtWins: 0, kingScore: 0 });
  }
  const upTo = Math.min(throughRound || 0, state.rounds.length);
  for (let i = 0; i < upTo; i++) {
    const r = state.rounds[i];
    for (const courtKey of [1, 2]) {
      const game = courtKey === 1 ? r.court1 : r.court2;
      if (!isGameComplete(game)) continue;
      const t1Won = game.score1 > game.score2;
      const t2Won = game.score2 > game.score1;
      for (const teamKey of ["team1", "team2"]) {
        const team = game[teamKey];
        const pts = teamKey === "team1" ? game.score1 : game.score2;
        const won = (teamKey === "team1" && t1Won) || (teamKey === "team2" && t2Won);
        for (const slot of team) {
          const st = stats[slot - 1];
          st.pointsScored += pts;
          if (won) {
            st.wins++;
            if (courtKey === 1) st.kingCourtWins++;
          }
        }
      }
    }
  }
  stats.forEach(s => { s.kingScore = s.wins + s.pointsScored + s.kingCourtWins; });
  return stats;
}

function rankPlayersKing(throughRound) {
  const stats = computeKingStats(throughRound);
  const tieRand = (state.tiebreakRandom && state.tiebreakRandom.length === 8)
    ? state.tiebreakRandom : [0,1,2,3,4,5,6,7];
  stats.sort((a, b) => {
    if (b.kingScore !== a.kingScore) return b.kingScore - a.kingScore;
    return tieRand.indexOf(a.slot - 1) - tieRand.indexOf(b.slot - 1);
  });
  return stats;
}

function buildNextKingRound(prevRound) {
  if (!isRoundDecided(prevRound)) throw new Error("buildNextKingRound called with undecided round");
  const c1 = prevRound.court1, c2 = prevRound.court2;
  const c1Win  = c1.score1 > c1.score2 ? c1.team1 : c1.team2;
  const c1Lose = c1.score1 > c1.score2 ? c1.team2 : c1.team1;
  const c2Win  = c2.score1 > c2.score2 ? c2.team1 : c2.team2;
  const c2Lose = c2.score1 > c2.score2 ? c2.team2 : c2.team1;
  // Movement: winners pool → King's Court; losers pool → Bottom Court. Random re-pair on each.
  const newC1 = shuffle([...c1Win, ...c2Win]);
  const newC2 = shuffle([...c1Lose, ...c2Lose]);
  return {
    round: prevRound.round + 1,
    court1: { team1: [newC1[0], newC1[1]], team2: [newC1[2], newC1[3]], score1: null, score2: null },
    court2: { team1: [newC2[0], newC2[1]], team2: [newC2[2], newC2[3]], score1: null, score2: null },
  };
}

function kingMovementToastText(prevRound) {
  const c2Win  = prevRound.court2.score1 > prevRound.court2.score2
    ? prevRound.court2.team1 : prevRound.court2.team2;
  const c1Lose = prevRound.court1.score1 > prevRound.court1.score2
    ? prevRound.court1.team2 : prevRound.court1.team1;
  return teamName(c2Win) + " climb to King's Court · " + teamName(c1Lose) + " drop to Bottom";
}
```

- [ ] **Step 2: Verify in browser console**

Open the file in a browser. In DevTools Console:

```js
// Set up test state
state.format = "king";
state.slots = ["A","B","C","D","E","F","G","H"];
state.tiebreakRandom = [0,1,2,3,4,5,6,7];
state.rounds = [{
  round: 1,
  court1: { team1: [1,2], team2: [3,4], score1: 11, score2: 5 },
  court2: { team1: [5,6], team2: [7,8], score1: 8, score2: 11 }
}];
const ks = computeKingStats(1);
console.log(ks.map(s => s.name + ": wins=" + s.wins + " pts=" + s.pointsScored + " kCW=" + s.kingCourtWins + " KS=" + s.kingScore));
// Expected per player:
// A: wins=1, pts=11, kCW=1, KS=13   (won Court 1, scored 11)
// B: wins=1, pts=11, kCW=1, KS=13   (won Court 1, scored 11)
// G: wins=1, pts=11, kCW=0, KS=12   (won Court 2, scored 11)
// H: wins=1, pts=11, kCW=0, KS=12   (won Court 2, scored 11)
// C: wins=0, pts=5,  kCW=0, KS=5    (lost Court 1, scored 5)
// D: wins=0, pts=5,  kCW=0, KS=5    (same)
// E: wins=0, pts=8,  kCW=0, KS=8    (lost Court 2, scored 8)
// F: wins=0, pts=8,  kCW=0, KS=8    (same)

// Test movement
const r2 = buildNextKingRound(state.rounds[0]);
// Court 1 of r2 should contain slots 1,2,7,8 (winners pool)
// Court 2 of r2 should contain slots 3,4,5,6 (losers pool)
console.log("R2 C1 pool:", [...r2.court1.team1, ...r2.court1.team2].sort());
// Expected: [1, 2, 7, 8]
console.log("R2 C2 pool:", [...r2.court2.team1, ...r2.court2.team2].sort());
// Expected: [3, 4, 5, 6]
```

- [ ] **Step 3: Commit**

```bash
git add pickleball.html
git commit -m "feat: add King engine functions"
```

---

## Task 4: Gauntlet Engine Block + Dispatch Updates

**Files:**
- Modify: `pickleball.html` — insert Gauntlet engine block, update `totalRegularRounds()`, `rankPlayersForFormat()`, `nextPartnerInfo()`

### Context
The Gauntlet block goes immediately after the King engine block (still before `// ---------- Crown Court logic ----------`). `totalRegularRounds()` is at line ~2840. `rankPlayersForFormat()` is at line ~2699. `nextPartnerInfo()` is at line ~2714.

Note on Gauntlet ranking: `rankPlayers(throughRound)` uses `computeStats()` which tracks `points` = raw points scored (not a separate "ranking points" metric). This matches the Gauntlet rule of re-ranking by points scored → wins → differential → head-to-head.

Note on Gauntlet initial assignment: `rankPlayers(0)` with throughRound=0 returns all players with 0 stats, sorted only by `tiebreakRandom` (which is set in `startTournament()` before `assignInitialGauntletCourts()` is called). This produces a stable random seed order for Round 1.

- [ ] **Step 1: Insert the Gauntlet engine block**

Insert immediately after the King engine block (still before `// ---------- Crown Court logic ----------`):

```js
// === GAUNTLET FORMAT ===
// Re-rank all 8 after every round. Court 1: #1+#4 vs #2+#3; Court 2: #5+#8 vs #6+#7.
// Reuses existing rankPlayers() (points scored → wins → diff → h2h) — no new stats needed.

function buildGauntletPairing(ranked, roundNum) {
  return {
    round: roundNum,
    court1: { team1: [ranked[0], ranked[3]], team2: [ranked[1], ranked[2]], score1: null, score2: null },
    court2: { team1: [ranked[4], ranked[7]], team2: [ranked[5], ranked[6]], score1: null, score2: null },
  };
}

function assignInitialGauntletCourts() {
  // rankPlayers(0) returns all players with 0 stats → sorted by tiebreakRandom (already set in startTournament).
  const ranked = rankPlayers(0).map(s => s.slot);
  return buildGauntletPairing(ranked, 1);
}

function buildNextGauntletRound(prevRound) {
  const ranked = rankPlayers(prevRound.round).map(s => s.slot);
  return buildGauntletPairing(ranked, prevRound.round + 1);
}
```

- [ ] **Step 2: Update `totalRegularRounds()`**

Find `function totalRegularRounds()`. Replace the entire function body:

```js
function totalRegularRounds() {
  if (state.format === "stack")    return state.stackRounds;
  if (state.format === "king")     return state.kingRounds;
  if (state.format === "gauntlet") return state.gauntletRounds;
  if (state.format === "crown")    return 3;
  return 7;
}
```

- [ ] **Step 3: Update `rankPlayersForFormat()`**

Find `function rankPlayersForFormat(throughRound)`. Replace:

```js
function rankPlayersForFormat(throughRound) {
  if (state.format === "stack") return rankPlayersStack(throughRound);
  if (state.format === "king")  return rankPlayersKing(throughRound);
  return rankPlayers(throughRound); // rr, gauntlet: same ranking
}
```

- [ ] **Step 4: Update `nextPartnerInfo()`**

Find `if (state.format === "stack") return null;` inside `nextPartnerInfo()`. Replace with:

```js
if (state.format === "stack" || state.format === "king" || state.format === "gauntlet") return null;
```

This disables next-partner chips for both new formats (partners aren't known ahead of time for incremental formats).

- [ ] **Step 5: Verify in browser console**

Open the file in a browser. In DevTools Console:

```js
// Verify totalRegularRounds
state.format = "king"; state.kingRounds = 9;
console.log(totalRegularRounds()); // Expected: 9

state.format = "gauntlet"; state.gauntletRounds = 8;
console.log(totalRegularRounds()); // Expected: 8

// Test Gauntlet initial assignment
state.tiebreakRandom = [2,5,0,7,3,1,6,4]; // arbitrary shuffle
state.slots = ["A","B","C","D","E","F","G","H"];
state.rounds = [];
const g1 = assignInitialGauntletCourts();
console.log("Court 1:", g1.court1.team1, "vs", g1.court1.team2);
console.log("Court 2:", g1.court2.team1, "vs", g1.court2.team2);
// Each team should have 2 slot numbers; 4 unique slots per court; 8 total unique slots
const allSlots = [...g1.court1.team1, ...g1.court1.team2, ...g1.court2.team1, ...g1.court2.team2];
console.log("All slots:", allSlots.sort(), "unique:", new Set(allSlots).size);
// Expected: [1,2,3,4,5,6,7,8], unique: 8
```

- [ ] **Step 6: Commit**

```bash
git add pickleball.html
git commit -m "feat: add Gauntlet engine and update dispatch functions"
```

---

## Task 5: Format Chooser UI + How It Works Modal

**Files:**
- Modify: `pickleball.html` — `renderFormatChooser()`, `rulesForActiveFormat()`, `openHowItWorksModal()`

### Context
`renderFormatChooser()` is around line 2988. `rulesForActiveFormat()` is around line 2895. `openHowItWorksModal()` is around line 5256.

- [ ] **Step 1: Add King and Gauntlet to `renderFormatChooser()` opts array**

Find the `opts` array inside `renderFormatChooser()`:
```js
const opts = [
  { id: "rr",    title: "Round Robin",  blurb: "7 rounds, every pair partners once. Top 4 → Championship." },
  { id: "stack", title: "Stack Format", blurb: "Court 1 (top) vs Court 2 (climbing). Win to climb, lose to drop." },
  { id: "crown", title: "Crown Court",  blurb: "4 players, 3 themed rounds + a Championship Crown Match." },
];
```

Replace with:
```js
const opts = [
  { id: "rr",       title: "Round Robin",      blurb: "7 rounds, every pair partners once. Top 4 → Championship." },
  { id: "stack",    title: "Stack Format",      blurb: "Court 1 (top) vs Court 2 (climbing). Win to climb, lose to drop." },
  { id: "king",     title: "King of the Court", blurb: "Winners stay or climb, losers drop. Random re-pairing each round." },
  { id: "gauntlet", title: "Gauntlet",          blurb: "Re-rank after every round. Top pairs top, bottom pairs bottom." },
  { id: "crown",    title: "Crown Court",        blurb: "4 players, 3 themed rounds + a Championship Crown Match." },
];
```

- [ ] **Step 2: Add rounds sub-selectors for King and Gauntlet in `renderFormatChooser()`**

Find the existing Stack sub-selector block:
```js
if (state.format === "stack") {
  const sub = el("div", { class: "settings-row", style: "margin-top: 10px; padding: 0;" });
  // ...
  wrap.appendChild(sub);
}
return wrap;
```

Add the King and Gauntlet sub-selectors immediately after the Stack block (before `return wrap;`):

```js
if (state.format === "king") {
  const sub = el("div", { class: "settings-row", style: "margin-top: 10px; padding: 0;" });
  sub.appendChild(el("label", null, "Rounds"));
  const sel = el("select");
  [6,7,8,9,10,11,12].forEach(v => {
    const opt = el("option", { value: String(v) }, String(v));
    if (state.kingRounds === v) opt.setAttribute("selected", "selected");
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => { state.kingRounds = parseInt(sel.value, 10); save(); });
  sub.appendChild(sel);
  wrap.appendChild(sub);
}
if (state.format === "gauntlet") {
  const sub = el("div", { class: "settings-row", style: "margin-top: 10px; padding: 0;" });
  sub.appendChild(el("label", null, "Rounds"));
  const sel = el("select");
  [6,7,8,9,10,11,12].forEach(v => {
    const opt = el("option", { value: String(v) }, String(v));
    if (state.gauntletRounds === v) opt.setAttribute("selected", "selected");
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => { state.gauntletRounds = parseInt(sel.value, 10); save(); });
  sub.appendChild(sel);
  wrap.appendChild(sub);
}
```

- [ ] **Step 3: Update `rulesForActiveFormat()`**

Replace the function body:

```js
function rulesForActiveFormat() {
  if (state.format === "stack")    return RULES_STACK;
  if (state.format === "king")     return RULES_KING;
  if (state.format === "gauntlet") return RULES_GAUNTLET;
  if (state.format === "crown")    return RULES_CROWN;
  return RULES_RR;
}
```

- [ ] **Step 4: Add King and Gauntlet to `openHowItWorksModal()` sections array**

Find the `sections` array in `openHowItWorksModal()`:
```js
const sections = [
  { id: "rr",    label: "Round Robin",  bullets: RULES_RR },
  { id: "stack", label: "Stack Format", bullets: RULES_STACK },
  { id: "crown", label: "Crown Court",  bullets: RULES_CROWN },
];
```

Replace with:
```js
const sections = [
  { id: "rr",       label: "Round Robin",      bullets: RULES_RR },
  { id: "stack",    label: "Stack Format",      bullets: RULES_STACK },
  { id: "king",     label: "King of the Court", bullets: RULES_KING },
  { id: "gauntlet", label: "Gauntlet",          bullets: RULES_GAUNTLET },
  { id: "crown",    label: "Crown Court",       bullets: RULES_CROWN },
];
```

- [ ] **Step 5: Verify in browser**

1. Open the file in a browser.
2. The format chooser on the setup screen should show 5 format buttons: Round Robin, Stack Format, King of the Court, Gauntlet, Crown Court.
3. Click "King of the Court" — a rounds selector (6-12, default 9) should appear below the buttons.
4. Click "Gauntlet" — a rounds selector (6-12, default 8) should appear.
5. Open ⚙ Settings → "How this works" — verify King and Gauntlet accordions appear.
6. Select King, reopen "How this works" — King accordion should be expanded, others collapsed.

- [ ] **Step 6: Commit**

```bash
git add pickleball.html
git commit -m "feat: add King and Gauntlet to format chooser and How It Works modal"
```

---

## Task 6: Tournament Start

**Files:**
- Modify: `pickleball.html` — `startTournament()`

### Context
`startTournament()` is around line 2565. It has an `if (isCrown)` branch, an `else if (state.format === "stack")` branch, and a final `else` (RR). Add King and Gauntlet branches between Stack and the final else.

`state.tiebreakRandom` is set at the TOP of `startTournament()` (before any format branches), so it's already set when `assignInitialGauntletCourts()` is called.

- [ ] **Step 1: Add King and Gauntlet branches in `startTournament()`**

Find the Stack branch end and the final RR `else`:
```js
  } else if (state.format === "stack") {
    state.slots = shuffled;
    state.rounds = [assignInitialStackCourts()];
    // ...
  } else {
    state.slots = shuffled;
    state.rounds = generateRounds();
    // ...
  }
```

Insert two new `else if` branches between Stack and the final `else`:

```js
  } else if (state.format === "king") {
    state.slots = shuffled;
    state.rounds = [assignInitialKingCourts()];
    state.phase = "playing";
    save();
    const r1k = state.rounds[0];
    const kC1Slots = [...r1k.court1.team1, ...r1k.court1.team2];
    const kC2Slots = [...r1k.court2.team1, ...r1k.court2.team2];
    const kDisplay = [...kC1Slots.map(nameOf), ...kC2Slots.map(nameOf)];
    runShuffleReveal(kDisplay, () => render(), {
      title: "Drawing courts…",
      groups: [
        { label: "👑 King's Court", count: 4 },
        { label: "Bottom Court",   count: 4 },
      ],
    });
  } else if (state.format === "gauntlet") {
    state.slots = shuffled;
    state.rounds = [assignInitialGauntletCourts()];
    state.phase = "playing";
    save();
    const r1g = state.rounds[0];
    const gC1Slots = [...r1g.court1.team1, ...r1g.court1.team2];
    const gC2Slots = [...r1g.court2.team1, ...r1g.court2.team2];
    const gDisplay = [...gC1Slots.map(nameOf), ...gC2Slots.map(nameOf)];
    runShuffleReveal(gDisplay, () => render(), {
      title: "Drawing courts…",
      groups: [
        { label: "Court 1 (Top)", count: 4 },
        { label: "Court 2",       count: 4 },
      ],
    });
  } else {
```

- [ ] **Step 2: Verify in browser**

1. Select "King of the Court" format, enter 8 names, click Start.
2. The shuffle reveal should show two labeled groups: "👑 King's Court" and "Bottom Court", each with 4 names.
3. After reveal, the playing screen should attempt to render (it may look wrong until Tasks 7/8 are done — that's OK).
4. Reload, select "Gauntlet", enter 8 names, click Start.
5. The shuffle reveal should show "Court 1 (Top)" and "Court 2" groups.

- [ ] **Step 3: Commit**

```bash
git add pickleball.html
git commit -m "feat: add startTournament branches for King and Gauntlet"
```

---

## Task 7: Round Advancement — Format Booleans + Readiness

**Files:**
- Modify: `pickleball.html` — top of `renderPlaying()`: add booleans, update `advanceReady` and `allRoundsAdvanceable`

### Context
`renderPlaying()` is around line 3873. It begins with `if (state.format === "crown") return renderCrownPlaying();`. Just after that, it defines `const isStack = state.format === "stack";`. We add new booleans here and update the two readiness constants. The advance button handlers are updated in the next task.

Adding the booleans is a non-breaking intermediate state: `isStack` still exists and is still used by the unmodified handlers below.

- [ ] **Step 1: Add format booleans at the top of `renderPlaying()`**

Find these lines near the top of `renderPlaying()` (after the Crown early return):
```js
  const wrap = el("div");
  const round = state.rounds[state.currentRound - 1];
  const isStack = state.format === "stack";
  const total = totalRegularRounds();
```

Replace with:
```js
  const wrap = el("div");
  const round = state.rounds[state.currentRound - 1];
  const isStack       = state.format === "stack";
  const isKing        = state.format === "king";
  const isGauntlet    = state.format === "gauntlet";
  const isIncremental = isStack || isKing || isGauntlet; // rounds built one at a time
  const requiresDecided = isStack || isKing;             // ties block advancement
  const total = totalRegularRounds();
```

- [ ] **Step 2: Update `advanceReady` and `allRoundsAdvanceable`**

Find:
```js
  const advanceReady = isStack ? isRoundDecided(round) : isRoundComplete(round);
  const allRoundsAdvanceable = isStack
    ? (state.rounds.length === total && state.rounds.every(isRoundDecided))
    : state.rounds.every(isRoundComplete);
```

Replace with:
```js
  const advanceReady = requiresDecided ? isRoundDecided(round) : isRoundComplete(round);
  const allRoundsAdvanceable = requiresDecided
    ? (state.rounds.length === total && state.rounds.every(isRoundDecided))
    : isIncremental
      ? (state.rounds.length === total && state.rounds.every(isRoundComplete))
      : state.rounds.every(isRoundComplete);
```

- [ ] **Step 3: Verify in browser console**

Open the file in a browser. Start a King tournament (or temporarily set `state.format = "king"` in console). In DevTools Console:
```js
// After renderPlaying() renders:
// The "Round 2 →" button should be disabled initially.
// Enter a tied score on court 1 (e.g., 11-11) — button should stay disabled for King.
// Enter a decided score on both courts — button should enable.
```

- [ ] **Step 4: Commit**

```bash
git add pickleball.html
git commit -m "feat: renderPlaying format booleans and readiness predicates for King/Gauntlet"
```

---

## Task 8: Round Advancement — Advance Handlers + `maybeFireRoundComplete`

**Files:**
- Modify: `pickleball.html` — advance button onclick, Build Finals onclick, `refreshes.push` callback, `maybeFireRoundComplete()`

### Context
Still in `renderPlaying()` (line ~3873). The three handler replacements are separate finds within the same function. `maybeFireRoundComplete()` is at line ~2745.

- [ ] **Step 1: Update the "Next Round" advance button click handler**

Find the advance button's onclick — it currently has this structure:
```js
      onclick: () => {
        if (isStack) {
          if (!isRoundDecided(round)) return;
          let toastMsg = null;
          if (state.rounds.length === state.currentRound) {
            state.previousRanks = rankPlayersStack(state.currentRound).map(s => s.slot);
            const next = buildNextStackRound(round);
            state.rounds.push(next);
            toastMsg = movementToastText(round, next);
          }
          state.currentRound++;
          save();
          render();
          if (toastMsg) showToast(toastMsg);
        } else {
          if (!isRoundComplete(round)) return;
          state.currentRound++;
          save();
          render();
        }
      }
```

Replace with:
```js
      onclick: () => {
        if (isIncremental) {
          if (requiresDecided ? !isRoundDecided(round) : !isRoundComplete(round)) return;
          let toastMsg = null;
          if (state.rounds.length === state.currentRound) {
            state.previousRanks = rankPlayersForFormat(state.currentRound).map(s => s.slot);
            if (isStack) {
              const next = buildNextStackRound(round);
              state.rounds.push(next);
              toastMsg = movementToastText(round, next);
            } else if (isKing) {
              const next = buildNextKingRound(round);
              state.rounds.push(next);
              toastMsg = kingMovementToastText(round);
            } else {
              state.rounds.push(buildNextGauntletRound(round));
            }
          }
          state.currentRound++;
          save();
          render();
          if (toastMsg) showToast(toastMsg);
        } else {
          if (!isRoundComplete(round)) return;
          state.currentRound++;
          save();
          render();
        }
      }
```

- [ ] **Step 2: Update the "Build Finals" button `onclick` re-evaluation**

Find the "Build Finals" button's onclick (it re-evaluates readiness at click time):
```js
      onclick: () => {
        const ready = isStack
          ? (state.rounds.length === total && state.rounds.every(isRoundDecided))
          : state.rounds.every(isRoundComplete);
        if (ready) { buildFinals(); render(); }
      }
```

Replace with:
```js
      onclick: () => {
        const ready = requiresDecided
          ? (state.rounds.length === total && state.rounds.every(isRoundDecided))
          : isIncremental
            ? (state.rounds.length === total && state.rounds.every(isRoundComplete))
            : state.rounds.every(isRoundComplete);
        if (ready) { buildFinals(); render(); }
      }
```

- [ ] **Step 3: Update the `refreshes.push` callback for primary button state**

Find the `refreshes.push(() => {` callback that updates `primaryBtn.disabled`. It currently has:
```js
    if (state.currentRound < total) {
      primaryBtn.disabled = isStack ? !isRoundDecided(round) : !isRoundComplete(round);
    } else {
      primaryBtn.disabled = isStack
        ? !(state.rounds.length === total && state.rounds.every(isRoundDecided))
        : !state.rounds.every(isRoundComplete);
    }
```

Replace those lines (keep the rest of the callback unchanged):
```js
    if (state.currentRound < total) {
      primaryBtn.disabled = requiresDecided ? !isRoundDecided(round) : !isRoundComplete(round);
    } else {
      primaryBtn.disabled = requiresDecided
        ? !(state.rounds.length === total && state.rounds.every(isRoundDecided))
        : isIncremental
          ? !(state.rounds.length === total && state.rounds.every(isRoundComplete))
          : !state.rounds.every(isRoundComplete);
    }
```

- [ ] **Step 4: Update `maybeFireRoundComplete()`**

Find:
```js
  const advanceable = state.format === "stack" ? isRoundDecided(round) : isRoundComplete(round);
```

Replace with:
```js
  const advanceable = (state.format === "stack" || state.format === "king")
    ? isRoundDecided(round)
    : isRoundComplete(round);
```

- [ ] **Step 5: Verify in browser**

1. Start a King tournament with 8 names.
2. Enter scores for both courts (one team wins each — no ties for King).
3. The "Round 2 →" button should become enabled.
4. Clicking advance should show a toast: "X & Y climb to King's Court · A & B drop to Bottom".
5. Round 2 should appear with new matchups. Winners from both courts should be on Court 1.
6. Start a Gauntlet tournament. Enter scores (ties allowed). Button enables on complete scores (tied ok). Advancing builds next round silently (no toast).

- [ ] **Step 6: Commit**

```bash
git add pickleball.html
git commit -m "feat: round advancement handlers for King and Gauntlet"
```

---

## Task 9: Court Labels, History, Schedule

**Files:**
- Modify: `pickleball.html` — `renderCourtCard()`, `renderHistory()`, `openScheduleModal()`

### Context
`renderCourtCard()` is around line 3993. `renderHistory()` is around line 4250. `openScheduleModal()` is around line 5183.

- [ ] **Step 1: Update court labels in `renderCourtCard()`**

Find this block (the two `else if` branches for `courtKey === 1` and `courtKey` being the bottom court):
```js
  } else if (courtKey === 1) {
    className += " c1" + (isStack ? " stack-top" : "");
    labelText = isStack ? "🏆 COURT 1" : "SOUTH COURT";
  } else {
    className += " c2" + (isStack ? " stack-bot" : "");
    labelText = isStack ? "COURT 2" : "NORTH COURT";
  }
```

Replace with:
```js
  } else if (courtKey === 1) {
    className += " c1" + (isStack ? " stack-top" : "");
    labelText = { stack: "🏆 COURT 1", king: "👑 KING'S COURT", gauntlet: "COURT 1 (TOP)" }[state.format] || "SOUTH COURT";
  } else {
    className += " c2" + (isStack ? " stack-bot" : "");
    labelText = { stack: "COURT 2", king: "BOTTOM COURT", gauntlet: "COURT 2" }[state.format] || "NORTH COURT";
  }
```

- [ ] **Step 2: Update court labels in `renderHistory()`**

Find:
```js
    const isStack = state.format === "stack";
    const c1Label = isStack ? "Court 1" : "South";
    const c2Label = isStack ? "Court 2" : "North";
```

Replace with:
```js
    const c1Label = { stack: "Court 1", king: "King's Court", gauntlet: "Court 1" }[state.format] || "South";
    const c2Label = { stack: "Court 2", king: "Bottom",       gauntlet: "Court 2" }[state.format] || "North";
```

(Remove the `const isStack` line — it was only used for the labels here.)

- [ ] **Step 3: Update court labels in `openScheduleModal()`**

Find:
```js
    const isStack = state.format === "stack";
    const c1Tag = isStack ? "Court 1" : "South";
    const c2Tag = isStack ? "Court 2" : "North";
```

Replace with:
```js
    const c1Tag = { stack: "Court 1", king: "King's Court", gauntlet: "Court 1" }[state.format] || "South";
    const c2Tag = { stack: "Court 2", king: "Bottom",       gauntlet: "Court 2" }[state.format] || "North";
```

- [ ] **Step 4: Verify in browser**

1. Start a King tournament, enter round 1 scores. Court cards should show "👑 KING'S COURT" and "BOTTOM COURT".
2. Advance to round 2. The History section should show "King's Court" and "Bottom" labels.
3. Open ⚙ Settings → "View full schedule" — should show "King's Court" and "Bottom" tags.
4. Repeat for Gauntlet: court cards show "COURT 1 (TOP)" and "COURT 2"; history and schedule show "Court 1"/"Court 2".

- [ ] **Step 5: Commit**

```bash
git add pickleball.html
git commit -m "feat: court labels for King and Gauntlet in cards, history, schedule"
```

---

## Task 10: Standings

**Files:**
- Modify: `pickleball.html` — insert `renderKingStandingsCard()`, update `renderStandingsCard()`

### Context
`renderStandingsCard()` is around line 4146. Insert `renderKingStandingsCard()` immediately before it. `trajectorySpan()`, `rankCell()`, and `MEDALS` are all defined just before `renderStandingsCard` and will be available.

- [ ] **Step 1: Insert `renderKingStandingsCard()` before `renderStandingsCard()`**

Find the line `function renderStandingsCard(throughRound, opts) {` and insert the entire new function immediately before it:

```js
function renderKingStandingsCard(throughRound, opts) {
  opts = opts || {};
  const stats = rankPlayersKing(throughRound);
  const card = el("div", { class: "card" });
  const head = el("div", { style: "display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; gap: 10px; flex-wrap: wrap;" },
    el("h3", { style: "margin: 0;" }, opts.title || "Live Standings"),
    opts.subtitle ? el("span", { class: "muted" }, opts.subtitle) : null,
  );
  card.appendChild(head);
  const table = el("table", { class: "standings" });
  const colgroup = el("colgroup", null,
    el("col", { class: "c-rank" }),
    el("col", { class: "c-name" }),
    el("col", { class: "c-pts" }),
    el("col", { class: "c-w" }),
    el("col", { class: "c-stack-extra" }),
    el("col", { class: "c-stack-extra" }),
  );
  table.appendChild(colgroup);
  table.appendChild(el("thead", null, el("tr", null,
    el("th", { style: "text-align: center;" }, "#"),
    el("th", null, "Player"),
    el("th", { class: "num", title: "King Score = wins + points + Court 1 wins" }, "Score"),
    el("th", { class: "num", title: "Total wins" }, "W"),
    el("th", { class: "num col-hide-mobile", title: "Court 1 wins" }, "👑W"),
    el("th", { class: "num col-hide-mobile", title: "Points scored" }, "PTS"),
  )));
  const tbody = el("tbody");
  stats.forEach((s, i) => {
    const traj = trajectorySpan(s.slot, i);
    const rankTd = el("td", { class: "rank" });
    if (i < 3) rankTd.appendChild(el("span", { class: "rank-badge medal" }, MEDALS[i]));
    else       rankTd.appendChild(el("span", { class: "rank-badge" }, "" + (i + 1)));
    if (traj) rankTd.appendChild(traj);
    tbody.appendChild(el("tr", { class: "r" + (i + 1) },
      rankTd,
      el("td", { class: "name" }, s.name),
      el("td", { class: "num" }, "" + s.kingScore),
      el("td", { class: "num" }, "" + s.wins),
      el("td", { class: "num col-hide-mobile" }, "" + s.kingCourtWins),
      el("td", { class: "num col-hide-mobile" }, "" + s.pointsScored),
    ));
  });
  table.appendChild(tbody);
  card.appendChild(table);
  return card;
}
```

- [ ] **Step 2: Add King and Gauntlet dispatches in `renderStandingsCard()`**

Find the beginning of `renderStandingsCard()`:
```js
function renderStandingsCard(throughRound, opts) {
  if (state.format === "stack") return renderStackStandingsCard(throughRound, opts);
  if (state.format === "crown") return renderCrownStandingsCard();
  opts = opts || {};
  const stats = rankPlayers(throughRound);
```

Replace those lines with:
```js
function renderStandingsCard(throughRound, opts) {
  if (state.format === "stack")    return renderStackStandingsCard(throughRound, opts);
  if (state.format === "crown")    return renderCrownStandingsCard();
  if (state.format === "king")     return renderKingStandingsCard(throughRound, opts);
  opts = opts || {};
  if (state.format === "gauntlet") opts = { ...opts, hidePartners: true };
  const stats = rankPlayers(throughRound);
```

The `hidePartners: true` hides the "N partners left" badge (which counts `7 - partnersUsed.size` — meaningless for Gauntlet). The next-partner chips are already suppressed by `nextPartnerInfo()` returning null for Gauntlet (Task 4 Step 4).

- [ ] **Step 3: Verify in browser**

1. Play a King tournament through 3 rounds with varied scores. The standings should show columns: Score, W, 👑W, PTS. Rank order should reflect the composite King Score. After advancing to round 2, trajectory arrows (▲▼) should appear next to rank numbers.
2. Play a Gauntlet tournament. The standings should show the standard PTS/W/+/– columns (same as Round Robin) without the "X left" partner badge.

- [ ] **Step 4: Commit**

```bash
git add pickleball.html
git commit -m "feat: King standings card, Gauntlet standings (hidePartners)"
```

---

## Task 11: Podium and Awards

**Files:**
- Modify: `pickleball.html` — `renderPodium()`, `computeAwards()`

### Context
`renderPodium()` is around line 4355. `computeAwards()` is around line 4394. Both currently call `computeStats(7, true)` with a hardcoded 7. For King and Gauntlet with different round counts this truncates stats — fix to use `computeStats(totalRegularRounds(), true)`.

- [ ] **Step 1: Update `renderPodium()` — add King branch and fix hardcoded `7`**

Find the else branch in `renderPodium()`:
```js
  } else {
    const stats = computeStats(7, true);
    labelBySlot = new Map(stats.map(s => [s.slot, s.points + " pts"]));
  }
```

Replace with:
```js
  } else if (state.format === "king") {
    const ks = computeKingStats(state.rounds.length);
    labelBySlot = new Map(ks.map(s => [s.slot, s.kingScore + " KS"]));
  } else {
    const stats = computeStats(totalRegularRounds(), true);
    labelBySlot = new Map(stats.map(s => [s.slot, s.points + " pts"]));
  }
```

- [ ] **Step 2: Update `computeAwards()` — add King MVP, fix hardcoded `7`, fix court tags**

Find the else branch for MVP in `computeAwards()`:
```js
  } else {
    const stats = computeStats(7, true);
    const maxPts = stats.reduce((m, s) => Math.max(m, s.points), 0);
    const mvpNames = stats.filter(s => s.points === maxPts).map(s => nameOf(s.slot));
    mvp = { names: mvpNames, detail: maxPts + " pts" };
  }
```

Replace with:
```js
  } else if (state.format === "king") {
    const ks = computeKingStats(state.rounds.length);
    const maxKS = ks.reduce((m, s) => Math.max(m, s.kingScore), 0);
    const winners = ks.filter(s => s.kingScore === maxKS && maxKS > 0);
    mvp = winners.length
      ? { names: winners.map(s => nameOf(s.slot)), detail: maxKS + " KS" }
      : { names: [], detail: null };
  } else {
    const stats = computeStats(totalRegularRounds(), true);
    const maxPts = stats.reduce((m, s) => Math.max(m, s.points), 0);
    const mvpNames = stats.filter(s => s.points === maxPts).map(s => nameOf(s.slot));
    mvp = { names: mvpNames, detail: maxPts + " pts" };
  }
```

Then find the court tag lines in `computeAwards()`:
```js
  const c1Tag = isStack ? "Court 1" : "South";
  const c2Tag = isStack ? "Court 2" : "North";
```

Replace with:
```js
  const c1Tag = { stack: "Court 1", king: "King's Court", gauntlet: "Court 1" }[state.format] || "South";
  const c2Tag = { stack: "Court 2", king: "Bottom Court", gauntlet: "Court 2" }[state.format] || "North";
```

- [ ] **Step 3: Verify in browser**

1. Play a complete King tournament (all rounds → Build Finals → enter final scores) through to the done screen.
2. The podium should show "N KS" labels for King players.
3. The awards strip should show a King Score-based MVP (highest KS wins).
4. Repeat for Gauntlet: podium shows "N pts", MVP shows highest point scorer.

- [ ] **Step 4: Commit**

```bash
git add pickleball.html
git commit -m "feat: podium and awards for King and Gauntlet"
```

---

## Task 12: Done Screen — Final Standings Table

**Files:**
- Modify: `pickleball.html` — `renderDoneScreen()` final standings table branch

### Context
`renderDoneScreen()` is around line 5029. It has a `if (isStack) { ... } else { computeStats(7, true) ... }` branch for the final standings table. Add a King branch and fix the Gauntlet hardcoded `7`.

- [ ] **Step 1: Add `isKing` boolean and update `colSpan`**

Find these lines in `renderDoneScreen()`:
```js
  const isStack = state.format === "stack";
  const colSpan = isStack ? 6 : 5;
```

Replace with:
```js
  const isStack = state.format === "stack";
  const isKing  = state.format === "king";
  const colSpan = (isStack || isKing) ? 6 : 5;
```

- [ ] **Step 2: Replace the final standings `else` block**

Find the final standings `else` block (starts with `} else {` and ends with `finalCard.appendChild(el("p", ...`):
```js
  } else {
    const allStats = computeStats(7, true);
    const colgroup = el("colgroup", null,
      el("col", { class: "c-rank" }),
      el("col", { class: "c-name" }),
      el("col", { class: "c-pts" }),
      el("col", { class: "c-w" }),
      el("col", { class: "c-diff" }),
    );
    table.appendChild(colgroup);
    table.appendChild(el("thead", null, el("tr", null,
      el("th", { style: "text-align: center;" }, "#"),
      el("th", null, "Player"),
      el("th", { class: "num" }, "PTS"),
      el("th", { class: "num" }, "W"),
      el("th", { class: "num col-hide-mobile" }, "+/–"),
    )));
    const tbody = el("tbody");
    ranking.forEach((rs, i) => {
      if (dividerLabels[i]) tbody.appendChild(tierDividerRow(dividerLabels[i]));
      const s = allStats.find(x => x.slot === rs.slot);
      tbody.appendChild(el("tr", { class: "r" + (i + 1) },
        rankCell(i),
        el("td", { class: "name" }, s.name),
        el("td", { class: "num" }, "" + s.points),
        el("td", { class: "num" }, "" + s.wins),
        el("td", { class: "num col-hide-mobile", style: s.diff > 0 ? "color: var(--good);" : (s.diff < 0 ? "color: var(--bad);" : "") },
          (s.diff > 0 ? "+" : "") + s.diff),
      ));
    });
    table.appendChild(tbody);
  }
  finalCard.appendChild(table);
  finalCard.appendChild(el("p", { class: "standings-footer" },
    "Within each tier, season points → wins → differential break ties."));
```

Replace with:
```js
  } else if (isKing) {
    const kingStats = computeKingStats(state.rounds.length);
    const byKingSlot = new Map(kingStats.map(s => [s.slot, s]));
    const colgroup = el("colgroup", null,
      el("col", { class: "c-rank" }),
      el("col", { class: "c-name" }),
      el("col", { class: "c-pts" }),
      el("col", { class: "c-w" }),
      el("col", { class: "c-stack-extra" }),
      el("col", { class: "c-stack-extra" }),
    );
    table.appendChild(colgroup);
    table.appendChild(el("thead", null, el("tr", null,
      el("th", { style: "text-align: center;" }, "#"),
      el("th", null, "Player"),
      el("th", { class: "num", title: "King Score" }, "Score"),
      el("th", { class: "num" }, "W"),
      el("th", { class: "num col-hide-mobile", title: "Court 1 wins" }, "👑W"),
      el("th", { class: "num col-hide-mobile", title: "Points scored" }, "PTS"),
    )));
    const tbody = el("tbody");
    ranking.forEach((rs, i) => {
      if (dividerLabels[i]) tbody.appendChild(tierDividerRow(dividerLabels[i]));
      const s = byKingSlot.get(rs.slot);
      tbody.appendChild(el("tr", { class: "r" + (i + 1) },
        rankCell(i),
        el("td", { class: "name" }, s.name),
        el("td", { class: "num" }, "" + s.kingScore),
        el("td", { class: "num" }, "" + s.wins),
        el("td", { class: "num col-hide-mobile" }, "" + s.kingCourtWins),
        el("td", { class: "num col-hide-mobile" }, "" + s.pointsScored),
      ));
    });
    table.appendChild(tbody);
  } else {
    const allStats = computeStats(totalRegularRounds(), true);
    const colgroup = el("colgroup", null,
      el("col", { class: "c-rank" }),
      el("col", { class: "c-name" }),
      el("col", { class: "c-pts" }),
      el("col", { class: "c-w" }),
      el("col", { class: "c-diff" }),
    );
    table.appendChild(colgroup);
    table.appendChild(el("thead", null, el("tr", null,
      el("th", { style: "text-align: center;" }, "#"),
      el("th", null, "Player"),
      el("th", { class: "num" }, "PTS"),
      el("th", { class: "num" }, "W"),
      el("th", { class: "num col-hide-mobile" }, "+/–"),
    )));
    const tbody = el("tbody");
    ranking.forEach((rs, i) => {
      if (dividerLabels[i]) tbody.appendChild(tierDividerRow(dividerLabels[i]));
      const s = allStats.find(x => x.slot === rs.slot);
      tbody.appendChild(el("tr", { class: "r" + (i + 1) },
        rankCell(i),
        el("td", { class: "name" }, s.name),
        el("td", { class: "num" }, "" + s.points),
        el("td", { class: "num" }, "" + s.wins),
        el("td", { class: "num col-hide-mobile", style: s.diff > 0 ? "color: var(--good);" : (s.diff < 0 ? "color: var(--bad);" : "") },
          (s.diff > 0 ? "+" : "") + s.diff),
      ));
    });
    table.appendChild(tbody);
  }
  finalCard.appendChild(table);
  const footerText = isKing
    ? "Within each tier, King Score (wins + points + Court 1 wins) breaks ties."
    : "Within each tier, season points → wins → differential break ties.";
  finalCard.appendChild(el("p", { class: "standings-footer" }, footerText));
```

- [ ] **Step 3: Verify in browser**

1. Play a complete King tournament through to the done screen.
2. The final standings should show Score/W/👑W/PTS columns with tier dividers.
3. The footer text should say "Within each tier, King Score (wins + points + Court 1 wins) breaks ties."
4. Repeat for Gauntlet: done screen shows PTS/W/+/– columns, no partner badge, and `totalRegularRounds()` worth of stats.

- [ ] **Step 4: Commit**

```bash
git add pickleball.html
git commit -m "feat: done screen final standings for King and Gauntlet"
```

---

## Task 13: Settings Integration

**Files:**
- Modify: `pickleball.html` — `openSettings()`

### Context
`openSettings()` is around line 5295. It has:
1. A Stack rounds config block (shown when `state.phase !== "setup"`)
2. An `allFormats` array for the switch-format buttons
3. A format-switch `onclick` handler that preserves settings
4. A Reset Tournament handler that has two branches: `if (isCrown) { ... } else { ... }`. The Crown branch is NOT modified — only the `else` branch's round-builder dispatch line is updated.

- [ ] **Step 1: Add rounds config for King and Gauntlet in Settings**

Find the Stack rounds config block inside `openSettings()` (it's only shown when `state.phase !== "setup"`):
```js
    if (state.format === "stack") {
      const noGamesPlayed = !state.rounds.some(r =>
        isGameComplete(r.court1) || isGameComplete(r.court2)
      );
      const roundsRow = el("div", { class: "settings-row" });
      roundsRow.appendChild(el("label", null, "Stack rounds"));
      // ...
      if (!noGamesPlayed) {
        modal.appendChild(el("p", { class: "muted", style: "font-size: 11px; margin: 0 0 6px;" },
          "Locked once games begin."));
      }
    }
```

Insert a second block immediately after the Stack block's closing `}`:

```js
    if (state.format === "king" || state.format === "gauntlet") {
      const isFmt = state.format === "king";
      const noGamesPlayed = !state.rounds.some(r =>
        isGameComplete(r.court1) || isGameComplete(r.court2)
      );
      const roundsRow = el("div", { class: "settings-row" });
      roundsRow.appendChild(el("label", null, isFmt ? "King rounds" : "Gauntlet rounds"));
      const sel = el("select");
      [6,7,8,9,10,11,12].forEach(v => {
        const opt = el("option", { value: String(v) }, String(v));
        if ((isFmt ? state.kingRounds : state.gauntletRounds) === v) opt.setAttribute("selected", "selected");
        sel.appendChild(opt);
      });
      if (!noGamesPlayed) sel.disabled = true;
      sel.addEventListener("change", () => {
        if (isFmt) state.kingRounds = parseInt(sel.value, 10);
        else state.gauntletRounds = parseInt(sel.value, 10);
        save();
      });
      roundsRow.appendChild(sel);
      modal.appendChild(roundsRow);
      if (!noGamesPlayed) {
        modal.appendChild(el("p", { class: "muted", style: "font-size: 11px; margin: 0 0 6px;" },
          "Locked once games begin."));
      }
    }
```

- [ ] **Step 2: Update `allFormats` list in `openSettings()`**

Find:
```js
  const allFormats = [
    { id: "rr",    label: "Round Robin" },
    { id: "stack", label: "Stack Format" },
    { id: "crown", label: "Crown Court" },
  ];
```

Replace with:
```js
  const allFormats = [
    { id: "rr",       label: "Round Robin" },
    { id: "stack",    label: "Stack Format" },
    { id: "king",     label: "King of the Court" },
    { id: "gauntlet", label: "Gauntlet" },
    { id: "crown",    label: "Crown Court" },
  ];
```

- [ ] **Step 3: Preserve `kingRounds` and `gauntletRounds` in the format-switch handler**

Inside the format-switch button's `onclick`, find the block that saves and restores settings:
```js
          const keptNames = state.rawNames.slice();
          const keptWinScore = state.winScore;
          const keptStackRounds = state.stackRounds;
          const keptKeepAwake = state.keepAwake;
          const keptKeepAwakeAggressive = state.keepAwakeAggressive;
          state = newState();
          state.rawNames = keptNames;
          state.winScore = keptWinScore;
          state.format = f.id;
          state.stackRounds = keptStackRounds;
          state.keepAwake = keptKeepAwake;
          state.keepAwakeAggressive = keptKeepAwakeAggressive;
```

Replace with:
```js
          const keptNames = state.rawNames.slice();
          const keptWinScore = state.winScore;
          const keptStackRounds = state.stackRounds;
          const keptKingRounds = state.kingRounds;
          const keptGauntletRounds = state.gauntletRounds;
          const keptKeepAwake = state.keepAwake;
          const keptKeepAwakeAggressive = state.keepAwakeAggressive;
          state = newState();
          state.rawNames = keptNames;
          state.winScore = keptWinScore;
          state.format = f.id;
          state.stackRounds = keptStackRounds;
          state.kingRounds = keptKingRounds;
          state.gauntletRounds = keptGauntletRounds;
          state.keepAwake = keptKeepAwake;
          state.keepAwakeAggressive = keptKeepAwakeAggressive;
```

- [ ] **Step 4: Preserve `kingRounds`/`gauntletRounds` in Reset Tournament and update its round builder**

In the Reset Tournament handler's `else` branch (non-Crown), find the save/restore block and the rounds dispatch:
```js
        const keptStackRounds = state.stackRounds;
        const keptKeepAwake = state.keepAwake;
        const keptKeepAwakeAggressive = state.keepAwakeAggressive;
        state = newState();
        state.format = keptFormat;
        state.stackRounds = keptStackRounds;
        state.winScore = keptWinScore;
        state.keepAwake = keptKeepAwake;
        state.keepAwakeAggressive = keptKeepAwakeAggressive;
```

Replace with:
```js
        const keptStackRounds = state.stackRounds;
        const keptKingRounds = state.kingRounds;
        const keptGauntletRounds = state.gauntletRounds;
        const keptKeepAwake = state.keepAwake;
        const keptKeepAwakeAggressive = state.keepAwakeAggressive;
        state = newState();
        state.format = keptFormat;
        state.stackRounds = keptStackRounds;
        state.kingRounds = keptKingRounds;
        state.gauntletRounds = keptGauntletRounds;
        state.winScore = keptWinScore;
        state.keepAwake = keptKeepAwake;
        state.keepAwakeAggressive = keptKeepAwakeAggressive;
```

Then find the round builder dispatch line (still in the `else` branch, a few lines below):
```js
          state.rounds = keptFormat === "stack" ? [assignInitialStackCourts()] : generateRounds();
```

Replace with:
```js
          state.rounds = keptFormat === "stack"    ? [assignInitialStackCourts()]
                       : keptFormat === "king"     ? [assignInitialKingCourts()]
                       : keptFormat === "gauntlet" ? [assignInitialGauntletCourts()]
                       : generateRounds();
```

- [ ] **Step 5: Verify in browser**

1. Start a King tournament with 9 rounds. Open ⚙ Settings. Verify "King rounds" selector appears (9 selected). Change it to 7 (before any games). Advance to round 2, reopen settings — selector should be disabled ("Locked once games begin.").
2. Start a new tournament, open settings, and switch format (e.g., to Gauntlet). The round count should persist on return to King.
3. During a King tournament, use "Reset Tournament" — it should restart the King tournament with the same names and re-shuffle courts using `assignInitialKingCourts()`.
4. Open settings mid-tournament. The "Switch to X" buttons should list all 5 formats. Switching wipes the tournament (with confirmation) and keeps names.
5. Repeat steps 1-4 for Gauntlet.

- [ ] **Step 6: Commit**

```bash
git add pickleball.html
git commit -m "feat: settings integration for King and Gauntlet (rounds config, format switch, reset)"
```

---

## Task 14: End-to-End Verification

**Files:**
- Read-only verification. Only commit if a bug fix is required.

- [ ] **Step 1: Full King of the Court tournament playthrough**

1. Select King format, set rounds to 6 for speed.
2. Enter 8 names, click Start. Verify shuffle reveal shows two groups.
3. Play all 6 rounds. After each advance, verify:
   - Movement toast appears naming who climbed / dropped.
   - Court 1 shows "👑 KING'S COURT", Court 2 shows "BOTTOM COURT".
   - Standings show Score/W/👑W/PTS columns. Values increase each round.
   - Winners from both courts in the previous round appear on Court 1 in the next round.
4. After round 6, click "Build Finals →".
5. Enter finals scores (Championship and Consolation). Advance to done screen.
6. Verify done screen: podium shows "N KS" labels, final standings shows Score/W/👑W/PTS, footer says King Score formula, awards show King Score-based MVP.
7. Open History and Full Schedule modals — all rounds listed with King's Court/Bottom labels.

- [ ] **Step 2: Full Gauntlet tournament playthrough**

1. Select Gauntlet format, set rounds to 6.
2. Enter 8 names, click Start. Verify shuffle reveal shows "Court 1 (Top)" / "Court 2" groups.
3. Play all 6 rounds. Verify:
   - No movement toast (Gauntlet is silent on advance).
   - Court 1 shows "COURT 1 (TOP)", Court 2 shows "COURT 2".
   - Standings show PTS/W/+/– (no "X left" partner badge). No trajectory arrows on first advance.
   - After round 2+, trajectory arrows appear (▲▼) based on prior-round rankings.
   - Enter a tied score — the advance button should still enable (ties are allowed).
   - Top-ranked player from previous round should be on Court 1 in next round.
4. Build and complete finals. Verify done screen shows PTS/W/+/– columns, "N pts" labels on podium.

- [ ] **Step 3: Verify existing formats are unaffected**

1. Select Round Robin. Enter 8 names. Play 2 rounds. Verify: "SOUTH COURT" / "NORTH COURT" labels, partner badges shown ("N left"), partner chips ("→ Name") on standings.
2. Select Stack. Play 2 rounds. Verify: "🏆 COURT 1" / "COURT 2" labels, Stack Score standings, climber toast on advance.
3. Select Crown Court. Enter 4 names. Play through all 3 matches + Crown Match. Verify Crown done screen.

- [ ] **Step 4: Verify localStorage persistence**

1. Start a King tournament, play 2 rounds, close the tab.
2. Reopen the file — the King tournament should resume from round 3.
3. Open settings, switch to Gauntlet. Reload. Verify the format is Gauntlet and `kingRounds`/`gauntletRounds` are preserved.

- [ ] **Step 5: Commit only if bugs were fixed**

If verification found and fixed bugs, commit with a specific message:
```bash
git diff --quiet && echo "No code changes — verification complete." || git commit -m "fix: <describe the specific bug found>"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ State fields (`kingRounds`, `gauntletRounds`) — Task 1
- ✅ `backfillStateDefaults` with `Number.isInteger` + range clamp — Task 1
- ✅ `RULES_KING`, `RULES_GAUNTLET` constants — Task 2
- ✅ King engine (`assignInitialKingCourts`, `computeKingStats`, `rankPlayersKing`, `buildNextKingRound`, `kingMovementToastText`) — Task 3
- ✅ Gauntlet engine (`buildGauntletPairing`, `assignInitialGauntletCourts`, `buildNextGauntletRound`) — Task 4
- ✅ `totalRegularRounds()`, `rankPlayersForFormat()`, `nextPartnerInfo()` dispatch — Task 4
- ✅ Format chooser UI + rounds sub-selector — Task 5
- ✅ `rulesForActiveFormat()`, `openHowItWorksModal()` sections — Task 5
- ✅ `startTournament()` King and Gauntlet branches with grouped shuffle reveal — Task 6
- ✅ `renderPlaying()` booleans + readiness predicates — Task 7
- ✅ `renderPlaying()` advance handlers, `maybeFireRoundComplete()` — Task 8
- ✅ `buildNextKingRound` tie guard (`throw new Error`) — included in Task 3 engine code
- ✅ Court labels in `renderCourtCard()`, `renderHistory()`, `openScheduleModal()` — Task 9
- ✅ `renderKingStandingsCard()` with Score/W/👑W/PTS columns — Task 10
- ✅ `renderStandingsCard()` dispatch with Gauntlet `hidePartners: true` — Task 10
- ✅ `renderPodium()` King branch + `computeStats(totalRegularRounds())` fix — Task 11
- ✅ `computeAwards()` King MVP + court tag labels — Task 11
- ✅ `renderDoneScreen()` King branch + Gauntlet `totalRegularRounds()` fix + footer text — Task 12
- ✅ Settings: rounds config, `allFormats`, format-switch preservation, Reset dispatch — Task 13
- ✅ `buildFinals()` / `finalRanking()` — format-agnostic, no changes needed
- ✅ Crown format — untouched throughout
