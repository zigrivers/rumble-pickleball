# Mixed Mode (Man + Woman Always Paired) — Design Spec

**Date:** 2026-06-28
**Status:** Approved design, pending implementation plan
**Scope:** Round Robin, Stack, King of the Court, and Gauntlet formats in `index.html`. Crown is out of scope (it uses hand-picked themed matches and a 4-slot roster, so "mixed" there is a setup-time validator at most — not addressed).

---

## 1. Problem

After a Round Robin night with 10 players (5 men, 5 women), players asked for a way to make Rumble always pair **1 man + 1 woman per team** — the "mixed" format official tournament pickleball uses. Today Rumble has no notion of gender or any two-cohort grouping: players are stored by name + optional phone only (`index.html:4787`, `index.html:6545`), and every scheduler (`bestRRSplit`, `generateRRSchedule`, `pairForStackCourt`, `buildNextLadderRound`, `buildGauntletPairing`, `allocateByes`) pairs players by repeat-partner/opponent cost with no group constraint.

The feature: a per-tournament setting that, when on, **guarantees every team is mixed (1 from Group A + 1 from Group B) in every round whenever the roster math allows**, across all four in-scope formats. For balanced rosters (the common social case like 5M+5F), every team in every round is mixed. For lopsided rosters where all-mixed is mathematically impossible, mixed is maximized without imposing extra byes — same-gender teams appear only where unavoidable.

## 2. Goals

- **Hard mixed guarantee when mathematically possible.** For any roster where `min(countA, countB) >= activeCourtsPerRound * 2`, every team in every round is mixed, in all four formats.
- **Best-effort when mathematically impossible.** On lopsided rosters, maximize mixed teams without sitting extra players. Same-gender teams appear only on courts where the roster can't be balanced. Never silently produce a same-gender team when a mixed split was available.
- **Generic two-group model, M/W defaults.** Stored as `a`/`b`; UI labels default to "Men"/"Women" but are editable. Works for any two-cohort pairing need (club A/club B, experienced/new, etc.) and is inclusive of non-binary players.
- **Zero behavior change when off.** Existing saved tournaments load and play identically. The Wh(8) fast path stays byte-identical for non-mixed RR 8/2. All scheduler additions are gated on `state.mixedMode`.

## 3. Non-goals

- **No changes to ranking, scoring, standings, or lifetime records.** Mixed is a *scheduling* concern, not a *ranking* concern. `computeStackStats`, `computeKingStats`, the Adjusted Margin ranker, and all stat persistence are group-agnostic and unchanged.
- **No new format codes.** "Mixed RR" is not a separate format — it's a setting on the existing Round Robin (and Stack/King/Gauntlet) the user already picked. Cloning schedulers into `mixed-rr` etc. is explicitly rejected (see §9, Approach B).
- **No same-gender-team prohibition.** We do not reduce active courts or impose extra byes to enforce purity on lopsided rosters. Court usage wins over absolute pairing purity when the two conflict (per the user's Question 3 decision).
- **No Crown changes.** Crown's 4 hand-picked slots and pre-seeded themed matches don't fit a per-round pairing model. The mixed toggle is hidden when `format === "crown"`.
- **No template changes.** Quick templates ("Lunch Break 45", etc.) don't touch `mixedMode`. Users who want mixed enable it manually after picking a template.

## 4. Data model

Two new pieces of state, both **off/empty by default** so existing saved tournaments load unchanged.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `state.mixedMode` | `boolean` | `false` | Master switch for the tournament |
| `state.mixedGroupLabels` | `{ a: string, b: string }` | `{ a: "Men", b: "Women" }` | Editable labels shown in the UI |
| `state.rawGroups` | `Array<"a"\|"b"\|"">` | `[]` | Group per setup-row player, captured *before* shuffle; parallel to `rawNames` |
| `state.slotGroups` | `Array<"a"\|"b"\|"">` | `[]` | Same data re-indexed to slot order *after* shuffle; parallel to `slots` |

### 4.1 Why two group arrays

Players are entered as names in setup (`rawNames`), then shuffled into slot order (`state.slots`) at Start time (`index.html:6557`). The scheduler thinks in slot numbers — `bestRRSplit(four, …)` receives slots `[3, 7, 2, 5]`, not names. So we need group keyed by slot during play. But we also need it keyed by setup row to survive format switches and re-shuffles. Mirroring the existing `rawNames` → `slots` pattern with `rawGroups` → `slotGroups` keeps it consistent with how the app already works.

### 4.2 The `groupOf` helper

Every scheduler function that needs to enforce "one A + one B per team" calls this:

```js
function groupOf(slot) { return (state.slotGroups || [])[slot - 1] || ""; }
```

If it returns `""` (player's group never set, or mixed mode off), the mixed logic treats that player as group-agnostic — they can pair with anyone. 

**Unset-groups contract (explicit):** the hard mixed guarantee (§7.7) applies only when **every active player has a group set** (`groupOf` never returns `""` for a playing slot). If even one active player has no group, mixed mode degrades to best-effort for that round: the scheduler still maximizes mixed teams among the grouped players, but the ungrouped player's team may not be mixed. The setup warning (§5.3) surfaces this before Start. This resolves the tension between "hard guarantee" and "graceful no-op" — the guarantee is conditional on complete input, and the no-op is the degradation path for incomplete input.

### 4.3 The `mixedModeBadTeamCount` helper

Returns the number of teams (0, 1, or 2) in a proposed pairing that are *not* mixed. Returns 0 unconditionally when `mixedMode` is off, so existing behavior is byte-identical.

### 4.4 Migration

The v5 loader (`index.html:5146`) already validates unknown fields and backfills defaults. Add `mixedMode: false`, `mixedGroupLabels: { a: "Men", b: "Women" }`, `rawGroups: []`, `slotGroups: []` to that same path. Old tournaments keep behaving exactly as today. A migration test (see §10.4) guards this.

### 4.5 When groups are populated into slots

At Start time, after `state.slots = shuffled` (`index.html:6636` for RR, `:6603` for stack, `:6614` for king, `:6625` for gauntlet), populate `state.slotGroups`. This mirrors the existing `phoneByName` pattern (`index.html:6559-6560`): build a `name → group` map from `rawNames`/`rawGroups` *before* the shuffle, then walk `state.slots` post-shuffle and look up each name's group. For a name with no group set, the slot group is `""`.

### 4.6 Group lifecycle for mid-tournament joins

`addMidEventPlayer` is name/phone-oriented today and has no group capture. When mixed mode is on, the join prompt gains a third field (the same M/W toggle from §5.2). The joined player's group is written to both `rawGroups` (their setup row) and `slotGroups` (their assigned slot) so the regenerated schedule (`generateRRSchedule` / `buildNextLadderRound`) reads it via `groupOf(slot)`. If the user leaves the toggle unset, the player gets `""` and the round degrades to best-effort per the §4.2 contract.

**Mid-tournament group edits:** if a player's group is changed mid-tournament (via the same roster-edit path), the schedule is regenerated for remaining rounds. Completed games are never rewritten — they keep their recorded teams. The regeneration picks up the new group from the next unstarted round forward, consistent with how court-count changes already trigger regeneration (`index.html:4851`).

## 5. Setup UI

### 5.1 The mixed-mode toggle

A new row in the rules block (`renderRulesBlock`), styled like the existing "Win score" / "Win by 2" rows:

```
Mixed mode (pair 1 man + 1 woman)        [ OFF | ON ]
```

- OFF by default. Hidden when `state.format === "crown"`.
- Flipping to ON reveals:
  1. The per-player M/W toggles (§5.2) on every roster row.
  2. A small "Edit labels" link → opens a tiny modal with two text inputs for the Group A / Group B labels (default *Men* / *Women*). Closed by default to keep setup simple.
- Flipping back to OFF hides the per-player toggles but **preserves** stored `rawGroups` — so toggling it back on restores prior entries. We don't silently delete data.

### 5.2 The per-player group control

Appended after the phone field in each roster row in `renderSetup()` (`index.html:10377`), shown only when `state.mixedMode === true`:

```
[ Player 3 name ]  [ 📱 optional ]  [ M | W ]   ×
```

- Two-segment toggle. Default value per row: `""` (unset).
- Tapping **M** sets `rawGroups[i] = "a"`; **W** sets `"b"`. Tapping the highlighted one again clears back to `""`.
- The toggle segment labels are derived from `mixedGroupLabels` but must be visually distinct. Logic: use the first character of each label, uppercased. If both first characters are identical (e.g., "Group A" / "Group B" → both "G"), fall back to the full label truncated to 4 characters. If those also collide, fall back to `1` / `2`. This guarantees the two toggle segments are always distinguishable regardless of label choice.
- On change: calls `save()` and `updateStartState()` — same flow as the name/phone inputs.

### 5.3 Start-button gating (informational, not blocking)

Per the best-effort policy (§2, §3): if mixed is ON and the roster can't cleanly field mixed teams on the chosen courts, the Start button stays enabled but shows a one-line heads-up beneath it. If groups are unset for some players, the warning reads differently. Start stays available either way.

Examples:
- Lopsided: `⚠️ 7 Men / 3 Women: some same-gender teams needed. Up to 4 players may sit per round.`
- Incomplete: `Set a group for all players, or mixed pairing may be uneven.`

### 5.4 Templates & paste modal

- Quick templates call `templateConfigFor` (`index.html:9318`) and fill `format`/rounds/scoring. They won't touch `mixedMode` — stays OFF, so templates behave identically.
- Paste N names modal populates `rawNames` in bulk. It sets `rawGroups[i] = ""` for each pasted row. Mixed mode isn't blocked; the user taps M/W per row afterward, same as if they'd typed names manually.

## 6. Scheduler changes — Round Robin

### 6.1 Disable the Wh(8) fast path when mixed is on

Today, 8 players / 2 courts uses a precomputed Whist schedule (`index.html:6638`) with no gender notion. With mixed on, skip it and fall through to `generateRRSchedule`, which already handles 8/2 correctly:

```js
if (count === 8 && state.courtCount === 2 && !state.mixedMode) {
  // existing Wh(8) path — unchanged
} else {
  state.rrScheduleMode = "generated";
  state.rounds = generateRRSchedule(...);
}
```

Cost: Wh(8) exists for perfect partner/opponent balance. With mixed on, balance is *deliberately* constrained to mixed teams, so we accept slightly less rotation purity — that's the whole point of the mode.

A regression test (§8.3) guards that mixed-off + 8/2 still uses Wh(8).

### 6.2 `bestRRSplit` — tier the cost comparison

Today (`index.html:7715`) it picks the cheapest of 3 splits into two teams; cost only counts repeat partners/opponents.

**Change:** when `mixedMode` is on, delegate to the shared `pairMixedAware` helper (§7.3) with RR-specific opts (`{ court, history, chosen }`), so the candidate splits sort by `(badTeams, baseCost)` instead of `baseCost` alone. `pairMixedAware` returns the chosen `[team1, team2]`; `bestRRSplit` wraps it with `makeGame(court, …)` as today.

- **Tier 1 (fully mixed):** `badTeams === 0`. Always wins when non-empty.
- **Tier 2 (residual):** at least one same-group team. Only chosen when no fully-mixed split exists for these 4 slots (e.g., `[A,A,A,B]` has no mixed split; `[A,A,B,B]` always does).

When `mixedMode` is off, `mixedModeBadTeamCount` returns 0 for everything and the sort reduces to pure cost — byte-identical to today.

### 6.3 `generateRRSchedule` — balanced court dealing

Today (`index.html:7735`) each round shuffles all `alloc.playing` slots and slices into chunks of 4. With mixed, random chunking produces courts like `[A,A,A,B]` that *cannot* be split into two mixed teams no matter how `bestRRSplit` works.

**Change:** when `mixedMode` is on, replace the shuffle-then-slice with a balanced deal — each court starts as 2A+2B, which always has a mixed split available:

```js
// Pseudo-code for the mixed court-dealing path.
// Safely handles empty pools (lopsided rosters) and unset groups.
function dealBalancedCourts(playing, activeCourts, rng) {
  const aPool = seededShuffle(playing.filter(s => groupOf(s) === "a"), rng);
  const bPool = seededShuffle(playing.filter(s => groupOf(s) === "b"), rng);
  const unset = seededShuffle(playing.filter(s => groupOf(s) === ""), rng);
  const courts = Array.from({ length: activeCourts }, () => []);
  // Deal 2A + 2B per court, top-up from whichever pool has players left.
  for (let c = 0; c < activeCourts; c++) {
    for (let need = 0; need < 2 && aPool.length; need++) courts[c].push(aPool.pop());
    for (let need = 0; need < 2 && bPool.length; need++) courts[c].push(bPool.pop());
  }
  // Fill remaining seats: prefer the larger pool, then unset players.
  const surplus = [...aPool, ...bPool, ...unset];
  for (let c = 0; c < activeCourts && surplus.length; c++) {
    while (courts[c].length < 4 && surplus.length) courts[c].push(surplus.pop());
  }
  return courts;
}
```

Key safety properties: uses `pop()` with `.length` checks (never returns `undefined`), players with unset groups are dealt into the surplus pool rather than dropped, and overflow from the larger group fills remaining seats without crashing. Courts that can't reach 2A+2B fall through to `pairMixedAware`'s Tier 2 (best-effort). `dealBalancedCourts` is the shared helper used by RR and by all ladder formats' round-1 dealing.

### 6.4 `allocateByes` — mixed-feasibility as a primary objective

Byes already rotate fairly across players via a `byeCount` history check (`index.html:7614`). The original draft treated mixed only as a tiebreak on that ordering — but that is too weak. **Counterexample:** with 6A+4B on 2 courts, the roster satisfies the §7.7 formula, yet if `allocateByes` sits even one B, the active set becomes 6A+3B which cannot form two 2A+2B courts. A group-fair tiebreak would not catch this because it only breaks ties; it doesn't reject bye sets that break feasibility.

**Change:** when `mixedMode` is on, bye selection gains a **feasibility filter** as a primary objective, layered above the existing rotation:

1. **Enumerate candidate bye sets** from the existing `sortByeCandidates` pool (same candidates, same ordering).
2. **Feasibility filter:** prefer the bye set whose removal leaves a playing set that is *mixed-feasible* — i.e., `countA(playing) >= 2 * activeCourts && countB(playing) >= 2 * activeCourts`. Among feasible bye sets, pick the one ranked highest by the existing rotation fairness sort.
3. **Fallback:** if no bye set is mixed-feasible (lopsided roster), fall back to the existing rotation policy unchanged — best-effort. This naturally prefers byes from the over-represented group because they have more candidates in the pool, which also happens to preserve as many mixed pairings as possible.

For balanced rosters (5M+5F), step 2 is always satisfiable and the filter is effectively a no-op — the existing rotation already sits 1M+1W. The filter only kicks in on rosters where a naive rotation would accidentally break mixed feasibility.

**Group-share normalization:** the existing `byeCount`-based sort handles individual fairness. For group-level fairness, the feasibility filter naturally normalizes by group size: the larger group contributes more bye candidates and absorbs more byes proportionally. No separate normalization term is needed — the feasibility constraint + existing rotation together produce proportional group bye shares over a multi-round tournament. Shared across all four formats (RR and the three ladders all call `allocateByes`).

### 6.5 What RR changes do NOT touch

- `rrRoundCost`, `rrPairKey`, `rrHistoryCounts` — unchanged. The repeat-partner/opponent math is group-independent.
- The Wh(8) constant table — untouched, just bypassed when mixed is on.
- `computeStackStats`, scoring, standings, lifetime records — all group-agnostic.

## 7. Scheduler changes — ladder formats (Stack, King, Gauntlet)

The ladder formats add a fundamental tension RR doesn't have: **court = skill tier.** Stack/King move winners up and losers down; Gauntlet re-ranks everyone globally. Court 1 is supposed to hold the strongest players. Mixed mode wants to balance gender *across* courts. These can collide — if the top 4 by skill happen to be 3M+1W, court 1 can't field two mixed teams no matter how we pair within it.

An earlier draft of this section used a two-pass "movement then repair" approach: run normal ladder movement, then a `repairCourtsForMixed` pass that swapped same-direction movers between adjacent courts. **That approach was rejected after multi-model review** identified three fatal flaws: (1) swapping a winner (moving up) with a loser (moving down) sends each player to the *opposite* court from what their result earned — the opposite of "preserving ladder integrity"; (2) adjacent-only swaps cannot propagate balance across a balanced court in the middle; (3) the "every team mixed" guarantee was unproven because direction-compatible swaps may not exist even when a balanced global assignment does.

The adopted design replaces it with a **single constrained assignment per round** — one optimization pass that jointly maximizes mixed teams and minimizes movement deviation, eliminating all three flaws.

### 7.1 Round 1 — balanced dealing (same as RR)

`assignInitialLadderCourts` (`index.html:5956`) today shuffles all players and slices into chunks of 4. Round 1 has **no skill information** — it's pure random assignment — so there's zero ladder-integrity cost to dealing 2A+2B per court instead.

```js
// When mixedMode is on, skip preserveLegacyShuffle and use balanced dealing
const ordered = state.mixedMode
  ? dealBalancedCourts(alloc.playing, alloc.activeCourts, rng)   // §6.3
  : preserveLegacyShuffle ? shuffle(alloc.playing) : seededShuffle(alloc.playing, rng);
```

Sets up clean mixed teams for round 1 in the common balanced-roster case, at no cost to the ladder.

### 7.2 Rounds 2+ — single constrained assignment

`buildNextLadderRound` (`index.html:6153`) and `buildGauntletPairing` (`index.html:6319`) both produce court assignments. The change: when `mixedMode` is on, replace the movement-then-seat-filling logic with a single `assignMixedLadderRound` call that optimizes court assignment jointly.

**The algorithm:**

```
assignMixedLadderRound(prevRound, format):
  1. Compute each active player's naturalCourt from ladder movement
     (Stack/King: winners up one, losers down one; Gauntlet: rank-block)
  2. allocateByes with the mixed-feasibility filter (§6.4) → playing set
  3. assignCourtsConstrained(playing, naturalCourt, activeCourts):
     Run a bounded multi-restart search (same pattern as generateRRSchedule's
     60 restarts). For each restart: deal players to courts, score the
     assignment lexicographically by:
       (a) totalBadTeams  — sum of mixedModeBadTeamCount across courts
       (b) totalDeviation — sum of |assignedCourt - naturalCourt| per player
       (c) repeatCost     — rrRoundCost for the proposed games
     Keep the assignment with the best lexicographic score.
  4. For each court's 4 slots, pairMixedAware (§7.3) to split into teams
```

**Why this resolves the rejected approach's flaws:**

- **No direction contradiction:** movement is not a hard constraint — it's the `(b)` cost term. The optimizer finds the assignment that minimizes deviation from natural movement while maximizing mixed courts. When a fully-mixed assignment exists within small deviation, it's chosen. When it doesn't, deviation grows as needed but `(a)` (mixed teams) always takes priority lexicographically.
- **No adjacency bug:** the search is global — it considers all possible court assignments across all courts simultaneously, not just adjacent swaps.
- **Provable guarantee:** if a 0-badTeam court assignment exists, the search finds it (because `(a)` is the primary sort key and any restart that hits it wins). The guarantee (§7.7) holds whenever such an assignment exists within the search space.

**Why the search is feasible:** ≤24 players, ≤6 courts. The existing `generateRRSchedule` already does 60 restarts of shuffle-and-score per round and runs in milliseconds. The constrained assignment uses the same multi-restart pattern with a 3-level lexicographic score instead of a single cost. No external solver or dependency needed — consistent with the app's vanilla-JS, no-build philosophy.

### 7.3 Within-court pairing — `pairMixedAware`

After court assignment, pair the 4 slots on each court. Shared helper for all four formats' within-court pairing:

```js
// Returns [team1, team2] — mixed-aware pairing for 4 slots on a court.
// Used by RR (§6.2 bestRRSplit), Stack (rounds 2+), King (rounds 2+), Gauntlet (all rounds).
function pairMixedAware(four, opts) {
  const splits = rrTeamSplits(four);        // the 3 possible 2-vs-2 splits
  const scored = splits.map(([t1, t2]) => ({
    teams: [t1, t2],
    badTeams: mixedModeBadTeamCount([t1, t2]),  // 0 = both mixed
    cost: pairingCost(t1, t2, opts),            // format-specific (see below)
  }));
  scored.sort((a, b) => a.badTeams - b.badTeams || a.cost - b.cost);
  return scored[0].teams;
}
```

- For a 2A+2B court it always produces two mixed teams (guaranteed).
- For a residual un-balanced court it produces as many mixed teams as possible.
- When `mixedMode` is off, `mixedModeBadTeamCount` returns 0 and the sort reduces to pure cost — byte-identical to today.

**`pairingCost` definition per format** (resolves the "Stack skill-balance silently changed" concern):

- **RR / Gauntlet:** `pairingCost = rrRoundCost([...chosen, game], history)` — the existing repeat-partner/opponent cost. Identical to today's `bestRRSplit` logic.
- **Stack:** `pairingCost = stackImbalance(t1, t2, stackBySlot) + repeatPenalty(t1, t2, prevSameCourt)`. `stackImbalance` measures the absolute difference in total stack-score between the two teams (so the stronger-stacked team doesn't dwarf the weaker). `repeatPenalty` is a large constant if `(t1, t2)` repeats the previous round's pairing on this court, 0 otherwise. This preserves Stack's defining property — balanced within-court teams — while respecting the mixed constraint. The integration test (§10.2, "Mixed Stack skill spread") asserts that within-court stack-score spread stays within a bound.
- **King:** `pairingCost = rrRoundCost([...chosen, game], history)` — same as RR. King already uses random pairing today, so this is a strict improvement (repeat avoidance).

### 7.4 Per-format call sites

- **Stack** (`pairForStackCourt`, `index.html:6123`): when `mixedMode` is on, delegate to `pairMixedAware` with `opts = { stackBySlot, prevSameCourt }`. When off, existing rank1+rank4 logic unchanged.
- **King** (shuffle pairing at `index.html:6227`): when `mixedMode` is on, replace the shuffle with `pairMixedAware(slots, { history, chosen, court })`. When off, unchanged.
- **Gauntlet** (fixed split `[block[0], block[3]], [block[1], block[2]]` at `index.html:6336`): when `mixedMode` is on, replace with `pairMixedAware(block, { history, chosen, court })`. When off, unchanged.

### 7.5 Gauntlet's global re-rank

Gauntlet (`index.html:6319`) re-ranks everyone globally each round. In the constrained assignment (§7.2), Gauntlet's `naturalCourt` is derived from the global rank: top 4 → court 1, next 4 → court 2, etc. The `totalDeviation` cost term (§7.2(b)) preserves the global ranking order — players only deviate from their rank-block when needed to achieve mixed courts, and the deviation is minimized. This treats rank preservation as a soft cost rather than a hard constraint, which is the right model: Gauntlet's identity is "strong players on top courts," and that signal is preserved as long as deviation is small (which the lexicographic ordering ensures).

### 7.6 Bye selection — same as RR

`buildNextLadderRound` and `buildGauntletPairing` both call `allocateByes` (`index.html:6161`, `index.html:6324`). The mixed-feasibility filter from §6.4 applies identically here — same change, shared across all formats. No format-specific bye work.

### 7.7 The guarantee, stated precisely

For any roster where `min(countA, countB) >= activeCourtsPerRound * 2` (enough of each group to put 2 on every active court) **and all active players have a group set** (§4.2 contract):

- **Round 1:** every team is mixed. Guaranteed by construction — `dealBalancedCourts` deals 2A+2B per court, and `pairMixedAware` always finds a mixed split for 2A+2B.
- **Rounds 2+ (ladder formats):** every team is mixed **whenever a fully-mixed court assignment exists within the search space** of the constrained assignment (§7.2). The multi-restart search explores enough assignments that, for balanced rosters, a 0-badTeam assignment is found in virtually every round. If an adversarial movement pattern prevents any fully-mixed assignment (rare on balanced rosters, possible on edge cases), the optimizer falls to best-effort and the same-gender indicator (§8.1) surfaces it honestly.

For rosters that don't satisfy the formula, mixed is maximized subject to that constraint, and same-gender teams appear only on the courts where the math forces them.

This is an honest guarantee: round 1 is hard; ladder rounds 2+ are "mixed whenever the optimizer finds a fully-mixed assignment," which is virtually always for balanced rosters but not mathematically guaranteed in adversarial movement scenarios.

### 7.8 What the ladder changes do NOT touch

- `computeStackStats`, `computeKingStats`, all ranking math — group-agnostic.
- `stackScoreGain`, `stackMultiplier`, win/loss detection — unchanged.
- Scoring, standings, lifetime records, recap — all group-agnostic at the computation level.

### 7.9 Honest cost — ranking non-neutrality on ladders

In a ladder format, a player's exact court may differ from what pure skill-sorting would produce, by one court position, when needed to keep teams mixed. This has a downstream effect the spec must acknowledge honestly: **court assignment drives opponent strength, which feeds the Adjusted Margin ranker** (`index.html:7763`). A player held a court lower to enable mixed pairing faces weaker opponents, which marginally affects their strength-adjusted score. Over a tournament this introduces a small ranking bias.

This is an unavoidable consequence of the user's decision to enforce mixed on a skill-tiered format. The tradeoff is: mixed pairing (the feature's value) vs. ranking purity (which is already approximate on short social sessions). We accept this tradeoff because:

1. The deviation is bounded to ±1 court position by the optimizer's lexicographic ordering.
2. The Adjusted Margin ranker is explicitly a "light, fixed-strength heuristic" (`index.html:7766`) designed for social play, not a precise rating.
3. The alternative — refusing mixed on ladder formats — denies the feature entirely on the formats the user asked for.

The same-gender-fallback indicator (§8.1) and the "Why?" explainer (§8.3) already make mixed decisions visible. We do not add a separate ranking-bias disclaimer to the UI because it would invite a question ("is her ranking fair?") that the ranker's existing approximations already moot.

## 8. Surfaces that reflect mixed mode

### 8.1 Courts display — mixed badge and fallback indicator

Each court card renders team names like `"Ava & Ben"` via `teamName()` (`index.html:7748`). Two additions:

1. **Mixed badge** next to each mixed team — same visual language as the existing partner chip (`index.html:920`), but a single token (e.g., a ♂♀ glyph or the two-group letters like `M·W`). Only shown when `mixedMode` is on. Non-interactive; glanceable confirmation.
2. **Visual contrast for same-gender fallback teams** — when best-effort produces a same-gender team (lopsided roster), show a subtle dashed outline + tooltip "Same-group team — not enough of one group to pair everyone." So the user understands *why* it happened rather than thinking the mode is broken.

No changes to the court layout itself.

### 8.2 Bye banner — group tally

The bye banner (`index.html:218`, rendered per round) currently says who's sitting. With mixed on, append a one-line group tally using the user's labels:

- Balanced: `Sitting this round: Dana, Lee  ·  1 Man · 1 Woman`
- Lopsided: `Sitting this round: Dana, Lee, Sam  ·  3 Men  ·  (roster has more men, so byes favor men)`

Makes the group-fair bye policy visible and self-explaining. Never hardcodes "Men"/"Women" — uses `state.mixedGroupLabels`.

### 8.3 Recap and "Why?" — explain mixed decisions

1. **The recap** (`index.html:7310`, "Personalized recap for the player in `slot`") — add a line when the player played on a same-gender team: *"Round 3: you teamed with Sam (same group) because there weren't enough of the other group to pair everyone."* Honest about the best-effort fallback.
2. **The "Why?" button** (the app has `why-btn` elements on bye banners and ladder movement toasts) — add a `why-btn` to the same-gender-team indicator from §8.1. Tap → *"Rumble keeps teams mixed (1 + 1) when the roster allows. This round, the roster math forced one same-group team."*

### 8.4 What does NOT change (and one honest caveat)

- **Standings computation, stats, strength-adjusted margin (`index.html:7763`), lifetime records** — all per-player and per-game, group-agnostic at the computation level. We don't surface group in standings because that would invite the wrong question ("did she rank high because of mixed?"). Mixed is a scheduling concern, not a ranking concern.
- **Caveat for ladder formats:** per §7.9, mixed mode is not perfectly ranking-neutral on ladders because court assignment influences opponent strength. This is an accepted tradeoff, not a bug — documented honestly in §7.9.
- **Text-message results** (`index.html:12924`) — sends per-player recaps. The §8.3 recap change flows through automatically. No standalone mixed section in the text.
- **Quick templates** — don't touch `mixedMode`.

## 9. Rejected alternatives

- **Approach B — new "Mixed RR" / "Mixed Stack" format codes.** Branch in `startTournament` into separate format codes. Zero risk to existing formats, but clones a lot of scheduler logic, more to maintain, and contradicts the mental model of "a setting on the mode I already picked." Rejected.
- **Approach C — post-hoc re-pairing.** Generate the normal schedule, then swap partners on each court to make teams mixed. Smallest code change, but destroys the careful repeat-partner / repeat-opponent balancing the scheduler does today — worse schedules and repeated partners. Rejected.
- **Hard-block start on lopsided rosters.** Simplest to reason about, but frustrating if you're short a woman on game night and just want to play. Rejected in favor of best-effort with honest signaling (§8).
- **Absolutely-always-mixed purity (sit extra players to enforce purity on lopsided rosters).** Maximum promise, but can sit half the room on an unbalanced night. Rejected in favor of court-usage-wins (§3).
- **Two-pass "movement then repair" for ladder formats.** Run normal ladder movement, then a `repairCourtsForMixed` pass swapping same-direction movers between adjacent courts. Rejected after multi-model review: swapping a winner (up) with a loser (down) sends each to the *opposite* court from what their result earned; adjacent-only swaps can't propagate across a balanced court; and the "every team mixed" guarantee was unproven. Replaced by the single constrained assignment (§7.2).
- **Precomputed mixed Wh(8) table for 4M+4F / 2 courts.** Ship a fixed mixed-Whist schedule that gives perfect mixed teams *and* the once-as-partner / twice-as-opponent rotation for the flagship case. **Mathematically not achievable as a clean analog:** Wh(8) has 28 partnership slots across 7 rounds (4 teams × 7 rounds) covering all C(8,2)=28 pairs exactly once. With 4M+4F, only 16 mixed pairs exist, but 28 partnership slots need filling — so mixed pairs must repeat ~1.75× on average, breaking the "exactly once" property that makes Wh(8) valuable. The generated scheduler with mixed cost produces high-quality schedules for 4M+4F without a special-case table; the marginal rotation quality isn't worth the maintenance cost of a hand-built table that only covers one roster size. Rejected.

## 10. Testing strategy

Rumble ships with a substantial inline self-test suite (the `console.assert` blocks throughout `index.html:2345-4470`) and a simulation harness (`simulate()` at `index.html:4766`). Mixed mode plugs into both. Tests live inline next to the code, following the existing pattern.

### 10.1 Unit tests — scheduler core

Pure-function tests against `bestRRSplit`, `pairMixedAware`, `assignCourtsConstrained`, `dealBalancedCourts`, and the `allocateByes` feasibility filter.

| Test | Setup | Assert |
|---|---|---|
| **RR: balanced roster → all mixed** | 5A+5B, 2 courts, 5 rounds generated | Every team on every game has one A + one B. |
| **RR: lopsided roster → best-effort** | 7A+3B, 2 courts | No court has 0 mixed teams; mixed teams maximized; no extra byes beyond normal. |
| **RR: mixed off → byte-identical** | Same seed, mixed on vs off (off case) | Identical schedule to today. Guards the gating. |
| **RR: unset groups → no-op** | mixed on, all `groupOf` returns `""` | Schedule generates without errors; no same-gender warnings; identical to mixed-off. |
| **`dealBalancedCourts` empty pools** | 7A+3B, 2 courts | No `undefined` in court arrays; no player dropped; 3 surplus A fill remaining seats. |
| **`dealBalancedCourts` unset groups** | 4A+4B+2 unset, 2 courts | Unset players placed in surplus pool; no crash; courts have 4 players each. |
| **`bestRRSplit` tier ordering** | 4 slots [A,A,B,B], with a cheap repeat-pair tempting | Picks mixed split even if a same-group split has lower base cost. |
| **`pairMixedAware` fallback** | 4 slots [A,A,A,B] | Produces one mixed team; other is same-group (unavoidable). |
| **`assignCourtsConstrained` finds mixed** | 4A+4B, naturalCourt from movement, 2 courts | Finds 0-badTeam assignment; totalDeviation > 0 only if needed. |
| **`assignCourtsConstrained` best-effort** | 5A+3B (playing), 2 courts | No fully-mixed assignment exists; minimizes badTeams; no crash. |
| **`allocateByes` feasibility filter** | 6A+4B, 2 courts, need 2 byes | Sits 2A (not 1A+1B) to keep playing set mixed-feasible (4A+4B). |
| **`allocateByes` fallback** | 7A+3B, 2 courts | No feasible bye set; falls back to rotation; no crash. |
| **Stack `pairingCost` balance** | 4 slots with known stack scores, 2A+2B | Picks mixed split with lowest stack-score imbalance between teams. |

### 10.2 Integration tests — full tournament flows

Extends the existing `simulationConfigs()` pattern (`index.html:4470`). New configs added to the same array:

| Config | Format | Roster | Asserts |
|---|---|---|---|
| `Mixed RR 10/2` | rr | 5A+5B, 2 courts, 6 rounds | All teams mixed all rounds; byes split 1A+1B each round. |
| `Mixed RR 12/3` | rr | 6A+6B, 3 courts | All teams mixed; byes split evenly across groups. |
| `Mixed Stack 8/2` | stack | 4A+4B, 2 courts, 6 rounds | Round 1 dealt 2A+2B; rounds 2+ all mixed (constrained assignment keeps courts balanced). |
| `Mixed Stack skill spread` | stack | 4A+4B, 2 courts, 6 rounds | Within-court stack-score spread stays within 2 points of non-mixed baseline. |
| `Mixed Stack 10/2 lopsided` | stack | 7A+3B, 2 courts | Best-effort; same-gender teams appear only on the court where unavoidable; no extra byes. |
| `Mixed King 8/2` | king | 4A+4B | All rounds mixed; King's Court still gets winners (movement deviation ≤ 1). |
| `Mixed Gauntlet 8/2` | gauntlet | 4A+4B | All rounds mixed; global re-rank still drives court assignment (rank deviation ≤ 1 block). |
| **Regression (mixed off)** | each format | 10 players | Identical to pre-change behavior (golden schedule via fixed seed). |

Each runs through `simulate()`, which means a failure aborts the page load — same safety net as every other feature.

### 10.3 The Wh(8) regression guard

§6.1 bypasses Wh(8) when mixed is on. Explicit test: **mixed off + 8 players + 2 courts must still use Wh(8)** (assert `rrScheduleMode === "wh8"`). Catches a future careless edit that breaks the non-mixed path.

### 10.4 Migration test

The v5 loader (`index.html:5146`) gains mixed defaults. New test mirroring existing migration tests (`index.html:1996`): load a legacy saved state with no `mixedMode` field, assert it backfills to `false`, `rawGroups` to `[]`, etc., and that the tournament still runs.

### 10.5 Visual / Playwright

The repo has `tests/visual/rumble.visual.spec.mjs`. Add one visual test: **setup screen with mixed on**, snapshot the per-player M/W toggles and the warning line. Catches CSS regressions on the new controls. We don't snapshot every court state — unit tests cover the logic; the visual test guards the new setup UI.

### 10.6 Manual QA checklist

1. Start a 10-player (5M+5F) RR tournament — confirm every court shows the mixed badge on both teams, every round.
2. Mid-tournament, use "Add player" to join a 6th man — confirm the schedule regenerates with best-effort mixed and the same-gender indicator appears where relevant.
3. Switch format to Stack with 8 players (4M+4F) — confirm round 2+ stays mixed after court movement.
4. Toggle mixed off mid-setup — confirm per-player toggles disappear, stored groups preserved, schedule unchanged from pre-feature behavior.
5. Load a tournament saved before this feature — confirm it loads and plays identically.

## 11. Architecture summary

- **State:** `mixedMode`, `mixedGroupLabels`, `rawGroups`, `slotGroups` + `groupOf()` / `mixedModeBadTeamCount()` helpers.
- **Setup UI:** rules-block toggle, per-player group control (collision-safe labels), editable labels, informational warning. Mid-event join gains group capture (§4.6).
- **RR scheduler:** Wh(8) bypass, tiered `bestRRSplit` via shared `pairMixedAware`, balanced court dealing (`dealBalancedCourts` with safe pool handling) in `generateRRSchedule`, mixed-feasibility bye filter in `allocateByes`.
- **Ladder scheduler:** round-1 balanced dealing (shared), single constrained assignment per round (`assignCourtsConstrained` — lexicographic: max mixed → min movement deviation → min repeat cost), shared `pairMixedAware` with format-specific `pairingCost`, shared bye filter.
- **Surfaces:** mixed badge on team cards, group tally in bye banner, recap/Why honesty for fallback teams.
- **Testing:** unit + integration + regression + migration + visual + manual QA.

## 12. Resolved questions

All questions surfaced during design and review are resolved in-spec:

- **Unset groups contract** (§4.2): hard guarantee applies only when all active players have a group set; otherwise degrades to best-effort. Setup warning (§5.3) surfaces incomplete groups before Start.
- **Mid-tournament joins** (§4.6): join prompt gains a group toggle; group is stored in both `rawGroups` and `slotGroups`; schedule regenerates from the next unstarted round.
- **Mid-tournament group edits** (§4.6): schedule regenerates for remaining rounds; completed games are never rewritten.
- **Repair-pass stall behavior** (resolved by §7.2 redesign): the two-pass repair is replaced by a single constrained assignment. There is no "stall" — the optimizer always returns the best assignment found across all restarts. If no fully-mixed assignment exists, it returns the one with fewest badTeams (best-effort).
- **Bye feasibility** (§6.4): bye selection uses a mixed-feasibility filter as a primary objective, not just a tiebreak. Prevents the 6A/4B counterexample where sitting one B breaks all mixed courts.
- **Stack skill-balance** (§7.3): `pairingCost` is explicitly defined per format. Stack uses `stackImbalance + repeatPenalty` to preserve within-court skill balance. Integration test asserts the spread stays bounded.
- **Ranking non-neutrality on ladders** (§7.9, §8.4): acknowledged as an accepted tradeoff. Deviation is bounded to ±1 court; the ranker is already approximate for social play; the alternative denies the feature on the formats the user asked for.
- **Toggle label collisions** (§5.2): first-char → truncated-full-label → numeric fallback ensures segments are always distinguishable.
