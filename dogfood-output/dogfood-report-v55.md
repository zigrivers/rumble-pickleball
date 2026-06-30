# Rumble Pickleball — Dogfood Report (v54 → v55)

End-to-end dogfooding of the live app driven through the real UI (Playwright, 390px iPhone viewport — the primary courtside surface), plus the built-in `?simulate` harness and three read-only code-audit passes. Every format was taken from setup → scoring → champions.

## Coverage (what was actually played, not theorized)
| Format | How it was exercised | Result |
|---|---|---|
| Round Robin (8p/2c) | Full **manual** playthrough: paste names → format → timing → start → 7 rounds typed scores → Build Finals → Championship + Consolation → Crown Champions | ✅ Pass |
| RR **MLP mixed** + skip-championship | Mixed mode on, 4 Men/4 Women assigned, verified Round 1 produced all-mixed teams, 7 rounds → "Finish & Crown Champions" (no finals) | ✅ Pass |
| Stack (8p/2c, 8 rounds) | Full playthrough → finals → champions | ✅ Pass (found BUG-3) |
| King of the Court (8p/2c, 9 rounds) | Full playthrough → finals → champions | ✅ Pass (found BUG-3) |
| Gauntlet (8p/2c, 8 rounds) | Full playthrough → finals → champions | ✅ Pass (clean) |
| Crown Court (4p, 3 best-of-3 + crown match) | Full playthrough → champions | ✅ Pass (found BUG-3) |
| Persistence | Reloaded mid-state and on the champions screen | ✅ Restores correctly, 0 console errors |
| `?simulate` harness | 60+ seeded tournaments across all formats + churn configs | ✅ 0 failures |

## What Worked Well
- **The whole tournament loop is genuinely solid.** Scheduling, partner rotation, winner detection, movement (climb/drop), standings math, tiers, championship/consolation brackets, and the awards engine were correct in every format. The `?simulate` harness independently confirms the standings logic across many seeds.
- **Premium finale.** The Champions screen (crown, medals, 1st–4th cards, tiered Final Standings, and the rich Tournament Awards grid: MVP, Biggest Win, Closest Game, Hot/Cold Streak, The Wall, Most Improved, Got Stomped, Best Duo) is legitimately high-end.
- **Score entry UX** — winners get an instant green highlight, checkmark, and a "🎉 win by N" banner. Clear and satisfying.
- **Safety rails** — "Start new tournament? This clears all scores and names." confirm before destructive reset; per-round live timers; Undo chip.
- **MLP mixed mode** — clean group-assignment UI (Mixed Doubles Rules, M/W buttons, editable labels, per-round Mixed/Same-gender toggles, Skip championship) and the pairing math is correct (verified all teams 1M+1W live).
- **State persistence** is reliable — reload mid-tournament restores the exact phase with no console errors.

## Bugs Found (all fixed in v55)
1. **🔴 BUG-3 — "undefined" on the celebration screen (Stack / King / Crown).** The 1st–4th place cards read RR-style stat fields, but other formats expose different fields. Live evidence: Stack showed "Points **undefined** pts"; King showed Record "5–**undefined**" + "undefined pts"; Crown showed Record "**undefined–undefined**" (8 `undefined` strings on the finale). **Fix:** Crown reads `gamesWon`/`gamesLost`; Stack/King read `pointsScored`; King derives losses as `gp − wins`. Locked with a new self-test; re-verified live (Crown finale now 0 undefined, real "Match Pts 13.5 mp / Record 4–2").
2. **🔴 BUG-1 — Mobile setup bottom bar collapsed.** When the "review the Format & Timing tabs" tip was present, its long text (in the same flex column as the Start button) expanded the right column, crushing the event summary into one word per line ("8 / Players / · / Round / Robin"), clipping the tip off-screen ("…and 'Timi"), and pushing **Start Tournament out of the viewport** on iPhone-width screens. **Fix:** restructured the bar into a clean summary+Start top row with the tip on its own full-width row below.
3. **🔴 BUG-2/4 — Live Standings names truncated to one letter on phones.** `table-layout:fixed` split the row into equal columns, starving the name column to ~47px so "Sofia" rendered as "S…", partner chips clipped, the header collided ("PLAYERGP"), and W–L wrapped to two lines. **Fix:** content-based column sizing on ≤480px + smaller stat font; full names and partner chips now display, stats stay compact.

## Pain Points (smaller friction)
- **Mixed-mode roster rows are cramped on 390px** — with name + phone + M + W + trash in one row, the name input shows ~4 chars ("Marc") and phone shows "Phon". Editable but tight. *(Documented; not yet changed — see Suggested Improvements.)*
- **"Build Finals" / "Time projection" labels** are slightly jargony; the projection value is actually the estimated **finish window**, labeled generically.
- **Finals "Seeds" grid** right column ("0.9 AM · GP 7 …") clips on narrow screens.

## Missing Features (observed gaps — none blocking)
- No in-app way to **export/share final standings as an image/file** beyond Share Cards / QR Snapshot (these exist and work).
- No **per-game undo of an individual score** surfaced prominently (Undo chip handles round-level).
- These are nice-to-haves; the core product is feature-complete for running an event.

## Suggested Improvements (prioritized)
1. *(Shipped in v55)* The three bug fixes above — highest impact, all on the most-used mobile surface.
2. **Mixed-mode roster rows:** on ≤480px, stack the phone field under the name (or hide it) when M/W group buttons are shown, so names aren't squeezed.
3. **Clarify the projection label** to "Est. finish" for untimed events.
4. **Add a mobile-width visual-regression baseline for the standings table** — the current baselines run at desktop width, so the mobile truncation bug had no snapshot guarding it.

## Verified audit leads (lower priority, not changed — surgical scope)
- **save() failure is swallowed** (localStorage quota): in-memory phase advances before `save()`; if the write throws (rare, storage full), a reload shows the pre-advance phase. Edge case; worth a defensive toast later.
- **Court rename mid-tournament isn't undoable** (minor consistency gap).
- **`?simulate` has no Mixed-RR-8/2 config**, and the flexible-scenario init uses the Wh(8) schedule without checking mixed mode (test-harness only; production `startTournament` correctly checks `!mixedMode`).

## v57 Follow-up — remaining findings addressed
After the v56 bug-fix ship, the rest of this report was worked through:

**Fixed & shipped in v57:**
- ✅ Pain Point — **mixed-mode roster rows cramped**: the name now takes its own full-width line on phones (verified live: "Marcus/Hannah/Mei" fully readable; phone + M/W + remove on a second line).
- ✅ Pain Point / Suggested #3 — **projection label**: untimed events now read **"Est. finish"** instead of a bare "Untimed".
- ✅ Pain Point — **Finals "Seeds" grid clipping**: seeds stack one-per-row on phones and the name ellipsizes before the stats, so "0.5 AM · GP 7" + "Why?" never clip (verified live).
- ✅ Suggested #4 — **mobile-width standings visual baseline** added (`playing-mobile-standings`), guarding the BUG-2 fix at 390px.
- ✅ Audit lead — **save() failure now warns** once via toast (perceived-data-loss path).
- ✅ Audit lead — **Mixed-RR-8/2 simulate coverage** added + flexible-scenario Wh(8)/mixed guard fixed (matches production).

**Deliberately deferred (rationale):**
- ⏭️ Audit lead — **court-rename undo**: a correct implementation needs focus-snapshot/commit-debounce on a text field (every keystroke would otherwise pollute the undo stack). Cosmetic, easily retyped — not worth the undo-system risk. Skipped per simplicity/surgical rules.
- ⏭️ Missing feature — **export standings as image**: already covered by the existing **Share Cards** + **QR Snapshot** actions.
- ⏭️ Missing feature — **per-game individual score undo**: round-level Undo + "Edit Final Scores" already provide recovery; a per-game undo is a larger feature with marginal added value.

## Post-Dogfood Assessment
**Confidence: 8.5 / 10.**
- All 5 formats + the MLP mixed/skip-championship variant complete cleanly end-to-end through the real UI; standings logic is independently verified across 60+ seeded tournaments; the three user-visible bugs found are fixed, two with re-verified live screenshots and one with a new locked self-test; all 12 visual baselines and the boundary/self-test/simulate suites stay green.

**Remaining risks (after v57):**
- Mobile-standings rendering relies on content-based sizing; an *extreme* name length could still wrap awkwardly — now partially guarded by the new `playing-mobile-standings` baseline (short-name fixture; very long names aren't stress-tested by a snapshot yet).
- The `save()`-quota path now warns the user, but the in-memory state still advances ahead of the failed write — a reload after a failed save would still show the last successfully-saved phase. The warning mitigates the surprise; it doesn't recover the unsaved step.
- Deep audit leads on ladder formats under *mid-tournament court-count changes* (Stack/King) were not reproduced through the UI; the simulate harness covers fixed-court play but not every churn permutation.
- Court renames mid-tournament remain non-undoable by design (see deferred list above).
