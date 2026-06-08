# Task: Thorough end-to-end dogfood test of the Rumble Pickleball app

Act as a meticulous QA engineer + UX reviewer dogfooding a production PWA before a
release. Your job is to ACTUALLY USE the app through real interaction across every
area, then deliver a prioritized report of bugs, gaps, and UI/UX enhancements. This
is exploratory/dogfood testing — be curious, try to break things, and judge how it
*feels*, not just whether it works. Do NOT fix anything; audit only.

## App under test
- Repo: /Users/kenallred/Developer/rumble — single-file vanilla-JS PWA (index.html,
  ~8k lines, no build step), plus sw.js + manifest + icons.
- Live: https://zigrivers.github.io/rumble-pickleball/ (test locally, not prod).
- SPA with no router: the view is driven by `state.phase`
  (setup | playing | finals | crown | done) plus modals. There are 5 tournament
  FORMATS: `rr` (8-player round robin), `stack`, `king`, `gauntlet` (8-player), and
  `crown` (4-player Crown Court). Each format has its own playing/standings/done UI.

## Setup
1. Serve from repo root: `python3 -m http.server 8765 --bind 127.0.0.1 -d . &`
2. Use the **agent-browser** skill for all browser work (load `agent-browser skills
   get core --full`, and `agent-browser skills get dogfood` for the exploratory-QA
   playbook). Prefer agent-browser over other browser tools.
3. Optional: Surface CLI (`surface capture --localhost <url>`) produces a11y-tree +
   computed-styles + DOM + screenshot artifacts under `.surface/captures/`. Surface's
   own finding synthesis returns 0 findings in this environment — so USE it only to
   capture; YOU evaluate the artifacts. Don't report an empty Surface run.

## CRITICAL environment lessons (read or you'll waste hours)
1. **Service worker caches index.html.** Before EVERY fresh load after a code change
   or when you want a clean DOM, clear it:
   ```
   agent-browser open "http://localhost:8765/index.html"
   agent-browser eval "(async()=>{const rs=await navigator.serviceWorker.getRegistrations();for(const r of rs)await r.unregister();const ks=await caches.keys();for(const k of ks)await caches.delete(k);return 'cleared';})()"
   agent-browser open "http://localhost:8765/index.html"   # fresh, uncontrolled
   ```
2. **Viewport syntax** is `agent-browser set viewport <w> <h> [dpr]`. Verify with
   `eval window.innerWidth`. Audit primarily at 390x844@2 (phone/courtside), plus
   768x1024 (tablet), 1440x900 (desktop/TV-cast — `col-hide-mobile` columns reappear
   and the standings table caps at 680px ≥900px wide), and landscape 844x390.
3. **Built-in harnesses:** `index.html?test` runs unit asserts — baseline is exactly
   **1 keep-awake failure** (`_reVerify() restarts Layer 1…`); anything else is a
   regression. `index.html?simulate` plays 3 full RR tournaments and must report
   **0 failures**. Read the console for `[self-tests] complete` / `[simulate] complete`.
4. **Dismiss stray overlays** before a capture: `agent-browser eval
   "document.querySelectorAll('.modal-bg').forEach(n=>n.remove())"`.
5. When seeding `state`, set `gameStartedAt` to a realistic recent time
   (`Date.now()-90000`), never `1` (produces a broken elapsed timer).

## Methodology — two complementary modes
**Mode A — Real play-through (primary; this is dogfooding).** Drive the app exactly
as a user would, via real clicks/typing/taps, through complete flows. This surfaces
interaction bugs that state-seeding hides (focus, validation, timers, toasts, button
enable/disable, animations, persistence). Example RR flow: type 8 names → Start →
watch the shuffle reveal → enter scores round by round (use the quick-fill "× N"
pills, type ties/overtime, edit a prior round via "← Round N") → Build Finals → enter
finals scores → done screen → text results → Start New Tournament.

**Mode B — Targeted state-seeding (to reach deep/rare states fast).** The globals
`state`, `newState()`, `generateRounds()`, `assignInitialStackCourts/KingCourts/
GauntletCourts()`, `buildNextStackRound/KingRound/GauntletRound()`, `buildCrownMatch()`,
`buildFinals()`, `rankPlayersForFormat()`, `nameOf()`, `render()` are all reachable via
`agent-browser eval` (top-level `let state` is reassignable from eval). Set
`rawNames`/`format`/`slots`, build rounds, set `phase`, call `render()`. Note: RR
pre-generates all 7 rounds up front; stack/king/gauntlet build one round at a time
(next round requires the current round *decided*). Crown uses `crownMatches` +
`crownFinal` with **slot indices** (not name strings) — seed it by completing
`crownMatches` then calling `buildCrownMatch()`, not by hand. For multi-round states
with trajectory arrows, set `previousRanks` before advancing.

Ground every finding in DATA where you can: pull role+name from the accessibility
tree (`agent-browser snapshot -i --json`), measure tap-target px via
`getBoundingClientRect`, and compute color contrast from `getComputedStyle`. CSS vars:
`--text #f1f5f9, --muted #94a3b8, --bg #0f1419, --panel #1a2028, --accent #fbbf24,
--good #10b981, --bad #ef4444, --court1 #38bdf8, --court2 #a78bfa`.

## Coverage checklist — exercise EVERY area
Go area by area; for each, try the happy path, the empty/initial state, the full/max
state, and at least one edge/error case.

**1. Setup screen**
- Name entry: fewer than 8, exactly 8, blank/whitespace, duplicate names (case-insensitive),
  very long names ("Maximilian"/"Christopher"), special chars/emoji, leading/trailing spaces.
- "Paste N names" modal: newline vs comma input, too few/too many, dupes, trimming.
- Phone numbers: valid/invalid formats, +country codes, the saved-roster auto-fill,
  privacy note. Confirm name→phone alignment survives the shuffle.
- Format selector: switch between all 5 formats; confirm player count flips 8↔4 (Crown),
  descriptions, and that the Time-Budget note adapts per format.
- "How it works" expander; Start button enable/disable logic.

**2. Time Budget (a whole subsystem)**
- Enable toggle → back-solved win condition readout (target / win-by / scoring /
  "likely done" window / confidence). Try every event-time option per format.
- The "time is tight" warning, rally-scoring acknowledgement dialog (confirm + cancel +
  Escape), auto-tighten on/off, mid-event slippage prompt ("Tighten remaining" /
  "Stay the course"), the auto-tighten toast + Undo, locked fields once started.
- Verify projected-finish updates as rounds complete; reopening a round to a tie should
  push the estimate back out.

**3. Playing screens — all 5 formats**
- Court labels/colors (South/North, 🏆 Court 1 / Court 2, 👑 King's Court / Bottom,
  Court 1 (Top)), score inputs, quick-fill pills, elapsed timers, win/tie/overtime
  status messages, "Awaiting scores".
- Score entry edge cases: 11-0, 0-0, ties (9-9 — must block advance, "enter a
  tiebreaker"), overtime (15-13), huge numbers, non-numeric, negative, editing a
  decided game back to a tie (clock should resume; estimate/standings update).
- Round navigation: "← Round N" back, "Round N+1 →" forward (enable only when
  decided), the shimmer toast on round complete, building the next round (stack/king/
  gauntlet movement toasts + trajectory arrows), Build Finals gating.
- Live Standings: ranks/medals, trajectory indicators, next-partner chips, "N left"
  partner badge (correct count, hidden on mobile), format-specific columns
  (SS/Score/Climbs/C1/MP/G W–L/PTS/+/–) + their header tooltips, the History expander,
  mid-event "Text standings" card (RR/Gauntlet only).

**4. Finals & Crown Match**
- RR/Stack/King/Gauntlet: Seeds table, Championship + Consolation pairings (1+4 vs 2+3),
  seed pills, score entry, the disabled-until-decided finish button, tied-finals handling.
- Crown Court: opening/round phases, match score, "Game 3 (if needed)" dimming, the
  Crown Match phase screen (#-seeded matchup), Back-to-Match navigation, crown standings
  (MP / G W–L / PTS, Top-2 chips).

**5. Done / results screens (per format)**
- Champions banner (and "Tied!"), scorecards, podium (1st/2nd/3rd with medals;
  note tier-vs-points ordering), confetti on first view, awards strip (all award types
  for Crown), final standings with tier dividers, "Includes finals games" note.
- Text results card: all-no-numbers, all-have-numbers, mixed; the Text (sms:) link and
  Copy button (clipboard toast); confirm it's absent for unsupported formats
  (stack/king/crown). Edit Final/Crown Scores. Start New Tournament (state reset,
  keep-awake setting preserved).

**6. Modals & global UI**
- Settings (mid-setup vs mid-tournament — locked fields), Display & TV (keep-awake +
  aggressive/silent-audio + status), Diagnostics (Verify Scoreboard runs ?simulate),
  Saved Numbers management, format/rounds selectors.
- "How this works" reference, Full Schedule modal, rally-scoring explainer.
- Modal a11y for each: role=dialog/aria-modal/accessible name, Escape-to-close,
  backdrop click, Tab focus trap, focus-on-open, focus return, stacked-modal behavior.

**7. Accessibility (every screen)**
- Keyboard-only traversal: visible focus ring (themed gold `:focus-visible`), logical
  tab order, all actions reachable, no traps outside modals.
- Screen-reader semantics: roles/names for inputs, toggles, score fields, buttons.
- Contrast: muted text, accent-on-dark, status colors, disabled states (measure, AA/AAA).
- Tap targets ≥44px across all controls.
- Reduced-motion (shuffle reveal / confetti / shimmer), zoom/large-text.

**8. Responsive & orientation**
- Re-check key screens at 390 / 768 / 1440 / landscape. Watch for overflow, wrapping,
  the standings width cap, columns hiding/showing, courts going 1-up vs 2-up, header
  wrapping, safe-area insets.

**9. Persistence, PWA & lifecycle**
- Reload mid-tournament (state restored exactly). localStorage migration (v1/v2/v3 keys).
- Service worker: update chip flow (skipWaiting), offline load, install/manifest,
  icons/theme. Clearing data ("Clear All") + confirm.
- Multiple tabs, backgrounding, the keep-awake layers.
- Corrupt/partial localStorage (hand-edit then load) → graceful backfill, no crash.

**10. Cross-cutting**
- Console errors/warnings during every flow (watch `agent-browser` console).
- Tolerance to rapid clicks / double-submits. Loading/empty/error states.
- Copy/microcopy quality, emoji rendering, number formatting, time formatting.

## What to record (severity + category)
For each finding: **[Severity P0–P3] [Bug | Gap | Enhancement]** — a one-line title,
then: where (view/format/state + `file:line` if known), what's wrong / what's missing /
what would be better, the **evidence** (a11y-tree excerpt, measured px/contrast,
screenshot, console output, repro steps), and a **concrete suggested fix**.
- P0 broken/unusable/data-loss · P1 serious · P2 moderate · P3 minor/polish.
- Bug = wrong behavior. Gap = missing-but-expected capability or inconsistency across
  formats. Enhancement = works, but a change would clearly improve UX.
Separate "verified working well" briefly from the issues. Distinguish your own
evaluation from any tool output.

## Deliverable
A prioritized report grouped by area (the 10 sections above), bugs/gaps/enhancements
separated, each grounded in evidence with a repro and a fix suggestion. Lead with a
short executive summary (top 5 things to fix first) and confirm the test-harness
status (`?test` = 1 baseline failure, `?simulate` = 0). End by asking whether to fix
any of them.

## Guardrails
- Audit only — make NO code changes and do NOT commit.
- Don't trust a single screenshot — verify with the a11y tree / measurements / a second
  viewport. Re-seed before inspecting (eval runs against whatever is currently rendered).
- Clean up when done: clear localStorage, close the browser, stop the http server.
