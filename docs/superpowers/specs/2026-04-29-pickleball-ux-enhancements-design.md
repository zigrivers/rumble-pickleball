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

Two new fields inside the existing tournament-state object stored at `pb_tourney_v1`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `awardsShown` | bool | `false` | Confetti gate. Set to `true` after the first time the Champions screen renders confetti so refresh / back-navigation does not refire. |
| `winScore` | number | `11` | Default value the tap-winner pill auto-fills. Adjustable in Settings (11/15/21). |

No top-level localStorage keys added. Existing fields unchanged. Migration: defaults are applied at load time when fields are absent — no rewrite of existing saved state required.

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

- Computed from the next round's schedule. Because `currentRound` is 1-based and `SCHEDULE` is 0-indexed, the next round's matchups are at `SCHEDULE[currentRound]` when `currentRound < 7`.
- Color-coded by court: cyan for South, violet for North — matching the court the partnership will play on in round N+1.
- Pill style: 12–14px font, `2px 8px` padding, `999px` border radius. Same row as the player name; does not increase row height.
- Disappears once `currentRound === 7` (no next round) and during finals/done phases. Setup phase has no standings so no chip.

#### Tap-winner quick-fill

Each team-row gets a small "× 11" pill positioned between the team name and the score input. Visible only when that row's score is `null`.

- Tap pill → set this team's score to `state.winScore`. Trigger the standard input pipeline (save state, refresh standings/buttons).
- Score input remains directly editable; pill disappears as soon as a value is present.
- Pill amount tracks `state.winScore` — if user changes it in Settings to 15, the pill reads "× 15".

#### Round-complete moment

When both court games on the current round transition from "incomplete" to "complete":
- The primary "Round N+1 →" / "Build Finals →" button gets a CSS-keyframe gold shimmer (1.5 s, fires once).
- A toast `🎉 Round N complete!` slides into a fixed-position container at the top of the page; auto-dismisses after 2500 ms.
- Tracking: the round-complete refresh callback compares previous-cycle state to current; only fires shimmer + toast on the actual transition. Editing scores after completion does not refire.

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
4. **View Full Schedule** button — opens a sub-modal listing all 7 rounds. Each round row shows both court matchups and, if scored, the score. Read-only.
5. *(Divider)*
6. **Reset Tournament** *(yellow secondary)* — confirm dialog: "Reset scores and re-shuffle the schedule? Your 8 names will be kept." On confirm: clears scores + rounds + finals, re-shuffles slot assignment, returns to round 1.
7. **Clear All** *(red danger)* — confirm dialog: "Clear all data including names? This can't be undone." On confirm: replaces state with `newState()`, returns to Setup screen.

## 5. Acceptance criteria

- The 7-round schedule continues to cover all 28 player pairs exactly once (regression check).
- Live refresh during score entry preserves input focus (regression check from prior session).
- Confetti fires exactly once per tournament's first arrival at the Champions screen.
- Round-complete toast/shimmer fires exactly once per round-completion transition.
- Animated shuffle reveal completes within 1500 ms total (1200 ms animation + skip safety) and is skippable.
- Paste-8-names rejects any input that doesn't yield exactly 8 unique trimmed names.
- "Reset Tournament" preserves names. "Clear All" wipes them.
- Awards math is correct against a hand-computed reference for a seeded tournament.
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
- `renderPodium(top3)` — Champions podium.
- `computeAwards()` — returns the four award objects.
- `renderAwardsStrip(awards)` — Champions awards.
- `runConfetti()` — Champions confetti animation.
- `openScheduleModal()` — Settings full-schedule view.
- `openHowItWorksModal()` — Settings rules view.
- `clearAll()` — full reset action.

CSS additions are appended to the existing `<style>` block, organized by feature with section comments.
