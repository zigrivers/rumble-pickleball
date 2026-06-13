# Strength-Adjusted Margin Ranking — Design Spec

**Date:** 2026-06-13
**Status:** Approved design, pending implementation plan
**Scope:** Round Robin and Gauntlet ranking in `index.html`, plus a new player-facing explainer page `docs/how-standings-work.html`.

---

## 1. Problem

Rumble's Round Robin currently ranks players by **points scored per game** as the *primary* key (then wins, then point differential, then head-to-head, then a random tiebreak). Players correctly observed this is backwards:

- A nail-biter win of **13–11** awards the winner **13** points/game.
- A blowout win of **11–3** awards the winner only **11** points/game.

So a player who *dominated* ranks **below** a player who barely escaped, because winning by 2 in extra (deuce) points accumulates a higher point total than winning by 8 in regulation. The metric rewards close, high-scoring games — the opposite of "who actually played best."

This contradicts standard practice (USA Pickleball, Pickleheads, pickleball.com), where **wins** are primary and **point differential** is the quality tiebreaker — points *scored* is essentially never a primary ranking metric.

## 2. Goals

- Rank Round Robin (and Gauntlet, which shares the same ranking) so that **margin of victory** drives standings, with **diminishing returns** so running up the score has limited value.
- Account for **strength of schedule** (beating strong teams counts more) **and partner strength** (being carried by a strong partner counts less), using a lightweight, deterministic, explainable heuristic — not a full iterative rating model.
- Keep the metric **continuous** (few ties, dampens partner-luck variance from rotation) and **explainable on the standings screen**.
- Ship a **player-facing explainer page** that describes how standings work for every game type in plain language, plus a technical deep-dive.

## 3. Non-goals

- **No full rating model.** No iterative convergence / Elo / least-squares solver. We use one fixed strength pass (see §4.3). Iterating to equilibrium is explicitly rejected: it overfits sparse single-session data and becomes unexplainable.
- **No changes to Stack or King ranking.** They have their own scoring (`rankPlayersStack`, `rankPlayersKing`) and are out of scope. (Note: Stack and King also fold raw points into their scores and share the same theoretical close-game inflation — flagged as a possible future item, not addressed here.)
- **No change to scheduling, bye allocation, or finals bracket structure.** Finals seeding consumes the new ranking automatically (see §6).

## 4. The metric: Adjusted Margin

A player's ranking number is the **average adjusted-margin credit** across their decided games, built in three layers.

### 4.1 Layer 1 — Diminishing-returns margin (per game)

For each **decided** game (see §7 for what "decided" means), take the player's team margin `d = teamScore − oppScore` (negative if the team lost) and convert it to a margin score on a square-root scale:

```
ms = sign(d) · √|d|
```

Because pickleball is win-by-2, every decided game has `|d| ≥ 2`, so a win is always `≥ √2 ≈ +1.41` and a loss `≤ −1.41`.

| Game result | Raw margin `d` | `ms` |
|---|---|---|
| 11–9 / 13–11 / any deuce win | +2 | **+1.41** |
| 11–6 | +5 | +2.24 |
| 11–3 | +8 | +2.83 |
| 11–0 | +11 | +3.32 |

This layer alone fixes the original complaint: a deuce win counts exactly the same as an 11–9 win, and a blowout outranks both — with a shutout worth only ~2.4× a squeaker, not 5.5×.

### 4.2 Layer 2 — Base strength (first pass)

Compute every player's **base score** = the average of their `ms` across decided games (through the round being evaluated). Then center each player's base score on the field:

```
s_p = base_p − fieldAverage
```

where `fieldAverage` is the mean base score over all players with at least one decided game. `s_p > 0` ⇒ stronger than the field, `< 0` ⇒ weaker. Early in a session everyone is near 0, so the adjustment in Layer 3 starts near-zero and grows as evidence accumulates.

### 4.3 Layer 3 — Strength-adjusted credit (second pass)

Re-walk each decided game from player *p*'s perspective, with partner *q* and opponents *o₁, o₂*:

```
O   = (s_o₁ + s_o₂) / 2          // opposing-team strength (centered)
P   = s_q                         // partner strength (centered)
adj = clamp( k · (O − P), −C, +C )
credit = ms + adj
```

This is **additive** (performance-vs-expectation), which makes it behave correctly for wins *and* losses:

| Situation | Effect on credit |
|---|---|
| Beat a strong team | boosted (overperformed) |
| Lost to a strong team | penalty softened (expected to lose) |
| Lost to a weak team | penalty increased |
| Carried by a strong partner (`P` high) | discounted |
| Carried a weak partner (`P` low/negative) | boosted |

A player's final **Adjusted Margin** = mean of `credit` over their decided games.

**Constants (tunable, defined in one place):**

| Constant | Value | Meaning |
|---|---|---|
| curve | `√` (square root) | diminishing-returns shape |
| `k` | `0.5` | strength sensitivity (opponent and partner, symmetric) |
| `C` | `1.0` | max strength adjustment per game |

**Key invariant:** because `C = 1.0 < √2 ≤ |ms|`, we have `sign(credit) = sign(ms)` for every game. **Every win always credits positive, every loss always negative.** Strength weighting can reorder *similar* results but can never make a win worth less than a loss of the same margin. Any change to `C` must preserve `C < √2 ≈ 1.414` to keep this invariant.

**Single-pass rationale:** Layer 2 base scores are computed once and used as fixed inputs in Layer 3. We do *not* recompute strength from adjusted credits and iterate — that is the rejected full-rating model. There is a mild self-reference (an opponent's base score includes their result against you); this is acceptable and standard for a light heuristic.

## 5. New tiebreaker chain (Round Robin + Gauntlet)

`rankPlayers(throughRound)` sorts descending by:

1. **Average adjusted credit** (the Adjusted Margin from §4) — primary
2. **Win rate** (`wins / gp`) — so win count settles otherwise-equal players
3. **Head-to-head** — unchanged (`headToHead()`, regular rounds only)
4. **Random tiebreak order** — unchanged (`tiebreakOrder()`)

Players with **0 decided games** sort last, ordered by `tiebreakOrder` (unchanged).

**Raw points-per-game is removed from the sort entirely** (it was the bug). Win–Loss record and average raw margin remain as *displayed* columns for intuition.

## 6. Scope of behavior change

| Area | Change |
|---|---|
| **Round Robin** | New Adjusted Margin ranking + tiebreaker chain |
| **Gauntlet** | Same — it calls `rankPlayers()` to re-rank and re-pair every round, so climbing toward Court 1 is now driven by Adjusted Margin |
| **Finals seeding** | No code change — `buildFinals()` already seeds from `rankPlayersForFormat(totalRegularRounds)`; it now seeds by the new order. Finals games never feed back into regular standings |
| **Stack** | Unchanged |
| **King** | Unchanged |
| **Byes** | Unchanged — never count as a game played |
| **In-progress/tied games** | Unchanged — excluded until decided |

## 7. Edge cases & rules

- **Decided games only.** A game counts only when `isGameDecided(g)` is true. A tied score (e.g. 11–11) is treated as in-progress (win-by-2) and excluded. This is existing behavior in `computeStats`; the new metric must respect it identically.
- **0-game players.** Excluded from `fieldAverage` and ranked last. They cannot appear as an opponent/partner in a decided game (all four players of a decided game have `gp ≥ 1`), so `s` is always defined where used.
- **Negative Adjusted Margin** is normal (a player who loses most games). Display with one decimal.
- **Sparse early rounds.** With little data, `s_p ≈ 0` for everyone, so the adjustment is small and the metric degrades gracefully to plain diminishing-returns margin.
- **Retroactive shifts.** Because strength of schedule is recomputed each round, a past game can gain/lose value as opponents' strength changes. This is intended (real strength-of-schedule) but must be explained in-app (see §8).

## 8. Display & in-app text changes

- **Standings screen:** headline number becomes **Adjusted Margin**; keep W–L and average raw margin as secondary columns. Add a short "ⓘ"/"?" tooltip explaining the metric and the retroactive-shift behavior.
- **Replace** every in-app reference to the old "points → wins → diff" ranking rule. Known location: the documented-rules comment near `index.html:3846`. Implementation must grep for and update all player-facing copies and code comments describing the old order.
- **New player-facing copy (canonical wording):**
  > *Players are ranked by **Adjusted Margin**. Each game's winning margin counts on a sliding scale — a blowout beats a squeaker, but with diminishing returns, so running up the score barely helps. Margins are then adjusted for strength of schedule: beating strong teams counts more, and being carried by a strong partner counts less. Ties are broken by win rate, then head-to-head.*

## 9. Deliverable: explainer page (`docs/how-standings-work.html`)

A standalone, self-contained HTML page (GitHub Pages-ready, served from `/docs`), styled to match `guide.html` (dark theme, gold accent, Archivo + Hanken Grotesk, court colors). Two top-level sections:

### 9.1 Plain-language section — "How standings work"

One card per game type:

- **Round Robin** — rotate partners/opponents; ranked by Adjusted Margin (how much you win by, diminishing returns, adjusted for who you played with/against); byes and unfinished games don't count; ties → win rate → head-to-head.
- **Gauntlet** — 8 players re-ranked every round by Adjusted Margin, then re-paired (Court 1 = #1+#4 vs #2+#3, Court 2 = #5+#8 vs #6+#7); play well to climb to Court 1.
- **Stack (ladder)** — courts are ranked, Court 1 is top; points on higher courts are worth more (1.5× on top court, scaling down), +3 for a win, +2 more for a win below the top court (climb bonus); ranked by average stack score per game.
- **King of the Court** — King's Court (Court 1) is the throne; score = wins + points scored + wins on the King's Court, averaged per game.
- **Finals** — top players seeded into brackets of four (1 v 4, 2 v 3): Championship, then Consolation, Bronze, … one per court; leftovers unseated; finals don't change regular standings.

Plus two plain-language subsections that ensure every calculation element is covered without jargon:

- **"Why your standing keeps moving"** — explains the retroactive strength-of-schedule behavior as a 3-step story (everyone starts equal → the app learns who's strong → earlier games get re-weighted), with a concrete worked example (a round-1 win over a player who later proves strong gains value), and a reassurance that standings *settle* rather than swing (bounded adjustment + the win-always-helps invariant). Scoped explicitly to Round Robin/Gauntlet; notes Stack/King don't do this.
- **"The fine print"** — plain-language coverage of the remaining elements: per-game averaging (totals/byes never inflate or deflate), byes don't count, only decided games count (win-by-2), the tiebreaker order, and 0-game players ranking last.

### 9.2 Technical deep-dive section — "Under the hood"

- Full Adjusted Margin formula: the three layers, the `√` curve table, centering, the additive strength term, constants `k`/`C`, the clamp, and the sign invariant.
- Why only decided games count (win-by-2).
- The exact tiebreaker chains for each format.
- Exact Stack (`stackScoreGain`, `stackMultiplier`) and King (`kingScore = wins + pointsScored + kingCourtWins`) formulas.
- A note that the page reflects the constants defined in `index.html`; if those are tuned, update this page to match.

> **Sync requirement:** the page documents the *target* RR/Gauntlet behavior defined in this spec. It must ship together with the ranking change, and its formulas/constants must match the implemented values.

## 10. Implementation notes (for the plan)

- The strength adjustment is **per-game**, so the metric needs game-level iteration twice (Layer 1/2 to get base scores, then Layer 3 to get credits). Suggested shape: a new pure function (e.g. `computeMarginStats(throughRound)`) that returns per-player `{ slot, gp, wins, winRate, avgRawMargin, avgMargin /* base */, adjScore /* final */ }`, computed entirely from decided games through `throughRound`.
- `rankPlayers(throughRound)` switches its sort to use `adjScore` (primary) then `winRate`, keeping `headToHead` and `tiebreakOrder` as the final two keys.
- Keep `computeStats` available for display columns (W–L, raw points, raw diff) or fold the needed fields into the new function — implementer's choice, but avoid duplicating game-walking logic more than necessary.
- All constants (`k`, `C`, and the curve function) live in one clearly-named place near the metric.

## 11. Verification

- **Unit-level (preferred via TDD):**
  - Deuce win (13–11) and an 11–9 win produce identical Layer-1 `ms` (= √2).
  - 11–3 ranks above 13–11 for otherwise-identical schedules.
  - The §4 "3–0 beats 2–1" scenario: three 11–9 wins outrank (11–0, 11–0, 0–11).
  - Sign invariant: across a spread of margins and strength values, every won game's `credit > 0` and every lost game's `credit < 0` with `C = 1.0`.
  - Beating a strong team yields higher `credit` than the same margin vs a weak team; a strong partner lowers `credit` vs the same result with a weak partner.
  - 0-game players rank last; byes and tied games excluded.
- **Manual:** run a sample tournament, confirm standings order matches intuition and the explainer page's worded rules.

## 12. Open knobs (defaults chosen, tunable later)

| Knob | Default | Notes |
|---|---|---|
| Curve | `√` | gentler/steeper possible; keep monotonic + diminishing |
| `k` (strength sensitivity) | `0.5` | raise for more strength-of-schedule effect |
| `C` (per-game adjustment cap) | `1.0` | must stay `< √2` to preserve the sign invariant |
| Player-facing name | "Adjusted Margin" | alt: "Performance Score" / "Rating" |
