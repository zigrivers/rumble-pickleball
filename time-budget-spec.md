# Time Budget Feature — Design Spec

**Status:** Revised (post-multi-model review)
**Author:** Claude (with Ken)
**Date:** 2026-05-06

## Goal

Let the user set a time budget for an event, and have the system back-solve a win condition — `(target, winBy, scoring)` — that fits. Format and round count remain user-chosen; scoring is the dial. When the event runs long, the system prompts the user to tighten scoring for remaining rounds.

Fixes the real failure mode: events run out of time before the final game completes.

## Resolved Decisions

1. **All five formats in scope** (Round Robin, Stack, King, Gauntlet, Crown). Crown is special-cased due to its 4-player / 1-court / per-theme structure.
2. **Flex scoring only.** Round count is the user's choice; algorithm does not change it. (Algorithm may suggest reducing rounds if no scoring fits; never changes silently.)
3. **Three dials:** `target`, `winBy`, `scoring` (rally vs. side-out).
4. **Dynamic adjustment in v1.** Mid-event slippage triggers a re-solve for remaining rounds; user prompt before applying.
5. **Court count:** 2 for 8-player formats, 1 for 4-player Crown. Hardcoded.
6. **Don't regress the existing fixed-scoring path.** Time budget is opt-in; current behavior is the default.
7. **Finals always richest:** SO/11/win-by-2, never compressed. Time reserved up-front.
8. **Auto-tighten default:** prompt (not auto). Auto-with-undo available as opt-in setting.
9. **Time budget meaning:** play time only. Does not include warm-up or arrival overhead.
10. **Stack convention override:** budget may select win-by-2 against Stack tradition, but only at setup — never mid-event. Cross-round fairness is preserved by locking the override before play starts.
11. **"Running long" threshold:** 10% over projected, hardcoded.
12. **Tight-budget banner:** yellow banner shown in setup when algorithm falls back to shortest combo.
13. **Slowest-court / variance factor:** `× 1.15` on top of base game estimate.
14. **Re-solve cap:** 3 total adjustments per event (raised from 2 — gives power users room before silent failure).
15. **First-time rally selection:** when the algorithm first picks rally during setup, show a one-time acknowledgment ("Rally scoring is faster — confirm?"). Avoids cultural surprises.
16. **Setup flow placement:** the Time Budget toggle appears in the setup screen *and* the settings modal. Setup is the primary surface.
17. **Lock after start:** the toggle and minutes value lock once the tournament begins. Mid-event adjustment is the only path to change scoring once started.
18. **Terminology:** "win condition" in user-facing strings; `scoringConfig` in code/data structures. One term per audience.
19. **Calibration is per-device, not per-user.** localStorage is one bucket. If multiple groups share a device, calibration blends them. Acceptable for v1.
20. **Score corrections don't rewrite the duration log.** First-completion time is locked.

## Audit Recap

| Format | Players | Courts | Rounds | Existing dials | Finals |
|---|---|---|---|---|---|
| Round Robin | 8 | 2 | **Fixed at 7** | winScore (11/15/21), win-by 2, side-out | Championship + Consolation, parallel |
| Stack | 8 | 2 | 4–12 (default 8) | winScore, **win-by 1** | Championship + Consolation |
| King | 8 | 2 | 6–12 (default 9) | winScore, win-by 2 | Championship + Consolation |
| Gauntlet | 8 | 2 | 6–12 (default 8) | winScore, win-by 2 | Championship + Consolation |
| Crown | 4 | 1 | 3 themed matches (best-of-3) + Crown Match (best-of-3) | **Locked per theme** | Crown Match is finals |

**No existing time tracking.** No `gameStartedAt`/`gameEndedAt` on games; no duration log. Clean slate.

**State gaps that must be filled before time budget can work:**
- `state.winBy` does not exist today (only `state.winScore` does).
- `state.scoringSystem` does not exist for non-Crown formats — they're implicitly side-out.
- `state.timeBudget.adjustments` array is needed at Phase 1 of the data model, not Phase 5.

**Hidden consumers of `state.winScore`:**
- Quick-fill pill at `pickleball.html:4261`.
- Reset Tournament block (`openSettings()`, ~5882).
- Switch Format block (`openSettings()`, ~5849).

All three must be updated when scoring becomes a computed value driven by time budget.

State persists to `localStorage` under `pb_tourney_v3`. We bump to `pb_tourney_v4`.

---

## Time Model

### Per-game estimate

```
T_game(target, winBy, scoring) = expected_points / points_per_minute
                                 × (winBy == 1 ? 0.85 : 1.0)

expected_points(target, sideout) ≈ 1.6 × target
expected_points(target, rally)   ≈ 1.65 × target
points_per_minute(sideout) ≈ 0.85    # rec mixed-level
points_per_minute(rally)   ≈ 2.0
```

The `1.6 × target` factor reflects that losers don't scale linearly with the target — in a side-out to 21, the loser typically lands around 13, not 18. Calibration replaces these constants once enough data is logged.

### Default per-game time table

| Scoring | Target | Win-by | Est. min | Range (low–high) |
|---|---|---|---|---|
| Side-out | 7  | 2 | 13 | 9–18 |
| Side-out | 9  | 2 | 17 | 12–23 |
| Side-out | 11 | 2 | 21 | 15–28 |
| Side-out | 15 | 2 | 28 | 20–37 |
| Side-out | 21 | 2 | 40 | 28–52 |
| Rally    | 7  | 2 | 6  | 4–8   |
| Rally    | 9  | 2 | 7  | 5–10  |
| Rally    | 11 | 2 | 9  | 7–13  |
| Rally    | 15 | 2 | 12 | 9–17  |
| Rally    | 21 | 2 | 17 | 13–24 |

Win-by-1 multiplies all values by 0.85. Range widths (~30% above/below midpoint) reflect realistic variance — beginner vs. intermediate, indoor vs. outdoor, ball/wind. Intentionally pessimistic until per-device calibration kicks in.

These estimates were revised upward after domain review: side-out to 11 was originally 18 min, which is closer to intermediate competitive play than recreational mixed-level. 21 min is a more honest default.

### Per-round and per-event time

8-player formats run **2 games in parallel** per round:

```
T_round   = T_game × 1.15 + T_changeover           # 1.15 = slowest-court + variance
T_event   = N_rounds × T_round + T_finals + T_setup_overhead
T_finals  = T_game(11, 2, sideout) × 1.15 + T_changeover
            # finals always richest config; recomputed each session via current calibration
T_changeover     ≈ 2.5 min        # 8 people walking between courts, app check, pairings
T_setup_overhead ≈ 5 min          # initial pairings, app check, first round start
```

For Crown (4-player, 1 court, sequential, **all 4 matches are best-of-3**):

```
T_event_crown    = sum over 4 matches of T_match
T_match          = expected_games × T_game(theme) + T_match_changeover
expected_games   = 2.3                      # best-of-3, evenly matched rec
T_match_changeover ≈ 3 min                  # higher: setup between matches, score reset
```

**Match-point multipliers** (1×, 1.5×, 2× per theme) affect tournament scoring, not duration. They are not in the time math.

### Idle / sleep handling

`Date.now()` keeps wall-clock time, so a closed laptop or backgrounded tab would otherwise count as game time and trigger spurious slippage prompts. Mitigation:

- **Heartbeat:** while the playing screen is rendered, write `state.timeBudget.lastSeenAt = Date.now()` once per second via the existing `statusTimer`.
- **Gap detection:** when computing elapsed time for an in-progress game, if `Date.now() - lastSeenAt > 5 min` since the last heartbeat, treat the gap as paused and add it to `game.pauseSec`. The slippage check uses `(gameEndedAt - gameStartedAt) - pauseSec`.
- **Heartbeat persisted:** `lastSeenAt` is in state, so cross-reload sessions are handled too.

This keeps the slippage math honest without requiring a user "I'm back" button.

### Calibration

Defaults are educated guesses. Self-correction:

- **Per-game duration log** to `localStorage` key `pb_durations_v1`:
  `{ts, format, target, winBy, scoring, courtIndex, durationSec, winnerScore, loserScore, roundIndex}`. Capped at 200 entries.
- **Blending:** simple average for the first 5 logged games per scoring system, then EMA with α=0.15. Cap deviation at ±50% of defaults to prevent a few weird games from corrupting the model.
- **Sample threshold:** ≥5 games (per scoring system) before overriding defaults.
- **Confidence display** in setup and settings: "Using your last 12 games" or "Using defaults — 3 games logged (need 5)".
- **Lock at first completion:** score corrections don't rewrite the log entry.
- **Per-device, not per-user.** Acknowledged limitation. Future work: profile selector.

### Surfacing uncertainty

Always a window, never a point estimate. Plain English, not stats:

> "Likely done between **7:35 and 7:55 pm**"

The bounds are the model's high/low after calibration. No "90% confidence" jargon.

---

## UX Design

### Setup-time UX (primary surface)

In the **setup screen** (before tournament starts), add a Time Budget block above the format chooser:

```
┌─ TIME BUDGET ─────────────────────────────────┐
│  ☐ Set a time budget                          │
│                                                │
│  When enabled:                                 │
│  Event time:   [90 minutes ▼]                  │
│                  options vary by format —      │
│                  see below                     │
│  Will play:    side-out to 11, win by 2        │
│  Likely done:  ~7:35–7:55 pm                   │
│  Confidence:   using defaults (no history)     │
│                                                │
│  ☐ Auto-tighten if running long                │
│    (default: prompt before tightening)         │
└────────────────────────────────────────────────┘
```

The same controls also appear in the settings modal — toggling either surface keeps state in sync.

**Time dropdown options:**
- 8-player formats: 60 / 75 / 90 / 105 / 120 / 150 / 180 min. Tight options (60, 75) are suffixed `(very tight)`.
- Crown: 90 / 105 / 120 / 150 / 180 min. Sub-90 options are filtered out with a tooltip: "Crown Match alone takes ~40 min — budget at least 90."

### Behavior

| Trigger | Effect |
|---|---|
| Toggle on | Reveal time dropdown; hide manual win-score dropdown; populate `plannedConfig`; mirror to `state.winScore`/`winBy`/`scoringSystem`. |
| Toggle off | Show manual win-score dropdown; restore previous `winScore`. |
| Time changed | Re-solve, update read-out. |
| Format changed | Re-solve, update read-out. (Existing format-switch flow already resets the tournament.) |
| Round count changed | Re-solve, update read-out. |
| Algorithm picks rally for the first time on this device | Show one-time acknowledgment dialog: "Rally scoring is faster — every rally scores. Confirm for this event?" Persist `rallyAcknowledged: true`. |

### Setup-time edge cases

- **Tight-budget banner.** When the algorithm falls back to the shortest combo, a yellow banner appears below the read-out: "This budget is tight — even our shortest games may run over." Banner persists until time, format, or rounds change. Does **not** block start; user can proceed.
- **No-fit (impossible).** When even shortest + finals + setup doesn't fit, the read-out shows "Budget too tight — increase time or reduce rounds." Start button is **disabled** until user adjusts.
- **Format-specific advice on no-fit:**
  - RR: "RR is fixed at 7 rounds — increase time, or switch to a different format."
  - Stack/King/Gauntlet: "Reduce {format} rounds (currently {n}) or increase time."
  - Crown: "Increase time to at least 90 minutes."
- **First event (no calibration).** Confidence line: "Using defaults — first event." Projection uses high end of range.

### In-event UX

**Header strip** (always visible when budget enabled, including TV display mode):

> 🕐 Likely done: **7:35–7:55 pm** · on pace

Updates after each completed round. Pace classification:

| Class | Threshold | Indicator |
|---|---|---|
| ahead | projected < 0.90 × budget | green; "could add a round" tooltip |
| on pace | 0.90 ≤ projected ≤ 1.05 × budget | green/neutral |
| behind | 1.05 < projected ≤ 1.10 × budget | yellow; no prompt |
| running long | projected > 1.10 × budget | orange; prompt fires |
| exhausted | adjustments cap reached | gray; no further prompts |

**Per-game elapsed badge** (in court card, while game is unfinished):

> `14:32`

Live-updating once per second via setInterval; cleared when game completes. Always visible (not gated on time budget enabled). Excludes paused (idle) time.

**Slippage prompt** (when "running long" fires):

Triggered after the user marks a round complete (`maybeFireRoundComplete`). Modal:

```
Title:   Running about 12 minutes long
Body:    Currently: side-out to 11.
         To finish on time, switch remaining rounds to rally to 11?
Buttons: [Tighten remaining]   [Stay the course]
                ^ default focus
```

**Auto-tighten variant** (if user opted in): no modal. Apply tightening immediately. Show 30-second persistent toast at the top:

```
Tightened to rally to 11.   [Undo]
```

After 30 sec, toast collapses to a small `↻ Undo last tightening` chip in the header until the next round completes.

**Cap-reached state.** After 3 total adjustments, no further prompts. Header shows:

> 🕐 ~10 min over · adjustments exhausted

Tooltip: "Re-solver hit the 3-adjustment cap. Consider ending early or playing through."

### Locked controls during play

| Control | Phase: setup | Phase: playing+ |
|---|---|---|
| Time budget toggle | enabled | **disabled** (tooltip: "Locked — set before starting") |
| Minutes dropdown | enabled | **disabled** |
| Auto-tighten checkbox | enabled | enabled (affects future slippage events) |
| Format / round count | (already locked once playing today) | locked |

### Crown floor surfacing

When Crown format is selected during setup (regardless of budget toggle state), show an inline note:

> Crown events typically run 100–165 minutes.

This sets expectations *before* the user picks a budget that won't fit.

---

## Algorithm

### Inputs

```
format          ∈ {rr, stack, king, gauntlet, crown}
time_budget_min ∈ ℕ
N_rounds        # user-chosen (or fixed for RR/Crown)
court_count     # derived: 2 for 8-player, 1 for Crown
calibration     # per-device points-per-minute (or null → defaults)
```

### Search space (8-player formats)

20 combos: `target ∈ {7, 9, 11, 15, 21}` × `winBy ∈ {1, 2}` × `scoring ∈ {sideout, rally}`.

### Selection rule (8-player formats)

```
1. T_finals = T_round(11, 2, sideout, calibration)
2. budget_for_rounds = time_budget_min - T_setup_overhead - T_finals
3. If budget_for_rounds <= 0: return {error: "no_fit_finals"}
4. target_T_round = budget_for_rounds / N_rounds
5. For each combo: compute T_round(combo, calibration)
6. Survivors: combos with T_round ≤ target_T_round
7. If no survivors: return {error: "no_fit",
                            suggestion: format_specific_advice(format, N_rounds)}
8. Sort survivors by lexicographic richness:
     a. scoring (sideout > rally)        ← cultural primacy
     b. target  (higher > lower)
     c. winBy   (2 > 1)
9. Return top combo. Tiebreak: longer T_round wins (richer game).
```

**Lexicographic ordering** is a deliberate change from the original additive richness score. Additive scoring made rally/21 outrank side-out/11, which contradicts the cultural default. Lexicographic with side-out as the primary key keeps "real" pickleball the default; rally only appears when no side-out option fits.

**Stack override:** Stack normally uses win-by-1. If win-by-2 wins lexicographically (e.g., side-out/11/wb2 beats side-out/11/wb1), the algorithm picks win-by-2 — but only at setup. The setup screen shows a toast: "Stack: using win-by-2 to fit budget." Mid-event, the existing config is preserved; tightening adjustments stay within the chosen winBy.

### Selection rule (Crown)

Four presets, ordered richest → tightest (Crown Match always SO/11):

| Preset | Opening | Power | Sudden Death | Crown Match | Est. event |
|---|---|---|---|---|---|
| Standard | SO/11 | SO/11 | RA/7 | **SO/11** | ~165 min |
| Compact  | SO/9  | SO/9  | RA/5 | **SO/11** | ~140 min |
| Quick    | RA/11 | RA/11 | RA/5 | **SO/11** | ~115 min |
| Sprint   | RA/9  | RA/9  | RA/5 | **SO/11** | ~105 min |

(Estimates: 4 matches × 2.3 expected games × `T_game(theme)` + 4 × 3 min changeover. Math corrected from prior draft, which understated by ~30%.)

```
1. If budget_min < 90: return {error: "crown_floor"}
2. For each preset (richest first):
     est = sum over 4 matches of (2.3 × T_game(theme) + T_match_changeover)
     if est ≤ budget_min: return preset
3. Return {error: "no_fit", preset: "Sprint"}
   # Sprint didn't even fit; same banner as 8-player no-fit
```

### Dynamic adjustment

After every round-complete event:

```
1. If completed_rounds < max(2, ceil(0.25 × N_rounds)):
     skip                          # warmup guard — don't trigger on n=1
2. If adjustments_used >= 3: skip  # cap
3. elapsed_so_far = sum of completed-game durations, excluding pauseSec
4. avg_round_actual = elapsed_so_far / completed_rounds
5. projected_total = elapsed_so_far
                     + remaining_rounds × avg_round_actual
                     + T_finals
                     + T_setup_overhead
6. If projected_total > time_budget × 1.10:
     budget_remaining = time_budget - elapsed_so_far - T_finals - T_setup_overhead
     new_combo = solveWinCondition(format, remaining_rounds, budget_remaining, cal)
     If new_combo strictly tighter than current (T_round_new < T_round_current):
       fire prompt (or auto-tighten with toast)
     Else:
       skip — no tighter option exists
```

**Why the warmup guard:** without it, a single deuce blowout in round 1 of a 7-round event would extrapolate to "you'll be ~30 min late" and fire a prompt before any reliable signal exists.

**Re-solve guards:**
- *Strictly tighter:* same combo or looser is rejected.
- *No re-loosening:* once tightened, the algorithm won't return to a richer combo even if subsequent rounds run faster.
- *Cap = 3:* total tightenings, whether they helped or not. Beyond the cap, slippage check is silent (header still classifies "behind" / "exhausted").

### Crown mid-event tightening

After each Crown match completes:

- If `projected > budget × 1.10` and `current_preset != Sprint`: jump to the next tighter preset.
- The new preset applies only to **un-played match indices**. Already-played match scoring is locked.
- `CROWN_THEMES` is module-level and is read by score validation. **Do not mutate it.** Instead, write to `state.timeBudget.crownActiveThemes[matchIndex] = themeOverride`. Crown rendering and `isValidCrownGameScore()` read overrides if present, else fall back to `CROWN_THEMES`.

Crown Match itself is never compressed (rule 7). Mid-event Crown tightening is therefore a small lever — usually only Sudden Death and possibly Power Round if untouched. Acknowledged limitation; documented in Out of Scope as "richer mid-event Crown adjustment" for future work.

---

## Data Model Changes

### State additions

```js
{
  // ...existing fields
  winScore: 11,                     // existing
  winBy: 2,                         // NEW — backfill default 2
  scoringSystem: "sideout",         // NEW — backfill default "sideout"
  timeBudget: {
    enabled: false,
    minutes: 90,
    autoTighten: false,
    plannedConfig: null,            // {target, winBy, scoring} when enabled
    plannedFinishWindow: null,      // [tsLow, tsHigh] when enabled
    adjustments: [],                // [{afterRound, fromConfig, toConfig, reason, ts}]
    rallyAcknowledged: false,
    crownActiveThemes: null,        // [{themeName, target, winBy, scoring}, ...] keyed by match
    lastSeenAt: 0,                  // heartbeat for sleep detection
  },
  // existing rounds[] gains per-game fields:
  // round.court1.gameStartedAt | null
  // round.court1.gameEndedAt   | null
  // round.court1.pauseSec      | 0
  // (same for court2)
}
```

### Duration log (independent localStorage key)

`pb_durations_v1`:

```js
[
  { ts: 1735000000, format: "king", target: 11, winBy: 2,
    scoring: "sideout", courtIndex: 0, durationSec: 920,
    winnerScore: 11, loserScore: 7, roundIndex: 3 },
  // ...
]
```

Capped at 200 entries. Used by calibration. Locked at first completion.

### Calibration cache

`pb_calibration_v1`:

```js
{
  pointsPerMinute: { sideout: 0.92, rally: 1.95 },
  sampleCount: { sideout: 23, rally: 14 },
  updatedAt: 1735000000
}
```

Empty until ≥5 games logged for a given scoring system.

### Schema migration

Bump `pb_tourney_v3` → `pb_tourney_v4`:

- Copy v3 fields verbatim.
- Add `winBy: 2`, `scoringSystem: "sideout"`.
- Add `timeBudget` block with `enabled: false`, `lastSeenAt: 0`, `adjustments: []`, etc.
- For an in-progress tournament: set `gameStartedAt = Date.now()` on the currently-displayed round's game objects (so duration tracking starts fresh, not retroactive). Older completed rounds stay without timestamps; duration log starts from migration forward.

---

## Implementation Tasks

The 7-phase plan is replaced with **25 tasks**, each sized at ~30–90 minutes of focused Sonnet 4.6 work. Each task names the specific file ranges to read (do not re-read the full 6K-line `pickleball.html`), explicit deps, and a verification check.

### Group A — Foundations (state, timestamps, duration log)

**1. State schema: `timeBudget` block + storage key bump + migration**
- Read: `pickleball.html:1043-1045` (STORAGE_KEY), `1767-1822` (`newState`, `backfillStateDefaults`), `1824-1859` (`load`).
- Add `timeBudget` block (all fields). Bump `STORAGE_KEY` → `pb_tourney_v4`. Add v3→v4 migration branch.
- **Verify:** First save writes to `pb_tourney_v4` with `timeBudget.enabled === false`. Loading legacy v3 still works.
- **Deps:** none.

**2. State schema: `winBy` and `scoringSystem` + Reset/Switch preservation**
- Read: `1767-1822`, `5849-5895` (Switch Format and Reset Tournament blocks in `openSettings()`).
- Add `winBy: 2` and `scoringSystem: "sideout"` to state. Backfill on load. Preserve in Switch Format and Reset Tournament.
- **Verify:** After Reset, `state.winBy === 2` and `scoringSystem === "sideout"`. After Switch Format, both preserved.
- **Deps:** 1.

**3. Per-game timestamps: `gameStartedAt`, `gameEndedAt`, `pauseSec`**
- Read: `2675-2766` (`startTournament`), `2241-2245`, `2407-2410`, `2498-2503` (Stack/King/Gauntlet initial assignment), `4291-4301` (`renderTeamRow` score input handler).
- Initialize `gameStartedAt = Date.now()` at game-object creation. Set `gameEndedAt = Date.now()` when both scores first become integers. Init `pauseSec = 0`.
- **Verify:** After scoring a game, `state.rounds[0].court1.gameEndedAt` is a positive integer. Pre-scoring, null.
- **Deps:** 1.

**4. Duration log: write `pb_durations_v1` on game completion**
- Read: `4291-4301` (same site as task 3).
- On first transition to "both scores entered," append entry to `pb_durations_v1`. Include all fields per spec. Cap at 200. Lock — subsequent edits don't rewrite.
- **Verify:** After completing a game, `JSON.parse(localStorage.getItem("pb_durations_v1"))` has a new entry. Score correction afterwards does not duplicate or rewrite.
- **Deps:** 1, 2, 3.

**5. Heartbeat for idle/sleep detection**
- Read: `5609-5793` (`statusTimer`).
- Once per second, write `state.timeBudget.lastSeenAt = Date.now()`. On next render after `Date.now() - lastSeenAt > 5 min`, increment in-progress game's `pauseSec` by the gap.
- **Verify:** With a simulated 10-min gap (manipulate `lastSeenAt`), in-progress game's `pauseSec` increases by ~10 min.
- **Deps:** 1.

### Group B — Algorithm (pure functions, mostly greenfield)

**6. `estimateGameMinutes(target, winBy, scoring, calibration)` → `[low, high]`**
- Read: insert near `1071` (existing test block) or before `newState()`. No other reads needed.
- Pure function. Defaults from spec table. ±30% range. ×0.85 for winBy=1. Calibration parameter overrides `points_per_minute` if non-null.
- **Verify:** `estimateGameMinutes(11, 2, "sideout", null)` returns `[15, 28]` ±1 (rounding tolerance). With calibration, returns scaled values.
- **Deps:** none.

**7. `estimateRoundMinutes(target, winBy, scoring, courtCount, calibration)` → `[low, high]`**
- Pure function. Calls task 6, applies ×1.15 + 2.5 min changeover.
- **Verify:** `estimateRoundMinutes(11, 2, "sideout", 2, null)` ≈ `[20, 34]`.
- **Deps:** 6.

**8. `solveWinCondition(format, rounds, budgetMin, calibration)` for 8-player formats**
- Pure function. 20-combo search; lexicographic richness ordering. Returns `{target, winBy, scoring}` or `{error, suggestion}`.
- **Verify:** `solveWinCondition("rr", 7, 90, null)` → `{target: 11, winBy: 2, scoring: "sideout"}`. `solveWinCondition("rr", 7, 30, null)` → `{error: "no_fit", suggestion: "RR is fixed at 7 rounds..."}`. Lexicographic: lex tiebreak is sideout > rally before target.
- **Deps:** 7.

**9. `pickCrownPreset(budgetMin, calibration)` → preset name or error**
- Pure function. Four presets in order. Returns name or `{error: "crown_floor"}` for budget < 90.
- **Verify:** `pickCrownPreset(105, null)` → "Sprint". `pickCrownPreset(60, null)` → `{error: "crown_floor"}`. `pickCrownPreset(170, null)` → "Standard".
- **Deps:** 7.

**10. `projectFinishTime(state, calibration, nowTs)` → `[tsLow, tsHigh]`**
- Pure function. Sum elapsed actual durations (minus `pauseSec`); add estimates for remaining rounds + T_finals + T_setup_overhead.
- **Verify:** Fresh tournament, `projectFinishTime(state, null, T)` ≈ `[T + low_estimate, T + high_estimate]`. Mid-tournament with one round done, returns adjusted window.
- **Deps:** 7.

**11. Self-tests for Group B**
- Read: `1071` (existing `runSelfTests`).
- Snapshot tests against spec tables. Cover lexicographic ordering edge cases (sideout/9/wb2 beats rally/21/wb2).
- **Verify:** `?test` URL param shows zero new failures.
- **Deps:** 6, 7, 8, 9, 10.

### Group C — Setup-time UX

**12. Setup screen: Time Budget block layout (visual only)**
- Read: `3226-3279` (`renderSetup()`).
- Insert block above format chooser. Toggle, dropdown, computed read-out, projected finish, confidence labels. No state mutations yet.
- **Verify:** Setup screen renders the new block. No existing setup behavior broken.
- **Deps:** 1.

**13. Settings modal: Time Budget section layout (visual only)**
- Read: `5607-5728` (`openSettings()`), insert before "Display & TV".
- Same controls as task 12.
- **Verify:** Opening settings shows the section.
- **Deps:** 1.

**14. Time Budget state wiring (setup + settings)**
- Read: handlers in tasks 12, 13. Also `4261` (quick-fill pill), `5661-5673` (manual winScore dropdown).
- Wire toggle, dropdown. On change, call `solveWinCondition()` (task 8) or `pickCrownPreset()` (task 9). Populate `plannedConfig`. Mirror to `state.winScore`/`winBy`/`scoringSystem` when enabled. Hide manual winScore dropdown when enabled. Quick-fill pill reads `plannedConfig.target` when enabled.
- **Verify:** Toggle on with 90-min RR → manual dropdown hidden, computed read-out shows "side-out to 11, win by 2", state mirrored. Quick-fill uses computed target.
- **Deps:** 8, 9, 12, 13.

**15. Setup-time edge cases: tight-budget banner, no-fit, Crown floor, rally acknowledgment**
- Read: same as task 14.
- Render yellow banner on `error: "no_fit_..."` fallback (not impossible, just tight). Disable start button on truly impossible. Filter Crown time options to ≥90 min. Show one-time rally acknowledgment dialog on first rally selection (persist `rallyAcknowledged: true`).
- **Verify:** Budget=30, format=King-9 → start disabled, banner shown. Budget=60 + Crown → 60 not in dropdown. First rally pick → dialog appears; second pick on same device → no dialog.
- **Deps:** 14.

**16. Lock controls after start**
- Read: `5689-5725` (existing pattern for round-count lock).
- Once `state.phase != "setup"`, disable Time Budget toggle and minutes dropdown with tooltip. Auto-tighten checkbox stays enabled.
- **Verify:** After `startTournament`, both fields disabled with "Locked — set before starting" tooltip.
- **Deps:** 14.

### Group D — In-event UX

**17. Header: projected-finish strip + pace badge**
- Read: `2970-3008` (`render()`, `renderHeader()`).
- When `timeBudget.enabled` and phase is "playing", render strip with window from `projectFinishTime()` + pace classification. Recalculates each `render()` call (once per round complete).
- **Verify:** Strip appears, hidden when disabled. Fresh tournament shows "on pace". TV display also renders the strip.
- **Deps:** 1, 10.

**18. Court card: live elapsed-time badge**
- Read: `4205-4253` (`renderCourtCard()`).
- For unfinished games (`gameStartedAt` set, `gameEndedAt` null), show elapsed badge updating once per second via setInterval. Cleared on game completion. Excludes `pauseSec`.
- **Verify:** Badge shows `0:00` on load, increments. Disappears when scored. Sleep test: simulated 10-min gap doesn't add 10 min to badge.
- **Deps:** 3, 5.

### Group E — Dynamic adjustment

**19. Slippage detection + tightening prompt**
- Read: `2889-2910` (`maybeFireRoundComplete`).
- After round complete: warmup guard, cap check, projection. If "running long" and tighter combo exists: fire blocking modal `[Tighten] [Stay the course]`. On Tighten: re-solve with budget_remaining, write `plannedConfig`, append to `adjustments[]`.
- **Verify:** With elapsed > 110% projection at round 3 of 7, modal appears. Round 1 doesn't fire (warmup guard). After 3 adjustments, no more modals.
- **Deps:** 8, 10, 14.

**20. Auto-tighten with persistent undo**
- Read: same as 19, plus settings checkbox handler from task 14.
- When `autoTighten` is on: skip modal, apply tightening, show 30-sec toast `[Undo]`. After 30 sec, collapse to header `↻ Undo` chip until next round complete.
- **Verify:** With auto-tighten on and slippage detected: no modal. Toast appears. Click Undo: prior config restored, adjustment count decremented.
- **Deps:** 19.

**21. Cap-reached state in header**
- Read: task 17 (renderHeader).
- When `adjustments.length >= 3`, header pace shows "exhausted" with tooltip. No further prompts.
- **Verify:** After 3rd adjustment, no further prompts; header indicator changes; tooltip explains.
- **Deps:** 19.

### Group F — Crown integration

**22. Crown setup: preset selection + apply at tournament start**
- Read: task 14 (settings handlers), `2691` (`startTournament` Crown branch), `1063-1068` (`CROWN_THEMES`).
- When budget enabled and format is Crown: call `pickCrownPreset()` (task 9), display preset name in setup. On `startTournament`, build matches with the preset's win conditions (write to `crownActiveThemes`).
- **Verify:** 105-min budget + Crown → "Sprint" shown. Tournament starts with Sprint configs.
- **Deps:** 9, 14.

**23. Crown mid-event preset jumping**
- Read: `2519-2555` (Crown validation), `3546-3792` (Crown render), task 19 (slippage hook).
- After Crown match complete, run slippage check. If running long and not Sprint: write next-tighter preset to `crownActiveThemes` for un-played match indices only. `isValidCrownGameScore()` and Crown rendering must check `crownActiveThemes` before falling back to `CROWN_THEMES`.
- **Verify:** After Crown match 1 runs long, match 2's win condition tightens. Match 1's validation still uses original config.
- **Deps:** 9, 19, 22.

### Group G — Calibration loop

**24. Calibration: blend `pb_durations_v1` into `points_per_minute`**
- Read: task 6 (where to add the blend function), tasks 8, 9, 10 (call sites).
- Compute per-scoring-system blended `points_per_minute` from log: simple avg until 5 samples, then EMA α=0.15. Cap deviation ±50%. Persist to `pb_calibration_v1`. Pass calibration through every solver call site.
- **Verify:** After 5+ logged side-out games, `pb_calibration_v1` populated. `solveWinCondition` output differs from defaults-only path. <5 games → defaults still used.
- **Deps:** 4, 6, 7, 8, 9, 10.

**25. Calibration: confidence read-out in setup & settings**
- Read: tasks 12, 13.
- Replace static "using defaults" with live read of `pb_durations_v1` length and `pb_calibration_v1` state.
- **Verify:** 3 games logged → "Using defaults — 3 games logged (need 5)". 12 games → "Using your last 12 games."
- **Deps:** 24.

### Task summary

| Group | Tasks | Description | Total est. effort |
|---|---|---|---|
| A | 1–5 | State / data foundations | ~3 hrs |
| B | 6–11 | Algorithm pure functions + tests | ~3 hrs |
| C | 12–16 | Setup-time UX | ~3 hrs |
| D | 17–18 | In-event display | ~1.5 hrs |
| E | 19–21 | Dynamic adjustment | ~2 hrs |
| F | 22–23 | Crown integration | ~2 hrs |
| G | 24–25 | Calibration loop | ~1 hr |

Suggested execution order: A → B → C → D → E → F → G. Tasks within each group execute in numeric order.

**Context budget per task:** every task's "Read" section names ≤500 lines. Sonnet should never need to read all 6K lines of `pickleball.html` for any single task.

---

## Open Questions

None for v1.

## Out of scope (for v1)

- Variable court count (3+ courts).
- Per-player time accounting.
- Calendar/external time integration ("start at 7 pm, finish by 9 pm").
- Sharing duration data across users / global calibration.
- Audible time warnings.
- Mid-game adjustment (we adjust between rounds, not within a game).
- Multiple calibration profiles per device (e.g., "Tuesday rec" vs. "Saturday competitive").
- User-overridable finals win condition.
- Richer mid-event Crown adjustment (compressing Crown Match itself, or compressing already-running matches).
- Stack mid-event win-by override.
