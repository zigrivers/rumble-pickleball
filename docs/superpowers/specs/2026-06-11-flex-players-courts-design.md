# Flexible Players & Courts — Design Spec

**Date:** 2026-06-11
**Status:** Approved design, pending implementation
**Implementer:** Codex GPT 5.5 (see companion implementation plan in `docs/superpowers/plans/`)

## 1. Overview

Rumble today is hardwired to **exactly 8 players on exactly 2 courts** (Crown Court: exactly 4 players on 1 court). This enhancement generalizes the app to:

- **4–24 players** on **1–6 courts** (default 2) for Round Robin, Stack, King of the Court, and Gauntlet.
- **Byes**: when active players exceed court capacity (`N > 4 × courts`), the surplus sits out each round. Byes are spread fairly (rules in §5).
- **Mid-tournament roster changes**: players may join late or leave early.
- **Per-game-average standings** so unequal games played (byes, late joins) never distort rankings.
- **Tiered finals** for all four non-Crown formats (RR, Stack, King, Gauntlet share one finals path) that scale with players and courts.

**Non-goals:**

- Crown Court stays exactly 4 players / 1 court. No changes to its match flow, themes, or scoring.
- No singles play, no uneven team sizes — every game is doubles (2v2).
- No scheduling across multiple sessions/days.

**Constraint:** the app remains a single-file vanilla-JS PWA — all changes land in `index.html` (plus an `sw.js` cache-version bump and a `guide.html` doc update). No build step, no new files.

## 2. Requirements summary (as agreed)

| # | Requirement |
|---|---|
| R1 | RR, Stack, King, Gauntlet support 4–24 players and 1–6 courts. Crown unchanged (exactly 4 players). |
| R2 | Court count is organizer-configurable, default 2, editable mid-event (applies from the next round). |
| R3 | Byes per round = `activeN − 4 × activeCourts` where `activeCourts = min(courtCount, floor(activeN / 4))`. |
| R4 | Bye fairness: RR/Gauntlet use strict even rotation; King/Stack use "losers sit" with a cap. Raw bye-count spread ≤ 1 is guaranteed for churn-free events (both policies); under roster churn a raw-count bound is unattainable, so fairness is governed by `byeRate`, the no-consecutive-sits rule, and the newcomer shield (§5.2). |
| R5 | Standings rank by per-game averages (points/game, win rate, diff/game), not raw totals. |
| R6 | Finals (shared by RR, Stack, King, Gauntlet — `buildFinals` is one code path today): tiered groups of 4 by the format's own season rank (Championship, Consolation, Bronze, …) up to available courts; everyone beyond the seated tiers — partial-tier leftovers *and* players beyond court capacity (e.g. 16 of 24 on 2 courts) — takes their season rank. |
| R7 | Players can join or leave mid-tournament; changes take effect at the next round boundary. |
| R8 | The existing 8-player/2-court Round Robin experience is preserved exactly (the `Wh(8)` whist schedule and today's standings ordering). |

## 3. Data model — state v5

New `STORAGE_KEY` version `v5`; `load()` migrates v4 (and older, via the existing chain) forward.

### 3.1 New / changed fields

```js
{
  phase: "setup" | "playing" | "finals" | "crown" | "done",
  format: "rr" | "stack" | "king" | "gauntlet" | "crown",
  courtCount: 2,            // 1..6; organizer-set; editable mid-event
  scheduleSeed: 123456789,  // PRNG seed fixed at Start; all schedule generation is seeded

  // Setup-phase roster (pre-shuffle), dynamic length 4..24:
  rawNames:  ["", ...],
  rawPhones: ["", ...],

  // Post-Start roster. Index = slot - 1. Slots are stable and append-only:
  // a late joiner gets slot N+1; a departed player keeps slot and history.
  // The 24-player cap applies to ACTIVE players; total slots may exceed 24
  // over a churny event (e.g. slot 25 replaces a departed player in a full
  // 24-active roster). All per-slot arrays (tiebreakRandom, previousRanks)
  // simply grow with the slot count.
  players: [
    { slot: 1, name: "Ava", phone: "",
      status: "active" | "left",
      eligibleFromRound: 1,  // set on join AND on every return; drives
                             // next-round eligibility and isNewThisRound
      joinedRound: 1,        // display metadata ("joined R5")
      leftRound: null },     // display metadata ("left after R5")
  ],
  // NOTE: joinedRound/leftRound are DISPLAY metadata only and hold the most
  // recent values. They are deliberately not an eligibility log: historical
  // eligibility is derived from round participation (a slot was eligible in a
  // past round iff it appears in that round's games ∪ byes — §5), which stays
  // correct through any leave/return sequence without interval bookkeeping.

  rounds: [
    { round: 3,
      games: [               // replaces hardcoded court1/court2 keys
        { court: 1,          // 1-based court number, 1 = top court in ladders
          team1: [1, 2], team2: [3, 4],
          score1: null, score2: null,
          gameStartedAt, gameEndedAt, pauseSec },
      ],
      byes: [9, 10],         // slots sitting this round (may be empty)
    },
  ],

  finals: {                  // replaces { championship, consolation }; null until finals
    tiers: [                 // index 0 = top tier; one game per tier
      { name: "Championship", court: 1, team1, team2,
        score1, score2, gameStartedAt, gameEndedAt, pauseSec },
      { name: "Consolation",  court: 2, ... },
    ],
    unseated: [17, 18],      // all active slots not seated in a tier, by season rank
  },

  rrRounds: 7,               // NEW: RR round count (4..12), only used off the golden path
  rrScheduleMode: "wh8" | "generated",  // NEW: computed ONCE at Start for RR from the
                             // setup config ("wh8" iff 8 players AND courtCount === 2 at
                             // that moment — setup-phase editing before Start never
                             // matters); flips to "generated" permanently on any
                             // MID-EVENT (post-Start) roster or court-count change —
                             // never back, even if the config returns to 8/2. All
                             // golden-path checks read this flag, never re-derive
                             // from current N/courts.
  stackRounds, kingRounds, gauntletRounds,   // unchanged semantics
  tiebreakRandom: [...],     // length N; on join, the new slot's index is inserted
                             // at a seeded-random position
  previousRanks: [...],      // length N where used
}
```

### 3.2 Migration v4 → v5 (mechanical)

- `slots[]`/`phones[]` → `players[]` (all `status:"active"`, `eligibleFromRound:1`, `joinedRound:1`, `leftRound:null`). **Crown exception:** v4 Crown states pad `slots` to 8 with only the first 4 real — migrate only slots 1–4 to `players[]` (4 entries, satisfying Crown's exactly-4 rule); never create blank active players.
- `rawNames[]`/`rawPhones[]` and `tiebreakRandom[]` carry over verbatim (all exist in v4; `tiebreakRandom` is length 8 there and only grows later via joins) — a save in the `setup` phase must surface its roster on the setup screen unchanged after migration.
- Each round: `court1` → `games[0]` with `court:1`; `court2` → `games[1]` with `court:2`; `byes: []`.
- `finals.championship` → `tiers[0]` (`name:"Championship"`, `court:1`); `finals.consolation` → `tiers[1]` (`name:"Consolation"`, `court:2`); `unseated: []`.
- Add `courtCount: 2`, `rrRounds: 7`, `scheduleSeed` (random), and `rrScheduleMode: "wh8"` for RR states (every v4 RR tournament is 8/2 by definition; other formats get `"generated"`, unused).
- Crown states migrate the shared fields only; `crownMatches`/`crownFinal`/`currentMatch` are untouched.
- A mid-tournament v4 save in any format/phase must resume seamlessly as v5. `backfillStateDefaults` gains the v5 defaults.

### 3.3 Accessors (single seam for the renderer/stats)

`nameOf(slot)` / `phoneOf(slot)` read from `players[]`. New helpers:

- `activeSlots(round)` — for a **past** round: slots appearing in that round's `games` ∪ `byes` (participation-derived, exact under any churn history). For the **next round being built**: slots with `status === "active"` and `eligibleFromRound ≤ round`.
- `gamesOf(roundObj)` — `roundObj.games` (sorted by `court`).
- `byesOf(roundObj)` — `roundObj.byes`.
- `playerCount()` — `players.length`; `activeCount()` — current actives.

All rendering, stats, history, and text-results code goes through these instead of touching `court1`/`court2`/`slots` directly.

## 4. Round shape

Computed at every round boundary from the *current* active roster and court count:

```
activeCourts = min(state.courtCount, floor(activeN / 4))
playing      = 4 × activeCourts
byesNeeded   = activeN − playing
```

Examples: 10 players / 2 courts → 8 play, 2 sit. 13 / 3 → 12 play, 1 sits. 10 / 6 → 2 courts used, 2 sit. 24 / 2 → 8 play, 16 sit (legal; see setup warning §9.1).

`activeN < 4` is invalid: departures that would drop actives below 4 are blocked in the UI (§8.2).

## 5. Bye allocator

One shared function; two policies. All randomness is seeded (`scheduleSeed`-derived PRNG).

Per-player inputs are **derived from round history, not stored counters** (this stays correct through any join/leave/return sequence with zero interval bookkeeping):

- `roundsEligible(slot)` = number of prior rounds where the slot appears in `games` ∪ `byes`.
- `byeCount(slot)` = number of prior rounds where the slot appears in `byes`.
- `byeRate(slot)` = `byeCount / max(1, roundsEligible)`.
- `lastByeRound(slot)` = most recent round where the slot appears in `byes` (none → −∞).
- `playedSinceLastBye(slot)` = number of eligible rounds since `lastByeRound` (never sat → all of the player's eligible rounds).
- `isNewThisRound(slot)` = `eligibleFromRound === the round being built`. Because `eligibleFromRound` is reset on every return, this protects both first-time joiners **and** returning players (whose prior history would otherwise disqualify a participation-derived check).

### 5.1 Policy `rotation` (RR, Gauntlet; also round 1 of King/Stack)

Pick the `byesNeeded` sitters by:

1. Lowest `byeRate` first (rate, not raw count, keeps late joiners proportionally fair).
2. Tie → highest `playedSinceLastBye` (a veteran who has played 5 rounds without sitting outranks a newcomer who has played 1 — plain "longest since last bye" would tie all never-sat players together).
3. Tie → seeded random.

**Hard constraints** (relaxed only when the remaining pool is smaller than `byesNeeded`, in this order: consecutive-sits first, newcomer shield last — mirroring §5.2, where the newcomer shield is also the strongest protection):

1. A player who sat the previous round is excluded. (Unavoidable only when more than half the actives sit each round, e.g. 24 players on 2 courts — then the rate ordering alone governs.)
2. A player with `isNewThisRound` (just joined or returned) is excluded — newcomers play their first round, they don't sit it. Without this rule a joiner's `byeRate` of 0 would make them the *first* pick to sit.

### 5.2 Policy `losersSitCapped` (King, Stack — rounds 2+)

Candidate order (first eligible candidates take the byes):

1. Losers of the previous round, bottom court first, then ascending toward the top court.
2. If more sitters are needed: winners, bottom court first.
3. If still more: the previous round's bye players.
4. Last resort: players with `isNewThisRound` (just joined/returned — they should play, not sit).

**Full candidate sort order** (court position is the primary key inside groups 1–2, not a tie-breaker): `(group asc, court desc — bottom court first, applies to groups 1–2 only, byeRate asc, playedSinceLastBye desc, seeded random)`. Fully deterministic under the seed: e.g. all bottom-court losers precede all next-court-up losers regardless of `byeRate`; among the two bottom-court losers, lower `byeRate` sits first.

**Protections applied across groups 1–3** (each relaxed, in this order, only if the pool would otherwise fall short of `byesNeeded`):

- *Newcomer shield:* `isNewThisRound` players are excluded from groups 1–3. (The cap below needs no separate new-player exclusion: its longest-tenured baseline already ignores low-eligibility players.)
- *No consecutive sits:* a player who sat the previous round is excluded from groups 1–3 (hard exclusion, like the newcomer shield), so nobody ever takes back-to-back byes while alternatives exist.
- *Cap:* skip any candidate whose resulting `byeCount` would exceed `minByeCount + 1`, where `minByeCount = min(byeCount among actives whose roundsEligible === max(roundsEligible among actives))` — the baseline comes only from the longest-tenured players. A late joiner's raw `byeCount` of 0 must never drag the baseline down (that would cap-skip every veteran and force the joiner to sit every other round — the trap exists both in their shielded first round *and* in every round after). The max is always attained by someone, so the set is non-empty even when every active is a recent joiner (then max eligibility is simply low); on round 1 it yields 0.

If the protections together exhaust the pool, relax them in reverse order (cap → consecutive → newcomer shield); after each relaxation, selection continues **in the same full candidate sort order above** (the relaxed protection simply stops filtering — no alternative ordering kicks in). The groups cover every active player, so `byesNeeded` is always satisfiable.

**Fairness bound:** in a churn-free tournament the cap guarantees bye-count spread ≤ 1. Under roster churn a raw-count bound is unattainable (a round-6 joiner can never "catch up" to three earlier byes), so fairness is rate-governed: within-group `byeRate` ordering plus the consecutive-sit protection bound each player's sitting proportionally to their eligibility. Tests assert the raw bound churn-free and the rate/consecutive properties under churn (§11).

Round 1 (no results yet) falls back to `rotation`.

## 6. Scheduling per format

All generation uses the seeded PRNG so regeneration (roster/court changes) and tests are reproducible.

### 6.1 Round Robin

**Golden path (R8):** `rrScheduleMode === "wh8"` (set at Start iff exactly 8 players and `courtCount === 2`; flipped to `"generated"` permanently by any roster or court-count change — §3.1) → use the `Wh(8)` whist table exactly as today (shuffled slot assignment, 7 fixed rounds, schedule preview, whist invariants). `rrRounds` is forced to 7 and the rounds selector is hidden. The flag, not the current configuration, is authoritative: changing courts to 1 and back to 2 mid-event does **not** re-enter the golden path.

**Generalized path (anything else):**

- The full schedule (all `rrRounds` rounds) is generated at Start so the Schedule preview keeps working.
- Per round: assign byes (`rotation`), then form courts/teams from the playing set by minimizing

  ```
  roundCost = Σ over courts [ Σ partner-pairs 10·partnerCount(a,b)² + Σ opponent-pairs 1·opponentCount(a,b)² ]
  ```

  where `partnerCount`/`opponentCount` accumulate across all prior rounds (played + already-generated). Squared penalties spread repeats evenly rather than letting one pair repeat three times.
- **Recency constraint:** partnering the same player as in one's immediately previous *played* round adds a large penalty (+1000 per such pair) — effectively a hard ban on consecutive repeat partners, matching the test invariant. A penalty (rather than a structural constraint) guarantees generation always completes: in any pathological corner the search degrades to a costed repeat instead of failing to produce a round.
- Search: randomized greedy with improvement — seeded-shuffle the playing set into courts of 4; pick each court's team split (3 possibilities) by cost; then repeatedly try swapping any two players across teams/courts, accepting any swap that lowers `roundCost`, until no improvement; ~60 restarts per round, keep the best. (N ≤ 24 → milliseconds.)
- **Regeneration:** any roster change, court-count change, or leaving the golden path regenerates *future rounds only* — every round after the current (possibly in-progress) round. Cost counts are rebuilt from **all rounds up to and including the current round** (its pairings are real on-court facts even if scores aren't in yet), so round k+1 never duplicates round k's pairings. Rounds up to and including the current one are never modified.
- **Determinism:** each round is generated with a round-specific PRNG stream seeded from `(scheduleSeed, roundNumber)` (e.g. `mulberry32(scheduleSeed ^ roundNumber * 0x9E3779B9)`), so regenerating round k+1 later yields the same result regardless of how many rounds were generated in the same session.
- `rrRounds` selector: 4–12, default 7 (shown only off the golden path; changeable until Start).

### 6.2 Ladder formats (King of the Court, Stack)

Courts 1…C form a ladder (court 1 = King's/Top Court). Building round *k+1* from round *k*:

1. **Targets:** winners target `max(1, court − 1)`; losers target `court + 1` (clamped to the new bottom); players who sat round *k* — and reactivated players returning from any number of missed rounds — target **the court they last played** (clamped into the new range) — a system-mandated bye must not demote a top-court player to the bottom. Just-joined players (no court history at all) target the bottom court. In the common case the two rules coincide: under `losersSitCapped` the sitters are almost always bottom-court losers, whose last-played court *is* the bottom.
2. **Byes:** allocate via `losersSitCapped` (§5.2).
3. **Fill — two passes** (so returners can never displace winners/losers and break movement invariants):
   - **Pass 1 — movers:** place last round's winners and losers (non-sitters) **directly into their target court's seats** — no sequential compaction. A bye vacancy on court 1 must NOT pull a court-1 loser back into court 1; movers sit exactly where their movement rule says, and vacancies stay open for pass 2. With a stable court count no target court ever exceeds 4 movers (≤2 winners from below or staying + ≤2 losers from above or staying, top/bottom clamps included), so winners never end below their previous court and losers never end above it — by construction. Only a court-count change can make targets pile up; then overflow (lowest `(priority asc, seeded random)` last) spills to the nearest court below with free seats (then above, bottom/top-clamped).
   - **Pass 2 — returners & joiners:** place bye-returners into remaining free seats nearest their target (last-played court, clamped), and just-joined players bottom-up. Pass 2 only consumes seats pass 1 left free, so it can shift a returner relative to their target, but never a mover.

   At 8/2 with no byes this reproduces today's movement exactly. Movement invariants (winners never down, losers never up) are tested on stable-court-count rounds; across a court-count change they are best-effort under clamping (§8.3).
4. **Pairing per court:** King → seeded-random re-pair (as today). Stack → rank 1+4 vs 2+3 by stack score with the existing repeat-partner-breaking swap, per court (today's `pairForStackCourt`, unchanged logic).

Round 1: seeded shuffle of actives; byes via `rotation`; courts filled randomly (as today's initial assignment).

If `activeCourts` changes between rounds (roster/court change), targets are clamped into the new range before filling.

**Stack scoring generalization** (`stackScoreGain`): point multiplier scales linearly from ×1.5 on court 1 to ×1.0 on the bottom court:

```
multiplier(court, C) = C === 1 ? 1 : 1 + 0.5 × (C − court) / (C − 1)
gain = pts × multiplier + (won ? 3 : 0) + (won && court > 1 ? 2 : 0)   // +2 = climb bonus
```

At C = 2 this reproduces today's numbers exactly (court 1 → 1.5×, court 2 → 1.0×, +2 for a court-2 win).

**Historical immutability:** `computeStackStats` evaluates each past round's multiplier with **that round's own court count** (`gamesOf(r).length`), never the current `state.courtCount` — a mid-event court-count change must not retroactively rescore games already played.

**King Score** stays `wins + pointsScored + topCourtWins` (top court = court 1), ranked per game (§7).

### 6.3 Gauntlet

Each round: re-rank all actives (per-game averages, §7) → byes via `rotation` (bye history governs — any rank can sit) → the remaining players, **in rank order**, fill blocks of four: best block = court 1 pairing #1+#4 vs #2+#3 (block-relative ranks), next block = court 2, etc. Direct generalization of today's rule. Round 1 ranks by `tiebreakRandom` as today.

### 6.4 Finals — tiered (R6; all four formats)

Finals are built by the **shared** `buildFinals`, which today serves RR, Stack, King, *and* Gauntlet, seeding from each format's own ranking (`rankPlayersForFormat`). Tiered finals therefore generalize identically for all four formats — "season rank" below means the format's own ranking (RR/Gauntlet averages, Stack score rate, King score rate; §7). At finals time, seed **active** players by season rank into tiers of 4, one tier per court, `tierCount = min(courtCount, floor(activeAtFinals / 4))`:

- Tier names, top down: **Championship, Consolation, Bronze, Copper, Iron, Stone** (max 6 tiers at 6 courts). Stored `tiers[].name` values are these plain strings; emoji (🏆 🥈 🥉) are added at render time only — tests and migration fixtures compare plain names.
- Within each tier: #1+#4 vs #2+#3 (today's balanced pairing), playing on court = tier index + 1.
- `unseated` = **all actives not seated in a tier**: exactly `activeAtFinals − tierCount × 4` players, the lowest-ranked ones. (This covers both partial-tier leftovers and court-capacity overflow — e.g. 8 actives on 1 court seats 4 and unseats 4 even though `8 mod 4 = 0`.)
- **Final standings order:** tier 1 winners → tier 1 losers → tier 2 winners → … → last tier losers → unseated actives by season rank → departed players by season rank (greyed, "left after R*n*"). Within each group, season rank breaks order (today's rule, now average-based). **While a tier's game is still undecided** (standings viewed mid-finals), that tier's 4 players are grouped together in the tier's slot, ordered by pre-finals season rank — no winner/loser split is computed from an undecided game.

Finals require ≥ 4 actives and ≥ 1 court; with fewer than 8 actives there is simply one tier.

## 7. Standings — per-game averages (R5)

`gamesPlayed(slot)` = decided games the player appeared in. All comparators switch from totals to rates:

| Format | Ranking order |
|---|---|
| RR / Gauntlet | `avgPoints = points/GP` → `winRate = wins/GP` → `avgDiff = diff/GP` → head-to-head (2-way ties only, as today) → `tiebreakRandom` |
| Stack | `stackScore/GP` → `tiebreakRandom` |
| King | `kingScore/GP` → `tiebreakRandom` |

- **Pre-comparator rule:** any player with `GP = 0` ranks below every player with `GP > 0`, regardless of rates; among themselves, `GP = 0` players order by `tiebreakRandom`. (Without this rule a no-game player's `avgDiff` of 0 would beat a played player's negative `avgDiff`.) **Implementation note:** evaluate this rule *before* computing any rate, and compute rates as `value / Math.max(1, GP)` — never bare division — so a `GP = 0` player can never inject `NaN` into the comparator and break sort transitivity.
- **Ranking-order rationale (intentional, do not "fix"):** `avgPoints` ranks ahead of `winRate`, mirroring today's totals comparator (points → wins → diff). Points-first is this app's documented scoring philosophy ("points decide the seeds" — every rally matters even in a blowout), and reordering would break the golden-path equivalence requirement (R8) by changing existing 8/2 standings.
- **Equivalence invariant:** when every player has equal `GP` (8/2, no byes, no roster changes), average ordering is identical to total ordering — golden-path standings are unchanged.
- UI: standings gain a **GP** column; value columns show per-game numbers to 1 decimal. Awards and text-results consume the same rates (award heuristics that count raw events, e.g. one-point games, keep counting raw events).
- H2H between two tied players uses their actual head-to-head games, as today.

## 8. Mid-tournament roster changes (R7)

**One rule: changes take effect at the next round boundary.** The in-progress round is never rebuilt. UI labels say "Takes effect next round."

### 8.1 Join

Settings → Manage Players → Add: name (+ optional phone) → new slot `N+1`, `status:"active"`, `eligibleFromRound = joinedRound = next round`. `tiebreakRandom` gets the new index inserted at a seeded-random position. Effects:

- RR: future rounds regenerate (§6.1); golden path (if applicable) is permanently exited.
- Ladders: enters next round targeting the bottom court (priority 2).
- Gauntlet: enters the re-rank pool (GP 0 → bottom initially).
- Bye fairness: `roundsEligible` is derived from actual prior round participation (`games` ∪ `byes`, §5) — `eligibleFromRound` only gates future eligibility and `isNewThisRound`; `joinedRound` stays display-only. The rate-based allocator handles proportional sitting.

### 8.2 Leave / return

Mark as left: `status:"left"`, `leftRound = current round`. Excluded from all future rounds; history and per-game-average standing remain; standings show them greyed with "left after R*n*." A left player can be re-activated: `status:"active"`, `eligibleFromRound = next round`, `leftRound = null` (cleared so the UI drops the stale "left after R*n*" label; the `eligibleFromRound` reset is what makes `isNewThisRound` protect returners, §5). No interval bookkeeping is needed: bye-fairness inputs and historical eligibility are derived from actual round participation (§5, §3.3), so any join/leave/return sequence is handled automatically; `joinedRound`/`leftRound` are display metadata only.

**Guards:** actives may not drop below 4; **active** players may not exceed 24 (total slots may — §3.1); names unique (existing rule); **Crown format: Manage Players is disabled entirely** (exactly-4 invariant — no joins, no departures); **Manage Players is available only during the `playing` phase** — disabled in `finals` and `done` (there are no future regular rounds to regenerate; setup has its own roster UI). If a departing player is in the current unfinished round, the organizer finishes or zero-scores that game; the engine only reacts from the next round.

### 8.3 Court-count change mid-event

Settings → Courts (1–6): applies from the next round; RR regenerates future rounds; ladders clamp targets into the new range (§6.2).

## 9. UX changes

### 9.1 Setup screen

- **Courts stepper** (1–6, default 2) beside the format chooser.
- **Dynamic roster:** starts at 8 rows; "+ Add player" to 24; row removal down to 4. Quick-fill and paste-roster adapt to N.
- **Live fit line** under the chooser: e.g. "10 players · 2 courts → 8 play, 2 sit out each round." Soft warning when more than a third of players would sit (e.g. "⚠️ 16 of 24 sit each round — consider more courts").
- Validation: flexible formats 4–24 players; Crown requires exactly 4 players and the courts stepper is disabled while Crown is selected (Crown always plays its single court — multi-court UI never renders for it). RR rounds selector (4–12, default 7) appears only off the golden path.

### 9.2 Playing screen

- Court cards render from `games[]`: responsive grid (1 column phone, 2 columns tablet, 3 columns TV at 5–6 courts). Court accent palette extends to 6 colors; ladder top-court treatments (gold styling) stay on court 1.
- **Bye banner** above the courts: "☕ Sitting this round: Ava, Sam — back next round."
- Round completes when **all active courts** are decided. Movement toasts generalize ("Ava & Sam climb to Court 2").
- History lists every game per round plus a byes line. Schedule preview (RR) shows byes per round.
- Text standings / text results include GP and per-game averages; byes noted.

### 9.3 Help / rules

`RULES_*` content updated to describe byes, per-game averages, tiered finals, and court count. `guide.html` gains a "More players & courts" section.

## 10. Time budget integration

- `estimateRoundMinutes` consumes **`activeCourts`** (courts actually used, §4) — not the configured `courtCount`, which may exceed what the roster can fill (10 players with 6 configured courts still play on 2). Slowest-court variance: 1 court ×1.00, 2 ×1.15, 3–4 ×1.20, 5–6 ×1.25.
- Finals = one round (tiers run in parallel), as today.
- `getTimeBudgetRounds()`: RR returns `rrRounds` (7 on the golden path).
- Solver/presets/projections otherwise unchanged — they just take the parameter.

## 11. Testing

The inline harnesses are the safety net: `?test` (unit asserts; baseline = exactly 1 known keep-awake failure) and `?simulate` (full-tournament simulations; must be 0 failures).

1. **Golden-path regression:** all existing self-tests pass; 8/2 RR still yields exact `Wh(8)` invariants (every pair partners once, opposes twice, 14 distinct foursomes) and standings ordering identical to v4 totals.
2. **Migration:** mid-tournament v4 fixtures for every format/phase load as v5 and resume (fixtures converted via the migration function itself).
3. **Bye fairness (simulated across seeds × configs):** churn-free → max bye-count spread ≤ 1 under both policies; under churn → no back-to-back byes unless unavoidable, newly joined/returned players never sit their first eligible round unless unavoidable, and per-player `byeRate` stays within the proportional bounds of §5.2; `GP = 0` players always rank below played players.
4. **Pairing quality (RR generalized):** no repeated partners in consecutive **played** rounds (the recency penalty keys on each player's immediately previous played round, §6.1; degenerate configs like 4 actives excepted); no pair partners 3+ times while some pair has never partnered, across simulated configs.
5. **Ladder invariants with byes:** winners never move down a court; losers never move up; a bye-returner re-enters at their last-played court (clamped); at 8/2, movement is bit-identical to today's builders.
6. **Average-ranking equivalence:** equal GP → ordering identical to totals-based ranking.
7. **Roster churn simulation:** random joins/leaves/court-changes mid-event across formats → no crashes, fairness bounds hold relative to eligibility, final standings well-formed (every slot appears exactly once).
8. **Stack scoring:** `multiplier(1, 2) = 1.5`, `multiplier(2, 2) = 1.0`; generalized gains match today's at C=2.

## 12. Rollout

- `sw.js` cache version bump so installed PWAs pick up the change.
- `guide.html` update (§9.3).
- No data loss: v4 saves migrate in place; a v5 rollback is not supported (forward-only, consistent with prior versions).
