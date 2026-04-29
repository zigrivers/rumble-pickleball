# Pickleball Tracker — UX Enhancement Design

Date: 2026-04-29
Target file: `pickleball.html` (single file, vanilla JS, no build, no dependencies)
Posture: targeted layer over existing design — visual identity unchanged.

---

## 1. Goals

Add the following capabilities to the existing pickleball tournament tracker without disturbing the current dark scoreboard look or breaking the single-file constraint:

1. Per-player "next-round partner" preview, inline in the Live Standings.
2. Setup screen: paste-8-names shortcut and an animated shuffle-reveal on Start.
3. Round screen: tap-winner quick-fill (auto-fills configurable win score) and a round-complete moment.
4. Finals screen: inline seed pills on the matchups, an amplified Championship card, and a one-line balanced-pairing caption.
5. Champions screen: a top-3 podium, a tournament-awards strip, and a one-time confetti pop.
6. Settings: a Win-score dropdown, a "View Full Schedule" button, and a two-tier reset (preserve names vs full clear).
7. Setup + Settings: a brief "How it works" rules block.

## 2. Non-goals

- No reuse-last-roster across tournaments.
- No swap-two-players in settings.
- No editable court names beyond the existing South/North.
- No round timer, no undo/redo, no keyboard shortcuts.
- No multi-tournament history beyond the single `pb_tourney_v1` localStorage key.
- No animation libraries — confetti and shuffle reveal are vanilla JS.

## 3. State schema additions

Three new fields inside the existing tournament-state object stored at `pb_tourney_v1`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `awardsShown` | bool | `false` | Confetti gate. Set to `true` after the first time the Champions screen renders confetti so refresh / back-navigation does not refire. **Both Reset Tournament and Clear All set this back to `false`** so each new tournament gets a fresh confetti moment. |
| `winScore` | number | `11` | Default value the tap-winner pill auto-fills. Adjustable in Settings (11/15/21). |
| `notifiedRounds` | number[] | `[]` | List of round numbers (1–7) for which the round-complete moment (toast + shimmer) has already fired. Persisted so a refresh immediately after entering the final score does not lose the notification, and so re-entering an already-completed round doesn't refire. Reset to `[]` by both Reset Tournament and Clear All. |

No top-level localStorage keys added. Existing fields unchanged. Migration: defaults are applied at load time when fields are absent — no rewrite of existing saved state required.

### 3.1 Name-handling safety

All player-name rendering throughout the app — standings, podium, awards, scorecards, history, paste-import preview, schedule modal, scoreboard rows — **must** use `textContent` / `createTextNode` (the existing `el()` helper handles strings via `document.createTextNode`, which is safe). No `innerHTML` interpolation of user-provided names anywhere. This protects against XSS via the paste-8-names shortcut and any future name-edit path. Acceptance check is in Section 5.

## 4. Per-screen specs

### 4.1 Setup screen

#### "How it works" rules block

A collapsible card directly under the existing title, default expanded. Built with a native `<details open>` so a user can collapse it without persistence. Content:

> **How it works**
> - 8 players, 2 courts, doubles. Every round, all 8 play.
> - 7 rounds, one per partner — by the end, you'll have partnered with every other player exactly once.
> - Score games however you normally would (typically first to 11, win by 2). Type any final score.
> - After round 7, points decide the seeds. Top 4 play the 🏆 Championship, bottom 4 play the 🥈 Consolation.
> - Championship is #1 + #4 vs #2 + #3 — a balanced pairing so the top players don't stomp.
> - Final ranking: total points → wins → point differential.

#### Paste-8-names shortcut

A muted "Paste 8 names" link above the inputs. Tapping opens a modal with a single multi-line textarea labelled "Paste names — one per line or comma-separated."

On submit:
- Split on `\n` or `,`, trim each, drop empties.
- If exactly 8 distinct names (uniqueness is case-insensitive, matching the existing Setup-screen gate): distribute into the 8 input fields and close the modal.
- If not exactly 8 distinct names: show inline error "found N — need 8 unique names" and leave the existing inputs untouched.

The per-input editing flow is unchanged.

#### Animated shuffle reveal on Start

When the user taps "Start Tournament":
- Disable the Start button.
- Run a `requestAnimationFrame` loop for ~1200 ms that re-renders the eight slot labels with a new random permutation every ~80 ms.
- Each frame, decay opacity and brightness so the final lock feels like an ease-out.
- On final frame, render the actual locked assignment (computed up-front, not derived from the animation).
- Provide a "Skip" affordance: a tap anywhere on the animation overlay completes immediately.

The animation is purely cosmetic — `state.slots` is finalized before the animation begins. The visible labels during the animation are decoupled from saved state.

### 4.2 Round screen

#### Partner-preview chip in standings

After each player's name in the Live Standings table, render a small pill:

```
Adrian  → Ken
```

- **Source of truth**: `state.rounds[state.currentRound]` (the next-round entry in saved state, where the post-randomization court assignment lives — `SCHEDULE` does not have the South/North flip applied). This is read when `state.currentRound < 7`. The lookup yields both the partner slot and which court (`court1` = South, `court2` = North) that pairing will play on.
- Color-coded by that resolved court: cyan for South (court1), violet for North (court2).
- Pill style: 12–14px font, `2px 8px` padding, `999px` border radius. Same row as the player name; does not increase row height.
- Disappears once `state.currentRound === 7` (no next round) and during finals/done phases. Setup phase has no standings so no chip.

#### Tap-winner quick-fill

Each team-row gets a small "× 11" pill positioned between the team name and the score input.

- **Visibility rule**: pill is shown only when **both** scores in that game are still `null`. Once either side has been entered, the pill on both rows disappears. This guarantees the pill always represents the natural "fresh game, mark the winner with their winning score" affordance, and avoids the edge case where setting one row to 11 wouldn't actually win against an opponent who already has a higher number entered.
- Tap pill → set this team's score to `state.winScore`. Trigger the standard input pipeline (save state, refresh standings/buttons). The opposite team's input becomes focused so the user can immediately type the loser's score.
- Score input remains directly editable; the pill is a shortcut, not a constraint.
- Pill amount tracks `state.winScore` — if user changes it in Settings to 15, the pill reads "× 15".

#### Round-complete moment

When the round becomes complete (both courts have valid scores):
- The primary "Round N+1 →" / "Build Finals →" button gets a CSS-keyframe gold shimmer (1.5 s, fires once).
- A toast `🎉 Round N complete!` slides into a fixed-position container at the top of the page; auto-dismisses after 2500 ms.

**Tracking (refresh-safe)**: a single gate function `maybeFireRoundComplete()` checks: if `isRoundComplete(state.rounds[state.currentRound - 1])` is true (using the existing helper, which takes a round *object*, not a round number — `currentRound` is 1-based, so subtract 1 to index `state.rounds`) *and* `state.notifiedRounds` does not include `state.currentRound`, then:

1. Push the current round number into `state.notifiedRounds`.
2. `save()`.
3. Fire toast + shimmer.

This gate is invoked from **two places**:

1. **At the end of `renderPlaying()`**, after the DOM is built. This catches the refresh case: if the user enters the final score and immediately reloads, the next render after reload sees a complete round whose number is not yet in `notifiedRounds`, fires the moment, then persists.
2. **Inside the score-input refresh callback**, after each input. This catches the live-entry case: when the score that completes the round is typed, the moment fires immediately without waiting for a re-render of the whole screen.

Because both paths consult the same persisted `notifiedRounds` gate, the moment is guaranteed to fire exactly once per round per tournament regardless of refresh timing or how the round got completed. Reset Tournament and Clear All clear `notifiedRounds` so a re-shuffled tournament gets a fresh round-complete moment per round.

### 4.3 Finals screen

#### Seed pills in matchups

Each player name in the Championship and Consolation matchup rows is prefixed with a small seed pill:

```
[#1] Adrian  &  [#4] Kris
```

Pill styling: 11px bold, gold-tinted background for Championship (`rgba(251,191,36,0.18)` bg, `#fbbf24` text), silver-tinted for Consolation (`rgba(203,213,225,0.15)` bg, `#cbd5e1` text). 4px border-radius — square rather than pill, to differentiate from rank/partner chips.

#### Compact seeds list (kept)

The existing seeds-grid card remains, but in a compact form:
- Same 2-column layout, smaller padding, single-line rows.
- Sits above the matchup cards.
- Provides full #1–#8 context that the inline seed pills don't (since pills only appear on the 8 finals players, which is everyone, but the full list shows ranking order at a glance).

#### Amplified Championship card

Visual hierarchy lift, no layout change:
- 8 px gold top border (vs 4 px on Consolation).
- 32 px gold-tinted box-shadow glow (`0 0 32px rgba(251,191,36,0.18)`).
- Team-name font 22 px, score-input font 44 px (Consolation: 16 px / 28 px).
- Padding 20 px (Consolation: 14 px).
- Court-label font 14 px (Consolation: 12 px).

The Consolation card stays at its current sizing. Side-by-side at iPad landscape; stacked at iPad portrait — Championship on top.

#### Balanced-pairing caption

Below the "🏆 CHAMPIONSHIP" label inside the Championship card:

> Balanced pairing — top seed + 4th vs 2nd + 3rd

Single line, muted color, 12 px. Not rendered on the Consolation card.

### 4.4 Champions screen

#### Top-3 podium

Replaces the visual top of the Final Standings table. Three stepped blocks:

- Gold (rank 1): tallest (~110 px), center, gold gradient, 🥇 emoji, 24 px gold glow shadow.
- Silver (rank 2): mid-height (~80 px), left, silver gradient, 🥈 emoji.
- Bronze (rank 3): shortest (~60 px), right, bronze gradient, 🥉 emoji.

Each step has the player's name above it (gold colored for rank 1) and total points beneath the name as muted secondary text.

The standings table remains for ranks 4–8, rendered below the podium.

**Ranking source (podium + ranks 4–8 table) — tournament-outcome order, not season order**: the player whose team won the championship game must appear on top of a screen titled "Champions." The Final Standings ordering therefore uses *tiers based on tournament outcome*, with the season ranking (`rankPlayers(7)`) breaking ordering inside each tier:

- **Tier 1 — Championship winners** (the 2 players of the team that won the Championship game). Ordered within the tier by season rank.
- **Tier 2 — Championship losers** (the other 2 players in the Championship game).
- **Tier 3 — Consolation winners** (the 2 players of the team that won the Consolation game).
- **Tier 4 — Consolation losers** (the other 2 players in the Consolation game).

This produces a deterministic 1-through-8 ordering where ranks 1–2 are the champions, 3–4 the runners-up, 5–6 the consolation winners, 7–8 the consolation losers. The podium shows ranks 1, 2, 3 from this list (gold = champion #1 by season rank, silver = champion #2, bronze = better runner-up by season rank).

**Numeric stats** (PTS, W, +/−) shown on each podium step and each table row come from `computeStats(7, includeFinals=true)` so totals reflect every game played including finals. Only the *order* changes from earlier sections — the *numbers* are total cumulative.

**Tied finals games are not allowed to advance to the Champions screen.** This removes the contradiction between "ranks 1-2 are championship winners" and a finals game that has no winner. The Finals screen's "Crown Champions" button is disabled while either finals game has equal scores; the existing "Tied — enter a tiebreaker" copy on the affected card prompts the user to adjust. This requirement is independent of the new design but is now load-bearing for the tier-ranking logic, so it is called out here. Acceptance criteria below codify the new gate.

**Helper to add**: `finalRanking()` returns the 8-element tier-ordered list, used by both the podium and the standings table on the Champions screen. Pure function over `state.finals` + `rankPlayers(7)`.

#### Tournament-awards strip

A 2×2 grid of award chips below the podium, before the standings table:

- 🎯 **MVP** — highest total points (regular rounds + finals games).
- 💥 **BIGGEST WIN** — single game with the largest point differential. Shows winning team and margin.
- 🤏 **CLOSEST GAME** — single game with the smallest non-zero point differential. Tiebreaker: descending winning score (a 21–20 wins over an 11–10). Shows score and round/court.
- 🔥 **HOT STREAK** — longest run of consecutive game wins by a single player across all games (round-robin + finals).

Award computation:
- Iterates the 14 round-robin games + 2 finals games = 16 games, in chronological order (rounds 1–7, then Championship, then Consolation).
- Tracks per-player win streaks; a loss or tie resets that player's streak counter.
- Tied awards render all tied names comma-separated (e.g., "Adrian & Sam — 85 pts").
- Edge case: if a category has no qualifying entry (e.g., Closest Game when every game was a tie — practically impossible but defensive), render "—" for that chip.

#### Confetti

On first render of `phase === "done"` when `state.awardsShown === false`:
- Spawn a `<canvas>` overlay covering the viewport.
- Run a 2 s burst of ~80 confetti particles falling from the top with random horizontal velocity, gravity, color from a small palette (gold/silver/bronze + court colors).
- Set `state.awardsShown = true` and persist.
- Remove the canvas after the animation completes.
- Subsequent renders (refresh, back-and-forth navigation) do not refire.

Implementation: ~40 lines of vanilla canvas. No library.

### 4.5 Settings modal

Reorganized for clarity. Top-to-bottom:

1. **How this works** button → opens a sub-modal with the same content as the Setup-screen rules block.
2. **Edit Names** (existing functionality, unchanged).
3. **Win score** dropdown — `<select>` with 11 / 15 / 21. Bound to `state.winScore`. Drives the tap-winner pill.
4. **View Full Schedule** button — visible only when `state.phase !== "setup"`. (During setup there is no `state.rounds`, no slot assignment, and no court flips — there is nothing meaningful to show.) When visible, opens a sub-modal listing all 7 rounds. Each round row shows both court matchups labeled South/North and, if scored, the score. Read-only.

When `state.phase === "finals"` or `"done"`, the modal also appends a "Finals" section below the rounds with the Championship matchup and (if scored) score, plus the Consolation matchup and score. Same read-only style.
5. *(Divider)*
6. **Reset Tournament** *(yellow secondary)* — visible only when `state.phase !== "setup"` (there is no tournament to reset during setup; users can simply edit name fields directly). Confirm dialog: "Reset scores and re-shuffle the schedule? Your 8 names will be kept." On confirm:
   - Capture the user-set values to preserve: the player names from `state.slots` (covers any in-tournament name edits via Edit Names) and `state.winScore` (a configuration preference, not tournament data).
   - Replace state with `newState()`, then write the preserved names back into both `rawNames` and `slots`, and write `winScore` back.
   - Re-shuffle slot assignment via the same path used by Start Tournament (fresh `state.rounds` with a new court-flip and a new `tiebreakRandom`).
   - `awardsShown` and `notifiedRounds` are reset to their defaults via `newState()` so the new tournament gets fresh confetti and per-round notifications.
   - Returns to round 1 (`phase = "playing"`).
7. **Clear All** *(red danger)* — visible in all phases. Confirm dialog: "Clear all data including names? This can't be undone." On confirm: replaces state with `newState()` (defaults across the board, including `awardsShown = false`, `notifiedRounds = []`, `winScore = 11`), returns to Setup screen.

## 5. Acceptance criteria

**Schedule + ranking integrity**
- The 7-round schedule continues to cover all 28 player pairs exactly once (regression check).
- Final-standings table and podium order use the tournament-outcome tier ranking (`finalRanking()`), not the raw season ranking. The Championship-winning team's two players occupy ranks 1 and 2; the Championship-losing team occupies 3 and 4; Consolation winners 5–6; Consolation losers 7–8. Within each tier, season ranking (`rankPlayers(7)`) breaks order.
- Numbers shown (PTS, W, +/−) include finals games via `computeStats(7, includeFinals=true)`.
- The Finals screen's "Crown Champions" button is disabled until **both** finals games are scored *and* non-tied. (Equal scores on either game keep the button disabled and surface the "Tied — enter a tiebreaker" message on the affected card.)

**Score entry + round screen**
- Live refresh during score entry preserves input focus (regression check from prior session).
- Tap-winner pill is visible only when both scores in that game are `null`; disappears as soon as either side has a value.
- Tap-winner pill amount tracks `state.winScore` and updates immediately when the Settings dropdown is changed.
- Partner-preview chip color matches the court the partnership will play on **as resolved in `state.rounds[currentRound]`** (post court-flip), not the static `SCHEDULE` array.

**Round-complete + confetti gating**
- Round-complete toast/shimmer fires exactly once per round per tournament. Refreshing the page immediately after entering the final score does not lose the moment (gate runs on initial render of the playing screen as well as during score-input refreshes); refreshing after it has fired does not refire it.
- Confetti fires exactly once per tournament's first arrival at the Champions screen, gated by `state.awardsShown`.
- Reset Tournament and Clear All both reset `awardsShown` and `notifiedRounds` so a re-shuffled tournament gets fresh confetti and fresh per-round notifications.

**Setup**
- Animated shuffle reveal completes within 1500 ms total (1200 ms animation + skip safety) and is skippable.
- Paste-8-names rejects any input that doesn't yield exactly 8 unique trimmed names (case-insensitive uniqueness, matching the existing setup gate).

**Settings**
- "Reset Tournament" is hidden during the setup phase. When visible, it preserves player names from `state.slots` and the current `state.winScore` configuration; in-tournament name edits via "Edit Names" are not lost; the schedule is freshly re-shuffled with a new `tiebreakRandom`.
- "Clear All" wipes everything (including names and `winScore`), returns to Setup, and is visible in all phases.
- "View Full Schedule" is hidden during the setup phase. During finals/done phases, it also appends the Championship and Consolation matchups (with scores when available) below the round-robin schedule.
- The Win-score dropdown (11/15/21) updates `state.winScore` immediately and is reflected in the round-screen pill within one render.

**Safety**
- All player-name rendering uses `textContent` / `createTextNode` (verified by grep for `innerHTML` against name-bearing renderers — none should match for player-name interpolation).

**Awards**
- Awards math is correct against a hand-computed reference for a seeded tournament.
- Closest Game tiebreaker is descending winning score (a 21–20 wins over an 11–10).
- Tied awards render all tied names comma-separated.

**Layout**
- All new UI keeps the 60 px minimum tap target standard.
- All new behavior works at iPad portrait (820 × 1180) and iPad landscape (1180 × 820).

## 6. Risks

- The animated shuffle reveal must not feel sluggish — hard cap 1.2 s, skippable.
- The tap-winner pill needs visual prominence sufficient for discovery without crowding the score input. Will iterate visually if first cut feels noisy.
- Awards computation adds ~40 lines. Keep in a single named function so it can be removed cleanly.
- Confetti canvas must be unmounted promptly to avoid lingering DOM weight.

## 7. File-level structure (informational)

All additions live in `pickleball.html`. New named helpers, roughly ordered:

- `runShuffleReveal(finalSlots, onDone)` — Setup animation.
- `openPasteNamesModal()` — Setup paste flow.
- `partnerOf(slot, round)` — schedule lookup helper.
- `nextRoundPartnerChip(slot)` — renderer for the standings chip.
- `quickFillPill(game, scoreKey)` — renderer for the round-screen pill.
- `runRoundCompleteMoment(round)` — toast + shimmer trigger.
- `seedPill(rank)` — finals matchup pill renderer.
- `finalRanking()` — tournament-outcome tier-ordered list of all 8 players, used by both the podium and the ranks 4–8 standings table on the Champions screen.
- `renderPodium(ranking)` — Champions podium.
- `computeAwards()` — returns the four award objects.
- `renderAwardsStrip(awards)` — Champions awards.
- `runConfetti()` — Champions confetti animation.
- `openScheduleModal()` — Settings full-schedule view (includes finals when applicable).
- `openHowItWorksModal()` — Settings rules view.
- `maybeFireRoundComplete()` — round-complete moment gate (called from render and from the score-input refresh).
- `resetTournament()` — preserves names + winScore, re-shuffles.
- `clearAll()` — full reset action.

CSS additions are appended to the existing `<style>` block, organized by feature with section comments.
