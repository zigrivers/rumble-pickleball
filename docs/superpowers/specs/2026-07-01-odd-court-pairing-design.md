# Odd-Court Pairing for Same-Gender Rounds — Design

**Date:** 2026-07-01
**Format affected:** Round Robin (`rr`) + Mixed mode + same-gender rounds
**Version target:** v59 (next bump)

## Problem

A game manager runs a Round Robin with 12 players (6 Men + 6 Women) on 3 courts, 6 rounds,
no championship. Rounds 1–4 are Mixed (1+1); rounds 5–6 are Same-gender.

In a same-gender round the scheduler correctly builds 2 **pure** courts — 4 men → men's
doubles, 4 women → women's doubles — and 1 **odd court** holding the 2 leftover men + 2
leftover women (6M / 4-per-court leaves 2M; 6W / 4-per-court leaves 2W). Today that odd
court is forced into a men's-pair-vs-women's-pair `[M,M] vs [W,W]` via
`bestSameGenderSplit` → `pairSameGroupAware` (index.html:8254).

The manager wanted that odd court to play as **mixed** `[M,W] vs [M,W]` instead, and to
**rotate** who sits on the odd court across same-gender rounds so every player gets at least
one same-gender game.

Today's behavior is also the only thing the existing ⚠️ setup warning
(index.html:12162) describes — it flags the mixed-group court but offers no recourse.

## Decisions (confirmed with the product owner)

1. **Where the choice lives:** **Per round.** Each same-gender round gets its own odd-court
   dropdown. (A global toggle was rejected — per-round matches a GM who may change intent
   between round 5 and round 6.)
2. **Default for the odd court:** **Mixed (1+1)** `[A,B] vs [A,B]` — the new behavior the GM
   asked for. `[A,A] vs [B,B]` (today's behavior) is kept as the explicit other option.
3. **Fairness across same-gender rounds:** **Spread it.** Rotate the odd court so as many
   players as possible get a same-gender (primary) game before anyone is on the odd court
   twice.

## Scope guardrails (non-goals)

- Only Round Robin + Mixed mode + same-gender rounds are affected.
- No change to Stack / King / Crown / Gauntlet, to finals, to mixed rounds, or to
  same-gender rounds whose roster *does* tile into pure courts (4A+4B / 2 courts etc.).
- The odd-court situation arises from roster math (per-group counts that aren't multiples of
  4). There is at most **one** odd court per round (leftovers always sum to 4), and there may
  be zero. Byes degrade gracefully: odd-court detection is general (`isOddCourt` = two or
  more groups among set players), so a same-gender round with byes / absences / unset-group
  players is handled by the same branch, with the graceful fallback of §C when the odd court
  is not 2A+2B.

## New saved state

| Field | Default | Meaning |
|---|---|---|
| `rrOddCourtModes` | `[]` | Array indexed by round number − 1. Each entry `"mixed"` or `"samegroup"`. Absent / `"mixed"` = new default (mixed odd court). `"samegroup"` = today's behavior. Only consulted on same-gender rounds that actually produce an odd court. |

Migration: backfill to `[]` in the same `backfillStateDefaults` block that handles
`rrPairingModes` (index.html:7166).

**Compatibility note (deliberate semantic change, not byte-compatible on regeneration):**
the *state format* is backward-compatible, but the *scheduling semantics* are not for
existing saved tournaments — an odd court that previously played `[A,A] vs [B,B]` now plays
mixed `[A,B] vs [A,B]` on its next regeneration. This is the intended fix (the old behavior
is exactly what the GM reported as wrong), the odd-court feature itself only shipped days
ago (v53–v55), and the change is made **visible** via the new per-round dropdown + rewritten
setup warning (see UI). No silent flip: the dropdown reflects the active mode for every
same-gender round. Completed tournaments (`phase === "done"`) are never regenerated, so
historical results are untouched.

## Setup UI (`renderRRPairingControls`, index.html:12125)

In the existing "Pairing by round" grid, **every round set to Same-gender** gets a second
dropdown — **"Odd court:"** — shown whenever `state.sameGenderOpponents === true` (the
restrict-ON mode that creates pure courts and thus a potential odd court). It is shown for
**all** same-gender rounds rather than only when the overall roster is unbalanced, because
per-round byes / mid-event absences can create an odd court even when the setup-time roster
counts appear to tile evenly. When a round in fact produces no odd court, the dropdown is
simply a harmless no-op for that round; helper copy makes that explicit:
"Only used when a round can't fill every court with same-gender teams."

Dropdown options:

- **Mixed (1+1)** — `[A,B] vs [A,B]` — selected by default (new).
- **Same group** — `[A,A] vs [B,B]` — today's behavior.

The existing ⚠️ warning text is lightly rewritten to point at the new dropdown ("…the odd
court will play mixed by default — change it here if you'd rather keep same-group pairs")
instead of merely describing the inevitability.

## Scheduler changes (`generateRRSchedule`, index.html:10178)

Three steps inside the same-gender branch. Pure courts are untouched.

### A. Odd-court detection (general)

After `dealSingleGenderCourts` produces the court rosters for the round, classify each court.
A slot's group is `groupOf(slot)` (`"a"`, `"b"`, or `""` for unset). Define:

```
groupSet(four) = distinct non-empty groups among the four players   // e.g. {"a"}, {"a","b"}
isOddCourt(four) = four.length === 4 && groupSet(four).size >= 2     // two or more groups present
isMixedCapable(four) = count(group=="a") >= 2 && count(group=="b") >= 2   // exactly ≥2 each
```

`isOddCourt` treats unset (`""`) players as wildcards that do **not** by themselves make a
court odd — a court of `[a,a,'','']` is `!isOddCourt` (single group among *set* players) and
is labeled/captioned as that group's doubles with the unset seats filled best-effort. This
avoids misclassifying an all-one-group court that happens to contain unset players.

There is at most one odd court per round (leftover counts sum to 4). When there is no odd
court (roster tiles evenly, e.g. 4A+4B / 2 courts), behavior is byte-identical to today.

### B. Deterministic odd-court staffing — `staffOddCourtForCoverage` (NEW function)

This replaces the probabilistic "fairness as a cost key" approach. Fairness is **guaranteed**
in O(n), independent of the restart loop's random seeds.

After `dealSingleGenderCourts` fixes the court structure (which determines *how many* of
each group land on the odd court), but **before** pairing, run a deterministic swap pass:

1. **Coverage accounting.** For each active player, count **pure-court appearances** across
   `prior` same-gender rounds. *Coverage = played on a single-group court.* Odd-court
   appearances (mixed **or** same-group) do **not** count toward coverage — the goal is to
   maximize how many players get a true same-gender game.
2. **Swap within group.** For the odd court (if any), for **each group** present on it, swap
   the odd-court players of that group with the same-group players on pure courts so that the
   odd court ends up staffed by the players with the **highest** coverage (least need of a
   pure-court seat). Ties broken by slot number (stable, deterministic).

Because swaps are always within-group, the court *structure* (how many A/B per court) is
preserved — only *which specific players* sit where changes. This works for any odd-court
composition (2A+2B, 3A+1B, etc.).

**Expected outcome for the motivating case** (rounds 5 & 6, 6M+6W / 3 courts): round 5's
odd court is arbitrary (all coverage counts 0 → ties broken by slot). Round 6 then seats the
4 players who *missed* round 5 onto pure courts, so all 12 players get ≥1 same-gender game.

### C. Odd-court pairing (per the new state)

After staffing, pair each court:

- **Pure court** (`!isOddCourt`): `bestSameGenderSplit(four, …)` — unchanged.
- **Odd court** + round mode `"samegroup"`: `bestSameGenderSplit(four, …)` — today's behavior.
- **Odd court** + round mode `"mixed"` (default) **and** `isMixedCapable(four)`: `bestRRSplit(four, …)`
  — which, because `state.mixedMode` is on, calls `pairMixedAware` and yields `[A,B] vs [A,B]`.
- **Odd court** + round mode `"mixed"` **and** `!isMixedCapable(four)` (e.g. 3A+1B, or unset
  players): **graceful fallback** — still call `bestRRSplit`, which does best-effort
  mixed-aware pairing (for 3A+1B it yields one mixed team + one AA team). Never crash; always
  a valid game. The mode is a *preference* honored when the math allows, not a hard contract.

No new pairing math is introduced — both helpers already exist. The 60-restart loop keeps
its existing job: optimize pairing **quality** (repeat partners/opponents, court balance) on
top of the now-fixed court rosters. Fairness is no longer in the cost function at all, so:

- There is no probabilistic failure mode (the deterministic pass guarantees coverage where
  the roster allows it).
- The cost key stays exactly today's `currentCost` — no lexicographic sacrifice of pairing
  quality, no magnitude asymmetry.
- Tests are deterministic and seed-independent.

## Court-card label (`renderCourtCard`, index.html:15651)

The odd court's caption changes from the generic
"Mixed-group court — roster doesn't divide evenly" to one of:

- **"Mixed pairs — odd court"** when the odd court was paired mixed (the new default).
- **"Same-group pairs — odd court"** when the GM chose `"samegroup"`.

Pure courts keep their existing "Men doubles" / "Women doubles" caption. The detection uses
the same `isOddCourt` predicate used by the scheduler. The caption wording is chosen at
**render time** from `state.rrOddCourtModes[round−1]` (the source of truth), so it stays
correct after import/export or partial state updates without persisting a copy on each round
object.

## Tests (inline `runSelfTests` / `?test`, next to `mlpPairingTests` at index.html:6200)

1. **Migration:** `backfillStateDefaults` yields `rrOddCourtModes === []` for a legacy state.
2. **6M+6W / 3 courts, odd-court `"mixed"` (default):** a same-gender round produces 2 pure
   single-gender courts + 1 court whose two teams are both mixed (`isMixedTeam` true for all
   four players' teams).
3. **6M+6W / 3 courts, odd-court `"samegroup"`:** the odd court's two teams are each
   same-group (`[A,A]` and `[B,B]`) — preserves today's behavior.
4. **No odd court (4A+4B / 2 courts):** no odd court exists; every court is single-gender
   regardless of `rrOddCourtModes` — byte-identical to today.
5. **Fairness across two same-gender rounds (6M+6W / 3 courts, `"mixed"` odd court):** after
   both rounds, every active player has ≥1 same-gender game (i.e. appeared on a pure court
   at least once). **Seed-independent** — assert the property holds across multiple seeds
   (`mulberry32(1)`, `mulberry32(99)`, `mulberry32(12345)`), since staffing is now
   deterministic and the guarantee must not depend on the RNG.
6. **Byte-identical baseline:** a mixed round and an evenly-tiling same-gender round produce
   the same schedule cost as before (the cost key is unchanged).
7. **Non-2+2 odd court (byes):** a same-gender round whose odd court is 3A+1B does not crash
   and produces a valid game under both modes — `"mixed"` falls back to best-effort (one
   mixed team + one AA team), `"samegroup"` yields best-effort same-group. Assert no throw
   and exactly 4 seated players.
8. **Unset-group players:** a same-gender round where some active has `groupOf === ""` does
   not crash; `isOddCourt` does not misclassify an all-one-group court containing unset
   players (e.g. `[a,a,'','']` is `!isOddCourt`).

## Version / cache

Bump `APP_VERSION` (index.html), `VERSION` (sw.js), and prepend a v59 entry to
`version.json` + `version-metadata.json` (per AGENTS.md §7).

## Out of scope

- Applying odd-court pairing to non-RR formats (none of them build pure same-gender courts).
- Changing how byes are allocated in same-gender rounds (existing `allocateByesMixed` stands).
- A separate "odd-court appearances" rotation metric. Coverage (pure-court appearances) is
  the single fairness objective; the deterministic staffing naturally spreads the odd court
  across players because staffing the odd court with the highest-coverage players each round
  is exactly the rule that prevents repeats.
