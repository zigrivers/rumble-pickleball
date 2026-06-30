# Dogfood Session Notes (v54 → next)

Running log of issues found while using the app as an end user. Severity: 🔴 bug / 🟠 friction / 🟡 polish / 🟢 missing-feature.

## Findings

### 🔴 BUG-1: Mobile sticky setup bar layout collapses (root-caused)
- **Where:** `index.html` `.setup-bottom-bar` render (~14150) + CSS (~975, ~1308). Hint at 11454-11465.
- **Repro:** Load app on a 390px-wide phone (iPhone 12–15). On Format/Timing tabs (before both tabs reviewed), the `#start-hint` "👉 Recommended: Review the 'Format' and 'Timing & Rules' tabs…" lives inside `.setup-bottom-bar-right` (`flex: 0 0 auto`). The long hint text expands the right column to its natural width, crushing the `.setup-bottom-summary` (`flex:1`) to ~1 word per line ("8 / Players / · / Round / Robin …") and overflowing the hint off-screen (clipped "…and 'Timi"). The Start button is pushed out of the viewport.
- **Severity:** 🔴 High — primary CTA (Start Tournament) and summary are unreadable/unreachable on the most common phone width.
- **Fix idea:** Move the hint OUT of the right column. Make the bar a column on mobile: top row = [summary (flex:1) | Start button], second full-width row = hint (wraps). Constrain hint width so it never overflows.

### 🔴 BUG-2: Live Standings player names truncated to a single initial on mobile
- **Where:** Round screen "Live Standings" table (`#`, `PLAYER`, `GP`, `AM`, `W–L`).
- **Repro:** On 390px phone, in-round standings show names as "S…", "D…", "H…", "Li…", "M…", "T…", "P…" — only 3-char "Wei" fits. The partner indicator ("→ Ta", "→ Li") is also clipped. Caused by fixed-width GP/AM/W–L columns + medal icon squeezing the PLAYER column.
- **Severity:** 🔴 High — you literally cannot tell who is winning; the standings table is the core live feature.
- **Fix idea:** Reflow the stats table on narrow screens (e.g. drop/secondary the AM column, tighten GP/W–L, give PLAYER min-width, allow 2-line name+partner). Consider a card/row layout on mobile.

### 🟡 POLISH-1: "Est. finish" label clarity
- Review & Start "TIME PROJECTION ~4:42pm–5:54pm" is actually the *finish window*; label as "Est. finish" to avoid confusion with start time (3:15pm).

### 🟡 POLISH-2: Finals "Seeds" grid right column clipped
- On Finals screen, the seed rows' right column ("0.9 AM · GP 7 (…") overflows/clips on 390px. Tighten or wrap.

## RR end-to-end: ✅ PASS (8p/2court)
Setup → format → timing → start → reveal → 7 rounds scored → Build Finals → Championship + Consolation → Crown Champions → premium Champions/Awards screen. Winner detection, movement, standings math, tiers, awards all correct. Only the two CSS/layout bugs above mar it.

### 🔴 BUG-3: "Points undefined pts" on placement cards (non-RR formats)
- **Where:** Champions screen 1st–4th place cards (the v50 detailed stats table).
- **Repro:** Finish a **Stack** tournament → place cards show "Points **undefined** pts" for all of 1st–4th. (RR shows real "65 pts".) Likely Stack/King/Gauntlet players lack the `points`/total field the card reads.
- **Severity:** 🔴 High — literal "undefined" shown to the user on the celebratory finale screen.
- **Fix idea:** Compute/format points safely per format (fallback when total points not tracked, or use the format's native metric). Hunt the place-card render.

### 🔴 BUG-4: Live Standings header columns collide ("PLAYERGP")
- **Where:** Round-screen Live Standings header on 390px.
- **Repro:** Stack round screen header renders "PLAYERGP" mashed together (PLAYER & GP column gap = 0) and "W–L" wraps to two lines. Same root as BUG-2 (table overflow on mobile).
- **Severity:** 🔴 High (part of BUG-2 fix).

## Stack end-to-end: ✅ flow PASS, ❌ BUG-3 on done screen
8 rounds → Build Finals → Championship + Consolation → Crown → Final Standings. Movement/standings correct; "undefined pts" bug on place cards.

### 🔴 BUG-3 (FULL SCOPE): Champions place-card Record/Points show "undefined" on Stack, King, Crown
Place-card metrics block `getPlayerChampionsStats` (index.html **14915–14959**) assumes RR-style fields. Actual stat fields differ:
- **Crown** (`crownPlayerStats`, 8562): has `gamesWon`/`gamesLost`, NOT `wins`/`losses` → Record renders **"undefined–undefined"** (×4). Fix Record → `${s.gamesWon}–${s.gamesLost}`.
- **Stack** (`computeStackStats`, 8128): has `wins`/`losses`/`pointsScored`, NOT `points` → Points renders **"undefined pts"**. Fix Points → `s.pointsScored`.
- **King** (`computeKingStats`, 8391): has `wins`/`gp`/`pointsScored`, NO `losses`, NO `points` → Record **"5–undefined"** + Points **"undefined pts"**. Fix losses → `s.gp - s.wins`, Points → `s.pointsScored`.
- **RR/Gauntlet** (`computeMarginStats`): has `wins`/`losses`/`points`/`diff` → OK.
- Verified live: Stack=4×"undefined pts"; King=8 undefined; Crown=4×"undefined–undefined"; Gauntlet=0; RR=0.

## King end-to-end: ✅ flow PASS (9 rounds→finals→champions), ❌ BUG-3
## Gauntlet end-to-end: ✅ FULL PASS (8 rounds→finals→champions, 0 undefined)
## Crown end-to-end: ✅ flow PASS (3 best-of-3 matches → Crown Match → Champions), ❌ BUG-3 record
## MLP mixed + skip-championship: ✅ FULL PASS
Mixed mode on, 4 Men/4 Women assigned, RR + skip championship. Round 1 = all 4 teams mixed (Liam+Sofia, Diego+Hannah, Marcus+Mei, Tariq+Priya). 7 rounds → "🏆 Finish & Crown Champions" (no Build Finals — skip worked) → Champions, 0 undefined.

### 🟡 POLISH-3: Mixed-mode roster rows cramped on mobile
- With M/W group buttons + trash, the name & phone inputs shrink to ~4 chars ("Marc", "Dieg", "Phon") on 390px. Names still editable but tight. Consider stacking phone below name, or hiding phone in mixed mode, on narrow screens.

## COVERAGE SUMMARY
- Live UI end-to-end: RR(8/2) manual, RR-MLP-mixed+skip, Stack, King, Gauntlet, Crown — all 6 reached Champions/Final Standings.
- `?simulate` harness: 0 failures across 60+ seeded tournaments (all formats + flex churn configs) — independent logic verification.
- 3 read-only audit subagents (RR/MLP, ladder formats, cross-cutting) surfaced verified + speculative leads.

## Subagent audit leads (TO VERIFY against real code before fixing)
- **SW version sync:** `APP_VERSION` (index.html:2510) and `sw.js` VERSION must both bump or cache won't invalidate. (Relevant to shipping step.) — VERIFY/honor.
- **save() failure swallowed** (index.html ~7082, ~14791): in-memory phase advances before save; if localStorage throws, reload shows stale phase → perceived data loss. Edge case (quota full). — VERIFY, consider guard.
- **Court rename not undoable** (~17333): minor consistency.
- **Standings tiny fonts** (10–11px tier dividers, ~554/713): reinforces Bug-2.
- **RR flexible-scenario wh8 ignores mixed** (test code ~6304) + no Mixed-RR-8/2 simulate coverage: low sev, fix improves test coverage.
- **allocateByesMixed silent infeasible fallback** (~9875): rare churn edge case.
- Stack/King court-count-decrease mid-play, Gauntlet 5p empty-round, Crown malformed-match crash: edge cases — VERIFY whether reachable via UI (UI may block illegal court counts).


