# Flexible Players & Courts — Implementation Plan (Codex Handoff)

> **For the implementing agent (Codex GPT 5.5):** Work strictly task-by-task, in order — later phases depend on earlier ones. Each task is TDD: write the listed asserts first, watch them fail, implement, watch them pass, commit. Steps use checkbox (`- [ ]`) syntax for tracking. Do not skip verification steps. Do not start a later phase while an earlier phase's verification fails.

**Goal:** Generalize Rumble from a fixed 8-player/2-court app to 4–24 players on 1–6 courts, with fair bye scheduling, per-game-average standings, mid-tournament join/leave, and tiered RR finals — while keeping the existing 8-player/2-court experience bit-identical.

**Spec (source of truth for every algorithm and rule):** `docs/superpowers/specs/2026-06-11-flex-players-courts-design.md`. Section references below (e.g. "§5.2") point there. Where this plan and the spec disagree, the spec wins.

**Architecture:** Everything lands in the single self-contained `index.html` (plus `sw.js` cache bump and a `guide.html` section at the end). No build step, no new source files. Phases: (1) state v5 + accessors, (2) pure refactor to `games[]`/`byes[]`, (3) seeded PRNG + bye allocator, (4) RR pairing engine, (5) ladder generalization, (6) Gauntlet, (7) average standings, (8) tiered finals, (9) setup UX, (10) mid-event roster UI, (11) time budget, (12) docs/rollout.

**Tech stack:** Vanilla JS, no dependencies. Verification via `python3 -m http.server` + agent-browser (or any headless browser that surfaces the console).

**Conventions:**
- Run all commands from repo root: `cd "$(git rev-parse --show-toplevel)"`.
- Serve: `python3 -m http.server 8765 --bind 127.0.0.1 -d . &`
- Self-tests: open `http://localhost:8765/index.html?test`. **Baseline is exactly 1 failure** (pre-existing keep-awake headless artifact). Every task must end back at 1.
- Simulations: open `http://localhost:8765/index.html?simulate`. **Must report 0 failures.**
- Existing helpers you will reuse: `el(tag, attrs, ...children)`, `showToast(text)`, `teamName(team)`, `nameOf(slot)`, `shuffle(arr)`, `isGameDecided(game)`, `isRoundDecided(r)`, `computeStats`, `rankPlayers`, `finalRanking`, `totalRegularRounds`, `backfillStateDefaults`, `load`/`save`.
- Commit after every task with the message given; end every commit body with the project's standard co-author line if other commits in `git log` carry one.

---

## Phase 1 — State v5, migration, accessors

### Task 1.1: v5 state shape + migration

**Anchor:** `function newState()` and `function backfillStateDefaults(obj)`; storage keys near `const STORAGE_KEY`.

- [x] Tests first (inside `runSelfTests()`, before the `[self-tests] complete` log — same pattern as existing task blocks): build a representative **v4** mid-tournament state object for each format (`rr` playing R3, `stack`, `king`, `gauntlet`, `crown`, plus an `rr` state in `finals` phase), run it through the migration, and assert:
  - **Old-key migration:** write a v4 fixture under the current v4 storage key, call `load()`, and assert the migrated v5 state is returned, persisted under the new v5 key, and the v4 key is handled like prior migrations handle theirs (follow the existing v3→v4 chain's key-handling convention). An implementation that migrates objects but never reads the old key must fail this test — without it, existing users' tournaments would vanish on upgrade.
  - Non-Crown fixtures: `players.length === 8`, every `players[i]` has `slot === i+1`, `status === "active"`, `eligibleFromRound === 1`, `joinedRound === 1`, `leftRound === null`, names/phones carried over from `slots`/`phones`.
  - each round has `games` (length 2, `court` 1 and 2, teams/scores/timestamps identical to the old `court1`/`court2`) and `byes: []`.
  - finals migrated to `tiers` (`[0].name === "Championship"`, `[1].name === "Consolation"`) and `unseated: []`.
  - `courtCount === 2`, `rrRounds === 7`, `Number.isInteger(scheduleSeed)`; RR states get `rrScheduleMode === "wh8"`.
  - `rawNames`/`rawPhones` carried over verbatim (a `setup`-phase v4 save keeps its roster on the setup screen).
  - crown state: **`players.length === 4`** (v4 Crown pads `slots` to 8 with 4 real players — migrate only the real 4, never blank actives); `crownMatches`/`crownFinal`/`currentMatch` untouched.
- [x] Implement per spec §3.1–§3.2: bump storage key to v5, add `migrateV4toV5(obj)` called from `load()` (keep the existing v1→…→v4 chain feeding into it), extend `newState()` and `backfillStateDefaults` with the v5 fields. **Do not change any rendering or game logic yet.** Transitional compatibility (removed in Task 2.2): migration retains `court1`/`court2` properties referencing the *same objects* as `games[0]`/`games[1]`, and `gamesOf(r)` synthesizes `[court1, court2]` when `r.games` is absent — because until Task 2.2 the round **builders** still emit `court1`/`court2`-only rounds for newly started tournaments. `backfillStateDefaults` normalizes any such round into `games[]` form on load.
- [x] Verify `?test` = 1 failure, `?simulate` = 0 failures, and a manual smoke: start an 8-player RR, play a round, reload.
- [x] Commit: `feat(state): v5 state shape — players[], games[]/byes[], courtCount, scheduleSeed + v4 migration`

### Task 1.2: Accessors + roster writers

- [x] Tests: `startTournament` (all five formats) populates `players[]` from the shuffled roster — names/phones match the old `slots[]`/`phones[]` content, `status:"active"`, `eligibleFromRound:1` — and "New Tournament"/reset clears it (a fresh tournament started after this task must render names correctly with `nameOf` reading `players[]`); `activeSlots(round)` per spec §3.3 — for **past** rounds derived purely from participation (`games` ∪ `byes`; `joinedRound`/`leftRound` are display-only and must NOT drive this), for the **next** round from `status === "active"` and `eligibleFromRound ≤ round`; `gamesOf`/`byesOf`/`playerCount`/`activeCount` per spec §3.3; `nameOf`/`phoneOf` read from `players[]`.
- [x] Implement near `nameOf`. Convert the roster **writers** first (`startTournament` and any reset path fill `players[]` alongside the legacy `slots[]`/`phones[]`, which Phase 9 retires), then convert `nameOf`/`phoneOf` internals to read `players[]`; leave all other call sites alone.
- [x] Verify; commit: `feat(state): roster/round accessors (activeSlots, gamesOf, byesOf)`

## Phase 2 — Pure refactor: all reads go through `games[]`/`byes[]`

**No behavior change in this phase.** 8/2 tournaments must look and act identical before/after.

### Task 2.1: Stats & logic readers

- [x] Mechanically convert every `r.court1` / `r.court2` read in **logic** code (`computeStats`, `computeStackStats`, `computeKingStats`, `rankPlayers*`, `isRoundDecided`, h2h, awards, text-results builders, time-budget projections) to iterate `gamesOf(r)`. Loops over `[1, 2]` court keys become loops over games. Keep all assert names passing.
- [x] Verify `?test` (1 failure) + `?simulate` (0).
- [x] Commit: `refactor: stats/logic read rounds via games[] instead of court1/court2`

### Task 2.2: Builders + renderer

- [ ] Convert round **builders** (`generateRounds`, `assignInitialStackCourts`, `buildNextStackRound`, `assignInitialKingCourts`, `buildNextKingRound`, `buildGauntletPairing`, finals construction) to emit `{round, games:[...], byes:[]}`. Convert the playing screen, history, schedule modal, finals screen, and toasts to render from `games[]` (still exactly 2 cards at this point). Delete the Task 1.1 transitional shims — the `court1`/`court2` retention, the `gamesOf` synthesis fallback, and the backfill normalization of builder-emitted legacy rounds. After this task, `court1`/`court2` references may remain **only** in `migrateV4toV5` and its migration fixtures/tests (legacy keys are the migration's input format, permanently) and in CSS class names like `.court-card.c1`; grep must show none in runtime builders, renderers, or stats.
- [ ] Verify `?test` + `?simulate` + manual smoke of all five formats (start, play a round, check history/standings).
- [ ] Commit: `refactor: builders and renderer emit/consume games[] rounds`

## Phase 3 — Seeded PRNG + bye allocator (pure functions)

### Task 3.1: Seeded PRNG

- [ ] Tests: `mulberry32(seed)` determinism (same seed → same sequence); `seededShuffle(arr, rng)` is a permutation and deterministic under a fixed seed.
- [ ] Implement near `shuffle`. `scheduleSeed` is set once in `startTournament`.
- [ ] Commit: `feat(core): seeded PRNG + seededShuffle for reproducible scheduling`

### Task 3.2: Bye history derivation + allocator

- [ ] Tests (drive with synthetic `rounds` fixtures, no UI):
  - `byeStatsFor(slot)` derived from round participation per spec §5 (eligible = appears in `games`∪`byes`; works through join/leave/return without stored counters); `isNewThisRound` from `eligibleFromRound`, covering returners; `playedSinceLastBye` tiebreak (veteran-without-bye outranks newcomer).
  - `rotation` policy: spread ≤ 1 over any (N∈4..24, C∈1..6, rounds≤12) churn-free simulation; no back-to-back byes unless unavoidable; `isNewThisRound` players never sit unless unavoidable (spec §5.1 hard constraints).
  - `losersSitCapped`: candidate group order + within-group ordering per §5.2; the three protections (newcomer shield, hard no-consecutive-sits exclusion, cap with `minByeCount` taken **only over longest-tenured actives**) and their relaxation order; churn-free spread ≤ 1; the §5.2 late-joiner trap in the shielded first round **and in the second/later eligible rounds** (a joiner's byeCount 0 must never drag the cap baseline down, cap-skip veterans, and force the joiner to sit every other round); pool always satisfies `byesNeeded`; falls back to `rotation` on round 1.
  - Round shape math per §4 (`activeCourts`, `byesNeeded`) including degenerate cases (24 players / 2 courts).
- [ ] Implement `allocateByes(policy, context)` + helpers as pure functions per §4–§5.
- [ ] Commit: `feat(core): bye allocator — rotation & losersSitCapped policies`

## Phase 4 — Round Robin generalized

### Task 4.1: Pairing engine

- [ ] Tests: cost function values on hand-built histories (partner repeat = 10·n², opponent = 1·n², +1000 consecutive-partner recency penalty, §6.1); generated round has each playing slot exactly once; determinism under seed; simulated quality invariants — no repeat partners in consecutive **played** rounds (per spec §6.1 the recency penalty keys on each player's immediately previous *played* round, so a pair separated by a bye may legally re-partner; degenerate 4-active configs excepted), no pair partnered 3+ times while another pair never partnered (across N∈{5,9,10,13,16,24}, C∈{1,2,3,6}, seeds×5).
- [ ] Implement `generateRRSchedule(actives, courtCount, roundsWanted, history, rng)` per §6.1 (randomized greedy, 3-way team split, swap improvement, ~60 restarts/round).
- [ ] Commit: `feat(rr): cost-minimizing pairing engine for arbitrary N/courts`

### Task 4.2: Golden path + integration

- [ ] Tests: `rrScheduleMode` computed once at Start from the setup config — `"wh8"` iff 8 players AND 2 courts at that moment (toggling courts 2→1→2 **during setup, before Start** still yields `"wh8"`), and `startTournament` consumes the `Wh(8)` `SCHEDULE` (existing whist invariant tests keep passing untouched); the flag flips to `"generated"` on any **mid-event (post-Start)** roster or court-count change and never flips back (mid-event courts 2→1→2: still `"generated"`); off the golden path the generated schedule is used and `rrRounds` (4–12, default 7) governs length; schedule preview shows byes per round.
- [ ] Wire into `startTournament`/`generateRounds`; add `rrRounds` selector in the format chooser (hidden on golden path).
- [ ] Verify `?test` + `?simulate`, plus a **programmatic** 10-player/2-court RR smoke: construct the state via a test helper (the setup UI for >8 players doesn't exist until Phase 9), render the playing screen, and assert the bye banner ("☕ Sitting this round: …" per §9.2) and playable courts. The manual UI smoke for flexible rosters happens in Phase 9.
- [ ] Commit: `feat(rr): flexible players/courts with byes; Wh(8) golden path preserved`

## Phase 5 — Ladders (King, Stack)

### Task 5.1: Generalized ladder movement

- [ ] Tests: **two-pass fill** per §6.2 — pass 1 places winners/losers (movement invariants hold by construction on stable court counts), pass 2 places returners/joiners only into free seats (a returner can never displace a mover); at 8/2, output matches today's `buildNextKingRound`/`buildNextStackRound` exactly (fixture comparison); winners never move down / losers never move up across simulated stable-court-count configs; bye returners land at or nearest their last-played court (new joiners bottom-up); court-count change clamps targets with spill-down-then-up overflow.
- [ ] Implement `buildNextLadderRound(prevRound, format)` replacing both format-specific builders; round 1 = seeded shuffle + `rotation` byes.
- [ ] Commit: `feat(ladder): C-court ladder movement with losersSitCapped byes (king+stack)`

### Task 5.2: Stack scoring generalization

- [ ] Tests: `stackMultiplier(court, C)` per §6.2 — `(1,2)→1.5`, `(2,2)→1.0`, `(1,1)→1`, linear interior values for C=4; `stackScoreGain` reproduces today's outputs at C=2 (reuse existing assert fixtures); climb bonus on any court > 1.
- [ ] Implement; update `computeStackStats` for N players / C courts.
- [ ] Verify + commit: `feat(stack): court-scaled score multiplier for C courts`

## Phase 6 — Gauntlet

- [ ] Tests: per §6.3 at N=10/C=2 — byes chosen by the `rotation` policy (bye history, NOT rank: any rank can sit), then the remaining 8 players, in rank order, fill blocks of four (best 4 → court 1 as #1+#4 vs #2+#3, next 4 → court 2); round 1 ranks by `tiebreakRandom`.
- [ ] Generalize `buildGauntletPairing` to N/C.
- [ ] Verify + commit: `feat(gauntlet): rank-block pairing for arbitrary N/courts`

## Phase 7 — Per-game-average standings

- [ ] Tests: comparator order per §7 table; **pre-comparator**: GP=0 ranks below all GP>0 (construct the avgDiff-0-vs-negative trap case); **equivalence**: random equal-GP tournaments rank identically under totals and averages (this keeps golden-path standings unchanged — do NOT reorder avgPoints/winRate, see §7 rationale); king/stack rates.
- [ ] Convert `rankPlayers`, `rankPlayersStack`, `rankPlayersKing` to rates; add GP column + 1-decimal per-game values to standings, awards, and text-results/text-standings builders (byes noted in texts).
- [ ] Verify `?test` + `?simulate` + manual standings check.
- [ ] Commit: `feat(standings): per-game-average ranking with GP column`

## Phase 8 — Tiered finals (all four formats)

- [ ] Tests: tier construction per §6.4 — `buildFinals` stays ONE shared code path seeding from `rankPlayersForFormat` (RR, Stack, King, Gauntlet all get tiered finals from their own ranking); `tierCount = min(courtCount, floor(activeAtFinals/4))`; seat `tierCount×4`, rest unseated; #1+#4 vs #2+#3 within tier; stored names plain Championship/Consolation/Bronze/Copper/Iron/Stone (emoji render-time only); final-standings order tiers → unseated by season rank → departed (greyed); 8/2 case identical to today for every format.
- [ ] Implement finals builder + finals screen rendering from `tiers[]`; update `finalRanking`.
- [ ] Verify + commit: `feat(finals): tiered finals scaled to players/courts`

## Phase 9 — Setup UX

- [ ] Courts stepper (1–6, default 2), dynamic roster rows (4–24, quick-fill/paste adapt), live fit line + ">⅓ sitting" warning, per-format validation (Crown: exactly 4 players AND the courts stepper disabled/ignored — Crown always plays its single court, never render multi-court UI for it), per §9.1. Court accent palette extended to 6 (CSS); responsive court-card grid (1/2/3 columns per §9.2).
- [ ] Tests where logic is pure (fit-line text builder, validation predicate); manual visual verification for layout at 1, 2, 3, 6 courts.
- [ ] Verify + commit: `feat(setup): court count + dynamic roster with fit line and byes warning`

## Phase 10 — Mid-event roster management

- [ ] Tests: join (slot N+1, active-cap 24, `tiebreakRandom` insertion, next-round effect, RR future-round regeneration, golden-path exit); leave (≥4 actives guard, greyed standings, departed in final ranking); return; court-count change mid-event (§8.1–§8.3). Churn simulation: random joins/leaves/court changes across formats × seeds → no crashes, fairness bounds hold, every slot appears exactly once in final standings.
- [ ] Implement Manage Players UI (Settings) + `regenerateFutureRounds()`.
- [ ] Verify `?test` + `?simulate` + manual churn session.
- [ ] Commit: `feat(roster): mid-tournament join/leave/return + court-count changes`

## Phase 11 — Time budget

- [ ] Tests: `estimateRoundMinutes` uses `activeCourts` (10 players/6 courts → 2-court variance) with the §10 variance table; `getTimeBudgetRounds()` returns `rrRounds` off golden path, 7 on it.
- [ ] Implement; verify; commit: `feat(time-budget): activeCourts-aware estimates`

## Phase 12 — Docs, rollout, final sweep

- [ ] Update `RULES_*` strings (byes, averages, tiers, courts), add "More players & courts" to `guide.html`, bump `sw.js` cache version.
- [ ] Extend `runSimulation` to randomized (N, C, format, churn) configs if not already done in Phase 10.
- [ ] Full verification: `?test` = exactly 1 failure; `?simulate` = 0 failures; manual pass of all five formats including a 10-player/2-court and a 13-player/3-court event.
- [ ] Commit: `feat: flexible players & courts — docs, sw bump, final verification`

---

## Acceptance checklist (mirror of spec §11)

- [ ] Golden path: 8/2 RR uses Wh(8); standings, finals, and movement bit-identical to v4 behavior.
- [ ] v4 saves (all formats, mid-tournament) resume as v5.
- [ ] Bye spread ≤ 1 (both policies, churn-free); newcomers never sit first round unless unavoidable; no back-to-back byes unless unavoidable.
- [ ] RR pairing quality invariants hold across simulated configs.
- [ ] Ladder movement invariants hold with byes.
- [ ] Equal GP ⇒ average ranking ≡ totals ranking; GP=0 ranks last.
- [ ] Roster churn simulation clean.
- [ ] `?test` baseline 1 failure; `?simulate` 0 failures.
