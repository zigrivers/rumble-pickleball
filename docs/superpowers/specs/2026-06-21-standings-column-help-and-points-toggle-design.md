# Standings: Column Help + Ranking/Points Toggle — Design

**Date:** 2026-06-21
**Status:** Approved (brainstorm), pending implementation plan

## Problem

Players using the app courtside (on phones) repeatedly ask the organizer what
the standings columns mean — "what is AM?", "what is +/–G?", "how does this
affect my ranking?". The app *does* have explanations, but they live in plain
HTML `title=` attributes that only appear on **hover**. Phones and tablets have
no hover, so the explanations are effectively invisible exactly where they're
needed most.

Separately, players asked to be able to see their **points** at any point in the
tournament — and on follow-up they want three related numbers: cumulative points
scored, net points, and average points per game.

## Goals

1. On **every screen that shows standings**, let a player get a clear,
   non-technical explanation of any column — by tap, working on touch devices.
2. Add a way to see three point stats — **PTS / NET / PPG** — without crowding
   the phone-width table.
3. Keep the explanations accurate to the real formulas, friendly, and grounded
   in examples.

## Non-goals

- No rewrite of the existing standings tables into a column framework. Changes
  stay surgical (project rule: don't refactor what isn't broken).
- The Points view does **not** re-sort the table by points (see Decisions).
- No change to how ranking is actually computed.

---

## Feature A — Column help (hybrid: tap header + guide button)

Two entry points, **one shared source of truth** (`COLUMN_HELP`):

- **Tap a column header** → a compact help card for *that one column*: full name,
  plain-English description, and a short example. On narrow screens it appears as
  a centered mini-card (robust, no fragile anchoring); on wide screens it can
  anchor near the header. Includes a **"See all columns →"** link to the guide.
- **"Column guide" button** (near each standings table) → one modal listing every
  column for the current format, grouped:
  - **Basics:** GP, W–L, W%
  - **Ranking:** the format's scoring stat (AM / SS/G / KS/G / MP)
  - **Points:** PTS, NET, PPG
  Each row: name + description + example.

### Where it applies
Every standings/ranking surface:
- Live standings cards: `renderStandingsCard` (RR/Gauntlet) `index.html:11741`,
  `renderStackStandingsCard` `:11806`, `renderKingStandingsCard` `:11689`,
  `renderCrownStandingsCard` `:10758`.
- Final standings: `renderDoneScreen` `:12787`, `renderDoneScreenCrown` `:11128`.
- Finals seeds table (`renderFinalsScreen` `:11907`) — header help only (no toggle).

### Accessibility
- Header is a real `<button>` (or `th` with a focusable button) with an
  `aria-label` like "What does AM mean?".
- The guide reuses the existing `mountModal` infra (role=dialog, aria-modal,
  Escape, focus trap, focus return — already supported, incl. stacking).

---

## Feature B — Ranking ⇄ Points toggle

A two-option switch above each standings table: **Ranking** (default) | **Points**.

- **Ranking view:** today's columns, unchanged per format.
- **Points view columns:** `#`, Player, GP, **PTS**, **NET**, **PPG**. Same column
  count as today → fits phone width with no horizontal scroll.
- **Rows keep ranking order** in Points view — same players, same `#`/medals, only
  the stat columns change. (Re-sorting by points is intentionally out of scope.)
- Choice is **remembered for the tournament** (stored in `state`, survives reload),
  defaults to **Ranking**.
- Applies to all 5 formats. For **Crown** this also de-clutters its table:
  *Ranking* = MP, G W–L; *Points* = PTS, NET, PPG (today Crown shows MP, G W–L,
  PTS, +/– all at once).

### Coloring (match existing conventions)
- **PTS** neutral (always positive).
- **NET** green if > 0, red if < 0, neutral at 0 (same as today's +/– / +/–G).
- **PPG** neutral.

---

## The explanations (`COLUMN_HELP` content)

Single source of truth. Each entry: short label, full name, description, example.
Verified against the code formulas (line refs in parentheses).

### Basics (all formats)
- **# · Rank** — Your standing. During play it's a live ranking that can change
  each round; on the results screen it's your final placement (bracket tier first,
  then tiebreakers).
- **GP · Games played** — How many games you've finished so far. *Ex: GP 8 = 8 games.*
- **W–L · Wins–Losses** — Your record: games won, then games lost. *Ex: 6–2 = six
  wins, two losses.*
- **W% · Win percentage** — The share of your games you've won. *Ex: 6 of 8 → 75%.*

### Points (the toggle's Points view, all formats)
- **PTS · Total points** — Every point you've scored, added up across all your
  games — win or lose. It just keeps growing. *Ex: scores of 11, 11, 9, 8… over 8
  games → PTS 176.* (RR/Gauntlet `stats.points` `:7698`; Stack/King/Crown
  `pointsScored`.)
- **NET · Net points** — Points you scored minus points scored against you, for the
  whole tournament. Positive = you've outscored opponents overall; negative = the
  reverse. *Ex: scored 176, gave up 163 → NET +13.* (RR/Gauntlet `stats.diff`
  `:7698`; Stack `pointsScored − pointsAgainst`; Crown `pointDiff` `:6328`; **King
  needs new `pointsAgainst`**.)
- **PPG · Points per game** — Your average points scored per game (total ÷ games).
  Steadier than the running total. *Ex: 176 over 8 games → PPG 22.0.* (`avgPoints`
  `:7708` / `pointsScored / gp`.)

### RR / Gauntlet ranking
- **AM · Adjusted Margin** — Your ranking score (higher is better; can go
  negative). Based on how much you win or lose by, with two fairness twists:
  (1) **blowouts have diminishing returns** — winning 11–2 counts only a little
  more than 11–7, so running up the score doesn't pad your rank; (2) **it adjusts
  for who you played** — beating strong opponents (or carrying a weaker partner)
  earns more, beating weak opponents a bit less. Because partners/opponents change
  each round, AM can shift slightly as the field's strength becomes clearer.
  *Ex: two players both 6–2 can have different AM — the one whose wins came against
  tougher opponents and by healthier margins ranks higher. AM only breaks ties
  **within** a finals tier; the bracket result (champion vs runner-up) comes
  first.* (`marginScore = sign(d)·√|d|` `:7659`; strength adj ±1.0 `:7657`,
  `:7764`; `adjScore` `:7753`.)
- **+/–G · Point margin per game** — On average, how many points you win or lose
  each game by. *Ex: +1.6 ≈ outscore opponents by ~1.6 a game; −4.8 ≈ outscored by
  ~5 a game.* (`avgDiff` `:7710`.)

### Stack ranking
- **SS/G · Stack Score per game** — Your Stack ranking score per game (higher is
  better). Each game you earn points for the points you scored — worth more on the
  higher courts — plus a bonus for winning, and an extra bonus for winning on a
  lower court (which moves you up). So *where* you win matters, not just whether.
  (`stackScoreGain`: `pts × multiplier + 3 win + 2 climb` `:5885`; top court has
  the higher multiplier `:5879`; `stackRate` per game.)
- **Climbs · Court climbs** — How many times you won your way up to a higher court.
  *Ex: Climbs 3 = climbed up three times.* (`courtClimbs`.)
- **C1 · Games on Court 1** — How many of your games were on Court 1, the top
  court. You only reach it by winning, so more is better. (`gamesOnCourt1` `:5934`.)

### King ranking
- **KS/G · King Score per game** — Your King ranking score per game (higher is
  better). It blends your wins, the points you scored, and your wins on the King's
  Court (the top court) — so winning up top counts most toward your rank.
  (`kingScore = wins + pointsScored + kingCourtWins` `:6172`; `kingRate` per game.)
- **👑W · King's Court wins** — Games you won on the King's Court (the top court).
  (`kingCourtWins` `:6166`.)
- **PPG** — see Points.

### Crown
- **MP · Match Points** — Your Crown ranking score. You earn match points for
  winning your matches, with partial credit depending on how the match went. Crown
  standings are ordered by this — most match points wins. **(Fix: today's tooltip
  wrongly says "Matches played".)** (`matchPoints += perWinner/perLoser` `:6312`;
  sort by `matchPoints` `:6344`.)
- **G W–L · Game win–loss** — Individual games you won and lost across all your
  Crown matches (each match is a short series). (`gamesWon`/`gamesLost` `:6329`.)
- **PTS / NET / PPG** — see Points. (Crown's current "+/–" column is NET; "PTS"
  already exists.)

---

## Implementation approach (surgical)

1. **`COLUMN_HELP` map** — one object keyed by column id → `{ short, name, desc,
   example, group }`. Sole source of header help and the guide modal.
2. **Header help helper** — given a column id, render the header as a tappable
   button + the popover/mini-card; one function reused by all render sites.
3. **Column guide modal** — builds from `COLUMN_HELP` filtered to the columns the
   current format shows (basics + ranking + points).
4. **Toggle** — small state field (e.g. `state.standingsView: "ranking" | "points"`,
   persisted) + a segmented control component. Each standings render site asks the
   helper which column set to render.
5. **Points cell helper** — one function renders the PTS/NET/PPG `<td>`s (and their
   `<col>`/`<th>`), called from each site to avoid duplication.
6. **King `pointsAgainst`** — add accumulation in `computeKingStats` (the only
   missing datum, needed for NET).
7. **Crown MP tooltip fix** — "Matches played" → "Match Points" (now sourced from
   `COLUMN_HELP`).

### Data already available (no new math except King NET)
- RR/Gauntlet: `points` (PTS), `diff` (NET), `avgPoints` (PPG) — `computeStats` `:7698`.
- Stack: `pointsScored`, `pointsAgainst` (NET), per-game (PPG).
- King: `pointsScored` (PTS), `pointsScored/gp` (PPG); **add `pointsAgainst`** (NET).
- Crown: `pointsScored` (PTS), `pointDiff` (NET), `/gp` (PPG).

---

## Testing

- **`?test` unit asserts** (`tools/run-url-check.mjs … --expected-failures 1`,
  baseline = 1 keep-awake failure):
  - Every column displayed by any format has a `COLUMN_HELP` entry (no orphan
    headers).
  - NET and PPG compute correctly for a seeded game set, each format.
  - Toggle state defaults to "ranking" and round-trips through save/load.
- **`?simulate`** must stay at **0 failures**.
- **Visual regression** (`npm run test:visual`): refresh the 10 baselines
  (intentional UI change) and add one snapshot of a standings table in **Points**
  view.
- **Accessibility:** toggle and header buttons keyboard-reachable with visible
  focus ring; guide modal a11y via existing `mountModal`; tap targets ≥44px.
- **`npm run check:index`** stays green.

---

## Decisions (confirmed with user)
1. Points view **keeps rank order** (does not re-sort by points).
2. **Crown gets the toggle** too (de-clutters its table).
3. Toggle **remembered across reload**, defaults to **Ranking**.
4. Fix Crown's mislabeled **MP** tooltip ("Matches played" → "Match Points").
5. Help mechanism = **hybrid** (tap header + guide button), one shared text source.
6. Point stats surfaced via the **toggle** (not extra always-on columns or
   tap-to-expand rows).
