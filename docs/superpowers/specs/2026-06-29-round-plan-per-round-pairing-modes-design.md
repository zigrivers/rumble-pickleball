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
- If the manager changes court count after setting a plan, blend rounds auto-clamp `mixedCourts` silently (no error).

### 4.4 Relationship to existing `mixedMode`

`mixedMode` is the shorthand; `roundPlan` is the advanced view:
- **`mixedMode` ON, `roundPlan` empty:** scheduler treats every round as mixed. This is the current mixed-mode feature — backward compatible.
- **`mixedMode` OFF, `roundPlan` empty:** scheduler treats every round as open. This is today's default — backward compatible.
- **`roundPlan` populated:** the round plan takes precedence. `mixedMode` is implied true (since the plan uses groups).
- **`mixedMode` toggled ON in setup:** populates `roundPlan` with all-mixed entries. The manager can then edit individual rounds.
- **`mixedMode` toggled OFF:** clears `roundPlan` to `[]`. Values preserved in memory for re-toggle.

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

The manager can edit `roundPlan` for remaining unstarted rounds via **⚙ Settings → Round Plan**. Completed rounds are locked (their games are already recorded). The edit triggers schedule regeneration for all unstarted rounds, picking up the new modes.

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

If the manager changes court count after setting up the plan, blend rounds auto-clamp `mixedCourts`. No error, no warning — just adjust silently.

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

The scheduler splits courts into two sets and applies different helpers:

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
  return [...mCourts, ...gCourts];
}
```

For the user's 6M+6W / 3-court / 2-mixed example:
- Mixed court 1: 2M+2W → M+W vs M+W
- Mixed court 2: 2M+2W → M+W vs M+W
- Gender court: 2M+2W → M+M vs W+W

4 mixed teams + 2 gender teams, all 12 players active.

### 6.6 `pairByMode` dispatcher

```js
function pairByMode(plan, four, courtIndex, opts) {
  if (plan.mode === "gender") return pairGenderAware(four, opts);
  if (plan.mode === "blend") {
    // First mixedCourts courts are mixed; rest are gender
    const isMixedCourt = courtIndex < (plan.mixedCourts || 1);
    return isMixedCourt ? pairMixedAware(four, opts) : pairGenderAware(four, opts);
  }
  // "mixed" and "open" both use pairMixedAware (open reduces to pure cost when mixedModeBadTeamCount returns 0)
  if (plan.mode === "mixed") return pairMixedAware(four, opts);
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

### 6.8 Bye allocation

`allocateByesMixed` (the feasibility filter) applies only when the round's mode is mixed or blend. For gender and open rounds, standard `allocateByes` is used. This is handled by the mode router — the calling code checks the round plan before choosing the bye allocator.

### 6.9 Finals bracket

The finals use the **last round's mode** for pairing. If round 7 was gender, finals are gender-paired. If round 7 was blend, finals use mixed (single-court finals can't blend). If round 7 was open, finals use the existing `#1+#4 vs #2+#3` formula.

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
| Gender mode, lopsided 7A+5B, 3 courts | Best-effort: form as many gender courts as possible |
| Blend with mixedCourts=0 | Equivalent to gender mode |
| Blend with mixedCourts=courtCount | Equivalent to mixed mode |
| Round plan shorter than rrRounds | Missing rounds fall back to `roundPlanForRound` (open or mixed) |
| Mid-tournament plan edit | Remaining rounds regenerate; completed rounds locked |
| Court count change after plan set | Blend `mixedCourts` re-clamped silently |

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
- **Setup UI:** collapsible Round Plan section (visible when mixed on), per-round dropdowns, blend sub-control, quick presets
- **New helpers:** `dealGenderCourts`, `pairGenderAware` (mirror of `pairMixedAware`), `dealBlendCourts` (splits courts into mixed + gender sets)
- **Routers:** `dealCourtsByMode`, `pairByMode` dispatch to the right helper based on `plan.mode`
- **Scheduler:** `generateRRSchedule` and `assignCourtsConstrained` read the round plan
- **Surfaces:** mode badge in header, court-type badge on blend courts, M·M/W·W team badges, settings round-plan view
- **Migration:** `roundPlan` defaults to `[]`, backfilled in v5 loader
- **Backward compat:** `mixedMode:true` + empty plan = all mixed; `mixedMode:false` + empty = all open

## 11. Open questions

None at design time.
