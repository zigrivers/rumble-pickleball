# Standings Column Help + Ranking/Points Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every standings column explainable by tap (not hover) and add a Ranking⇄Points toggle that surfaces PTS/NET/PPG without crowding phone-width tables.

**Architecture:** Single-file vanilla-JS PWA (`index.html`, no build). One `COLUMN_HELP` data map is the sole source of truth for column labels + explanations; small helpers render tappable headers, a help modal, a guide modal, a view toggle, and the point cells. Each of the existing hand-built standings tables gets a surgical change: wrap stat headers in `helpTh(...)`, add the toggle + guide button, and branch the stat columns on `state.standingsView`. Existing ranking-view cells are left byte-identical; only new code is added.

**Tech Stack:** Vanilla JS + the in-page `el()` DOM helper, `mountModal()` for dialogs, the `?test` self-test harness (`runSelfTests`), `?simulate` harness, and Playwright visual-regression.

## Global Constraints

- No build step. All code lives in `/Users/kenallred/Developer/rumble/index.html`.
- Self-test baseline: `npm run test:self` must report **exactly 1** failure (the keep-awake `_reVerify` baseline). Adding tests must keep it at 1 (i.e. all new asserts pass).
- `npm run test:simulate` must report **0** failures.
- `npm run check:index` must stay green.
- Tests require a server: `python3 -m http.server 8765 --bind 127.0.0.1 -d .` from the repo root (run once, in the background).
- Surgical changes only: do NOT refactor the 7 standings tables into a column framework. Leave existing ranking-view cell code unchanged; only add the toggle, the `helpTh` header wrapping, and the points-view branch.
- Match existing color conventions: positive→`var(--good)`, negative→`var(--bad)`, neutral→no color. CSS vars: `--bad #ef4444`, `--good #10b981`, `--muted #94a3b8`, `--gold/--accent #fbbf24`.
- Commit after each task with a clear message. Never use `--no-verify`.

## File Structure

- `index.html` — the only source file changed. New code is added in these regions:
  - **Stats:** `computeKingStats` (`~6138`) gains `pointsAgainst`.
  - **New data + helpers:** add a `COLUMN_HELP` block and helper functions near the other render helpers (after `el()` at `~8193`, or just before `renderStandingsCard` at `~11741` — pick one contiguous block and keep all new helpers together).
  - **State:** `newState()` literal (`~4670`) and `backfillStateDefaults()` (`~5029`) gain `standingsView`.
  - **Render sites (wired):** `renderStandingsCard` `~11741`, `renderStackStandingsCard` `~11806`, `renderKingStandingsCard` `~11689`, `renderCrownStandingsCard` `~10758`, `renderDoneScreen` final standings `~12787`, `renderDoneScreenCrown` `~11128`, `renderFinalsScreen` seeds `~11907`.
  - **Self-tests:** new `{ … }` blocks appended inside `runSelfTests`, before the `console.log(\`[self-tests] complete …\`)` line at `~4357`.
  - **CSS:** add rules near the existing `table.standings` styles (`~387`).
- `tests/visual/rumble.visual.spec.mjs` — may gain one new Points-view snapshot (Task 11).

---

### Task 1: King stats track `pointsAgainst` (for NET)

**Files:**
- Modify: `index.html` — `computeKingStats` init `~6142` and accumulation loop `~6156-6169`.
- Test: `index.html` — new block in `runSelfTests` before `~4357`.

**Interfaces:**
- Produces: `computeKingStats(throughRound)` stat objects now include `pointsAgainst` (integer, points scored by opponents in that player's games). Used by Task 3's `pointStatsFor` for King NET.

- [ ] **Step 1: Write the failing test** — append this block inside `runSelfTests`, just before the `console.log(\`[self-tests] complete …\`)` line (`~4356`):

```js
// Standings — King tracks pointsAgainst (for NET)
{
  const _save = state;
  state = newState();
  state.format = "king";
  state.slots = ["A", "B", "C", "D"];
  state.rawNames = ["A", "B", "C", "D"];
  const r = makeRound(1, [makeGame(1, [1, 2], [3, 4])], []);
  r.games[0].score1 = 11; r.games[0].score2 = 6;
  state.rounds = [r];
  const ks = computeKingStats(1);
  console.assert(ks[0].pointsScored === 11 && ks[0].pointsAgainst === 6, "king winner pointsAgainst", ks[0]);
  console.assert(ks[2].pointsScored === 6 && ks[2].pointsAgainst === 11, "king loser pointsAgainst", ks[2]);
  state = _save;
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:self`
Expected: FAIL — total failures = 2 (baseline 1 + the new `pointsAgainst` asserts), because `pointsAgainst` is `undefined`.

- [ ] **Step 3: Add the field to the stat object** — in `computeKingStats`, change the init push (`~6142`) from:

```js
    stats.push({ slot: s, name: nameOf(s), wins: 0, pointsScored: 0, kingCourtWins: 0, kingScore: 0,
      gp: 0, kingRate: 0, winRate: 0 });
```
to:
```js
    stats.push({ slot: s, name: nameOf(s), wins: 0, pointsScored: 0, pointsAgainst: 0, kingCourtWins: 0, kingScore: 0,
      gp: 0, kingRate: 0, winRate: 0 });
```

- [ ] **Step 4: Accumulate points against** — in the decided-game loop (`~6156-6169`), the current body is:

```js
      for (const teamKey of ["team1", "team2"]) {
        const team = game[teamKey];
        const pts = teamKey === "team1" ? game.score1 : game.score2;
        const won = (teamKey === "team1" && t1Won) || (teamKey === "team2" && t2Won);
        for (const slot of team) {
          const st = stats[slot - 1];
          st.pointsScored += pts;
          st.gp++;
          if (won) {
            st.wins++;
            if (courtKey === 1) st.kingCourtWins++;
          }
        }
      }
```
Add an `ag` (against) value and accumulate it. Replace with:
```js
      for (const teamKey of ["team1", "team2"]) {
        const team = game[teamKey];
        const pts = teamKey === "team1" ? game.score1 : game.score2;
        const ag  = teamKey === "team1" ? game.score2 : game.score1;
        const won = (teamKey === "team1" && t1Won) || (teamKey === "team2" && t2Won);
        for (const slot of team) {
          const st = stats[slot - 1];
          st.pointsScored += pts;
          st.pointsAgainst += ag;
          st.gp++;
          if (won) {
            st.wins++;
            if (courtKey === 1) st.kingCourtWins++;
          }
        }
      }
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm run test:self`
Expected: PASS — back to exactly **1** failure (baseline).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(standings): track pointsAgainst in King stats for NET"
```

---

### Task 2: `COLUMN_HELP` map + `columnHelp()` accessor

**Files:**
- Modify: `index.html` — add a new contiguous helper block (place it just before `renderStandingsCard` at `~11741`; all new helpers from Tasks 2–7 live together here).
- Test: `index.html` — new block in `runSelfTests`.

**Interfaces:**
- Produces:
  - `COLUMN_HELP` — object keyed by column id → `{ short, name, desc, example }` (all strings). `short` is the visible header label.
  - `columnHelp(id)` → the entry, or `null` if unknown.
  - `RANKING_COLS` — object keyed by format → ordered array of `{ id, hideMobile? }` for the Ranking view's stat columns (after `#` and Player).
  - `POINTS_COLS` — ordered array of column ids for the Points view: `["gp", "pts", "net", "ppg"]`.
  - `GUIDE_GROUPS(format)` → `{ Basics: [ids], Ranking: [ids], Points: [ids] }` for the guide modal.

- [ ] **Step 1: Write the failing test** — append in `runSelfTests` before `~4356`:

```js
// Standings — COLUMN_HELP completeness
{
  console.assert(typeof columnHelp === "function", "columnHelp is available");
  console.assert(columnHelp("zzz") === null, "columnHelp unknown → null");
  const ids = new Set(["gp", "pts", "net", "ppg"]);
  Object.values(RANKING_COLS).forEach(cols => cols.forEach(c => ids.add(c.id)));
  ids.forEach(id => {
    const h = columnHelp(id);
    console.assert(h && h.short && h.name && h.desc && h.example,
      "COLUMN_HELP has full entry for " + id, h);
  });
  console.assert(columnHelp("am").short === "AM" && /Adjusted Margin/.test(columnHelp("am").name),
    "am entry shape");
  console.assert(columnHelp("mp").short === "MP" && /Match Points/.test(columnHelp("mp").name),
    "mp relabeled to Match Points");
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:self`
Expected: FAIL — `columnHelp is not defined`.

- [ ] **Step 3: Add the data + accessor** — insert this block just before `function renderStandingsCard` (`~11741`):

```js
// === Standings column help — single source of truth for labels + explanations ===
const COLUMN_HELP = {
  // Basics
  rank:   { short: "#",    name: "Rank",  desc: "Your standing. During play it's a live ranking that can change each round; on the results screen it's your final placement (bracket tier first, then tiebreakers).", example: "#1 = top of the standings right now." },
  gp:     { short: "GP",   name: "Games played", desc: "How many games you've finished so far.", example: "GP 8 = you've played 8 games." },
  wl:     { short: "W–L",  name: "Wins–Losses", desc: "Your record: games won, then games lost.", example: "6–2 = six wins, two losses." },
  winpct: { short: "W%",   name: "Win percentage", desc: "The share of your games you've won.", example: "6 wins out of 8 games = 75%." },
  // Points (toggle's Points view)
  pts:    { short: "PTS",  name: "Total points", desc: "Every point you've scored, added up across all your games — win or lose. It just keeps growing.", example: "Scores of 11, 11, 9, 8… over 8 games → PTS 176." },
  net:    { short: "NET",  name: "Net points", desc: "Points you scored minus points scored against you, for the whole tournament. Positive means you've outscored your opponents overall; negative means they've outscored you.", example: "Scored 176, gave up 163 → NET +13." },
  ppg:    { short: "PPG",  name: "Points per game", desc: "Your average points scored per game (total points ÷ games played). A steadier number than the running total.", example: "176 points over 8 games → PPG 22.0." },
  // RR / Gauntlet ranking
  am:     { short: "AM",   name: "Adjusted Margin", desc: "Your ranking score (higher is better; it can go negative). It's based on how much you win or lose by, with two fairness twists: (1) blowouts have diminishing returns — winning 11–2 counts only a little more than 11–7, so running up the score doesn't pad your rank; (2) it adjusts for who you played — beating strong opponents (or carrying a weaker partner) earns more, beating weak opponents a bit less.", example: "Two players both 6–2 can differ: the one whose wins came against tougher opponents and by healthier margins ranks higher. AM only breaks ties WITHIN a finals tier — the bracket result (champion vs runner-up) comes first." },
  diffg:  { short: "+/–G", name: "Point margin per game", desc: "On average, how many points you win or lose each game by. Positive means you usually outscore opponents; negative means you're usually outscored.", example: "+1.6 ≈ you outscore opponents by about 1.6 a game; −4.8 ≈ you're outscored by about 5 a game." },
  // Stack ranking
  ssg:    { short: "SS/G", name: "Stack Score per game", desc: "Your Stack ranking score per game (higher is better). Each game you earn points for the points you scored — worth more on the higher courts — plus a bonus for winning, and an extra bonus for winning on a lower court (which moves you up). So where you win matters, not just whether you win.", example: "Winning on Court 1 (the top court) is worth more than winning on Court 2, so two players with the same record can have different SS/G." },
  climbs: { short: "Climbs", name: "Court climbs", desc: "How many times you won your way up to a higher court.", example: "Climbs 3 = you climbed up three times." },
  c1:     { short: "C1",   name: "Games on Court 1", desc: "How many of your games were played on Court 1, the top court. You only reach it by winning, so more is better.", example: "C1 5 = five of your games were on the top court." },
  // King ranking
  ksg:    { short: "KS/G", name: "King Score per game", desc: "Your King ranking score per game (higher is better). It blends your wins, the points you scored, and your wins on the King's Court (the top court) — so winning up top counts most toward your rank.", example: "Two players with the same record rank differently if one won more games on the King's Court." },
  kingw:  { short: "👑W",  name: "King's Court wins", desc: "Games you won on the King's Court (the top court).", example: "👑W 3 = you won three games up on the King's Court." },
  // Crown ranking
  mp:     { short: "MP",   name: "Match Points", desc: "Your Crown ranking score. You earn match points for winning your matches, with partial credit depending on how the match went. Crown standings are ordered by this — most match points wins.", example: "Win your match cleanly and you bank the full match points; a closer result earns a bit less." },
  gwl:    { short: "G W–L", name: "Game win–loss", desc: "Individual games you won and lost across all your Crown matches (each match is a short series).", example: "G W–L 4–2 = you won four games and lost two across your matches." },
};
function columnHelp(id) { return Object.prototype.hasOwnProperty.call(COLUMN_HELP, id) ? COLUMN_HELP[id] : null; }
const RANKING_COLS = {
  rr:       [{ id: "gp" }, { id: "am" }, { id: "wl" }, { id: "winpct", hideMobile: true }, { id: "diffg", hideMobile: true }],
  gauntlet: [{ id: "gp" }, { id: "am" }, { id: "wl" }, { id: "winpct", hideMobile: true }, { id: "diffg", hideMobile: true }],
  stack:    [{ id: "gp" }, { id: "ssg" }, { id: "wl" }, { id: "winpct", hideMobile: true }, { id: "climbs", hideMobile: true }, { id: "c1", hideMobile: true }],
  king:     [{ id: "gp" }, { id: "ksg" }, { id: "wl" }, { id: "winpct", hideMobile: true }, { id: "kingw", hideMobile: true }, { id: "ppg", hideMobile: true }],
  crown:    [{ id: "mp" }, { id: "gwl" }],
};
const POINTS_COLS = ["gp", "pts", "net", "ppg"];
function guideGroups(format) {
  const rankIds = (RANKING_COLS[format] || RANKING_COLS.rr).map(c => c.id);
  // Basics = rank + any of gp/wl/winpct present in the ranking set, shown first.
  const basics = ["rank", "gp", "wl", "winpct"].filter(id => id === "rank" || id === "gp" || rankIds.includes(id));
  const ranking = rankIds.filter(id => !["gp", "wl", "winpct"].includes(id));
  return { Basics: basics, Ranking: ranking, Points: ["pts", "net", "ppg"] };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test:self`
Expected: PASS — exactly **1** failure (baseline).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(standings): add COLUMN_HELP data map + column config"
```

---

### Task 3: `pointStatsFor()` — derive PTS/NET/PPG per format

**Files:**
- Modify: `index.html` — add to the helper block (after Task 2's code).
- Test: `index.html` — new block in `runSelfTests`.

**Interfaces:**
- Consumes: stat objects from `computeStats`/`computeMarginStats` (RR/Gauntlet: `points`, `diff`, `gp`), `computeStackStats` (`pointsScored`, `pointsAgainst`, `gp`), `computeKingStats` (`pointsScored`, `pointsAgainst`, `gp` — Task 1), `crownPlayerStats` (`pointsScored`, `pointDiff`, `gamesWon`, `gamesLost`).
- Produces: `pointStatsFor(s, format)` → `{ gp:number, pts:number, net:number, ppg:number }` (ppg rounded to 1 decimal as a Number).

- [ ] **Step 1: Write the failing test** — append in `runSelfTests`:

```js
// Standings — pointStatsFor per format
{
  const rr = pointStatsFor({ gp: 8, points: 176, diff: 13 }, "rr");
  console.assert(rr.gp === 8 && rr.pts === 176 && rr.net === 13 && rr.ppg === 22, "pointStatsFor rr", rr);
  const st = pointStatsFor({ gp: 5, pointsScored: 50, pointsAgainst: 41 }, "stack");
  console.assert(st.pts === 50 && st.net === 9 && st.ppg === 10, "pointStatsFor stack", st);
  const kg = pointStatsFor({ gp: 4, pointsScored: 40, pointsAgainst: 31 }, "king");
  console.assert(kg.pts === 40 && kg.net === 9 && kg.ppg === 10, "pointStatsFor king", kg);
  const cr = pointStatsFor({ gamesWon: 2, gamesLost: 1, pointsScored: 33, pointDiff: 5 }, "crown");
  console.assert(cr.gp === 3 && cr.pts === 33 && cr.net === 5 && cr.ppg === 11, "pointStatsFor crown", cr);
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:self`
Expected: FAIL — `pointStatsFor is not defined`.

- [ ] **Step 3: Implement** — add to the helper block:

```js
// Derive the three point stats (PTS/NET/PPG) for any format from its stat object.
function pointStatsFor(s, format) {
  let gp, pts, net;
  if (format === "crown") {
    gp = (s.gamesWon || 0) + (s.gamesLost || 0);
    pts = s.pointsScored || 0;
    net = s.pointDiff || 0;
  } else if (format === "stack" || format === "king") {
    gp = s.gp || 0;
    pts = s.pointsScored || 0;
    net = (s.pointsScored || 0) - (s.pointsAgainst || 0);
  } else { // rr | gauntlet
    gp = s.gp || 0;
    pts = s.points || 0;
    net = s.diff || 0;
  }
  const ppg = Math.round((pts / Math.max(1, gp)) * 10) / 10;
  return { gp, pts, net, ppg };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test:self`
Expected: PASS — exactly **1** failure (baseline).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(standings): add pointStatsFor() PTS/NET/PPG derivation"
```

---

### Task 4: `state.standingsView` toggle state (persisted)

**Files:**
- Modify: `index.html` — `newState()` literal (`~4689`, alongside `awardsShown: false`) and `backfillStateDefaults()` (`~5030`).
- Test: `index.html` — new block in `runSelfTests`.

**Interfaces:**
- Produces: `state.standingsView` — `"ranking"` (default) or `"points"`. Persisted automatically by `save()` (full `JSON.stringify(state)`); restored by `backfillStateDefaults` on load and undo.

- [ ] **Step 1: Write the failing test** — append in `runSelfTests`:

```js
// Standings — standingsView default + backfill
{
  console.assert(newState().standingsView === "ranking", "newState.standingsView=ranking");
  const a = {}; backfillStateDefaults(a);
  console.assert(a.standingsView === "ranking", "backfill defaults standingsView");
  const b = { standingsView: "points" }; backfillStateDefaults(b);
  console.assert(b.standingsView === "points", "backfill preserves valid standingsView");
  const c = { standingsView: "bogus" }; backfillStateDefaults(c);
  console.assert(c.standingsView === "ranking", "backfill repairs bad standingsView");
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:self`
Expected: FAIL — `standingsView` is `undefined`.

- [ ] **Step 3: Add to `newState()`** — in the `newState()` return literal, add after `awardsShown: false,` (`~4689`):

```js
    standingsView: "ranking",                        // "ranking" | "points" — Live/Final standings stat columns
```

- [ ] **Step 4: Add to `backfillStateDefaults()`** — add after the `awardsShown` line (`~5030`):

```js
  if (obj.standingsView !== "ranking" && obj.standingsView !== "points") obj.standingsView = "ranking";
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm run test:self`
Expected: PASS — exactly **1** failure (baseline).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(standings): add persisted standingsView toggle state"
```

---

### Task 5: Header help (`helpTh`) + single-column help modal

**Files:**
- Modify: `index.html` — helper block (after Task 3) + CSS near `~387`.
- Test: `index.html` — new block in `runSelfTests`.

**Interfaces:**
- Consumes: `COLUMN_HELP`, `columnHelp`, `el`, `mountModal`.
- Produces:
  - `helpTh(id, extraClass)` → a `<th class="num help-th …">` whose content is a `<button class="col-help-btn">` showing `COLUMN_HELP[id].short`; clicking opens the single-column help. `extraClass` (optional) is appended to the `<th>` class (e.g. `"col-hide-mobile"`).
  - `openColumnHelp(id, format)` → opens a compact modal with that column's name/desc/example and a "See all columns →" button (calls `openColumnGuideModal(format)` from Task 6).
  - `plainTh(label, extraClass)` → a `<th>` for non-help headers (`#`, Player) so call sites stay uniform.

- [ ] **Step 1: Write the failing test** — append in `runSelfTests`:

```js
// Standings — helpTh builds a labeled help button
{
  const th = helpTh("am");
  console.assert(th.tagName === "TH", "helpTh returns a th");
  const btn = th.querySelector("button.col-help-btn");
  console.assert(btn && btn.textContent === "AM", "helpTh shows short label in a button", btn);
  console.assert(/What does AM mean/.test(btn.getAttribute("aria-label") || ""), "helpTh button has aria-label");
  const th2 = helpTh("winpct", "col-hide-mobile");
  console.assert(th2.className.indexOf("col-hide-mobile") !== -1, "helpTh applies extraClass");
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:self`
Expected: FAIL — `helpTh is not defined`.

- [ ] **Step 3: Implement helpers** — add to the helper block:

```js
function plainTh(label, extraClass) {
  return el("th", { class: (extraClass ? extraClass + " " : ""), style: label === "#" ? "text-align:center;" : "" }, label);
}
function helpTh(id, extraClass) {
  const h = columnHelp(id) || { short: id };
  const btn = el("button", {
    class: "col-help-btn",
    type: "button",
    "aria-label": "What does " + h.short + " mean?",
    onclick: (e) => { e.stopPropagation(); openColumnHelp(id, state.format); },
  }, h.short);
  return el("th", { class: "num help-th" + (extraClass ? " " + extraClass : "") }, btn);
}
function openColumnHelp(id, format) {
  const h = columnHelp(id); if (!h) return;
  const bg = el("div", { class: "modal-bg" });
  const modal = el("div", { class: "modal col-help-modal" });
  modal.appendChild(el("h3", { style: "margin:0 0 4px;" }, h.short + " · " + h.name));
  modal.appendChild(el("p", { style: "margin:0 0 10px;color:var(--text);" }, h.desc));
  modal.appendChild(el("p", { class: "muted", style: "margin:0 0 16px;font-style:italic;" }, h.example));
  const seeAll = el("button", { class: "primary", style: "width:100%;margin-bottom:8px;" }, "See all columns →");
  seeAll.addEventListener("click", () => { bg.remove(); openColumnGuideModal(format || state.format); });
  const close = el("button", { style: "width:100%;" }, "Close");
  close.addEventListener("click", () => bg.remove());
  modal.appendChild(seeAll);
  modal.appendChild(close);
  bg.appendChild(modal);
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  mountModal(bg, modal);
}
```

- [ ] **Step 4: Add CSS** — add near the `table.standings` rules (`~387`):

```css
.help-th .col-help-btn {
  background: none; border: 0; color: var(--muted); font: inherit; font-weight: 600;
  cursor: pointer; padding: 6px 2px; min-height: 32px; text-decoration: underline dotted; text-underline-offset: 3px;
}
.help-th .col-help-btn:hover, .help-th .col-help-btn:focus-visible { color: var(--text); }
.col-help-modal { max-width: 360px; }
```

- [ ] **Step 5: Run the test, verify it passes** (note: `openColumnGuideModal` doesn't exist yet but `helpTh` only references it inside a click handler, so the module still loads)

Run: `npm run test:self`
Expected: PASS — exactly **1** failure (baseline).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(standings): tappable header help (helpTh + single-column modal)"
```

---

### Task 6: Column guide modal

**Files:**
- Modify: `index.html` — helper block.
- Test: `index.html` — new block in `runSelfTests`.

**Interfaces:**
- Consumes: `guideGroups`, `columnHelp`, `mountModal`, `el`.
- Produces:
  - `openColumnGuideModal(format)` → modal listing every column for `format`, grouped Basics/Ranking/Points, each row `short · name` + desc + example.
  - `guideButton(format)` → a small `<button class="guide-btn">ⓘ Column guide</button>` that opens the guide. Used by every standings card head (Tasks 7–10).

- [ ] **Step 1: Write the failing test** — append in `runSelfTests`:

```js
// Standings — column guide modal lists grouped columns
{
  document.querySelectorAll(".modal-bg").forEach(n => n.remove());
  openColumnGuideModal("rr");
  const modal = document.querySelector(".modal-bg .col-guide-modal");
  console.assert(!!modal, "guide modal mounts");
  const txt = modal ? modal.textContent : "";
  console.assert(/Adjusted Margin/.test(txt) && /Total points/.test(txt) && /Games played/.test(txt),
    "guide shows ranking + points + basics entries");
  document.querySelectorAll(".modal-bg").forEach(n => n.remove());
  const gb = guideButton("rr");
  console.assert(gb.tagName === "BUTTON" && /Column guide/.test(gb.textContent), "guideButton label");
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:self`
Expected: FAIL — `openColumnGuideModal is not defined`.

- [ ] **Step 3: Implement** — add to the helper block:

```js
function openColumnGuideModal(format) {
  const groups = guideGroups(format || state.format);
  const bg = el("div", { class: "modal-bg" });
  const modal = el("div", { class: "modal col-guide-modal" });
  modal.appendChild(el("h3", { style: "margin:0 0 12px;" }, "What the columns mean"));
  Object.keys(groups).forEach(groupName => {
    const ids = groups[groupName].filter(id => columnHelp(id));
    if (!ids.length) return;
    modal.appendChild(el("div", { class: "muted", style: "font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px;" }, groupName));
    ids.forEach(id => {
      const h = columnHelp(id);
      modal.appendChild(el("div", { style: "margin:0 0 10px;" },
        el("div", { style: "font-weight:700;" }, h.short + " · " + h.name),
        el("div", { style: "color:var(--text);font-size:14px;" }, h.desc),
        el("div", { class: "muted", style: "font-size:13px;font-style:italic;margin-top:2px;" }, h.example),
      ));
    });
  });
  const close = el("button", { class: "primary", style: "width:100%;margin-top:8px;" }, "Got it");
  close.addEventListener("click", () => bg.remove());
  modal.appendChild(close);
  bg.appendChild(modal);
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  mountModal(bg, modal);
}
function guideButton(format) {
  const btn = el("button", { class: "guide-btn", type: "button" }, "ⓘ Column guide");
  btn.addEventListener("click", () => openColumnGuideModal(format || state.format));
  return btn;
}
```

- [ ] **Step 4: Add CSS** — near `~387`:

```css
.guide-btn { background: none; border: 1px solid var(--muted); color: var(--muted); border-radius: 999px;
  font: inherit; font-size: 12px; font-weight: 600; padding: 4px 10px; cursor: pointer; }
.guide-btn:hover, .guide-btn:focus-visible { color: var(--text); border-color: var(--text); }
.col-guide-modal { max-width: 420px; max-height: 80vh; overflow-y: auto; }
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm run test:self`
Expected: PASS — exactly **1** failure (baseline).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(standings): column guide modal + guide button"
```

---

### Task 7: View toggle control + points header/body cells

**Files:**
- Modify: `index.html` — helper block + CSS near `~387`.
- Test: `index.html` — new block in `runSelfTests`.

**Interfaces:**
- Consumes: `state.standingsView`, `save`, `render`, `pointStatsFor`, `columnHelp`, `helpTh`.
- Produces:
  - `standingsViewToggle()` → a segmented control (two `<button>`s, Ranking | Points) that sets `state.standingsView`, calls `save()` then `render()`. The active button has `aria-pressed="true"`.
  - `pointsHeaderThs()` → array of `<th>` for the Points view (GP, PTS, NET, PPG via `helpTh`).
  - `pointsBodyTds(s, format)` → array of `<td>` for the Points view, NET colored by sign.
  - `isPointsView()` → boolean (`state.standingsView === "points"`).

- [ ] **Step 1: Write the failing test** — append in `runSelfTests`:

```js
// Standings — points cells + toggle
{
  const tds = pointsBodyTds({ gp: 8, points: 176, diff: -3 }, "rr");
  console.assert(tds.length === 4, "pointsBodyTds has GP+PTS+NET+PPG", tds);
  console.assert(tds[1].textContent === "176", "PTS cell value");
  console.assert(tds[2].textContent === "-3" && /var\(--bad\)/.test(tds[2].getAttribute("style") || ""),
    "NET negative is red", tds[2]);
  const ths = pointsHeaderThs();
  console.assert(ths.length === 4 && ths.some(t => /PTS/.test(t.textContent)), "pointsHeaderThs labels");
  const tog = standingsViewToggle();
  console.assert(tog.querySelectorAll("button").length === 2, "toggle has two buttons");
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:self`
Expected: FAIL — `pointsBodyTds is not defined`.

- [ ] **Step 3: Implement** — add to the helper block:

```js
function isPointsView() { return state.standingsView === "points"; }
function pointsHeaderThs() {
  return POINTS_COLS.map(id => helpTh(id)); // gp, pts, net, ppg — all visible (4 fit on mobile)
}
function pointsBodyTds(s, format) {
  const p = pointStatsFor(s, format);
  const netStyle = p.net > 0 ? "color: var(--good);" : (p.net < 0 ? "color: var(--bad);" : "");
  return [
    el("td", { class: "num" }, "" + p.gp),
    el("td", { class: "num" }, "" + p.pts),
    el("td", { class: "num", style: netStyle }, (p.net > 0 ? "+" : "") + p.net),
    el("td", { class: "num" }, p.ppg.toFixed(1)),
  ];
}
function setStandingsView(v) { state.standingsView = v; save(); render(); }
function standingsViewToggle() {
  const mk = (label, v) => {
    const b = el("button", {
      class: "seg-btn" + (state.standingsView === v ? " active" : ""),
      type: "button",
      "aria-pressed": state.standingsView === v ? "true" : "false",
    }, label);
    b.addEventListener("click", () => { if (state.standingsView !== v) setStandingsView(v); });
    return b;
  };
  return el("div", { class: "standings-view-toggle", role: "group", "aria-label": "Standings columns" },
    mk("Ranking", "ranking"), mk("Points", "points"));
}
```

- [ ] **Step 4: Add CSS** — near `~387`:

```css
.standings-view-toggle { display: inline-flex; border: 1px solid var(--muted); border-radius: 999px; overflow: hidden; }
.standings-view-toggle .seg-btn { background: none; border: 0; color: var(--muted); font: inherit; font-size: 13px;
  font-weight: 600; padding: 5px 14px; min-height: 32px; cursor: pointer; }
.standings-view-toggle .seg-btn.active { background: var(--accent); color: #1a1207; }
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm run test:self`
Expected: PASS — exactly **1** failure (baseline).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(standings): Ranking/Points view toggle + points cells"
```

---

### Task 8: Wire RR / Gauntlet (live + final standings)

**Files:**
- Modify: `index.html` — `renderStandingsCard` (`~11749-11803`) and the RR/Gauntlet branch of `renderDoneScreen` final standings (`~12787` area; the RR/Gauntlet table at `~12875-12902`).

**Interfaces:**
- Consumes: `standingsViewToggle`, `guideButton`, `helpTh`, `plainTh`, `isPointsView`, `pointsHeaderThs`, `pointsBodyTds`, `RANKING_COLS`.

- [ ] **Step 1: Replace the head + table build in `renderStandingsCard`** — replace lines `~11750-11800` (from the `head` const through the `stats.forEach` body) so the head includes the toggle + guide and the columns branch on the view. New code:

```js
  const head = el("div", { style: "display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; gap: 10px; flex-wrap: wrap;" },
    el("h3", { style: "margin: 0;" }, opts.title || "Live Standings"),
    el("div", { style: "display:flex;align-items:center;gap:8px;flex-wrap:wrap;" },
      opts.subtitle ? el("span", { class: "muted" }, opts.subtitle) : null,
      standingsViewToggle(), guideButton(state.format)),
  );
  card.appendChild(head);
  const points = isPointsView();
  const table = el("table", { class: "standings" + (vno.advancedStats ? "" : " hide-advanced") });
  const colCount = points ? 4 : RANKING_COLS[state.format === "gauntlet" ? "gauntlet" : "rr"].length;
  const colgroup = el("colgroup", null,
    el("col", { class: "c-rank" }), el("col", { class: "c-name" }),
    ...Array.from({ length: colCount }, () => el("col", {})));
  table.appendChild(colgroup);
  const fmt = state.format === "gauntlet" ? "gauntlet" : "rr";
  const headerStatThs = points ? pointsHeaderThs()
    : RANKING_COLS[fmt].map(c => helpTh(c.id, c.hideMobile ? "col-hide-mobile" : ""));
  table.appendChild(el("thead", null, el("tr", null,
    plainTh("#"), plainTh("Player"), ...headerStatThs)));
  const tbody = el("tbody");
  stats.forEach((s, i) => {
    const remaining = Math.max(0, playerCount() - 1 - s.partnersUsed.size);
    const partnerBadge = (opts.hidePartners || !vno.partnerBadges) ? null : el("span", {
      class: "partner-badge" + (remaining === 0 ? " done" : ""),
      title: "Partners remaining"
    }, remaining + " left");
    const npi = nextPartnerInfo(s.slot);
    const partnerChip = (npi && vno.partnerChips) ? el("span", {
      class: "partner-chip " + (npi.bye ? "bye" : ("c" + npi.courtKey)),
      title: npi.bye ? "Sitting next round" : "Next round partner",
    }, npi.bye ? "→ sitting" : ("→ " + nameOf(npi.partner))) : null;
    const statTds = points ? pointsBodyTds(s, fmt) : [
      el("td", { class: "num" }, "" + s.gp),
      el("td", { class: "num", style: s.adjScore > 0 ? "color: var(--good);" : (s.adjScore < 0 ? "color: var(--bad);" : "") }, s.adjScore.toFixed(1)),
      el("td", { class: "num" }, s.wins + "–" + (s.gp - s.wins)),
      el("td", { class: "num col-hide-mobile" }, Math.round(s.winRate * 100) + "%"),
      el("td", { class: "num col-hide-mobile", style: s.avgDiff > 0 ? "color: var(--good);" : (s.avgDiff < 0 ? "color: var(--bad);" : "") }, (s.avgDiff > 0 ? "+" : "") + s.avgDiff.toFixed(1)),
    ];
    tbody.appendChild(el("tr", { class: standingsRowClass("r" + (i + 1), s.slot) },
      rankCell(i), standingNameCell(s, partnerChip, partnerBadge), ...statTds));
  });
```

- [ ] **Step 2: Wire the RR/Gauntlet final-standings table in `renderDoneScreen`** — at the RR/Gauntlet standings table (`~12875-12902`): add `standingsViewToggle()` + `guideButton(state.format)` to that section's header row, wrap each stat `<th>` with `helpTh(id, …)` using ids `["gp","am","wl","winpct","diffg"]` (mobile-hide `winpct`,`diffg`), and branch the stat `<td>`s on `isPointsView()` exactly as in Step 1 (points → `pointsBodyTds(s, fmt)`; ranking → keep the existing GP/AM/W–L/W%/+/–G cells). Use `fmt = state.format === "gauntlet" ? "gauntlet" : "rr"`.

- [ ] **Step 3: Verify self-tests + simulate still green**

Run: `npm run test:self && npm run test:simulate`
Expected: self-tests = 1 failure; simulate = 0 failures.

- [ ] **Step 4: Manual smoke (agent-browser)** — serve, open, seed an RR done state, screenshot both views:

```bash
agent-browser --session plan open "http://localhost:8765/index.html"
agent-browser --session plan eval "(()=>{document.querySelectorAll('.standings-view-toggle').length})()"
```
Confirm a Ranking/Points toggle and ⓘ Column guide button render above Live Standings; tapping a header opens its help; tapping Points shows PTS/NET/PPG.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(standings): wire RR/Gauntlet live + final standings to help + toggle"
```

---

### Task 9: Wire Stack (live + final standings)

**Files:**
- Modify: `index.html` — `renderStackStandingsCard` (`~11806`) and the Stack branch of `renderDoneScreen` (`~12801-12809` headers, plus its tbody cells).

**Interfaces:**
- Consumes: same helpers as Task 8. Ranking ids: `["gp","ssg","wl","winpct","climbs","c1"]` (mobile-hide `winpct`,`climbs`,`c1`). `fmt = "stack"`.

- [ ] **Step 1: Add toggle + guide to the Stack card head** — in `renderStackStandingsCard`, find the head/`h3` row and append `standingsViewToggle()` + `guideButton("stack")` beside the title (mirror Task 8 Step 1's `head` structure).

- [ ] **Step 2: Branch headers** — replace the Stack `<thead>` stat `<th>`s (`~11827-11835`) with:

```js
  const points = isPointsView();
  const headerStatThs = points ? pointsHeaderThs()
    : RANKING_COLS.stack.map(c => helpTh(c.id, c.hideMobile ? "col-hide-mobile" : ""));
```
and build the header row as `el("tr", null, plainTh("#"), plainTh("Player"), ...headerStatThs)`. Adjust the `<colgroup>` to emit 2 fixed cols (`c-rank`, `c-name`) + `points ? 4 : 6` generic `<col>`s (mirror Task 8 Step 1's colgroup).

- [ ] **Step 3: Branch body cells** — wrap the Stack stat `<td>`s (the existing GP / SS/G / W–L / W% / Climbs / C1 cells) in `points ? pointsBodyTds(s, "stack") : [ <existing cells> ]`, keeping the existing cell code unchanged in the ranking branch.

- [ ] **Step 4: Repeat for the Stack final-standings table** in `renderDoneScreen` (`~12801-12809`): same head additions, same header ids, same body branch (`fmt = "stack"`).

- [ ] **Step 5: Verify + commit**

Run: `npm run test:self && npm run test:simulate`
Expected: 1 / 0.
```bash
git add index.html
git commit -m "feat(standings): wire Stack live + final standings to help + toggle"
```

---

### Task 10: Wire King + Crown (live + final standings)

**Files:**
- Modify: `index.html` — `renderKingStandingsCard` (`~11689`), King branch of `renderDoneScreen` (`~12838-12846`), `renderCrownStandingsCard` (`~10758`), `renderDoneScreenCrown` (`~11128`).

**Interfaces:**
- Consumes: same helpers. King ranking ids `["gp","ksg","wl","winpct","kingw","ppg"]` (mobile-hide `winpct`,`kingw`,`ppg`), `fmt="king"`. Crown ranking ids `["mp","gwl"]`, `fmt="crown"`.

- [ ] **Step 1: King live + final** — in `renderKingStandingsCard` and the King done table: add `standingsViewToggle()` + `guideButton("king")` to the head; branch headers via `RANKING_COLS.king.map(c => helpTh(c.id, c.hideMobile ? "col-hide-mobile" : ""))` vs `pointsHeaderThs()`; branch body via `points ? pointsBodyTds(s, "king") : [ <existing KS/G etc. cells> ]`. (King's existing PPG cell stays in the ranking view; the Points view's PPG comes from `pointStatsFor`.)

- [ ] **Step 2: Crown live + final** — in `renderCrownStandingsCard` (`~10758`) and `renderDoneScreenCrown` (`~11128`): add `standingsViewToggle()` + `guideButton("crown")` to the head. Ranking view headers become `helpTh("mp")`, `helpTh("gwl")` (this replaces the wrong `title:"Matches played"` with the correct Match Points help from `COLUMN_HELP`); ranking body keeps the existing `matchPoints.toFixed(1)` and `gamesWon–gamesLost` cells. Points view → `pointsHeaderThs()` / `pointsBodyTds(s, "crown")`. Remove the now-redundant standalone `+/–` column from the Crown ranking view (NET lives in the Points view); keep `#`, Player, MP, G W–L in Ranking.

- [ ] **Step 3: Verify**

Run: `npm run test:self && npm run test:simulate`
Expected: 1 / 0.

- [ ] **Step 4: Manual smoke** — seed a Crown done state and a King playing state via `agent-browser` eval; confirm the toggle swaps columns, MP help now says "Match Points", and Points view shows PTS/NET/PPG.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(standings): wire King + Crown to help + toggle; fix Crown MP label"
```

---

### Task 11: Finals seeds header help + full verification & visual baselines

**Files:**
- Modify: `index.html` — `renderFinalsScreen` seeds table (`~11907-11977`): wrap the seed table's stat header(s) with `helpTh(...)` and add `guideButton(state.format)` near its heading (no toggle on the seeds table — it's a seeding view, not live standings).
- Modify: `tests/visual/rumble.visual.spec.mjs` — add one Points-view snapshot.

- [ ] **Step 1: Finals seeds header help** — in `renderFinalsScreen`, add `guideButton(state.format)` beside the Seeds heading and wrap its ranking stat header with the matching `helpTh(id)` (e.g. `am` for RR/Gauntlet, `ssg`/`ksg` for Stack/King). Leave the rest of the seeds layout unchanged.

- [ ] **Step 2: Run the full gate**

Run: `npm run test:self && npm run test:simulate && npm run check:index`
Expected: self = 1 failure, simulate = 0 failures, check:index green.

- [ ] **Step 3: Refresh visual baselines (intentional UI change)**

Run: `npm run test:visual` first to SEE the diffs (expect the 10 standings-bearing snapshots to differ by the new toggle/guide row). Confirm the diffs are only the added controls, then:
Run: `npm run test:visual:update`
Expected: snapshots updated; a follow-up `npm run test:visual` passes 10/10.

- [ ] **Step 4: Add a Points-view snapshot** — in `tests/visual/rumble.visual.spec.mjs`, add a test that seeds/opens a standings screen, clicks the **Points** toggle (`page.getByRole("button", { name: "Points" }).click()`), and asserts `toHaveScreenshot("standings-points.png")`. Run `npm run test:visual:update` to capture it, then `npm run test:visual` to confirm green.

- [ ] **Step 5: Accessibility spot-check (agent-browser)** — keyboard-tab to a header help button and the toggle; confirm visible focus ring and that Enter/Space activate them; open the guide modal and confirm Escape closes it and focus returns.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/visual
git commit -m "feat(standings): finals seeds header help; refresh visual baselines + points snapshot"
```

---

## Self-Review

**Spec coverage:**
- Hover-only `title=` → tap help: Tasks 5 (header tap), 6 (guide), wired in 8–11. ✅
- One shared explanation source: Task 2 `COLUMN_HELP`. ✅
- Applies to every standings surface: live (8/9/10), final (8/9/10), Crown (10), finals seeds header help (11). ✅
- Ranking/Points toggle, PTS/NET/PPG, same column count on mobile, rank order preserved (no re-sort — `stats` order is reused, only cells change): Tasks 7–10. ✅
- Toggle remembered across reload, default Ranking: Task 4. ✅
- Crown gets toggle + MP relabel fix: Task 10. ✅
- King NET data: Task 1. ✅
- Tests: completeness (2), NET/PPG (1,3), toggle default+round-trip (4), simulate 0, visual refresh + points snapshot (11), a11y spot-check (11). ✅
- Coloring conventions (NET green/red): Task 7. ✅

**Placeholder scan:** No TBD/TODO; every code step shows real code; the only "apply the same pattern" references (Tasks 9–10) name the exact column ids, format string, and which existing cells to keep — concrete, not vague.

**Type consistency:** `pointStatsFor` returns `{gp,pts,net,ppg}` (used in Task 7). `helpTh(id, extraClass)`, `plainTh(label, extraClass)`, `pointsHeaderThs()`, `pointsBodyTds(s, format)`, `guideButton(format)`, `standingsViewToggle()`, `openColumnHelp(id, format)`, `openColumnGuideModal(format)`, `columnHelp(id)` — names/signatures match across all call sites. `RANKING_COLS[fmt]` entries are `{id, hideMobile?}` used consistently. `state.standingsView` values `"ranking"|"points"` consistent in Tasks 4/7.
