# Rumble Pickleball — Dogfood Report (v57 → v58): Large Fields

Focus: stress-test big-club tournaments — **12–32 players across 3–8 courts**, 3+ end-to-end runs per format, hunting scale-specific bugs/perf/UX. Driven through the real UI (Playwright) plus the `?simulate` harness and a read-only scale-audit pass.

## Headline finding
The app was **hard-capped at 24 players / 6 courts** in ~16 places. The goal's range (up to 32 players / 8 courts) was unsupported. So the core work was: prove the scheduling algorithms hold at scale, then **raise the caps to 32 / 8** and make the rendering (court colors, finals tiers) scale with them.

## Coverage (what was actually played)
| Format | Live end-to-end runs (players/courts) | Result |
|---|---|---|
| Round Robin | 32/8 (full, screenshots), 20/5, 16/4 | ✅ champions, 0 undefined |
| Stack | 28/7, 24/6, 12/3 | ✅ champions, 0 undefined |
| King of the Court | 32/8, 16/4, 12/3 | ✅ champions, 0 undefined |
| Gauntlet | 30/7 (byes), 24/6, 12/3 | ✅ champions, 0 undefined |
| Crown Court | 4/1 (fixed format — confirmed unaffected by cap changes) | ✅ |
| `?simulate` (added 8 high-count configs) | RR 32/8, RR 28/6 byes, RR 24/8 idle-courts, Stack 28/7, King 32/8, Gauntlet 30/7 byes, Mixed RR 24/6, RR 20/5 churn | ✅ 20 tournaments, **0 failures** |

**12 clean live end-to-end runs** (3+ per scalable format) + 20 simulate tournaments. Performance measured: scoring 12 rounds × 8 courts = **270 ms**; 32-player champions render = **18 ms**.

## What Worked Well
- **The scheduling/standings algorithms already scale.** Before raising any UI cap, I added high-count configs to `?simulate` and they verified clean (0 failures) at 32/8, 28/6 byes, 24/8 idle-courts, churn, and mixed. The 24/6 cap was purely a UI limit, not an algorithmic one.
- **The court grid is already responsive.** `.court-row` is an auto-fit grid — on a laptop/tablet the 8 courts lay out in a compact 2–3 column grid (no endless scroll); on phones they stack. Organizers running 8 courts on a laptop get a scannable board for free.
- **Everything that scales by data scaled correctly:** byes ("Sitting this round: G21, G30"), the 32-row Live Standings, the **8-tier finals** (Championship → … → Slate → Clay, each on its own court, balanced pairings), the 32-player Champions screen (real placement stats, full tiered Final Standings, awards), all with **zero "undefined"**.
- **Performance is excellent** even at the maximum field — no jank scoring or rendering.

## Bugs Found (all fixed in v58)
All were latent caps/assumptions that would break *when* the field exceeded the old limit:
1. **🔴 `courtIdentity()` clamped court number to 6** — courts 7–8 were silently mapped to "Court 6" (label, color class, accent). Raised to 8.
2. **🔴 `FINAL_TIER_NAMES` had only 6 entries** — at 8 courts the 7th/8th finals tiers rendered `name: undefined`. Added "Slate" + "Clay" (and a defensive `Tier N` fallback). Verified live: 8 tiers render with names.
3. **🔴 Court color tokens stopped at `--court6`** — courts 7–8 had no border/label/chip color. Added `--court7` (red) + `--court8` (lime) and extended all 5 enumerated style blocks (`.court-card`, `.court-label`, `.history-game .court-tag`, `.partner-chip`, `.schedule-game .court-tag`). Verified live: Court 7 red, Court 8 lime.
4. **🔴 16 hard-coded caps (24 players / 6 courts)** across validation, clamps, steppers, number inputs, mid-event add buttons, state backfill, and help text. Raised consistently to **32 / 8**; updated the two cap self-tests and added a positive "accepts 32-player RR / 8 courts" assertion.

## Pain Points (smaller)
- **Desktop Live Standings truncates long names at 32 players** — with the desktop-only W%/+/–G columns and the 680px table cap, long names ("Player 17") clip to "Player 1…". Pre-existing density behavior, not scale-introduced; ordinary first names fit. Not changed (out of scope / surgical).
- **The start "draw" animation takes ~3–4 s for a 32-player field** (more slots to reveal). It's intentional anticipation, not jank.

## Missing Features (none blocking)
- The large-field support itself was the missing feature — now implemented.

## Suggested Improvements (prioritized)
1. *(Shipped in v58)* Raise caps to 32/8 + scale the court palette and finals tiers.
2. *(Shipped in v58)* New `?simulate` coverage at 25–32 players / 7–8 courts so the scale is regression-guarded by the harness.
3. *(Shipped in v58)* New visual baseline `playing-32p-8c` locking the 8-court colors + 32-row standings.
4. Future: a denser/optional compact standings layout for 24+ players on desktop (the only mild scale-pain left).

## Post-Dogfood Assessment
**Confidence: 9 / 10.**
- All four scalable formats complete end-to-end at the new maximum (and across the 12–32 / 3–8 range) with correct schedules, byes, 8-tier finals, full standings, awards, and zero "undefined"; standings/scheduling are independently verified by 20 simulate tournaments (8 at the new scale, 0 failures); the four scale bugs are fixed and re-verified live with screenshots; self-tests (incl. a new 32/8 acceptance test), boundary check, and 14 visual baselines (incl. a new large-field one) are green; performance at 32/8 is excellent.

**Remaining risks:**
- Desktop standings name density at 32 players (cosmetic, pre-existing).
- Mid-tournament *court-count changes* on 7–8-court ladder events (Stack/King) weren't each driven through the UI; fixed-court play at scale is verified, churn is verified at 5 courts, but not every 7–8-court churn permutation.
- The huge fields are verified with synthetic uniform scores; pathological real-world score patterns (many ties, walkovers) at 32 players weren't exhaustively driven.
