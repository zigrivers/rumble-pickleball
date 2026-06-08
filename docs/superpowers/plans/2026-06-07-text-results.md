# Player Phone Numbers + Text Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture optional player phone numbers at setup (remembered across events by name) and offer per-player "Text results" / "Text standings" drafts on the done and playing screens for Round Robin & Gauntlet.

**Architecture:** All changes layer onto the single self-contained `index.html`. New pure utilities (`normalizePhone`, `isValidPhone`, `smsHref`) and roster CRUD go near the other top-level helpers; a state-dependent `buildResultsMessage` builds the recap from existing `computeStats`/`finalRanking`/`rankPlayers`. State gains `rawPhones` (parallel to `rawNames`) and `phones` (parallel to `slots`). Delivery is per-player `sms:` deep links plus a clipboard Copy fallback. Tests are inline `console.assert` blocks under `?test`.

**Tech Stack:** Vanilla JS, no build step. Verification via `python3 -m http.server` + agent-browser.

**Spec:** `docs/superpowers/specs/2026-06-07-text-results-design.md`

**Conventions:**
- Run all commands from repo root: `cd "$(git rev-parse --show-toplevel)"`.
- Serve for testing: `python3 -m http.server 8765 --bind 127.0.0.1 -d . &`
- Run self-tests: open `http://localhost:8765/index.html?test`, then `agent-browser console | grep "self-tests] complete"`. Baseline is **1 failure** (pre-existing keep-awake headless artifact); each task must keep the count at 1 plus only its own intentional RED, returning to 1 when GREEN.
- `el(tag, attrs, ...children)` is the existing top-level DOM helper. `showToast(text)`, `teamName(team)`, `nameOf(slot)`, `computeStats(throughRound, includeFinals)`, `rankPlayers(n)`, `finalRanking()`, `totalRegularRounds()`, `isRoundComplete(r)` already exist.
- v1 formats: **Round Robin (`rr`) and Gauntlet (`gauntlet`)** get the recap UI. Stack/King/Crown get capture+roster only.

---

### Task 1: Pure phone utilities

**Files:**
- Modify: `index.html` — add three functions just above `function nameOf(slot)` (search `function nameOf(slot)`).
- Modify: `index.html` — add asserts inside `runSelfTests()` before the line `console.log(`+"`"+`[self-tests] complete`+"`"+`` (search that string).

- [ ] **Step 1: Write the failing tests**

Insert before the `[self-tests] complete` log line:

```js
  // Task TR1 — phone utilities
  {
    console.assert(normalizePhone("(555) 201-3344") === "5552013344", "normalizePhone strips formatting");
    console.assert(normalizePhone("+1 555 201 3344") === "+15552013344", "normalizePhone keeps leading +");
    console.assert(normalizePhone("  555.201.3344  ") === "5552013344", "normalizePhone trims + strips dots");
    console.assert(normalizePhone("") === "" && normalizePhone(null) === "", "normalizePhone handles empty/null");
    console.assert(isValidPhone("555-201-3344") === true, "isValidPhone true for 10 digits");
    console.assert(isValidPhone("12345") === false, "isValidPhone false for too-short");
    console.assert(isValidPhone("") === false, "isValidPhone false for empty");
    console.assert(
      smsHref("(555) 201-3344", "Hi & bye?") === "sms:5552013344?body=Hi%20%26%20bye%3F",
      "smsHref normalizes number and url-encodes body");
  }
```

- [ ] **Step 2: Run to verify it fails**

Open `http://localhost:8765/index.html?test`; expected console: `[self-tests] complete — N failure(s)` with N > 1, and assertion messages for `normalizePhone strips formatting` etc. (functions undefined → throws/fails).

- [ ] **Step 3: Implement the utilities**

Insert above `function nameOf(slot)`:

```js
// ---------- phone / SMS utilities ----------
function normalizePhone(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  const lead = trimmed.startsWith("+") ? "+" : "";
  return lead + trimmed.replace(/\D/g, "");
}
function isValidPhone(raw) {
  return normalizePhone(raw).replace(/\D/g, "").length >= 7;
}
function smsHref(phone, body) {
  return "sms:" + normalizePhone(phone) + "?body=" + encodeURIComponent(body);
}
```

- [ ] **Step 4: Run to verify it passes**

Reload `?test`; expected: `[self-tests] complete — 1 failure(s)` (baseline only).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: phone normalize/validate/smsHref utilities"
```

---

### Task 2: Saved-roster CRUD

**Files:**
- Modify: `index.html` — add roster helpers + `ROSTER_KEY` constant directly below the phone utilities from Task 1.
- Modify: `index.html` — asserts in `runSelfTests()` before the `[self-tests] complete` line.

- [ ] **Step 1: Write the failing tests**

```js
  // Task TR2 — roster CRUD
  {
    const saved = localStorage.getItem(ROSTER_KEY);
    localStorage.removeItem(ROSTER_KEY);
    console.assert(JSON.stringify(loadRoster()) === "{}", "loadRoster empty default");
    saveRosterEntry("Ken", "(555) 201-3344");
    console.assert(rosterPhoneFor("ken") === "5552013344", "rosterPhoneFor case-insensitive + normalized");
    console.assert(rosterPhoneFor("  KEN ") === "5552013344", "rosterPhoneFor trims");
    saveRosterEntry("Ken", "");          // blank → delete
    console.assert(rosterPhoneFor("Ken") === "", "saveRosterEntry deletes on empty");
    saveRosterEntry("Ann", "5550000000");
    deleteRosterEntry("Ann");
    console.assert(rosterPhoneFor("Ann") === "", "deleteRosterEntry removes");
    saveRosterEntry("Bo", "5551110000");
    clearRoster();
    console.assert(JSON.stringify(loadRoster()) === "{}", "clearRoster empties");
    localStorage.setItem(ROSTER_KEY, "{bad json");
    console.assert(JSON.stringify(loadRoster()) === "{}", "loadRoster tolerates corrupt json");
    if (saved !== null) localStorage.setItem(ROSTER_KEY, saved); else localStorage.removeItem(ROSTER_KEY);
  }
```

- [ ] **Step 2: Run to verify it fails**

Reload `?test`; expected N > 1 with `loadRoster empty default` etc. failing (helpers undefined).

- [ ] **Step 3: Implement roster CRUD**

Below the Task 1 utilities:

```js
const ROSTER_KEY = "pb_roster_v1";
function loadRoster() {
  try {
    const r = JSON.parse(localStorage.getItem(ROSTER_KEY) || "{}");
    return (r && typeof r === "object" && !Array.isArray(r)) ? r : {};
  } catch (e) { return {}; }
}
function rosterPhoneFor(name) {
  if (!name) return "";
  return loadRoster()[name.trim().toLowerCase()] || "";
}
function saveRosterEntry(name, phone) {
  const key = (name || "").trim().toLowerCase();
  if (!key) return;
  const roster = loadRoster();
  if (isValidPhone(phone)) roster[key] = normalizePhone(phone);
  else delete roster[key];
  try { localStorage.setItem(ROSTER_KEY, JSON.stringify(roster)); } catch (e) {}
}
function deleteRosterEntry(name) {
  const key = (name || "").trim().toLowerCase();
  const roster = loadRoster();
  delete roster[key];
  try { localStorage.setItem(ROSTER_KEY, JSON.stringify(roster)); } catch (e) {}
}
function clearRoster() {
  try { localStorage.removeItem(ROSTER_KEY); } catch (e) {}
}
```

- [ ] **Step 4: Run to verify it passes**

Reload `?test`; expected `1 failure(s)`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: name-keyed saved-roster CRUD (upsert/delete-on-empty)"
```

---

### Task 3: State fields + length-aware migration

**Files:**
- Modify: `index.html` `newState()` — add `rawPhones` after the `rawNames:` line (search `rawNames: ["", "", "", "", "", "", "", ""]`).
- Modify: `index.html` `backfillStateDefaults(obj)` — add defaults (search `function backfillStateDefaults`).
- Modify: `index.html` — assert in `runSelfTests()`.

- [ ] **Step 1: Write the failing test**

```js
  // Task TR3 — phone state migration
  {
    const legacy = { phase: "setup", rawNames: ["A","B","C","D","E","F","G","H"], slots: ["","","","","","","",""] };
    const m = backfillStateDefaults(legacy);
    console.assert(Array.isArray(m.rawPhones) && m.rawPhones.length === 8 && m.rawPhones.every(p => p === ""),
      "migration adds rawPhones length 8", m.rawPhones);
    console.assert(Array.isArray(m.phones) && m.phones.length === 8 && m.phones.every(p => p === ""),
      "migration adds phones length 8", m.phones);
    const legacy4 = { phase: "setup", rawNames: ["A","B","C","D"], slots: ["A","B","C","D"] };
    const m4 = backfillStateDefaults(legacy4);
    console.assert(m4.rawPhones.length === 4 && m4.phones.length === 4,
      "migration sizes arrays to existing player count", m4.rawPhones, m4.phones);
  }
```

- [ ] **Step 2: Run to verify it fails**

Reload `?test`; expected `migration adds rawPhones length 8` failing (field absent).

- [ ] **Step 3: Implement**

In `newState()`, immediately after the `rawNames: [...]` line, add:

```js
    rawPhones: ["", "", "", "", "", "", "", ""],     // parallel to rawNames; optional cell numbers
```

In `backfillStateDefaults(obj)`, add before its `return obj;` (or with the other field guards):

```js
  if (!Array.isArray(obj.rawPhones)) obj.rawPhones = Array((obj.rawNames || []).length || 8).fill("");
  if (!Array.isArray(obj.phones))    obj.phones    = Array((obj.slots    || []).length || 8).fill("");
```

- [ ] **Step 4: Run to verify it passes**

Reload `?test`; expected `1 failure(s)`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: rawPhones/phones state fields with length-aware migration"
```

---

### Task 4: Build phones + reconcile roster at startTournament

**Files:**
- Modify: `index.html` `startTournament()` (search `const shuffled = shuffle(names);` and the function's closing `}` after the final `else` branch).

- [ ] **Step 1: Write the failing test**

```js
  // Task TR4 — startTournament builds phones + roster
  {
    const savedState = state;
    const savedRoster = localStorage.getItem(ROSTER_KEY);
    localStorage.removeItem(ROSTER_KEY);
    state = newState();
    state.format = "rr";
    state.rawNames = ["Ava","Ben","Cy","Dee","Eli","Fay","Gus","Hal"];
    state.rawPhones = ["(555) 111-2222","","555.333.4444","","","","",""];
    startTournament();
    // phones parallel to slots, normalized; aligns by name after shuffle
    const idxAva = state.slots.indexOf("Ava");
    const idxCy  = state.slots.indexOf("Cy");
    console.assert(state.phones.length === state.slots.length, "phones length matches slots");
    console.assert(state.phones[idxAva] === "5551112222", "Ava phone aligned after shuffle", state.phones[idxAva]);
    console.assert(state.phones[idxCy] === "5553334444", "Cy phone aligned after shuffle", state.phones[idxCy]);
    console.assert(rosterPhoneFor("Ava") === "5551112222", "roster upserted Ava");
    console.assert(rosterPhoneFor("Ben") === "", "no roster entry for blank Ben");
    if (savedRoster !== null) localStorage.setItem(ROSTER_KEY, savedRoster); else localStorage.removeItem(ROSTER_KEY);
    state = savedState;
  }
```

- [ ] **Step 2: Run to verify it fails**

Reload `?test`; expected `phones length matches slots` / `Ava phone aligned` failing (`state.phones` not built).

- [ ] **Step 3: Implement**

In `startTournament()`, immediately after `const shuffled = shuffle(names);` add:

```js
  // Map each (trimmed, unique) name to its normalized phone for post-shuffle alignment.
  const phoneByName = {};
  names.forEach((n, i) => { if (n) phoneByName[n] = normalizePhone(state.rawPhones[i] || ""); });
```

At the **end of the function**, immediately before the final closing `}` of `startTournament` (after the `else { ... }` branch that ends with `runShuffleReveal(state.slots.slice(), () => render());`), add:

```js
  // Derive per-slot phones from the final slot order, and remember name→phone in the roster.
  state.phones = state.slots.map(n => phoneByName[n] || "");
  for (let i = 0; i < count; i++) saveRosterEntry(names[i], state.rawPhones[i] || "");
  save();
```

- [ ] **Step 4: Run to verify it passes**

Reload `?test`; expected `1 failure(s)`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: build state.phones and upsert roster on startTournament"
```

---

### Task 5: buildResultsMessage (final + mid-event)

**Files:**
- Modify: `index.html` — add `textResultsSupported()` and `buildResultsMessage()` just above `function nameOf(slot)` (below the roster CRUD).
- Modify: `index.html` — harness asserts in `runSelfTests()`.

- [ ] **Step 1: Write the failing test**

```js
  // Task TR5 — buildResultsMessage (seeded tournament)
  {
    const savedState = state;
    const rounds = SCHEDULE.map((rd, i) => ({
      round: i + 1,
      court1: { team1: rd[0][0].slice(), team2: rd[0][1].slice(), score1: 11, score2: 5 },
      court2: { team1: rd[1][0].slice(), team2: rd[1][1].slice(), score1: 11, score2: 5 },
    }));
    state = {
      phase: "done", format: "rr",
      slots: ["A","B","C","D","E","F","G","H"],
      rounds, currentRound: 7, tiebreakRandom: [0,1,2,3,4,5,6,7],
      finals: {
        championship: { team1: [1,4], team2: [2,3], score1: 11, score2: 9 },
        consolation:  { team1: [5,8], team2: [6,7], score1: 11, score2: 9 },
      },
      awardsShown: true, winScore: 11, notifiedRounds: [],
    };
    const order = finalRanking().map(s => s.slot);
    const stats = computeStats(totalRegularRounds(), true);
    const top = order[0];
    const msg = buildResultsMessage(top, "final");
    console.assert(msg.includes("You: #1 of 8"), "final: top player is #1", msg);
    console.assert(msg.includes("🥇 ") && msg.includes("🥈 "), "final: champion lines present");
    console.assert(msg.includes("Final standings:"), "final: heading present");
    // Parity: every player's (W, pts) in the message equals computeStats(total,true)
    const bySlot = {}; stats.forEach(s => bySlot[s.slot] = s);
    const ok = order.every((s, i) => msg.includes((i+1) + ". " + bySlot[s].name + " (" + bySlot[s].wins + "W, " + bySlot[s].points + " pts)"));
    console.assert(ok, "final: leaderboard numbers match computeStats(total,true)");

    // mid-event mode: no champion lines, interim header
    const mid = buildResultsMessage(order[0], { throughRound: 3 });
    console.assert(mid.includes("standings through 3 rounds"), "mid: interim header", mid);
    console.assert(!mid.includes("🥇"), "mid: no champion line");

    // champion-line guard when finals is null
    state.finals = null;
    const noFinals = buildResultsMessage(1, "final");
    console.assert(!noFinals.includes("🥇"), "final: champion lines guarded on null finals");
    state = savedState;
  }
```

- [ ] **Step 2: Run to verify it fails**

Reload `?test`; expected `final: top player is #1` failing (`buildResultsMessage` undefined).

- [ ] **Step 3: Implement**

Above `function nameOf(slot)`:

```js
function textResultsSupported() {
  return state.format === "rr" || state.format === "gauntlet";
}

// Personalized recap for the player in `slot`. mode = "final" | { throughRound: N }.
// State-dependent: reads slots/finals/stats. Final-mode numbers come from
// computeStats(total, true) + finalRanking() order, matching the done screen.
function buildResultsMessage(slot, mode) {
  const isFinal = mode === "final";
  const through = isFinal ? totalRegularRounds() : mode.throughRound;
  const order = (isFinal ? finalRanking() : rankPlayers(through)).map(s => s.slot);
  const stats = computeStats(through, isFinal);
  const bySlot = {}; stats.forEach(s => { bySlot[s.slot] = s; });
  const me = bySlot[slot];
  const pos = order.indexOf(slot) + 1;
  const sign = d => (d > 0 ? "+" : "") + d;
  const lines = [];
  const youLine = "You: #" + pos + " of " + order.length +
    " (" + me.wins + "W " + me.losses + "L, " + sign(me.diff) + " pts)";
  const board = order.map((s, i) => {
    const st = bySlot[s];
    return (i + 1) + ". " + st.name + " (" + st.wins + "W, " + st.points + " pts)";
  });

  if (isFinal) {
    lines.push("🏓 Rumble Pickleball — tonight's results", "", youLine, "");
    if (state.finals) {
      const f = state.finals;
      const champWin = f.championship.score1 > f.championship.score2 ? f.championship.team1 : f.championship.team2;
      const consWin  = f.consolation.score1  > f.consolation.score2  ? f.consolation.team1  : f.consolation.team2;
      lines.push("🥇 " + teamName(champWin), "🥈 " + teamName(consWin), "");
    }
    lines.push("Final standings:", ...board, "", "GG! 🎾");
  } else {
    lines.push(
      "🏓 Rumble Pickleball — standings through " + through + " round" + (through > 1 ? "s" : ""),
      "", youLine, "", "Standings:", ...board, "", "(not final — more rounds to play) 🎾");
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Reload `?test`; expected `1 failure(s)`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: buildResultsMessage final + mid-event recaps"
```

---

### Task 6: Setup screen phone fields + roster auto-fill

**Files:**
- Modify: `index.html` `renderSetup()` — the name-input loop (search `placeholder: "Player " + (i + 1)`).
- Modify: `index.html` — add a module-level `let _phoneAutofilled = [];` near other top-level `let` state flags (search `let _undoChipAdjIdx`).

- [ ] **Step 1: Add the autofill-tracking flag**

Near `let _undoChipAdjIdx = -1;` add:

```js
let _phoneAutofilled = [];   // setup: per-row, true if phone came from roster and wasn't hand-edited
```

- [ ] **Step 2: Replace the setup name-row loop**

Replace the existing block:

```js
  for (let i = 0; i < playerCount; i++) {
    const input = el("input", {
      class: "name-input",
      type: "text",
      placeholder: "Player " + (i + 1),
      value: state.rawNames[i] || "",
      autocomplete: "off",
      autocapitalize: "words",
      autocorrect: "off",
      spellcheck: "false",
    });
    input.addEventListener("input", () => {
      state.rawNames[i] = input.value;
      save();
      const btn = document.getElementById("start-btn");
      if (btn) btn.disabled = !canStart();
    });
    list.appendChild(input);
  }
```

with:

```js
  for (let i = 0; i < playerCount; i++) {
    const row = el("div", { class: "setup-row", style: "display:flex;gap:8px;" });
    const nameInput = el("input", {
      class: "name-input",
      type: "text",
      placeholder: "Player " + (i + 1),
      value: state.rawNames[i] || "",
      autocomplete: "off",
      autocapitalize: "words",
      autocorrect: "off",
      spellcheck: "false",
      style: "flex:2;",
    });
    const phoneInput = el("input", {
      class: "name-input",
      type: "tel",
      inputmode: "tel",
      placeholder: "📱 optional",
      value: state.rawPhones[i] || "",
      autocomplete: "off",
      style: "flex:1.4;",
    });
    nameInput.addEventListener("input", () => {
      state.rawNames[i] = nameInput.value;
      // Auto-fill phone from roster when the field is empty or still roster-filled
      // (and not since hand-edited), so "Ken" → "Kenneth" re-resolves instead of
      // stranding Ken's number on Kenneth's row.
      if (!state.rawPhones[i] || _phoneAutofilled[i]) {
        const filled = rosterPhoneFor(nameInput.value);
        state.rawPhones[i] = filled;
        phoneInput.value = filled;
        _phoneAutofilled[i] = !!filled;
      }
      save();
      const btn = document.getElementById("start-btn");
      if (btn) btn.disabled = !canStart();
    });
    phoneInput.addEventListener("input", () => {
      state.rawPhones[i] = phoneInput.value;
      _phoneAutofilled[i] = false;   // manual edit locks the value
      save();
    });
    row.appendChild(nameInput);
    row.appendChild(phoneInput);
    list.appendChild(row);
  }
```

- [ ] **Step 3: Verify auto-fill + lock in the browser**

```bash
agent-browser open "http://localhost:8765/index.html"
agent-browser wait --load domcontentloaded
cat <<'EOF' | agent-browser eval --stdin
localStorage.setItem("pb_roster_v1", JSON.stringify({ ken: "5551234567" }));
state = newState(); state.format = "rr"; render(); "seeded";
EOF
```

Type a name and check auto-fill, then extend it past the match:

```bash
agent-browser eval "(() => { const n = document.querySelectorAll('.setup-row .name-input')[0]; n.value='Ken'; n.dispatchEvent(new Event('input')); return state.rawPhones[0]; })()"
```
Expected: `5551234567`.

```bash
agent-browser eval "(() => { const n = document.querySelectorAll('.setup-row .name-input')[0]; n.value='Kenneth'; n.dispatchEvent(new Event('input')); return JSON.stringify(state.rawPhones[0]); })()"
```
Expected: `""` (re-resolved — Kenneth not in roster, so the autofilled number cleared).

Manual-edit lock:

```bash
agent-browser eval "(() => { const p = document.querySelectorAll('.setup-row input[type=tel]')[0]; p.value='5559990000'; p.dispatchEvent(new Event('input')); const n = document.querySelectorAll('.setup-row .name-input')[0]; n.value='Ken'; n.dispatchEvent(new Event('input')); return state.rawPhones[0]; })()"
```
Expected: `5559990000` (manual value not overwritten by roster).

- [ ] **Step 4: Reset test state + commit**

```bash
agent-browser eval "localStorage.clear(); 'ok'"
git add index.html
git commit -m "feat: setup phone fields with roster auto-fill + staleness handling"
```

---

### Task 7: Done-screen "Text results" card

**Files:**
- Modify: `index.html` — add `renderTextResultsCard(mode)` just above `function renderDoneScreen` (search `function renderDoneScreen`).
- Modify: `index.html` `renderDoneScreen()` — append the card after the Final Standings card (search `wrap.appendChild(finalCard);`).
- Modify: `index.html` `renderDoneScreenCrown()` — append the not-supported card (search `function renderDoneScreenCrown`; append near its other `wrap.appendChild` calls, before the final return).

- [ ] **Step 1: Implement the card**

Above `function renderDoneScreen`:

```js
function renderTextResultsCard(mode) {
  const card = el("div", { class: "card" });
  card.appendChild(el("h3", { style: "margin:0 0 10px;" },
    mode === "final" ? "📱 Text results" : "📱 Text standings"));
  if (!textResultsSupported()) {
    card.appendChild(el("p", { class: "muted", style: "margin:0;" },
      "Texting results isn't available for this format yet."));
    return card;
  }
  const btnStyle = "display:inline-block;text-decoration:none;background:var(--accent);" +
    "color:#1a1207;border:none;border-radius:8px;padding:6px 12px;font-weight:600;font-size:13px;cursor:pointer;";
  const count = state.slots.filter(Boolean).length;
  for (let slot = 1; slot <= count; slot++) {
    const phone = state.phones[slot - 1];
    const row = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:6px;" });
    row.appendChild(el("div", { style: "flex:1;" }, nameOf(slot)));
    if (isValidPhone(phone)) {
      const body = buildResultsMessage(slot, mode);
      row.appendChild(el("a", { href: smsHref(phone, body), style: btnStyle }, "Text"));
      const copyBtn = el("button", { style: btnStyle + "background:var(--panel);color:var(--text);" }, "Copy");
      copyBtn.addEventListener("click", () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(body).then(
            () => showToast("Copied " + nameOf(slot) + "'s recap"),
            () => showToast("Copy failed — long-press the Text draft instead"));
        }
      });
      row.appendChild(copyBtn);
    } else {
      row.appendChild(el("span", { class: "muted" }, "no number"));
    }
    card.appendChild(row);
  }
  return card;
}
```

- [ ] **Step 2: Wire into the done screens**

In `renderDoneScreen()`, immediately after `wrap.appendChild(finalCard);` add:

```js
  wrap.appendChild(renderTextResultsCard("final"));
```

In `renderDoneScreenCrown()`, before its final `return wrap;`, add:

```js
  wrap.appendChild(renderTextResultsCard("final"));
```

- [ ] **Step 3: Verify in the browser (RR)**

```bash
agent-browser open "http://localhost:8765/index.html"
agent-browser wait --load domcontentloaded
cat <<'EOF' | agent-browser eval --stdin
state = newState(); state.format = "rr";
state.slots = ["Ava","Ben","Cy","Dee","Eli","Fay","Gus","Hal"];
state.phones = ["5551112222","","5553334444","","","","",""];
state.tiebreakRandom = [0,1,2,3,4,5,6,7];
state.rounds = SCHEDULE.map((rd,i)=>({round:i+1,
  court1:{team1:rd[0][0].slice(),team2:rd[0][1].slice(),score1:11,score2:5},
  court2:{team1:rd[1][0].slice(),team2:rd[1][1].slice(),score1:11,score2:5}}));
state.currentRound = 7; buildFinals();
state.finals.championship.score1=11; state.finals.championship.score2=9;
state.finals.consolation.score1=11; state.finals.consolation.score2=9;
state.phase="done"; state.awardsShown=true; render();
const rows = Array.from(document.querySelectorAll(".card")).find(c=>/Text results/.test(c.textContent));
JSON.stringify({ hasCard: !!rows,
  avaHref: (Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')&&a.getAttribute('href').startsWith('sms:5551112222'))||{}).href ? 'sms-ok' : 'missing',
  noNumberCount: (document.body.textContent.match(/no number/g)||[]).length })
EOF
```
Expected: `hasCard:true`, `avaHref:"sms-ok"`, `noNumberCount:6` (6 players without numbers).

- [ ] **Step 4: Reset + commit**

```bash
agent-browser eval "localStorage.clear(); 'ok'"
git add index.html
git commit -m "feat: done-screen Text results card (Text + Copy, RR/Gauntlet)"
```

---

### Task 8: Playing-screen "Text standings" card

**Files:**
- Modify: `index.html` `renderPlaying()` — after the standings card is appended (search `wrap.appendChild(standingsCard);`).

- [ ] **Step 1: Implement**

Immediately after `wrap.appendChild(standingsCard);` add:

```js
  // Mid-event recap (RR/Gauntlet only, once at least one round is complete).
  if (textResultsSupported()) {
    const completedRounds = state.rounds.filter(isRoundComplete).length;
    if (completedRounds >= 1) {
      wrap.appendChild(renderTextResultsCard({ throughRound: completedRounds }));
    }
  }
```

- [ ] **Step 2: Verify in the browser**

```bash
agent-browser open "http://localhost:8765/index.html"
agent-browser wait --load domcontentloaded
cat <<'EOF' | agent-browser eval --stdin
state = newState(); state.format="rr";
state.slots=["Ava","Ben","Cy","Dee","Eli","Fay","Gus","Hal"];
state.phones=["5551112222","","","","","","",""];
state.tiebreakRandom=[0,1,2,3,4,5,6,7];
state.rounds=SCHEDULE.map((rd,i)=>({round:i+1,
  court1:{team1:rd[0][0].slice(),team2:rd[0][1].slice(),score1:(i<2?11:null),score2:(i<2?5:null)},
  court2:{team1:rd[1][0].slice(),team2:rd[1][1].slice(),score1:(i<2?11:null),score2:(i<2?5:null)}}));
state.currentRound=3; state.phase="playing"; render();
const card = Array.from(document.querySelectorAll(".card")).find(c=>/Text standings/.test(c.textContent));
JSON.stringify({ hasCard: !!card, mentionsThrough: /through 2 rounds/.test(buildResultsMessage(1,{throughRound:2})) })
EOF
```
Expected: `hasCard:true`, `mentionsThrough:true`.

- [ ] **Step 3: Reset + commit**

```bash
agent-browser eval "localStorage.clear(); 'ok'"
git add index.html
git commit -m "feat: playing-screen Text standings card (mid-event)"
```

---

### Task 9: Settings "Saved numbers" + Clear All clears roster

**Files:**
- Modify: `index.html` `openSettings()` — add a "Saved numbers" section before the Done button (search `const closeBtn = el("button"` inside `openSettings`).
- Modify: `index.html` — Clear All handler (search `Clear all data including names`).

- [ ] **Step 1: Add the Saved numbers section**

Immediately before `const closeBtn = el("button", { style: "width: 100%; margin-top: 12px;"` in `openSettings`, add:

```js
  // ---- Saved numbers ----
  modal.appendChild(el("div", { class: "ka-section-title" }, "Saved numbers"));
  modal.appendChild(el("p", { class: "ka-sub", style: "margin:0 0 8px;" },
    "Remembered by name for next time. Numbers are matched by name, so two people with the same name share one entry."));
  const rosterWrap = el("div");
  function refreshRoster() {
    rosterWrap.textContent = "";
    const roster = loadRoster();
    const names = Object.keys(roster).sort();
    if (!names.length) {
      rosterWrap.appendChild(el("p", { class: "muted", style: "margin:0;" }, "No saved numbers yet."));
      return;
    }
    names.forEach(key => {
      const r = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:6px;" });
      r.appendChild(el("div", { style: "flex:1;" }, key + " — " + roster[key]));
      const del = el("button", { class: "secondary", style: "padding:4px 10px;" }, "✕");
      del.addEventListener("click", () => { deleteRosterEntry(key); refreshRoster(); });
      r.appendChild(del);
      rosterWrap.appendChild(r);
    });
  }
  refreshRoster();
  modal.appendChild(rosterWrap);
  const clearNumsBtn = el("button", { class: "secondary", style: "width:100%;margin-top:6px;" }, "Clear all saved numbers");
  clearNumsBtn.addEventListener("click", () => { clearRoster(); refreshRoster(); });
  modal.appendChild(clearNumsBtn);
```

- [ ] **Step 2: Make Clear All also clear the roster**

In the Clear All `onclick` handler, immediately after the `if (!confirm("Clear all data including names? This can't be undone.")) return;` line, add:

```js
      clearRoster();
```

- [ ] **Step 3: Verify in the browser**

```bash
agent-browser open "http://localhost:8765/index.html"
agent-browser wait --load domcontentloaded
cat <<'EOF' | agent-browser eval --stdin
localStorage.setItem("pb_roster_v1", JSON.stringify({ ken:"5551234567", ann:"5559990000" }));
openSettings();
const sec = Array.from(document.querySelectorAll(".modal *")).some(n=>/ken — 5551234567/.test(n.textContent||""));
JSON.stringify({ listsKen: sec });
EOF
```
Expected: `listsKen:true`.

Delete one:

```bash
agent-browser eval "(() => { const b = Array.from(document.querySelectorAll('.modal button')).find(x=>x.textContent==='✕'); b.click(); return JSON.stringify(Object.keys(loadRoster())); })()"
```
Expected: one key remaining (the first sorted, `ann` deleted or `ken` — whichever the first row was; assert length 1):

```bash
agent-browser eval "Object.keys(loadRoster()).length"
```
Expected: `1`.

- [ ] **Step 4: Reset + commit**

```bash
agent-browser eval "localStorage.clear(); 'ok'"
git add index.html
git commit -m "feat: Settings saved-numbers management; Clear All clears roster"
```

---

### Task 10: Final verification + privacy note

**Files:**
- Modify: `index.html` `openSettings()` — append a privacy line to the Saved numbers section (after `clearNumsBtn`).

- [ ] **Step 1: Add the privacy note**

After `modal.appendChild(clearNumsBtn);` add:

```js
  modal.appendChild(el("p", { class: "ka-sub", style: "margin:8px 0 0;" },
    "Numbers are stored only in this browser (unencrypted) and are never sent anywhere — " +
    "they leave your device only when you tap Text or Copy. This app is hosted on a shared " +
    "github.io address, so other pages you host there could read them; use Clear All to remove."));
```

- [ ] **Step 2: Full regression — self-tests**

```bash
agent-browser open "http://localhost:8765/index.html?test"
agent-browser wait --load domcontentloaded
sleep 3
agent-browser console | grep "self-tests] complete"
```
Expected: `[self-tests] complete — 1 failure(s)`.

- [ ] **Step 3: Full regression — simulation harness**

```bash
agent-browser open "http://localhost:8765/index.html?simulate"
agent-browser wait --load domcontentloaded
sleep 4
agent-browser console | grep "simulate] complete"
```
Expected: `[simulate] complete — 0 failure(s) across 3 tournaments`.

- [ ] **Step 4: Legacy-save load (no phone fields) does not throw**

```bash
cat <<'EOF' | agent-browser eval --stdin
localStorage.setItem("pb_tourney_v4", JSON.stringify({ phase:"setup", format:"rr",
  rawNames:["A","B","C","D","E","F","G","H"], slots:["","","","","","","",""] }));
const s = load();
JSON.stringify({ rawPhones: s.rawPhones.length, phones: s.phones.length });
EOF
```
Expected: `{"rawPhones":8,"phones":8}`.

- [ ] **Step 5: Stack done screen shows the not-supported note**

```bash
cat <<'EOF' | agent-browser eval --stdin
state = newState(); state.format="stack"; render();
buildResultsMessage; // exists
const card = renderTextResultsCard("final");
JSON.stringify({ note: /isn't available for this format yet/.test(card.textContent) });
EOF
```
Expected: `{"note":true}`.

- [ ] **Step 6: Reset + commit**

```bash
agent-browser eval "localStorage.clear(); 'ok'"
agent-browser close
git add index.html
git commit -m "feat: privacy note for saved numbers; text-results feature complete"
```

---

## Self-Review

**Spec coverage:**
- Client-only per-player `sms:` drafts + Copy fallback → Tasks 1, 7. ✅
- Inline phone capture (option A) → Task 6. ✅
- Roster remembered by name; upsert + delete-on-empty; CRUD; trim/lowercase key → Tasks 2, 4. ✅
- Recap with full standings, record in parentheses; final + mid-event; champion guard; computeStats parity → Task 5. ✅
- Availability done + mid-event → Tasks 7, 8. ✅
- Format scope RR/Gauntlet; Stack/King/Crown note → Tasks 5 (`textResultsSupported`), 7, verified Task 10 Step 5. ✅
- Data model rawPhones/phones; canonical alignment via unique-name map; length-aware migration → Tasks 3, 4. ✅
- Auto-fill staleness (Ken→Kenneth) + manual lock → Task 6. ✅
- Settings management + Clear All clears roster → Task 9. ✅
- Privacy (plaintext, shared github.io origin, delete/Clear All) → Tasks 9, 10. ✅
- Pure vs state-dependent helper split → Tasks 1–2 (pure asserts) vs Task 5 (seeded harness). ✅
- Testing checklist (auto-fill, startTournament side-effects, migration/legacy load, mid vs final, Settings delete/Clear All, Stack note, regression) → Tasks 6–10. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output; paths repo-relative. ✅

**Type/name consistency:** `normalizePhone`/`isValidPhone`/`smsHref` (Task 1) → used in 2,4,5,7; `ROSTER_KEY`/`loadRoster`/`rosterPhoneFor`/`saveRosterEntry`/`deleteRosterEntry`/`clearRoster` (Task 2) → 4,6,9,10; `rawPhones`/`phones` (Task 3) → 4,6,7,8,10; `buildResultsMessage(slot, mode)` & `textResultsSupported()` (Task 5) → 7,8; `renderTextResultsCard(mode)` (Task 7) → 8,10; `_phoneAutofilled` (Task 6). Consistent. ✅

**MMR review (2026-06-07):** the spec this plan implements already incorporated the 5-model review's 11 findings (RR/Gauntlet scope, Copy fallback, autofill staleness, delete-on-empty, length-aware migration, homonym note, finals guard, privacy rewrite, helper reclassification, canonical alignment, key normalization).
