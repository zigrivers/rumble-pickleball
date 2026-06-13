# Win % and W–L Record Columns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the W/G decimal with a **W%** column and add a **W–L** record column in every standings table that shows W/G (Round Robin, Gauntlet, Stack, King — live cards and done-screen tables).

**Architecture:** All in the single-file app `index.html`. The W/G header, the win-rate body cell, and the `c-w` colgroup entry are byte-identical across all six tables, so three `replace_all` edits update all of them at once. The simulation's positional `checkTable` (RR only) and the RR display self-test are updated to match. Display-only — no ranking/metric change.

**Tech Stack:** Vanilla JS embedded in `index.html`. No build system. Tests run in a browser via URL params.

**Reference spec:** `docs/superpowers/specs/2026-06-13-win-percent-and-record-columns-design.md`

---

## How to run the tests (READ THIS — browser caches aggressively)

There is no CLI test runner. Both suites run in a browser and log to the console; `runSelfTests` also invokes `runSimulation()` internally, so `?test` covers both.

**The shared Playwright MCP browser serves a STALE `index.html` unless forced fresh. Before EVERY test run, do all of:**
1. Start a server on a FRESH, unused port: `nohup python3 -m http.server <PORT> >/tmp/wl-<PORT>.log 2>&1 &` then `sleep 1`. Use a new port each run (e.g. 8771, 8772, …).
2. Load Playwright tools: ToolSearch `select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_console_messages,mcp__plugin_playwright_playwright__browser_close`.
3. `mcp__plugin_playwright_playwright__browser_close`.
4. `mcp__plugin_playwright_playwright__browser_navigate` to `http://localhost:<PORT>/index.html?test&v=<unique>`.
5. Read console: level "error" for failing `[ASSERT]` lines; level "info" for the two completion lines.

Sanity-check you're on fresh code: `curl -s "http://localhost:<PORT>/index.html" | grep -c '"W–L"'` → expect `6` after the change, `0` before.

**Pass condition:**
- `[simulate] complete — 0 failure(s) across 7 tournaments`
- `[self-tests] complete — N failure(s)` where N is **0, or 1 only if** the pre-existing flaky `[ASSERT] _reVerify() restarts Layer 1 when rafHandle is null` (keep-awake/RAF) fires. Any OTHER assert = real failure.

---

## File Structure

Everything is in `index.html`:
- Six standings tables share three identical code fragments (W/G `<th>`, win-rate `<td>`, `c-w` `<col>`) — updated via `replace_all`.
- `checkTable` (inside `runSimulation`) reads RR table cells positionally — updated for the shifted indices.
- The RR display self-test (inside `runSelfTests`) — extended to assert the new columns.

---

## Task 1: Replace W/G with W–L + W% across all six standings tables

**Files:**
- Modify: `index.html` — six standings tables (via three `replace_all` edits), the RR display self-test, and `checkTable`.

This is a single cohesive change: we update the two test surfaces to expect the new columns (red), then add the columns (green).

- [ ] **Step 1: Update the RR display self-test to require the new columns**

Find (grep `RR standings show GP`):

```javascript
    console.assert(/GP/.test(standings.textContent) && /AM/.test(standings.textContent),
      "RR standings show GP and Adjusted Margin columns", standings.textContent);
```

Replace with (note the en-dash `–` U+2013 in the record regex):

```javascript
    console.assert(/GP/.test(standings.textContent) && /AM/.test(standings.textContent)
      && /\d+–\d+/.test(standings.textContent) && /%/.test(standings.textContent),
      "RR standings show GP, AM, W–L and W% columns", standings.textContent);
```

- [ ] **Step 2: Update `checkTable` for the new (shifted) cell indices**

Find (grep `function checkTable`):

```javascript
        gp: tr.cells[2].textContent, am: tr.cells[3].textContent,
        wg: tr.cells[4].textContent, diff: tr.cells[5].textContent,
```

Replace with:

```javascript
        gp: tr.cells[2].textContent, am: tr.cells[3].textContent,
        wl: tr.cells[4].textContent, wpct: tr.cells[5].textContent, diff: tr.cells[6].textContent,
```

Then find the per-row assertion:

```javascript
        r.name === e.name && r.gp === String(e.gp) && r.am === fmtRate(e.adjScore)
          && r.wg === fmtRate(e.wg) && r.diff === fmtDiff(e.dg),
```

Replace with (en-dash `–` in the record):

```javascript
        r.name === e.name && r.gp === String(e.gp) && r.am === fmtRate(e.adjScore)
          && r.wl === e.w + "–" + (e.gp - e.w)
          && r.wpct === Math.round(e.wg * 100) + "%"
          && r.diff === fmtDiff(e.dg),
```

(`expectedTable`'s row objects already carry `w` (wins), `gp`, and `wg` (win rate) — no change to `expectedTable`.)

- [ ] **Step 3: Run the tests to verify they FAIL (red)**

Run via the fresh-load recipe above. Expected (the columns don't exist yet, so the table still renders W/G at `cells[4]`):
- `[self-tests]` shows failures > the flaky baseline — at least the new `"RR standings show GP, AM, W–L and W% columns"` assert and the `"runSimulation returns 0 failures"` assert.
- `[simulate]` shows many `T# R# row …` / `final standings row …` failures.

Confirm this red state before implementing.

> **For Steps 4–6:** these substrings appear at different indentation in the live vs done-screen tables, so match the **bare substring with NO leading whitespace** (exactly as written below). `replace_all` replaces the substring in place and preserves each line's own indentation. Each substring occurs exactly 6 times (one per standings table) and nowhere else.

- [ ] **Step 4: Add the W% header to all six tables (`replace_all`, no leading whitespace)**

Replace **all occurrences** of this exact substring:

```
el("th", { class: "num", title: "Wins per game" }, "W/G"),
```

with (two `<th>` — `W–L` visible, `W%` hidden on mobile):

```
el("th", { class: "num", title: "Win–loss record" }, "W–L"), el("th", { class: "num col-hide-mobile", title: "Win percentage" }, "W%"),
```

- [ ] **Step 5: Add the W–L + W% body cells to all six tables (`replace_all`, no leading whitespace)**

Replace **all occurrences** of this exact substring:

```
el("td", { class: "num" }, s.winRate.toFixed(1)),
```

with (two `<td>`):

```
el("td", { class: "num" }, s.wins + "–" + (s.gp - s.wins)), el("td", { class: "num col-hide-mobile" }, Math.round(s.winRate * 100) + "%"),
```

(`s.wins`, `s.gp`, and `s.winRate` are present on every format's stats objects: `computeStats`, `computeStackStats`, `computeKingStats`.)

- [ ] **Step 6: Add the W% colgroup `<col>` to all six tables (`replace_all`, no leading whitespace)**

Replace **all occurrences** of this exact substring:

```
el("col", { class: "c-w" }),
```

with:

```
el("col", { class: "c-w" }), el("col", { class: "c-w col-hide-mobile" }),
```

(Keeps `<col>` count aligned with the new column count in every colgroup.)

- [ ] **Step 7: Run the tests to verify they PASS (green)**

Run via the fresh-load recipe (NEW port, `browser_close`, unique `?test&v=` URL). Expected:
- `curl … | grep -c '"W–L"'` → `6`
- `[simulate] complete — 0 failure(s) across 7 tournaments`
- `[self-tests] complete — 0 failure(s)` (or 1 only if the flaky KeepAwake assert fires — confirm via error-level console that it's the only one).

If `checkTable` rows mismatch only on `wpct` by a rounding edge, confirm the app cell uses `Math.round(s.winRate * 100)` and the assertion uses `Math.round(e.wg * 100)` — they're the same formula; a real mismatch is a bug, not a tolerance to loosen.

- [ ] **Step 8: Manual smoke (in-page probe)**

On the fresh load, run via `mcp__plugin_playwright_playwright__browser_evaluate`:

```javascript
() => {
  const mp = n => Array.from({length:n},(_,i)=>({slot:i+1,name:"P"+(i+1),phone:"",status:"active",eligibleFromRound:1,joinedRound:1,leftRound:null}));
  const sg = (c,t1,t2,s1,s2)=>{const g=makeGame(c,t1,t2);g.score1=s1;g.score2=s2;return g;};
  const saved = state;
  state = { phase:"playing", format:"rr", courtCount:2, slots:Array.from({length:8},(_,i)=>"P"+(i+1)), players:mp(8),
    rounds:[ makeRound(1,[sg(1,[1,2],[3,4],11,3),sg(2,[5,6],[7,8],11,9)],[]),
             makeRound(2,[sg(1,[1,3],[2,4],11,5),sg(2,[5,7],[6,8],11,9)],[]) ],
    currentRound:2, tiebreakRandom:Array.from({length:8},(_,i)=>i), previousRanks:[], notifiedRounds:[], awardsShown:false, winScore:11, finals:null };
  const card = renderStandingsCard(2);
  const headers = Array.from(card.querySelectorAll("thead th")).map(th=>th.textContent);
  const row1 = Array.from(card.querySelector("tbody tr").cells).map(td=>td.textContent);
  state = saved;
  return { headers, row1 };
}
```

Expected: `headers` includes `"W–L"` and `"W%"` (no `"W/G"`); `row1` shows a record like `"2–0"` and a percent like `"100%"`.

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat(standings): show W–L record and Win % columns (replace W/G)"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** all six tables updated via the three `replace_all` edits (spec §5/§6); W–L = `wins–(gp−wins)`, W% = `Math.round(winRate×100)%` (spec §4); `col-hide-mobile` on W% keeps mobile count unchanged (spec §5); `checkTable` indices + RR display test updated (spec §7); Crown/recap/seeds/podium/snapshot untouched (spec §3). `expectedTable` and `checkWellFormedTable` intentionally unchanged (spec §7).
- **En-dash discipline:** the record separator is `–` (U+2013), matching the `"W–L"` header, the body cell, the `checkTable` assertion, and the display-test regex. Do not use a hyphen `-`.
- **Why one task:** the column positions and `checkTable`'s positional reads are tightly coupled; splitting them creates a guaranteed red window for no benefit. The red→green happens within Steps 3→7.
- **0-game players:** render `0–0` / `0%` (ranked last) — no special-casing needed (`gp−wins=0`, `winRate=0`).
