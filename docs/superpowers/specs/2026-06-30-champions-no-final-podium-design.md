# Tournament Champions panel — "no championship game" redesign

**Date:** 2026-06-30
**Branch:** `worktree-champions-no-final-panel`
**File touched:** `index.html` (single-file vanilla-JS PWA), `sw.js`, `version.json`, `version-metadata.json`

## Problem

When a tournament ends **without a championship game** (Round Robin "Skip
championship", or any non-crown format that finishes on standings), the
Tournament Champions panel renders:

> 👑 Tournament Champions
> **Tied!**

This is wrong. There is no tie — the final standings produce a clear 1st, 2nd,
3rd and 4th place. The misleading "Tied!" headline undercuts the four players who
actually earned the podium.

### Root cause

`renderUnifiedChampionsPanel(ranking)` (index.html ~line 14962) derives the
header winner from the championship game:

```js
const champ = finalTier(0);                       // null when no finals were built
const champWin = champ && champ.score1 > champ.score2 ? champ.team1 : ...;
champWinName = champWin ? teamName(champWin) : "Tied!";   // ← falls back to "Tied!"
```

When `state.finals` is null (`skipChampionship`, etc.), `finalTier(0)` is null,
`champWin` is null, and the header shows "Tied!". The 1st–4th `placements-grid`
**already renders correctly below** — only the header is broken.

## Goal

Make the panel **celebrate the top 4 as the overall tournament champions** when
no championship game was played, with a premium podium feel and exciting
reveal animations.

## Design (surgical, reuses the existing podium grid)

Detection: `noFinalGame = !isCrown && !champ` (no championship tier exists). This
covers Skip-championship and any standings-only finish. The genuine
"championship game played but tied" edge (`champ` truthy, scores equal) is
**unchanged** — it still shows "Tied!".

### Header (no-final branch only)

Replace the single "Tied!" line with a celebratory, honest banner:

- Floating crown 👑 (existing `crownFloat` animation).
- Eyebrow: `Tournament Champion` (existing `.celebration-title`, gold, uppercase, tracked).
- Hero line = **the 1st-place champion's name** (`ranking[0].name`) with a gold
  glow — they are the champion, crowned by standings.
- Caption pill: `Crowned by final standings` (uppercase, muted) — honest framing
  that there was no championship game.

### Podium grid = the focus (the four champions)

Keep the existing 4-card `placements-grid` (1st–4th, medal theming, per-player
stats, staggered `fadeInUp`) as the visual hero of the card. In the no-final
case, add premium polish via a modifier class `champions-podium-card--standings`:

- **#1 "champion spotlight"** — gold radial glow behind the card, a slow gold
  **shine sweep** across it, a small `CHAMPION` ribbon, slightly elevated
  (scale/shadow) so the hierarchy reads as a podium without fragile layout
  reordering. The existing emoji pulse stays.
- 2nd / 3rd / 4th keep their silver / bronze / violet theming and staggered
  reveal.
- A soft, slowly-rotating gold aurora behind the header for depth.

### Motion guidelines (applied)

- Entrance: staggered `fadeInUp` (existing, 0.10–0.46s delays), ease-out.
- New: `championGlow` (opacity/transform glow pulse) + `championShine`
  (transform sweep) on the #1 card; `auroraDrift` behind the header.
- transform/opacity only (no width/height/top/left animation).
- All new motion gated behind `prefers-reduced-motion` (the panel already
  honors it via `prefersReducedMotion()` / `runConfetti()`); confetti already
  fires on the done screen.

### Typography / palette decisions

- **No web-font dependency** — this is an offline-first PWA; the SW shell cache
  doesn't include Google Fonts, so importing Russo One/Chakra Petch would fail
  offline. Apply the competitive-sports *principles* within the existing
  system-font stack: weights 800/900, uppercase tracked eyebrows, mono/tabular
  numerals for the stat rows (already `font-family: monospace`).
- Reuse the existing medal ramp (gold/silver/bronze/violet) + gold accent.

## Scope guardrails

- Only the no-championship branch and its CSS change. The crown-format and
  played-championship branches are untouched.
- The `placements-grid` render loop is unchanged (still drives 1st–4th from
  `ranking`).
- `finalRanking()` already returns the season standings when no finals exist —
  no ranking-logic change needed.

## Ship

Bump `APP_VERSION` (index.html) + `VERSION` (sw.js) v54 → v55, prepend a v55
changelog entry to `version.json` and `version-metadata.json`, run tests,
commit, push, open PR, merge, prune.
