# King of the Court & Gauntlet Formats — Design Spec

## Goal

Add `king` (King of the Court / Waterfall) and `gauntlet` as first-class tournament formats in `pickleball.html`, with full parity in UX, functionality, and final ranking output alongside the existing `rr`, `stack`, and `crown` formats.

## Architecture

**Integration approach: Minimal fork with labeled blocks.** Each new format lives in a clearly marked `// === KING FORMAT ===` / `// === GAUNTLET FORMAT ===` block. A thin dispatch layer updates the ~25 existing switch points (`if (state.format === "stack")` checks) to include the new format IDs. No refactoring of existing code.

Both formats reuse the existing round data shape `{ round, court1: { team1, team2, score1, score2 }, court2: {...} }` and the existing `buildFinals()` / `finalRanking()` pipeline unchanged.

**Tech stack:** Single-file vanilla JS, no build step, no new dependencies.

---

## Section 1: State & Data Model

### New fields in `newState()`

```js
kingRounds:     9,   // configurable 6–12
gauntletRounds: 8,   // configurable 6–12
```

### `backfillStateDefaults()` changes

```js
// Old:
if (!["stack","crown"].includes(obj.format)) obj.format = "rr";
// New:
if (!["rr","stack","crown","king","gauntlet"].includes(obj.format)) obj.format = "rr";

// Use Number.isInteger + range clamp — typeof check alone allows NaN, Infinity, decimals
if (!Number.isInteger(obj.kingRounds)     || obj.kingRounds     < 6 || obj.kingRounds     > 12) obj.kingRounds     = 9;
if (!Number.isInteger(obj.gauntletRounds) || obj.gauntletRounds < 6 || obj.gauntletRounds > 12) obj.gauntletRounds = 8;
```

### Format-switch & Reset preservation

The Settings modal's format-switch and Reset Tournament code (`openSettings()`) currently preserves `stackRounds`. Extend to also preserve `kingRounds` and `gauntletRounds`.

Both formats use the existing `state.rounds[]` array (incremental, same shape as Stack). No new sub-arrays needed.

---

## Section 2: King of the Court Engine

### Format ID: `"king"` | Default rounds: 9 | Round range: 6–12

### Rules summary

- 8 players, 2 courts. Court 1 = King's Court. All 8 play every round.
- After each round: C1 winners stay on C1 + split randomly; C2 winners move up to C1 + split randomly; C1 losers drop to C2 + split randomly; C2 losers stay on C2 + split randomly.
- Ranking metric: composite `kingScore = wins + pointsScored + kingCourtWins` (wins on Court 1). Sorted descending; tiebreak by `tiebreakRandom`.
- Ties not allowed for round advancement (movement rules require a clear winner).

### `assignInitialKingCourts()`

Random initial assignment — mirrors `assignInitialStackCourts()`:

```js
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
```

### `computeKingStats(throughRound)`

Iterates `state.rounds` up to `throughRound`. Per player:

```js
{
  slot, name,
  wins,           // total wins across all courts
  pointsScored,   // total points scored across all courts
  kingCourtWins,  // wins specifically on Court 1
  kingScore,      // wins + pointsScored + kingCourtWins (computed after accumulation)
}
```

### `rankPlayersKing(throughRound)`

```js
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
```

### `buildNextKingRound(prevRound)`

Requires `isRoundDecided(prevRound)` (both courts have a clear winner). The function guards explicitly — movement rules are undefined on a tie, so calling with a tied round is a programming error.

```js
function buildNextKingRound(prevRound) {
  if (!isRoundDecided(prevRound)) throw new Error("buildNextKingRound called with undecided round");
  const c1 = prevRound.court1, c2 = prevRound.court2;
  const c1Win  = c1.score1 > c1.score2 ? c1.team1 : c1.team2;
  const c1Lose = c1.score1 > c1.score2 ? c1.team2 : c1.team1;
  const c2Win  = c2.score1 > c2.score2 ? c2.team1 : c2.team2;
  const c2Lose = c2.score1 > c2.score2 ? c2.team2 : c2.team1;

  // Movement: c1Win + c2Win → King's Court pool; c1Lose + c2Lose → Bottom pool
  const newC1 = shuffle([...c1Win, ...c2Win]);
  const newC2 = shuffle([...c1Lose, ...c2Lose]);

  return {
    round: prevRound.round + 1,
    court1: { team1: [newC1[0], newC1[1]], team2: [newC1[2], newC1[3]], score1: null, score2: null },
    court2: { team1: [newC2[0], newC2[1]], team2: [newC2[2], newC2[3]], score1: null, score2: null },
  };
}
```

### Movement toast

```js
function kingMovementToastText(prevRound, newRound) {
  const c2Win  = prevRound.court2.score1 > prevRound.court2.score2
    ? prevRound.court2.team1 : prevRound.court2.team2;
  const c1Lose = prevRound.court1.score1 > prevRound.court1.score2
    ? prevRound.court1.team2 : prevRound.court1.team1;
  return teamName(c2Win) + " climb to King's Court · " + teamName(c1Lose) + " drop to Bottom";
}
```

---

## Section 3: Gauntlet Engine

### Format ID: `"gauntlet"` | Default rounds: 8 | Round range: 6–12

### Rules summary

- 8 players, 2 courts. Every round, re-rank all 8 players using the existing `rankPlayers()` function (same RR ranking: wins → diff → h2h → tiebreakRandom).
- Fixed pairing rule: Court 1 = `[rank1+rank4]` vs `[rank2+rank3]`; Court 2 = `[rank5+rank8]` vs `[rank6+rank7]`.
- Ties allowed (ranker handles them via tiebreak chain).
- No new stats or standings renderer — reuses `computeStats` / `rankPlayers` / `renderStandingsCard` as-is.

### `assignInitialGauntletCourts()`

`rankPlayers(0)` returns all players at 0 stats, sorted by `tiebreakRandom` — gives a stable initial seed order.

```js
function assignInitialGauntletCourts() {
  const ranked = rankPlayers(0).map(s => s.slot);
  return buildGauntletPairing(ranked, 1);
}
```

### `buildGauntletPairing(rankedSlots, roundNum)`

Shared helper used by both the initial and incremental builders:

```js
function buildGauntletPairing(ranked, roundNum) {
  return {
    round: roundNum,
    court1: { team1: [ranked[0], ranked[3]], team2: [ranked[1], ranked[2]], score1: null, score2: null },
    court2: { team1: [ranked[4], ranked[7]], team2: [ranked[5], ranked[6]], score1: null, score2: null },
  };
}
```

### `buildNextGauntletRound(prevRound)`

```js
function buildNextGauntletRound(prevRound) {
  const ranked = rankPlayers(prevRound.round).map(s => s.slot);
  return buildGauntletPairing(ranked, prevRound.round + 1);
}
```

---

## Section 4: UI & Dispatch Layer

### `totalRegularRounds()`

```js
function totalRegularRounds() {
  if (state.format === "stack")    return state.stackRounds;
  if (state.format === "king")     return state.kingRounds;
  if (state.format === "gauntlet") return state.gauntletRounds;
  if (state.format === "crown")    return 3;
  return 7;
}
```

### `rankPlayersForFormat()`

```js
function rankPlayersForFormat(throughRound) {
  if (state.format === "stack") return rankPlayersStack(throughRound);
  if (state.format === "king")  return rankPlayersKing(throughRound);
  return rankPlayers(throughRound); // rr, gauntlet, crown fallthrough
}
```

### `renderPlaying()` — derived booleans (replaces the single `isStack`)

```js
const isStack      = state.format === "stack";
const isKing       = state.format === "king";
const isGauntlet   = state.format === "gauntlet";
const isIncremental = isStack || isKing || isGauntlet;   // builds rounds one at a time
const requiresDecided = isStack || isKing;               // ties not allowed for advancement
```

All `isStack ?` ternaries in `renderPlaying()` are updated to use these booleans:
- `advanceReady` uses `requiresDecided`
- `allRoundsAdvanceable` uses `requiresDecided`
- The advance-button click handler dispatches to `buildNextKingRound()` / `buildNextGauntletRound()` / `buildNextStackRound()` based on format

### `startTournament()` — new branches

King and Gauntlet each get an `else if` branch:
- Calls their respective initial-courts function
- Uses the same grouped `runShuffleReveal` as Stack (Court 1 / Court 2 groups)

### `renderCourtCard()` — court labels

```
King,    Court 1: "👑 KING'S COURT"
King,    Court 2: "BOTTOM COURT"
Gauntlet, Court 1: "COURT 1 (TOP)"
Gauntlet, Court 2: "COURT 2"
```

### `renderStandingsCard()`

Dispatches to new `renderKingStandingsCard()` for `"king"`. Gauntlet routes to the existing RR standings renderer but with `hidePartners: true` injected — the RR standings show a "N partners left" badge computed as `7 - partnersUsed.size`, which is nonsensical for Gauntlet (rounds don't rotate everyone through every partner).

```js
// Inside renderStandingsCard dispatch:
if (state.format === "king")     return renderKingStandingsCard(throughRound, opts);
if (state.format === "gauntlet") return renderRRStandingsCard(throughRound, { ...opts, hidePartners: true });
// else falls through to RR
```

King standings columns: # | Player | Score | W | 👑W (Court 1 wins) | PTS

The PTS column shows raw `pointsScored`, letting players audit why two players with the same wins and Court 1 wins are ranked differently.

### `renderFormatChooser()` — two new option buttons

```js
{ id: "king",     title: "King of the Court", blurb: "Winners stay or climb, losers drop. Random re-pairing each round." },
{ id: "gauntlet", title: "Gauntlet",           blurb: "Re-rank after every round. Top pairs top, bottom pairs bottom." },
```

Each shows a rounds sub-selector when active (same pattern as Stack's sub-selector):
- King: options 6–12, default 9
- Gauntlet: options 6–12, default 8

### Settings modal — `allFormats` list

```js
const allFormats = [
  { id: "rr",       label: "Round Robin" },
  { id: "stack",    label: "Stack Format" },
  { id: "king",     label: "King of the Court" },
  { id: "gauntlet", label: "Gauntlet" },
  { id: "crown",    label: "Crown Court" },
];
```

Rounds config block: adds King and Gauntlet cases (locked once games begin, same as Stack).

### `nextPartnerInfo()`

Returns `null` for `"king"` and `"gauntlet"` (partners not known until round is built).

```js
if (state.format === "stack" || state.format === "king" || state.format === "gauntlet") return null;
```

### `maybeFireRoundComplete()`

```js
const advanceable = (state.format === "stack" || state.format === "king")
  ? isRoundDecided(round)
  : isRoundComplete(round);
```

### `renderPodium()` and `computeAwards()`

Both currently call `computeStats(7, true)` with a hardcoded `7`. For King and Gauntlet this truncates stats if rounds > 7. Change to `computeStats(totalRegularRounds(), true)` in both functions. No other changes needed — the award categories (MVP, Biggest Win, Hot Streak, etc.) are game-outcome-based and work correctly for all formats.

### `renderDoneScreen()` — final standings table

The non-Stack else branch at the done screen also hardcodes `computeStats(7, true)` and shows PTS/W/+/– columns. Two fixes:

1. **Gauntlet:** Change `computeStats(7, true)` to `computeStats(totalRegularRounds(), true)`. Columns stay as PTS/W/+/– (correct for Gauntlet). Footer text stays as-is.

2. **King:** Add a new `isKing` branch (parallel to the existing `isStack` branch) that calls `computeKingStats(state.rounds.length)` and renders columns Score/W/👑W/PTS. Footer text should read "Within each tier, King Score (wins + points + Court 1 wins) breaks ties."

The `isStack` local variable in `renderDoneScreen` expands to:
```js
const isStack = state.format === "stack";
const isKing  = state.format === "king";
const colSpan = (isStack || isKing) ? 6 : 5;
```

### History & Schedule modal

Court labels extended with King and Gauntlet cases (same label map as `renderCourtCard()`).

### "How it works" modal

`RULES_KING` and `RULES_GAUNTLET` constants added (bullet arrays). `rulesForActiveFormat()` dispatches to them. `openHowItWorksModal()` sections list gains both new format entries (collapsed by default, expanded when active).

**`RULES_KING` bullets:**
1. 8 players, 2 courts. Court 1 is the 👑 King's Court; Court 2 is the Bottom Court.
2. All 8 players play every round.
3. After each round: Court 1 winners stay on Court 1, Court 2 winners climb to Court 1. Court 1 losers drop to Court 2, Court 2 losers stay on Court 2.
4. After movement, players on each court are randomly re-paired into two new teams.
5. Ranking: King Score = wins + points scored + Court 1 wins. Highest King Score after all rounds = #1 seed.
6. After regular rounds, top 4 by King Score play the 🏆 Championship (#1+#4 vs #2+#3); bottom 4 play the 🥈 Consolation.

**`RULES_GAUNTLET` bullets:**
1. 8 players, 2 courts, doubles.
2. After every round, all 8 players are re-ranked by performance (points scored → wins → point differential → head-to-head).
3. Pairing rule: Court 1 gets #1+#4 vs #2+#3; Court 2 gets #5+#8 vs #6+#7 — the best play the best, the rest play the rest.
4. Round 1 uses a random seed order.
5. Standard scoring (default first to 11, win by 2). Standings use the same points/wins/differential ranking as Round Robin.
6. After all rounds, top 4 play the 🏆 Championship, bottom 4 play the 🥈 Consolation.

---

## File structure (changes only)

**Modify:** `pickleball.html` (only file)

New code blocks inserted in order:
1. `RULES_KING` and `RULES_GAUNTLET` constants (near existing `RULES_RR`, `RULES_STACK`, `RULES_CROWN`)
2. `// === KING FORMAT ===` block: `assignInitialKingCourts`, `computeKingStats`, `rankPlayersKing`, `buildNextKingRound`, `kingMovementToastText`, `renderKingStandingsCard`
3. `// === GAUNTLET FORMAT ===` block: `buildGauntletPairing`, `assignInitialGauntletCourts`, `buildNextGauntletRound`

Existing functions modified (dispatch layer): `newState`, `backfillStateDefaults`, `totalRegularRounds`, `rankPlayersForFormat`, `nextPartnerInfo`, `startTournament`, `maybeFireRoundComplete`, `renderPlaying`, `renderCourtCard`, `renderStandingsCard`, `renderFormatChooser`, `renderHistory`, `openScheduleModal`, `openSettings`, `openHowItWorksModal`, `rulesForActiveFormat`, `renderPodium`, `computeAwards`, `renderDoneScreen`

---

## What is NOT changed

- `buildFinals()` — already format-agnostic via `rankPlayersForFormat()`
- `finalRanking()` — already format-agnostic
- `computeStats()` / `rankPlayers()` — Gauntlet reuses unchanged
- Crown format code — untouched
- All rendering helpers: `renderCourtCard`, `renderTeamRow`, `renderRoundCourts`, `renderFinalsScreen` — modified only at the dispatch/label points, core logic unchanged
- `renderDoneScreen` — modified (King branch in final standings table, `computeStats(7)` → `computeStats(totalRegularRounds())` for Gauntlet)
- All confetti, animations, keep-awake, awards, localStorage persistence
