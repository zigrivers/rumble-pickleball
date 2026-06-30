# MLP-style Per-Round Pairing + Skip Championship — Design

**Date:** 2026-06-30
**Format affected:** Round Robin (`rr`)
**Version target:** v53

## Problem

A league manager runs MLP-format events (teams of 4: 2 men + 2 women). They want to
configure a Round Robin event as **4 mixed-doubles rounds + 2 gender-doubles rounds, with
no championship game** — go straight to the champions screen after the final round.

The app already supports "Mixed mode" (group-based pairing labeled Men/Women by default),
but it has exactly one pairing behavior — every team is 1 from Group A + 1 from Group B —
applied to all rounds, and a Round Robin always ends with a built finals/championship stage.

## Decisions (confirmed with the product owner)

1. **Model:** Keep the existing *individual* round-robin (players re-shuffled into fresh
   teams each round, ranked individually). Add a per-round pairing choice on top. NOT a
   fixed-teams-of-4 / team-scoring rebuild.
2. **Per-round UI:** A dropdown per round (Round 1…N), each set to **Mixed** or **Same-gender**.
3. **Opponent rule:** A single tournament-wide toggle "Same-gender opponents only",
   **default ON** (authentic MLP — men's pairs only face men's pairs).

## New saved state (all backward-compatible via `backfillStateDefaults`)

| Field | Default | Meaning |
|---|---|---|
| `rrPairingModes` | `[]` | Array indexed by round number − 1. Each entry `"mixed"` or `"samegender"`. Absent/`"mixed"` = today's behavior. |
| `sameGenderOpponents` | `true` | When a round is `"samegender"`: ON ⇒ same-group teams only face same-group teams (single-gender courts where roster allows); OFF ⇒ a men's pair may face a women's pair. |
| `skipChampionship` | `false` | When ON, the final regular round ends the tournament; no finals stage. |

Existing tournaments load with these defaults, so behavior is **byte-identical** for anyone
who does not opt in (Mixed mode with no per-round overrides == today).

## New pairing engine (net-new — the inverse of today's mixed pairing)

Today `pairMixedAware` *minimizes* same-group teams. Add the inverse for same-gender rounds:

- `pairSameGroupAware(four, opts)` — among the 3 possible 2v2 splits, pick the one that
  *maximizes* same-group teams (minimize `isMixedTeam` count), tie-broken by repeat cost.
- `bestSameGenderSplit(four, court, history, chosen)` — wraps it into a game (mirrors `bestRRSplit`).
- `dealSingleGenderCourts(playing, activeCourts, rng)` — greedy: fill each court from the
  larger remaining group first, falling back to the other group for leftover seats. With a
  balanced roster (e.g. 4M+4W / 2 courts) this yields one pure men's court + one pure women's
  court. Uneven rosters degrade gracefully (a court may be impure → paired same-gender best-effort).
- `rrPairingModeForRound(roundNum)` — returns `"samegender"` only when Mixed mode is on,
  format is `rr`, and `rrPairingModes[roundNum-1] === "samegender"`; otherwise `"mixed"`.

### Scheduler wiring (`generateRRSchedule`)

Per round, choose the dealing + pairing by `rrPairingModeForRound(roundNum)`:

- **mixed** (or Mixed mode off): unchanged — `dealBalancedCourts` / `null` + `bestRRSplit`.
- **samegender**: courts = `sameGenderOpponents ? dealSingleGenderCourts(...) : dealBalancedCourts(...)`;
  pair via `bestSameGenderSplit`.

The existing court-relabel balancing pass is unaffected (it only swaps court *labels*, never
mixes players across courts).

## Skip championship

- On the last regular round, the "Build Finals →" button becomes
  **"Finish & Crown Champions →"** and sets `phase = "done"` directly (calling
  `recordToLifetimeIfEnabled()` and recording the undo event, exactly like the finals→done path).
- Finish-time estimates exclude the finals game when `skipChampionship` is on.
- The champions/done screen already tolerates `finals === null`, so no further change.

## UI (Setup → Format tab, Round Robin only)

Appended under the existing Rounds dropdown in `renderFormatChooser`:

1. **Skip championship** toggle (switch) — "End after the final round (no championship game)."
2. **Pairing by round** editor — visible only when Mixed mode is on: one labeled dropdown
   per round (Mixed / Same-gender), resizing with the round count. A hint when Mixed mode is
   off ("Turn on Mixed mode in Players & Courts to set per-round pairing").
3. **Same-gender opponents** toggle (default ON) — shown when ≥1 round is Same-gender.

## Tests (inline `runSelfTests`, gated by `?test`)

- `pairSameGroupAware` produces same-group teams for a 2A+2B court and a 4A court.
- `dealSingleGenderCourts` yields single-gender courts for 4A+4B / 2 courts.
- `generateRRSchedule` with a `"samegender"` round: every team is same-group; with
  `sameGenderOpponents` ON every court is single-gender.
- `skipChampionship`: completing the last round reaches `phase === "done"` (no finals built).
- Migration: the three new fields backfill to their defaults.

## Out of scope

- Fixed teams of 4 / team scoring.
- Per-round opponent rule (single global toggle only).
- Applying skip-championship to non-RR formats (RR is the only format with a built finals stage).

## Version / cache

Bump `APP_VERSION` (index.html), `VERSION` (sw.js), and prepend a v53 entry to
`version.json` + `version-metadata.json`.
