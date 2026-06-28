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

If it returns `""` (player's group never set, or mixed mode off), the mixed logic gracefully no-ops — so a half-filled roster never breaks the scheduler.

### 4.3 The `mixedModeBadTeamCount` helper

Returns the number of teams (0, 1, or 2) in a proposed pairing that are *not* mixed. Returns 0 unconditionally when `mixedMode` is off, so existing behavior is byte-identical.

### 4.4 Migration

The v5 loader (`index.html:5146`) already validates unknown fields and backfills defaults. Add `mixedMode: false`, `mixedGroupLabels: { a: "Men", b: "Women" }`, `rawGroups: []`, `slotGroups: []` to that same path. Old tournaments keep behaving exactly as today. A migration test (see §8.4) guards this.

### 4.5 When groups are populated into slots

At Start time, after `state.slots = shuffled` (`index.html:6636` for RR, `:6603` for stack, `:6614` for king, `:6625` for gauntlet), populate `state.slotGroups`. This mirrors the existing `phoneByName` pattern (`index.html:6559-6560`): build a `name → group` map from `rawNames`/`rawGroups` *before* the shuffle, then walk `state.slots` post-shuffle and look up each name's group. For a name with no group set, the slot group is `""`.

The mid-tournament join path (`addMidEventPlayer`) regenerates the schedule; the new player's group comes from their setup row, maps to `slotGroups`, and `generateRRSchedule` picks them up automatically since it reads `groupOf(slot)`.

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
- The toggle segment labels are the first letters of the user's `mixedGroupLabels` values (uppercase). Code never hardcodes "M"/"W" outside that label source.
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
// Pseudo-code for the mixed court-dealing path
function dealBalancedCourts(playing) {
  const aPool = seededShuffle(playing.filter(s => groupOf(s) === "a"), rng);
  const bPool = seededShuffle(playing.filter(s => groupOf(s) === "b"), rng);
  const courts = [];
  for (let c = 0; c < activeCourts; c++) {
    courts.push([aPool.shift(), aPool.shift(), bPool.shift(), bPool.shift()]);
  }
  // overflow (when groups are lopsided) spills to best-fit courts
  return courts;
}
```

Overflow from the larger group fills remaining seats; `bestRRSplit`'s Tier 2 handles those courts. `dealBalancedCourts` is the shared helper used by RR and by all ladder formats' round-1 dealing.

### 6.4 `allocateByes` — group-fair tiebreak

Byes already rotate fairly across players via a `byeCount` history check (`index.html:7614`). With mixed, byes must also rotate fairly across groups — otherwise the over-represented group sits disproportionately (mathematically inevitable when counts differ) but within each group the burden should still be shared.

**Change:** in `sortByeCandidates`, among candidates tied on the existing sort key, prefer the candidate whose **group's running bye share** is lowest. For balanced rosters (5M+5F), this is a no-op: byes split evenly anyway. This is a small addition to `sortByeCandidates`, not a new policy. Shared across all four formats (RR and the three ladders all call `allocateByes`).

### 6.5 What RR changes do NOT touch

- `rrRoundCost`, `rrPairKey`, `rrHistoryCounts` — unchanged. The repeat-partner/opponent math is group-independent.
- The Wh(8) constant table — untouched, just bypassed when mixed is on.
- `computeStackStats`, scoring, standings, lifetime records — all group-agnostic.

## 7. Scheduler changes — ladder formats (Stack, King, Gauntlet)

The ladder formats add a fundamental tension RR doesn't have: **court = skill tier.** Stack/King move winners up and losers down; Gauntlet re-ranks everyone globally. Court 1 is supposed to hold the strongest players. Mixed mode wants to balance gender *across* courts. These can collide — if the top 4 by skill happen to be 3M+1W, court 1 can't field two mixed teams no matter how we pair within it.

The §4b-draft approach (only change within-court pairing) is **insufficient** to guarantee mixed, because ladder movement can land 3A+1B on a court, and no split of that produces two mixed teams. To guarantee mixed when math allows (per the user's "always mixed for all rounds" clarification), we must also adjust **court assignment**, while preserving ladder movement as much as possible.

This is a two-pass design: **(1) run normal ladder movement**, then **(2) a mixed-repair pass** that swaps players across courts to restore 2A+2B everywhere achievable.

### 7.1 Round 1 — balanced dealing (same as RR)

`assignInitialLadderCourts` (`index.html:5956`) today shuffles all players and slices into chunks of 4. Round 1 has **no skill information** — it's pure random assignment — so there's zero ladder-integrity cost to dealing 2A+2B per court instead.

```js
// When mixedMode is on, skip preserveLegacyShuffle and use balanced dealing
const ordered = state.mixedMode
  ? dealBalancedCourts(alloc.playing)   // 2A+2B per court (shared with RR §6.3)
  : preserveLegacyShuffle ? shuffle(alloc.playing) : seededShuffle(alloc.playing, rng);
```

Sets up clean mixed teams for round 1 in the common balanced-roster case, at no cost to the ladder.

### 7.2 Rounds 2+ — two-pass: movement, then mixed-repair

`buildNextLadderRound` (`index.html:6153`) and `buildGauntletPairing` (`index.html:6319`) both produce a court assignment (`seats[court - 1]` arrays). The change: after seats are populated by normal movement, run a `repairCourtsForMixed(seats, movementDir)` pass before within-court pairing.

**What the repair pass does:**

1. Compute each court's group skew: `countA - countB` for the 4 slots.
2. Identify donor courts (skew > 0 = extra of one group) and acceptor courts (skew < 0 = extra of the other).
3. Swap same-direction movers between adjacent courts to balance. When court X has an extra A who is a *winner* (moving up) and court X+1 has an extra B who is a *loser* (moving down), swap them — both players still move in their intended direction, just routed past each other.

```js
function repairCourtsForMixed(seats, movementDir) {
  if (!state.mixedMode) return;
  // movementDir: Map<slot, "up" | "down" | "stay"> from the ladder pass
  for (let pass = 0; pass < seats.length; pass++) {      // bounded; converges fast
    let swapped = false;
    for (let c = 0; c < seats.length - 1; c++) {
      const lo = seats[c], hi = seats[c + 1];
      const loSkew = groupSkew(lo), hiSkew = groupSkew(hi);
      if (Math.sign(loSkew) === Math.sign(hiSkew)) continue;   // both same-skew, no help
      // lo has extra of one group, hi has extra of the other — find a compatible swap
      const swapPair = findDirectionalSwap(lo, hi, movementDir);
      if (swapPair) { applySwap(lo, hi, swapPair); swapped = true; }
    }
    if (!swapped) break;
  }
}
```

**Why this preserves ladder integrity:** swaps only happen between players already moving in the same direction. A woman winning on court 2 who would have moved to court 1 — but court 1 is "full" of women — gets swapped with a man on court 1 who's moving down. Both end up at the court their result earned; they just trade places with someone heading the other way. The competitive signal (winners up, losers down) is preserved; only *which specific court seat* they occupy changes.

**Why this converges:** each swap strictly reduces total absolute skew across courts. Bounded by court count.

**Best-effort fallback (the §3 policy):** if after the repair pass some court still isn't 2A+2B (the global roster can't make every court pairable — e.g., 7A+3B on 2 courts can field only 1 fully-balanced court), `pairMixedAware` (§7.3) handles the residual: it forms the mixed team(s) that *are* possible on that court and accepts a same-gender team for the rest. No extra byes imposed; court count stays as the user set it.

### 7.3 Within-court pairing — `pairMixedAware`

After the repair pass, pair the 4 slots on each court. Shared helper for all four formats' within-court pairing:

```js
// Returns [team1, team2] — mixed-aware pairing for 4 slots on a court.
// Used by RR (§6.2 bestRRSplit), Stack (rounds 2+), King (rounds 2+), Gauntlet (all rounds).
function pairMixedAware(four, opts) {
  const splits = rrTeamSplits(four);        // the 3 possible 2-vs-2 splits
  const scored = splits.map(([t1, t2]) => ({
    teams: [t1, t2],
    badTeams: mixedModeBadTeamCount([t1, t2]),  // 0 = both mixed
    cost: pairingCost(t1, t2, opts),            // stack balance + repeat avoidance
  }));
  scored.sort((a, b) => a.badTeams - b.badTeams || a.cost - b.cost);
  return scored[0].teams;
}
```

- For a 2A+2B court it always produces two mixed teams (guaranteed).
- For a residual un-balanced court it produces as many mixed teams as possible.
- When `mixedMode` is off, `mixedModeBadTeamCount` returns 0 and the sort reduces to pure cost — byte-identical to today.

### 7.4 Per-format call sites

- **Stack** (`pairForStackCourt`, `index.html:6123`): when `mixedMode` is on, delegate to `pairMixedAware` with `opts = { stackBySlot, prevSameCourt }` so stack-score balance and repeat-pair avoidance still factor in. When off, existing rank1+rank4 logic unchanged.
- **King** (shuffle pairing at `index.html:6227`): when `mixedMode` is on, replace the shuffle with `pairMixedAware(slots, {})`. When off, unchanged.
- **Gauntlet** (fixed split `[block[0], block[3]], [block[1], block[2]]` at `index.html:6336`): when `mixedMode` is on, replace with `pairMixedAware(block, { court, history, chosen })`. When off, unchanged.

### 7.5 Gauntlet's global re-rank

Gauntlet (`index.html:6319`) re-ranks everyone globally each round and slices into blocks of 4. The repair pass applies the same way: after blocks are formed by rank, run `repairCourtsForMixed` on the block list (treating each block as a "court"). Swaps happen between adjacent rank-blocks, preserving the global ranking order as much as possible.

### 7.6 Bye selection — same as RR

`buildNextLadderRound` and `buildGauntletPairing` both call `allocateByes` (`index.html:6161`, `index.html:6324`). The group-fair tiebreak from §6.4 applies identically here — same `sortByeCandidates` change, shared across all formats. No format-specific bye work.

### 7.7 The guarantee, stated precisely

For any roster where `min(countA, countB) >= activeCourtsPerRound * 2` (enough of each group to put 2 on every active court), **every team in every round is mixed**, in all four formats. The 5M+5F / 2-court case satisfies this (5 >= 2×2). For rosters that don't satisfy it, mixed is maximized subject to that constraint, and same-gender teams appear only on the courts where the math forces them.

### 7.8 What the ladder changes do NOT touch

- `computeStackStats`, `computeKingStats`, all ranking math — group-agnostic.
- `stackScoreGain`, `stackMultiplier`, win/loss detection — unchanged.
- Win/loss court movement (`addMover`, winners up / losers down) — the *direction* is sacred; only the specific seat can shift via the repair pass.
- Scoring, standings, lifetime records, recap — all group-agnostic.

### 7.9 Honest cost

In a ladder format, a player's exact court may differ from what pure skill-sorting would produce, by one court position, when needed to keep teams mixed. That's the deliberate tradeoff — and it's the only way to honor "always mixed when math allows" without breaking the ladder.

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

### 8.4 What does NOT change

- **Standings, ranking, stats, strength-adjusted margin (`index.html:7763`), lifetime records** — per-player and per-game, group-agnostic. We don't surface group in standings because that would invite the wrong question ("did she rank high because of mixed?"). Mixed is a scheduling concern, not a ranking concern.
- **Text-message results** (`index.html:12924`) — sends per-player recaps. The §8.3 recap change flows through automatically. No standalone mixed section in the text.
- **Quick templates** — don't touch `mixedMode`.

## 9. Rejected alternatives

- **Approach B — new "Mixed RR" / "Mixed Stack" format codes.** Branch in `startTournament` into separate format codes. Zero risk to existing formats, but clones a lot of scheduler logic, more to maintain, and contradicts the mental model of "a setting on the mode I already picked." Rejected.
- **Approach C — post-hoc re-pairing.** Generate the normal schedule, then swap partners on each court to make teams mixed. Smallest code change, but destroys the careful repeat-partner / repeat-opponent balancing the scheduler does today — worse schedules and repeated partners. Rejected.
- **Hard-block start on lopsided rosters.** Simplest to reason about, but frustrating if you're short a woman on game night and just want to play. Rejected in favor of best-effort with honest signaling (§8).
- **Absolutely-always-mixed purity (sit extra players to enforce purity on lopsided rosters).** Maximum promise, but can sit half the room on an unbalanced night. Rejected in favor of court-usage-wins (§3).

## 10. Testing strategy

Rumble ships with a substantial inline self-test suite (the `console.assert` blocks throughout `index.html:2345-4470`) and a simulation harness (`simulate()` at `index.html:4766`). Mixed mode plugs into both. Tests live inline next to the code, following the existing pattern.

### 10.1 Unit tests — scheduler core

Pure-function tests against `bestRRSplit`, `pairMixedAware`, `repairCourtsForMixed`, `dealBalancedCourts`.

| Test | Setup | Assert |
|---|---|---|
| **RR: balanced roster → all mixed** | 5A+5B, 2 courts, 5 rounds generated | Every team on every game has one A + one B. |
| **RR: lopsided roster → best-effort** | 7A+3B, 2 courts | No court has 0 mixed teams; mixed teams maximized; no extra byes beyond normal. |
| **RR: mixed off → byte-identical** | Same seed, mixed on vs off (off case) | Identical schedule to today. Guards the gating. |
| **RR: unset groups → no-op** | mixed on, all `groupOf` returns `""` | Schedule generates without errors; no same-gender warnings. |
| **`bestRRSplit` tier ordering** | 4 slots [A,A,B,B], with a cheap repeat-pair tempting | Picks mixed split even if a same-group split has lower base cost. |
| **`pairMixedAware` fallback** | 4 slots [A,A,A,B] | Produces one mixed team; other is same-group (unavoidable). |
| **`repairCourtsForMixed` convergence** | 2 courts: [A,A,A,B] and [A,B,B,B] | After repair: both [A,A,B,B]. Both swaps direction-preserving. |
| **`repairCourtsForMixed` respects direction** | Court1 winner (A) vs court2 loser (B) | Swap only when both move compatibly; never reverses a player's earned direction. |

### 10.2 Integration tests — full tournament flows

Extends the existing `simulationConfigs()` pattern (`index.html:4470`). New configs added to the same array:

| Config | Format | Roster | Asserts |
|---|---|---|---|
| `Mixed RR 10/2` | rr | 5A+5B, 2 courts, 6 rounds | All teams mixed all rounds; byes split 1A+1B each round. |
| `Mixed RR 12/3` | rr | 6A+6B, 3 courts | All teams mixed; byes split evenly across groups. |
| `Mixed Stack 8/2` | stack | 4A+4B, 2 courts, 6 rounds | Round 1 dealt 2A+2B; rounds 2+ all mixed (repair pass keeps courts balanced). |
| `Mixed Stack 10/2 lopsided` | stack | 7A+3B, 2 courts | Round 1 best-effort; same-gender teams appear only on the court where unavoidable; no extra byes. |
| `Mixed King 8/2` | king | 4A+4B | All rounds mixed; King's Court still gets winners. |
| `Mixed Gauntlet 8/2` | gauntlet | 4A+4B | All rounds mixed; global re-rank still drives court assignment. |
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
- **Setup UI:** rules-block toggle, per-player M/W control, editable labels, informational warning.
- **RR scheduler:** Wh(8) bypass, tiered `bestRRSplit`, balanced court dealing in `generateRRSchedule`, group-fair bye tiebreak in `sortByeCandidates`.
- **Ladder scheduler:** round-1 balanced dealing (shared), `repairCourtsForMixed` post-pass (direction-preserving swaps), shared `pairMixedAware`, shared bye tiebreak.
- **Surfaces:** mixed badge on team cards, group tally in bye banner, recap/Why honesty for fallback teams.
- **Testing:** unit + integration + regression + migration + visual + manual QA.

## 12. Open questions

None at design time. Implementation plan may surface concrete edge cases (e.g., exact behavior when a single player has unset group mid-tournament, or how the repair pass behaves with court counts > 2 and severely lopsided rosters) — these should be resolved in the plan, not the spec.
