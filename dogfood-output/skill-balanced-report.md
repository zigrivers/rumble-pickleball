# Skill-Balanced Pairing Dogfood Report

**Date:** 2026-06-29
**Tester:** AI (automated browser session via agent-browser)
**Scenario:** 12-player Round Robin (6 Advanced + 6 Social), 3 courts, 10 full rounds played end-to-end through finals and championship. Plus edge-case testing with lopsided 8A+4S and 7A+3S rosters.

---

## What Worked Well

### Core feature: skill-balanced pairing ✓

**All 30 games across 10 rounds produced 100% mixed (A+S) teams.** Every team showed the A·S badge. The scheduler paired across skill levels exactly as intended.

### Partner variety ✓

Every player partnered with **all 6 players** from the other group across 10 rounds. With 6 possible partners and 10 games, repeats are mathematically forced (need at least 10 partner slots, have 6). The scheduler correctly cycled through all 6 before repeating, with max repeat count of 2-3.

### Opponent diversity ✓

Max opponent count was 3 across 10 games — no player faced any opponent more than 3 times out of 10.

### Label propagation across all surfaces ✓

| Surface | Displayed correctly? | Example |
|---|---|---|
| Preset dropdown | ✓ | "Advanced / Social" selected |
| Per-player toggles | ✓ | "A" / "S" buttons |
| Team badges on court | ✓ | "A·S" next to each team |
| Bye banner tally | ✓ | "1 Advanced · 1 Social" |
| Unequal-groups warning | ✓ | "7 Advanced / 3 Social: some same-group teams needed" |
| "Why?" explanation | ✓ | "Rumble pairs across groups (1 Advanced + 1 Social)" |
| Custom dropdown display | ✓ | "Custom (Pro / Rookie)" |

### Finals bracket mixed-aware ✓

All 6 finals teams (Championship, Consolation, Bronze) were mixed (A+S). The finals pairing fix works correctly for skill labels just as it does for gender labels.

### Tournament completion ✓

Full end-to-end: setup → 10 rounds scored → finals bracket built → finals scored → champion crowned. Champion: Soc3 & Adv5. No crashes, no JS errors in console.

### Lopsided roster fallback (8A+4S) ✓

With 8 Advanced + 4 Social on 3 courts: 4 mixed teams (A+S) + 2 same-group teams (A+A). All 4 Social players placed on mixed courts. The "Why?" button correctly explained the same-group fallback using skill labels.

### Preset switching ✓

Switched between Men/Women, Advanced/Social, and Custom labels in the UI. All surfaces relabeled instantly. Detection correctly showed "Custom (Pro / Rookie)" when custom labels were set.

---

## Pain Points

### 1. `rrScheduleMode` not set correctly on programmatic setup

**Severity: Minor (affects test scripting, not real users)**

When I set up the tournament via `eval` without going through `startTournament()`, `rrScheduleMode` defaulted to `"wh8"` (the 8-player special case) even for 12 players on 3 courts. This caused `totalRegularRounds()` to return 7 instead of 10, blocking the "Build Finals" button. Setting `rrScheduleMode = "generated"` fixed it. Real users won't hit this — `startTournament()` sets the mode correctly — but it's a state-invariant gap.

### 2. Partner repetition is mathematically forced with 10 rounds

With 6 possible cross-group partners and 10 games, each player must repeat at least 4 partners. The scheduler distributes repeats evenly (most ×2, a few ×3), but some players (e.g., Adv2 repeated Soc1 ×3) may notice the repetition. This is not a bug — it's a mathematical constraint — but a social group running 10+ rounds with only 6 in each group will feel the repetition.

---

## Bugs Found

### None remaining.

The hardcoded "same-gender" text and "Why?" explanation were fixed during implementation. The `rrScheduleMode` issue is a scripting artifact, not a user-facing bug.

---

## Missing Features

None blocking. The feature delivers on its goal: one-tap skill balancing that works identically to mixed doubles with different labels.

---

## Suggested Improvements

1. **Partner variety stat in recap.** Show "You partnered with 6/6 Social players across 10 rounds" so players know they got maximum variety despite repeats.

2. **Preset persistence across tournaments.** Remember the last-used preset when starting a new tournament (currently resets to Men/Women default each time).

3. **"How many do I need?" guidance.** When selecting Advanced/Social, a hint: "For best results, aim for equal counts in each group. With 6+6, everyone partners everyone. With 8+4, some same-group teams are unavoidable."

---

## Post-Dogfood Assessment

**Confidence Score: 9/10**

The feature works correctly end-to-end. All 30 games were mixed across 10 rounds. Every surface uses the correct vocabulary. The preset dropdown is intuitive — select "Advanced / Social" and the entire app speaks skill-balancing. The lopsided fallback works with correct explanations.

**What held it back from 10/10:**
- The `rrScheduleMode` scripting issue (minor, doesn't affect real users)
- Partner repetition at 10 rounds is mathematically unavoidable but could feel repetitive (not a code issue)
- Custom labels could use better default suggestions (e.g., "A / B Club", "Experienced / New")

**Remaining risks:**
- **Skill distribution skew.** Social groups often have far more beginners than advanced players. The lopsided fallback handles it, but the experience degrades (many same-group teams). The unequal-groups warning helps set expectations.
- **Label semantics.** "Advanced" and "Social" are subjective — different groups will disagree on who belongs where. This is a social problem, not a technical one.

**What would move this to 10/10:**
- A human user running a real skill-balanced night and confirming pairings feel fair
- Preset persistence across tournaments
