# Round Plan — Per-Round Pairing Modes — Design Spec

**Date:** 2026-06-29
**Status:** Approved design, pending implementation plan
**Scope:** All formats (Round Robin, Stack, King of the Court, Gauntlet). Crown is out of scope (fixed 4-player themed matches).

---

## 1. Problem

Players at a social pickleball night (6M + 6W, 3 courts) want a mix of mixed doubles and gender doubles in the same session — not one or the other for the whole night. They want to design the *arc* of the evening: warm up with gender doubles, switch to mixed for the social middle rounds, finish however they choose. Today the app supports exactly one pairing constraint for the entire tournament (all mixed or all open). There's no way to vary the pairing mode per round.

## 2. Goals

- **Per-round pairing modes.** The manager assigns a mode to each round before the tournament starts: Open, Mixed, Gender, or Blend.
- **Blend mode.** A round where some courts play mixed doubles and the rest play gender doubles — directly answering the 6M+6W/3-court request (2 mixed courts + 1 gender court = 4 mixed teams + 2 gender teams, all 12 active).
- **Backward compatible.** Existing `mixedMode` toggle still works. `mixedMode:true` + no round plan = all mixed (today's behavior). `mixedMode:false` + no plan = all open (today's behavior).
- **Mid-tournament edit.** The manager can change the mode of remaining unstarted rounds via Settings. Completed rounds are locked.
- **Works across formats.** Round Robin, Stack, King, and Gauntlet all respect the round plan. Crown is excluded (fixed 4-player matches).

## 3. Non-goals

- **No new format codes.** Round Plan is a setting on the existing formats, not a new format.
- **No per-court tagging across all rounds.** The manager controls per-round, not per-court-permanent. (Approach B from brainstorming, rejected.)
- **No automatic roster detection.** The app does not auto-suggest a blend split. The manager configures it explicitly.
- **No change to ranking, scoring, or standings.** Pairing mode is a scheduling concern. The Adjusted Margin ranker and all stat computation are mode-agnostic.
- **No round plan for Crown.** Crown's themed matches don't fit the per-round model.

## 3.5 Cross-mode standings — honest framing

A tournament with varying modes (gender rounds + mixed rounds) produces standings that mix different competitive contexts. Gender rounds shrink each player's partner pool to their own group (~5 options for 6+6), so repeat partners exhaust variety faster. Mixed rounds pair across groups. A strong player in a weak same-gender pool faces a structurally different challenge than in mixed rounds. All games feed one Adjusted Margin leaderboard.

**This is intentional for a social night.** The standings are a fun social aggregate, not a precision rating. The Adjusted Margin ranker is explicitly a "light, fixed-strength heuristic" designed for social play. We accept the cross-mode variance because the alternative — separate standings per mode — fragments the social narrative of the night into incomparable leaderboards. The spec owns this framing rather than implying mode has no competitive effect.

## 4. Data model

### 4.1 New state field

| Field | Type | Default | Purpose |
|---|---|---|---|
| `state.roundPlan` | `Array<RoundMode>` | `[]` (empty = use `mixedMode` fallback) | One entry per round, controls pairing constraint |

### 4.2 RoundMode shape

```ts
type RoundMode =
  | { mode: "open" }                        // no constraint
  | { mode: "mixed" }                       // every team 1A + 1B
  | { mode: "gender" }                      // every team same-group
  | { mode: "blend", mixedCourts: number }; // N courts mixed, rest gender
```

- `mode: "open"` — the scheduler pairs freely for best rotation. Byte-identical to today's non-mixed behavior.
- `mode: "mixed"` — every team must be 1 from Group A + 1 from Group B. Uses the existing mixed-mode logic (`dealBalancedCourts` + `pairMixedAware`).
- `mode: "gender"` — every team must be same-group (M+M or W+W). New constraint, the inverse of mixed.
- `mode: "blend"` — `mixedCourts` courts play mixed; the remaining courts play gender. New constraint combining both.

### 4.3 Blend constraints

- `mixedCourts` must be `>= 1` and `<= courtCount - 1`. If `mixedCourts === 0`, it's equivalent to `gender`. If `mixedCourts === courtCount`, it's equivalent to `mixed`.
- If the manager changes court count after setting a plan, blend rounds auto-clamp `mixedCourts` and display a small inline note on affected rows: *"Adjusted (court count changed)."* The note clears on next render.

### 4.4 Relationship to existing `mixedMode` — explicit mode threading

`mixedMode` is the legacy shorthand; `roundPlan` is the advanced view. The critical design decision: **scheduling primitives no longer read `state.mixedMode` directly.** They receive the resolved per-round mode as an explicit parameter. This fixes the coupling where an "open" round inside a populated plan would still trigger mixed pairing because `bestRRSplit` checks the global.

- **`mixedMode` ON, `roundPlan` empty:** `roundPlanForRound(ri)` returns `{mode:"mixed"}` for all rounds. Scheduler receives `"mixed"` explicitly. Backward compatible.
- **`mixedMode` OFF, `roundPlan` empty:** `roundPlanForRound(ri)` returns `{mode:"open"}`. Scheduler receives `"open"`. Backward compatible.
- **`roundPlan` populated:** the round plan takes precedence per-round. `state.mixedMode` is set to `true` (so surfaces like the per-player group toggles stay visible) but **scheduling primitives ignore it** — they read only the resolved mode passed by the router.
- **`mixedMode` toggled ON in setup:** populates `roundPlan` with all-mixed entries. The manager can then edit individual rounds.
- **`mixedMode` toggled OFF:** clears `roundPlan` to `[]`. Values preserved in memory for re-toggle.

**What changes in existing primitives:** every function that currently reads `state.mixedMode` gains an explicit `mode` parameter instead:
- `bestRRSplit(four, court, history, chosen)` → `bestRRSplit(four, court, history, chosen, mode)`
- `pairMixedAware(four, opts)` → already takes opts; the mode is in `opts.mode`
- `mixedModeBadTeamCount(teams)` → gains a `mode` param; only counts bad teams when mode is `"mixed"`
- `generateRRSchedule` → passes `roundPlanForRound(ri)` to each helper
- `allocateByesMixed` → becomes `allocateByesForMode(mode, ...)` (see §6.8)
- `assignCourtsConstrained` → gains `mode` param

When `mode === "open"`, all these primitives reduce to today's non-mixed behavior (byte-identical) regardless of what `state.mixedMode` says.

### 4.5 Migration

`roundPlan` defaults to `[]`. The v5 loader (`backfillStateDefaults`) backfills it. Old tournaments load with `[]` and behave identically to today.

### 4.6 The `roundPlanForRound` helper

```js
// Resolves the effective mode for round index `ri` (0-based).
// Falls back to mixedMode if roundPlan is empty or the round isn't covered.
function roundPlanForRound(ri) {
  if (Array.isArray(state.roundPlan) && state.roundPlan[ri]) {
    return state.roundPlan[ri];
  }
  return state.mixedMode ? { mode: "mixed" } : { mode: "open" };
}
```

### 4.7 Mid-tournament joins

When a player joins mid-tournament, the schedule regenerates for remaining rounds. Each regenerated round reads its `roundPlanForRound(ri)` mode. The new player's group comes from their setup-row group (existing `addMidEventPlayer` group capture from the mixed-mode feature).

### 4.8 Mid-tournament plan edits

The manager can edit `roundPlan` for remaining unstarted rounds via **⚙ Settings → Round Plan**. Completed rounds are locked (their games are already recorded).

**Round Robin:** regenerates all unstarted pre-built rounds immediately, picking up the new modes.

**Ladder formats (Stack/King/Gauntlet):** these build rounds incrementally — the next round is only built after the prior round's scores are entered. Plan edits apply when the next round is generated: the manager changes round 5's mode from mixed to gender while round 3 is in progress; when round 4 completes and round 5 is generated, it reads the updated mode. No immediate regeneration — the plan change takes effect at the next round boundary.

## 5. Setup UI

### 5.1 The Round Plan section

A new collapsible section on the setup screen, between the player roster and the Start button. Only visible when `mixedMode` is ON. Title: **"Round Plan"** with subtitle *"Choose how each round pairs teams."*

### 5.2 Per-round dropdown

One row per round, matching `totalRegularRounds()`:

```
ROUND PLAN                          ▾
Choose how each round pairs teams.

  Round 1   [ Mixed   ▾ ]
  Round 2   [ Mixed   ▾ ]
  Round 3   [ Mixed   ▾ ]
  Round 4   [ Mixed   ▾ ]
  Round 5   [ Gender  ▾ ]
  Round 6   [ Blend: 2 mixed + 1 open ▾ ]
  Round 7   [ Open    ▾ ]
```

Each dropdown has four options: **Open**, **Mixed**, **Gender**, **Blend**.

### 5.3 Blend sub-control

When Blend is selected for a round, a compact inline control appears on that row: `[ 2 mixed · 1 open ]` with `+`/`-` buttons to adjust `mixedCourts` (clamped to `1..courtCount-1`). Label updates live.

### 5.4 Default behavior

When mixed mode is toggled ON, every round defaults to **Mixed**. The manager can then change individual rounds.

### 5.5 Quick presets

Three small buttons above the dropdown list:
- **All Mixed** — sets every round to Mixed (the default)
- **Mixed → Gender** — first half mixed, second half gender
- **Custom** — clears to all Open, manager configures manually

These just fill the dropdowns — the manager can edit any round afterward.

### 5.6 Court count interaction

If the manager changes court count after setting up the plan, blend rounds auto-clamp `mixedCourts` with an inline note (see §4.3).

### 5.7 Mixed-mode toggle interaction

- **ON:** reveals Round Plan section, sets all rounds to Mixed default.
- **OFF:** hides Round Plan section, clears `roundPlan` to `[]` (preserved in memory for re-toggle).

## 6. Scheduler changes

### 6.1 Mode router

`generateRRSchedule` reads `roundPlanForRound(ri)` for each round and routes to the appropriate dealing + pairing logic:

```js
const plan = roundPlanForRound(ri);
const courts = dealCourtsByMode(plan, alloc.playing, alloc.activeCourts, rng, prior);
const games = courts.map((four, c) => pairByMode(plan, four, c, opts));
```

`dealCourtsByMode` and `pairByMode` are thin dispatchers based on `plan.mode`.

### 6.2 Open mode

Uses the existing non-mixed path: `seededShuffle` → slice into courts of 4 → `bestRRSplit`. Byte-identical to today.

### 6.3 Mixed mode

Uses the existing mixed path: `dealBalancedCourts` (2A+2B per court) → `pairMixedAware`. No new code — routes to the helpers we already built.

### 6.4 Gender mode

**New helper — `dealGenderCourts(playing, activeCourts, rng, priorRounds)`:** deals players to courts keeping groups separable. With balanced 6A+6B on 3 courts, forms three courts of 2A+2B. Each court will pair as A+A vs B+B.

Court composition options for gender mode:
- 4A → A+A vs A+A (all same-group)
- 4B → B+B vs B+B
- 2A+2B → A+A vs B+B (same-group teams, different-group opponents)

The dealer prefers 2A+2B courts when possible (maximizes partner variety: each player can partner with any of the N-1 same-group players, and faces all opposite-group players as opponents).

**Gender semantics (resolved):** "Gender" means same-group *teams* — M+M or W+W. Opponents may be the same or different group. A 2A+2B court pairs as A+A vs B+B (men vs women), which is standard gender-doubles match play. A 4A court pairs as A+A vs A+A. This is the common interpretation for social pickleball: you partner with your own gender but may play against any team. If a manager wants strict gender separation (men only play men, women only play women), that requires a 4A+4B court split, which only works when group counts divide evenly into courts of 4 — a configuration the dealer forms when math allows but does not force.

**Wildcard handling:** players with unset groups (`groupOf` returns `""`) are treated as wildcards in gender mode — they can fill either side. `pairGenderAware` counts a team with one unset player as `crossTeams === 0` (valid for gender mode) since the unset player can be any group. This means a roster with some unset players degrades gracefully: the scheduler forms same-group pairs where possible and uses unset players as flexible fillers.

**New helper — `pairGenderAware(four, opts)`:** the mirror image of `pairMixedAware`. Instead of minimizing same-group teams, it minimizes *cross-group* (mixed) teams:

```js
function pairGenderAware(four, opts) {
  const splits = rrTeamSplits(four);
  const scored = splits.map(([team1, team2]) => {
    let crossTeams = 0;
    for (const team of [team1, team2]) {
      const g0 = groupOf(team[0]), g1 = groupOf(team[1]);
      if (g0 && g1 && g0 !== g1) crossTeams++;  // mixed team = bad for gender mode
    }
    return { teams: [team1, team2], crossTeams, cost: pairingCost(team1, team2, opts) };
  });
  scored.sort((a, b) => a.crossTeams - b.crossTeams || a.cost - b.cost);
  return scored[0].teams;
}
```

For a 2A+2B court, this always produces `[A,A]` vs `[B,B]` (the only split with `crossTeams === 0`). For a 4A or 4B court, all splits have `crossTeams === 0` so it picks the one with lowest repeat cost. When `mixedMode`-style helpers are off, this gracefully degrades to cost-only ranking.

### 6.5 Blend mode

The scheduler splits courts into two sets and applies different helpers. **Each generated game stores its court mode** as `game.courtMode` (`"mixed"` or `"gender"`) so rendering and post-processing passes (including the court-swap optimizer) don't need to re-derive mode from court index:

```js
function dealBlendCourts(plan, playing, activeCourts, rng, prior) {
  const mixedCourts = Math.max(1, Math.min(plan.mixedCourts || 1, activeCourts - 1));
  const genderCourts = activeCourts - mixedCourts;
  // Deal mixed courts first: 2A+2B each
  const mCourts = dealBalancedCourts(playing, mixedCourts, rng, prior);
  // Remove dealt players, deal gender courts from remainder
  const dealt = new Set(mCourts.flat());
  const remaining = playing.filter(s => !dealt.has(s));
  const gCourts = dealGenderCourts(remaining, genderCourts, rng, prior);
  // Return courts with their mode tags
  const tagged = [
    ...mCourts.map(c => ({ slots: c, courtMode: "mixed" })),
    ...gCourts.map(c => ({ slots: c, courtMode: "gender" })),
  ];
  return tagged;
}
```

The court-swap post-processing pass (§generateRRSchedule's relabeling) must preserve `game.courtMode` when swapping court numbers — it swaps the `court` field but leaves `courtMode` intact, so rendering always reads the correct mode from the game record.

For the user's 6M+6W / 3-court / 2-mixed example:
- Mixed court 1: 2M+2W → M+W vs M+W (`courtMode: "mixed"`)
- Mixed court 2: 2M+2W → M+W vs M+W (`courtMode: "mixed"`)
- Gender court: 2M+2W → M+M vs W+W (`courtMode: "gender"`)

4 mixed teams + 2 gender teams, all 12 players active.

### 6.6 `pairByMode` dispatcher

Uses the `courtMode` tag from `dealBlendCourts` (or the round's mode for non-blend rounds), not court index:

```js
function pairByMode(plan, four, courtMode, opts) {
  // courtMode is "mixed" or "gender" (resolved by the dealer for blend,
  // or equals plan.mode for non-blend rounds)
  if (courtMode === "gender") return pairGenderAware(four, opts);
  if (courtMode === "mixed") return pairMixedAware(four, opts);
  return bestRRSplit(four, opts.court, opts.history, opts.chosen);  // open
}
```

### 6.7 Ladder formats (Stack/King/Gauntlet)

`assignCourtsConstrained` gains a mode parameter. Its cost function's primary key changes:
- **Mixed:** minimize `badTeams` (same-group teams) — existing
- **Gender:** minimize `crossTeams` (mixed teams) — inverted
- **Blend:** mixed courts minimize badTeams, gender courts minimize crossTeams
- **Open:** no primary constraint — pure deviation + repeat cost

The optimizer already does multi-restart search with a lexicographic cost. Adding a mode parameter changes the scoring function, not the structure.

**Rank-vs-mode conflict in blend rounds:** in a ladder, court assignment is rank-dependent (winners up, losers down). In a blend round, the ranking order may place group ratios on a court that can't satisfy its mode (e.g., 4 players of one group assigned to a "mixed" court). The optimizer resolves this by treating the mode as a **soft constraint within the lexicographic cost** — it minimizes mode violations after minimizing court deviation. If a perfect mode assignment isn't achievable within the movement constraints, the court with the fewest violations accepts the fallback, and the court-type badge on screen reflects what was actually achieved (not what was planned). The "Why?" button explains the fallback.

### 6.8 Bye allocation — mode-aware for all modes

**The existing `allocateByesMixed` is renamed and generalized to `allocateByesForMode(mode, ...)`.** It applies a feasibility filter appropriate to the round's mode:

- **Mixed:** byes leave a playing set where `countA >= 2*activeCourts && countB >= 2*activeCourts` (existing behavior).
- **Gender:** byes leave a playing set where each group has an even count (so same-group pairs are possible on every court). Specifically: `countA % 2 === 0 && countB % 2 === 0` after removing byes.
- **Blend:** byes leave a playing set satisfying *both* the mixed-court constraint (enough A and B for `mixedCourts` courts of 2A+2B) and the gender-court constraint (even remainder for gender courts).
- **Open:** standard rotation `allocateByes` — no group constraint.

For all modes, the existing individual-fairness rotation (`byeCount` history) remains the tie-break among feasible bye sets. If no feasible set exists (lopsided roster), falls back to standard rotation (best-effort).

### 6.9 Finals bracket — rank-seeded, mode-aware when feasible

Finals pairing uses rank seeding (#1+#4 vs #2+#3) as the primary constraint — this is the championship, and seed integrity matters more than pairing mode. **The round-plan mode does NOT apply to finals.** This resolves the conflict where the top 4 by rank might be 3A+1B and can't form a valid mixed/gender split.

Exception: if the top-4 seeds happen to have a 2A+2B split and the tournament was predominantly mixed-mode, `pairMixedAware` is used to pick the mixed split (same as the fix we applied to finals in the mixed-mode feature). Otherwise, rank-seeded pairing is used as-is.

This means: a gender-only tournament will still get rank-seeded finals (which may be mixed if the top 4 happen to split that way). The finals are about finding the best team, not enforcing a pairing mode. The round plan governs the regular rounds; the finals are their own thing.

### 6.10 What does NOT change

- `rrRoundCost` (repeat-partner/opponent math) — secondary sort key in all modes
- `computeStackStats`, `computeKingStats`, all ranking math — mode-agnostic
- Standings, scoring, lifetime records — mode-agnostic
- Wh(8) schedule — bypassed when any non-open mode is active (same as current mixed behavior)

## 7. Surfaces

### 7.1 Mode badge in round header

Header shows: **"Round 3 of 7 · Mixed"** or **"Round 6 of 7 · Blend (2 mixed + 1 open)"** or **"Round 1 of 7 · Open"**.

### 7.2 Court-type badge (blend rounds only)

On blend rounds, mixed courts show a **Mixed** badge and gender courts show a **Gender** badge next to the court name. This distinguishes the two court types on screen.

### 7.3 Same-gender team badges

In gender mode and on gender courts in blend mode, teams show **M·M** or **W·W** badges instead of the mixed M·W badge. Uses the existing badge rendering with the two-group letters.

### 7.4 Round plan view in Settings

**⚙ Settings → Round Plan** shows the full plan read-only. Remaining unstarted rounds can be edited; completed rounds are locked.

### 7.5 Bye banner

Unchanged — still shows group tally ("1 Men · 1 Women") regardless of mode.

### 7.6 Recap & "Why?"

- Gender round, blend gender court: no special note (same-gender teams are expected)
- Mixed round with same-gender fallback (lopsided): existing "Why?" explanation
- No mode-transition note in the recap (not blocking)

### 7.7 What does NOT change

- Standings table — no mode column
- Score entry — identical UI
- Text-message results — recap flows through
- Templates — don't touch the round plan

## 8. Testing strategy

### 8.1 Unit tests

| Test | Setup | Assert |
|---|---|---|
| **Open mode → existing behavior** | 10 players, no groups, roundPlan `[open]` | Identical to today's `generateRRSchedule` |
| **Mixed mode → all mixed** | 5A+5B, roundPlan `[mixed × 7]` | Every team 1A+1B every round |
| **Gender mode → all same-group** | 6A+6B, 3 courts, roundPlan `[gender]` | Every team AA or BB; no mixed teams |
| **Gender: 2A+2B court** | 4 slots [A,A,B,B], gender mode | Pairs as [A,A] vs [B,B] |
| **Gender: 4A court** | 4 slots [A,A,A,A], gender mode | Same-group split; avoids repeat partner |
| **`pairGenderAware` cross-team minimization** | [A,A,B,B] | `crossTeams === 0` |
| **Blend: 2 mixed + 1 gender** | 6A+6B, 3 courts, roundPlan `[{blend, mixedCourts:2}]` | Courts 1-2 mixed; court 3 same-group |
| **Blend court split** | 6A+6B, 3 courts, mixedCourts=2 | 4 mixed teams, 2 gender teams; all 12 active |
| **`roundPlanForRound` fallback (mixed)** | `mixedMode:true`, `roundPlan:[]` | Returns `{mode:"mixed"}` |
| **`roundPlanForRound` fallback (open)** | `mixedMode:false`, `roundPlan:[]` | Returns `{mode:"open"}` |
| **`roundPlanForRound` explicit** | `roundPlan:[{mode:"gender"}]` | Returns `{mode:"gender"}` for ri=0 |
| **Blend clamp on court change** | mixedCourts=3, courtCount drops to 2 | `mixedCourts` clamped to 1 |

### 8.2 Integration tests (simulation)

| Config | Roster | Courts | Round plan | Asserts |
|---|---|---|---|---|
| `Gender RR 12/3` | 6A+6B | 3 | `[gender × 5]` | All teams same-group; byes split evenly |
| `Blend RR 12/3` | 6A+6B | 3 | `[blend(2) × 5]` | Courts 1-2 mixed, court 3 gender, every round |
| `Round Plan arc` | 6A+6B | 3 | `[gender, gender, mixed, mixed, blend(2)]` | R1-2 gender, R3-4 mixed, R5 blend; transitions correct |
| **Regression (no roundPlan)** | 10 players | 2 | `[]` | Identical to pre-feature |
| **Regression (mixedMode on, no plan)** | 5A+5B | 2 | `[]` | Identical to current mixed mode |

### 8.3 Migration test

Legacy saved state without `roundPlan` loads with `[]`. Tournament still runs.

### 8.4 Edge cases

| Case | Expected behavior |
|---|---|
| Gender mode, lopsided 7A+5B, 3 courts | Best-effort: form as many gender courts as possible; remaining court may have mixed teams |
| Blend, lopsided 8A+4B, 3 courts, 2 mixed | Mixed courts: 2A+2B each; gender remainder 4A+0B → A+A vs A+A |
| Blend with byes present (10A+6B, 3 courts, 2 mixed) | Bye filter ensures mixed courts get 2A+2B and gender remainder is even |
| Blend with mixedCourts=0 | Equivalent to gender mode |
| Blend with mixedCourts=courtCount | Equivalent to mixed mode |
| Round plan shorter than rrRounds | Missing rounds fall back to `roundPlanForRound` (open or mixed) |
| Mid-tournament plan edit (RR) | Remaining rounds regenerate; completed rounds locked |
| Mid-tournament plan edit (ladder) | Change takes effect at next round boundary |
| Court count change after plan set | Blend `mixedCourts` re-clamped with inline note |
| Gender mode with unset-group players | Unset players are wildcards; pairs same-group where possible |
| Open round inside populated plan | Truly open (no mixed pairing) — primitives receive `"open"` mode explicitly |
| `game.courtMode` survives court-swap pass | Court relabeling preserves `courtMode` tag on game records |

### 8.5 Manual QA

1. 6M+6W, 3 courts, plan: gender × 2, mixed × 2, blend(2) × 1. Play all 5 rounds. Verify each round's mode.
2. Blend round: courts 1-2 show M·W teams, court 3 shows M·M / W·W simultaneously.
3. Edit plan mid-tournament: change round 4 from mixed to gender. Verify regeneration.
4. Toggle mixed mode off then on: verify round plan preserved/restored.
5. Load a pre-feature tournament: verify it plays identically.

## 9. Rejected alternatives

- **Per-court type tags (Approach B).** Tag each court as mixed/open/gender permanently. Rejected: can't vary by round, and the user explicitly wants per-round control.
- **Mode-as-format-variant (Approach C).** "Mixed Blend" as a new format card. Rejected: doesn't allow per-round variation, and clones scheduler logic.
- **Automatic blend detection.** App auto-suggests blend when roster math fits. Rejected: the manager wants explicit control, not magic.
- **Visual timeline UI.** Tap-to-cycle colored blocks per round. Rejected: harder to implement well on mobile, less precise than dropdowns.

## 10. Architecture summary

- **State:** `state.roundPlan: Array<RoundMode>` + `roundPlanForRound(ri)` resolver with `mixedMode` fallback
- **Explicit mode threading:** scheduling primitives receive the resolved per-round mode as a parameter — they do NOT read `state.mixedMode` directly. Fixes the coupling where an open round inside a plan would trigger mixed pairing.
- **Court identity:** each generated game stores `game.courtMode` (`"mixed"` / `"gender"` / `"open"`) at generation time. Rendering and post-processing passes read this tag instead of inferring from court index.
- **Setup UI:** collapsible Round Plan section (visible when mixed on), per-round dropdowns, blend sub-control, quick presets
- **New helpers:** `dealGenderCourts`, `pairGenderAware` (mirror of `pairMixedAware` — minimizes crossTeams), `dealBlendCourts` (splits courts into mixed + gender sets, tags each with `courtMode`)
- **Routers:** `dealCourtsByMode`, `pairByMode` dispatch based on `plan.mode` / `courtMode`
- **Bye allocation:** `allocateByesForMode(mode, ...)` — mode-aware feasibility filter for all modes (mixed, gender, blend, open)
- **Scheduler:** `generateRRSchedule` and `assignCourtsConstrained` read the round plan and pass mode explicitly
- **Finals:** rank-seeded pairing, mode-aware only when the top-4 split happens to be 2A+2B and tournament was predominantly mixed
- **Surfaces:** mode badge in header, court-type badge on blend courts (reads `game.courtMode`), M·M/W·W team badges, settings round-plan view
- **Migration:** `roundPlan` defaults to `[]`, backfilled in v5 loader
- **Backward compat:** `mixedMode:true` + empty plan = all mixed; `mixedMode:false` + empty = all open

## 11. Resolved questions

All questions surfaced during design and MMR review are resolved:

- **Global coupling:** scheduling primitives receive explicit `mode` parameter; they don't read `state.mixedMode` (§4.4).
- **Court identity:** `game.courtMode` stored on each game record at generation time; not derived from court index (§6.5).
- **Bye feasibility for gender/blend:** `allocateByesForMode` applies group-feasibility constraints for all modes, not just mixed (§6.8).
- **Finals mode conflict:** finals use rank-seeded pairing; mode does NOT apply. The round plan governs regular rounds only (§6.9).
- **Gender semantics:** same-group teams, cross-group opponents allowed. Wildcards fill either side (§6.4).
- **Lopsided blend:** tested explicitly; gender remainder deals from whatever's left after mixed courts (§8.4).
- **Ladder plan edits:** take effect at next round boundary, not immediate regeneration (§4.8).
- **Ladder blend conflicts:** mode is a soft constraint within the optimizer; court badge reflects actual achievement (§6.7).
- **Cross-mode standings fairness:** intentional social aggregate, not precision rating (§3.5).
- **Silent clamping:** inline note shown when court count change clamps `mixedCourts` (§4.3).
