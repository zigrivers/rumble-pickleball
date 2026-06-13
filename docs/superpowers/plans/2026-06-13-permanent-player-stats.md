# Permanent (Lifetime) Player Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in, phone-keyed lifetime player stats that persist across tournaments, are derived from each finished tournament, and (in Phases C/D) sync automatically across the organizer's devices via Firebase — while the app keeps shipping from GitHub Pages with no build step.

**Architecture:** A local-first `localStorage` ledger (`pb_lifetime_v1`) behind a `LifetimeStore` facade with a pluggable `SyncBackend`. Append-only per-tournament records keyed by `tournamentId`; lifetime aggregates derived on read. Pure merge/dedupe/normalize/aggregate functions take a ledger argument (no globals, no I/O) so they are unit-testable in the synchronous `?test` harness. Cloud sync (Firestore + Auth, owner-scoped) is layered on later behind the same facade; the local-first store always remains the on-device source of truth.

**Tech Stack:** Vanilla HTML/CSS/JS single-file app (`index.html`). Inline `?test` self-tests (synchronous `console.assert`). Playwright visual tests + Node scripts from the technical-enablers harness. Firebase modular SDK (Auth + Firestore), vendored as static files; `@firebase/rules-unit-testing` + Firebase Emulator for security-rules tests.

**Source of truth:** `docs/superpowers/specs/2026-06-13-permanent-player-stats-design.md`.

---

## Project Rules

- Work from repo root: `/Users/kenallred/Developer/rumble`.
- **Prerequisite:** technical-enablers **Tasks 1-4** are done first (boundary sentinels, `npm run check:index`, the URL gate runner, and the Playwright visual playbook all exist). This plan assumes `tools/check-index-boundaries.mjs`, `tools/run-url-check.mjs`, `tools/visual-state-fixtures.mjs`, and `tests/visual/rumble.visual.spec.mjs` exist.
- Preserve root `index.html` as the shipped app. No build step, no bundler, no framework.
- All new in-app code lives inside a single new `RUMBLE:LIFETIME` sentinel section in `index.html` (added in Task A1); state additions live in the existing `STATE` section; UI in `RENDER`; self-tests in `TESTS`.
- Run gates after every task:
  - `npm run check:index` passes.
  - Open `index.html?test` → ends with exactly **1 failure** (the pre-existing keep-awake artifact; all new asserts pass).
  - Open `index.html?simulate` → ends with **0 failures**.
  - `npm run test:visual` passes (after baselines exist).
- **Do not bump `sw.js`** (cache `VERSION`) until the explicit release task (Task D5).
- Commit after every task with the listed message. End each commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- For Firebase modular-SDK call shapes (Phase C/D), pin the SDK version once (Task C2) and verify exact APIs against current docs (context7: `/firebase/firebase-js-sdk`) at execution time.

## Files Map

- Modify: `index.html`
  - `STATE`: add `saveToLifetime`, `startedAt`, `tournamentId` to `newState()`/`backfillStateDefaults()`; one-time boot persist.
  - `RUMBLE:LIFETIME` (new section): identity helpers, pure ledger functions, normalization, aggregation, `LifetimeStore` + `NullBackend` + (Phase C) `FirestoreBackend`, recording hook.
  - `RENDER`: lifetime toggle, Career view, career card, sync/auth UI, data management.
  - `TESTS`: inline self-tests for all pure functions.
- Modify: `tools/check-index-boundaries.mjs` — add `"LIFETIME"` to the ordered `sections` array (after `STATS`, before `RENDER`).
- Modify: `docs/architecture/index-boundaries.md` — document the `RUMBLE:LIFETIME` boundary.
- Modify: `tools/visual-state-fixtures.mjs`, `tests/visual/rumble.visual.spec.mjs` — add lifetime states.
- Create (Phase C/D): `vendor/firebase/*` (vendored SDK), `firebase.json`, `firestore.rules`, `tests/rules/lifetime-rules.test.mjs`.
- Modify (Phase C/D): `package.json` (add `test:rules`).

---

# Phase A - Local-First Core (no cloud; fully `?test`-verifiable)

## Task A1: Boundary section + state fields + stable tournamentId

**Files:**
- Modify: `index.html` (`STATE` section; new `RUMBLE:LIFETIME` sentinel; `TESTS`)
- Modify: `tools/check-index-boundaries.mjs`
- Modify: `docs/architecture/index-boundaries.md`

- [ ] **Step 1: Add the boundary sentinel**

  In `index.html`, immediately after the `RUMBLE:STATS:end` sentinel and before `RUMBLE:RENDER:start`, add an empty section:

  ```js
  // RUMBLE:LIFETIME:start
  // (lifetime store, identity, recording — filled in by later tasks)
  // RUMBLE:LIFETIME:end
  ```

- [ ] **Step 2: Register the boundary in the checker**

  In `tools/check-index-boundaries.mjs`, add `"LIFETIME"` to the `sections` array between `"STATS"` and `"RENDER"`:

  ```js
  const sections = ["STYLE", "STATE", "TESTS", "CORE", "FORMATS", "STATS", "LIFETIME", "RENDER", "MODALS", "BOOT"];
  ```

  Add the matching row to `docs/architecture/index-boundaries.md`:

  ```markdown
  | Lifetime Stats | phone-keyed lifetime ledger, recording, sync | `RUMBLE:LIFETIME` |
  ```

- [ ] **Step 3: Add state fields**

  In `newState()` (STATE section) add defaults:

  ```js
  saveToLifetime: false,
  startedAt: 0,
  tournamentId: "",
  ```

  In `backfillStateDefaults(obj)` add (idempotent, only-if-missing; NO clock/random read here):

  ```js
  if (typeof obj.saveToLifetime !== "boolean") obj.saveToLifetime = false;
  if (typeof obj.startedAt !== "number") obj.startedAt = 0;
  if (typeof obj.tournamentId !== "string") obj.tournamentId = "";
  ```

- [ ] **Step 4: Stamp tournamentId at start; persist legacy once at boot**

  In `startTournament()`, immediately AFTER the existing `state.scheduleSeed = makeScheduleSeed();` line, add:

  ```js
  state.startedAt = Date.now();
  state.tournamentId = state.scheduleSeed + "-" + state.startedAt;
  ```

  In the boot path (where the global `state` is assigned from `load()`), after assignment and before first render, add a one-time persist for legacy in-progress/done tournaments:

  ```js
  if (state && state.phase && state.phase !== "setup" && !state.tournamentId) {
    // legacy tournament started before this field existed
    if (!state.startedAt) state.startedAt = 0;
    state.tournamentId = (state.scheduleSeed || 0) + "-" + state.startedAt;
    save();
  }
  ```

- [ ] **Step 5: Add self-tests**

  In the `TESTS` section, add:

  ```js
  // Lifetime A1 — state fields + tournamentId stability
  {
    const s = newState();
    console.assert(s.saveToLifetime === false, "newState.saveToLifetime defaults false");
    const legacy = { phase: "playing", scheduleSeed: 42 };
    backfillStateDefaults(legacy);
    console.assert(legacy.tournamentId === "" && legacy.startedAt === 0,
      "backfill does not invent tournamentId/startedAt (boot path does)", legacy);
    backfillStateDefaults(legacy);
    console.assert(legacy.startedAt === 0, "backfill is idempotent / no clock read", legacy);
  }
  ```

- [ ] **Step 6: Verify**

  ```bash
  npm run check:index
  python3 -m http.server 8765 --bind 127.0.0.1 -d .
  ```
  Open `index.html?test` (ends at 1 failure) and `index.html?simulate` (0 failures).

- [ ] **Step 7: Commit**

  ```bash
  git add index.html tools/check-index-boundaries.mjs docs/architecture/index-boundaries.md
  git commit -m "feat(lifetime): add LIFETIME boundary, state fields, stable tournamentId"
  ```

## Task A2: Identity helpers

**Files:** Modify `index.html` (`RUMBLE:LIFETIME`, `TESTS`)

- [ ] **Step 1: Implement canonical phone key + trackable predicate**

  In the LIFETIME section:

  ```js
  // Canonical lifetime identity key. Collapses 5552013344 / 15552013344 / +15552013344.
  function lifetimePhoneKey(raw) {
    const digits = normalizePhone(raw).replace(/\D/g, "");      // normalizePhone keeps a leading +; drop it here
    if (digits.length === 11 && digits[0] === "1") return digits.slice(1); // NANP country code
    return digits;
  }
  // Stricter than isValidPhone (>=7): lifetime tracking needs a real 10-digit number.
  function lifetimeTrackable(raw) {
    return lifetimePhoneKey(raw).length >= 10;
  }
  ```

- [ ] **Step 2: Add self-tests**

  ```js
  // Lifetime A2 — identity
  {
    console.assert(lifetimePhoneKey("(555) 201-3344") === "5552013344", "key strips formatting");
    console.assert(lifetimePhoneKey("+1 555 201 3344") === "5552013344", "key drops + and NANP 1");
    console.assert(lifetimePhoneKey("15552013344") === "5552013344", "key drops leading 1");
    console.assert(lifetimeTrackable("555-201-3344") === true, "10-digit trackable");
    console.assert(lifetimeTrackable("12345") === false, "short not trackable");
  }
  ```

- [ ] **Step 3: Verify & commit**

  Run the gates (check:index, ?test=1, ?simulate=0), then:

  ```bash
  git add index.html
  git commit -m "feat(lifetime): canonical phone identity helpers"
  ```

## Task A3: Pure ledger + merge functions

**Files:** Modify `index.html` (`RUMBLE:LIFETIME`, `TESTS`)

- [ ] **Step 1: Implement pure ledger helpers**

  All take/return plain objects; no globals, no I/O.

  ```js
  function emptyLedger() { return { players: {}, tournaments: {}, sync: { lastSyncedAt: 0, pendingTournamentIds: [], pendingDeletes: [] } }; }

  // Collapse multiple rows that share a canonical key within ONE record.
  function dedupeRecordResults(results) {
    const byKey = {};
    for (const r of results) {
      const cur = byKey[r.phoneKey];
      if (!cur) { byKey[r.phoneKey] = Object.assign({}, r); continue; }
      cur.gamesPlayed += r.gamesPlayed; cur.wins += r.wins; cur.losses += r.losses;
      cur.pointsFor += r.pointsFor; cur.pointDiff += r.pointDiff;
      // keep the better finish, and take its podium/partial/status
      if ((r.finalRank || 1e9) < (cur.finalRank || 1e9)) {
        cur.finalRank = r.finalRank; cur.podium = r.podium; cur.partial = r.partial; cur.status = r.status; cur.name = r.name;
      }
    }
    return Object.values(byKey);
  }

  // Merge one tournament record into a ledger (idempotent by id; last-write-wins by revisedAt).
  function ledgerPutRecord(ledger, record) {
    const out = Object.assign({}, ledger, { tournaments: Object.assign({}, ledger.tournaments), players: Object.assign({}, ledger.players) });
    const existing = out.tournaments[record.id];
    if (!existing || (record.revisedAt || 0) >= (existing.revisedAt || 0)) {
      out.tournaments[record.id] = record;
    }
    for (const r of record.results) out.players[r.phoneKey] = mergePlayer(out.players[r.phoneKey], r, record.completedAt);
    return out;
  }

  function mergePlayer(prev, row, seenAt) {
    const aliases = new Set((prev && prev.aliases) || []);
    if (prev && prev.displayName && prev.displayName !== row.name) aliases.add(prev.displayName);
    return {
      phoneKey: row.phoneKey,
      displayName: row.name,
      aliases: Array.from(aliases).slice(-5),
      firstSeenAt: prev ? Math.min(prev.firstSeenAt || seenAt, seenAt) : seenAt,
      lastSeenAt: Math.max((prev && prev.lastSeenAt) || 0, seenAt),
    };
  }

  // Union two ledgers (used for cross-device merge and import).
  function mergeLedgers(a, b) {
    let out = { players: Object.assign({}, a.players), tournaments: Object.assign({}, a.tournaments), sync: a.sync };
    for (const rec of Object.values(b.tournaments)) out = ledgerPutRecord(out, rec);
    return out;
  }
  ```

- [ ] **Step 2: Add self-tests**

  ```js
  // Lifetime A3 — ledger merge/dedupe
  {
    const rec = { id: "t1", completedAt: 100, revisedAt: 1, results: [
      { phoneKey: "5550000001", name: "Ann", gamesPlayed: 3, wins: 2, losses: 1, pointsFor: 30, pointDiff: 4, finalRank: 1, podium: 1, partial: false, status: "active" },
    ]};
    let L = ledgerPutRecord(emptyLedger(), rec);
    console.assert(Object.keys(L.tournaments).length === 1 && L.players["5550000001"].displayName === "Ann", "put adds record + player");
    const older = Object.assign({}, rec, { revisedAt: 0, results: [Object.assign({}, rec.results[0], { wins: 99 })] });
    L = ledgerPutRecord(L, older);
    console.assert(L.tournaments["t1"].results[0].wins === 2, "older revisedAt does not overwrite");
    const dup = dedupeRecordResults([rec.results[0], Object.assign({}, rec.results[0], { gamesPlayed: 1, wins: 0, losses: 1, finalRank: 5, podium: null })]);
    console.assert(dup.length === 1 && dup[0].gamesPlayed === 4 && dup[0].finalRank === 1, "dedupe sums games, keeps best finish", dup);
  }
  ```

- [ ] **Step 3: Verify & commit**

  ```bash
  git add index.html
  git commit -m "feat(lifetime): pure ledger merge/dedupe functions"
  ```

## Task A4: Cross-format results normalization

**Files:** Modify `index.html` (`RUMBLE:LIFETIME`, `TESTS`)

- [ ] **Step 1: Implement normalization**

  Maps each format's per-slot stat object (from `computeStats`/`computeStackStats`/`computeKingStats`/`crownPlayerStats`) into the common row shape. Field sources are per the spec's normalization table (RR/Gauntlet: `gp/diff/points/wins/losses`; Stack: real `wins/losses`, `pointsScored/pointsAgainst`; King: `wins`, `losses = gp - wins`, no points-against; Crown: `gamesWon/gamesLost`).

  ```js
  function normalizeStatRow(format, st) {
    if (format === "king") {
      return { gamesPlayed: st.gp, wins: st.wins, losses: Math.max(0, st.gp - st.wins),
               pointsFor: st.pointsScored, pointDiff: 0 };
    }
    if (format === "stack") {
      return { gamesPlayed: st.gp, wins: st.wins, losses: st.losses,
               pointsFor: st.pointsScored, pointDiff: st.pointsScored - st.pointsAgainst };
    }
    if (format === "crown") {
      return { gamesPlayed: (st.gamesWon || 0) + (st.gamesLost || 0), wins: st.gamesWon, losses: st.gamesLost,
               pointsFor: st.pointsScored, pointDiff: st.pointDiff };
    }
    // rr / gauntlet (computeStats rows)
    return { gamesPlayed: st.gp, wins: st.wins, losses: st.losses,
             pointsFor: st.points, pointDiff: st.diff };
  }
  ```

- [ ] **Step 2: Add self-tests** (synthetic stat rows, no live state)

  ```js
  // Lifetime A4 — normalization
  {
    console.assert(JSON.stringify(normalizeStatRow("king", { gp: 4, wins: 3, pointsScored: 40 }))
      === JSON.stringify({ gamesPlayed: 4, wins: 3, losses: 1, pointsFor: 40, pointDiff: 0 }), "king losses = gp - wins");
    console.assert(normalizeStatRow("stack", { gp: 5, wins: 3, losses: 2, pointsScored: 50, pointsAgainst: 41 }).pointDiff === 9,
      "stack pointDiff = scored - against");
    console.assert(normalizeStatRow("crown", { gamesWon: 2, gamesLost: 1, pointsScored: 33, pointDiff: 5 }).gamesPlayed === 3,
      "crown gamesPlayed = won + lost");
  }
  ```

- [ ] **Step 3: Verify & commit**

  ```bash
  git add index.html
  git commit -m "feat(lifetime): cross-format stat normalization"
  ```

## Task A5: Aggregation (derive on read)

**Files:** Modify `index.html` (`RUMBLE:LIFETIME`, `TESTS`)

- [ ] **Step 1: Implement `playerCareer`**

  ```js
  function playerCareer(ledger, phoneKey) {
    const recs = Object.values(ledger.tournaments)
      .filter(t => t.results.some(r => r.phoneKey === phoneKey));
    let wins = 0, losses = 0, games = 0, pointsFor = 0, diffSum = 0;
    let best = null; const podiums = { 1: 0, 2: 0, 3: 0 };
    for (const t of recs) {
      const r = t.results.find(x => x.phoneKey === phoneKey);
      wins += r.wins; losses += r.losses; games += r.gamesPlayed;
      pointsFor += r.pointsFor; diffSum += r.pointDiff;
      if (r.finalRank && (best === null || r.finalRank < best)) best = r.finalRank;
      if (r.podium) podiums[r.podium]++;
    }
    const player = ledger.players[phoneKey] || { phoneKey, displayName: phoneKey, aliases: [] };
    return {
      phoneKey, displayName: player.displayName, aliases: player.aliases,
      tournaments: recs.length, wins, losses, games,
      winPct: games ? wins / games : 0,
      pointsFor, avgPointDiff: games ? diffSum / games : 0,
      bestFinish: best, podiums,
    };
  }
  function allCareers(ledger) { return Object.keys(ledger.players).map(k => playerCareer(ledger, k)); }
  ```

- [ ] **Step 2: Add self-tests**

  ```js
  // Lifetime A5 — aggregation
  {
    let L = emptyLedger();
    L = ledgerPutRecord(L, { id: "a", completedAt: 1, revisedAt: 1, results: [
      { phoneKey: "k", name: "K", gamesPlayed: 4, wins: 3, losses: 1, pointsFor: 40, pointDiff: 8, finalRank: 2, podium: 2, partial: false, status: "active" } ]});
    L = ledgerPutRecord(L, { id: "b", completedAt: 2, revisedAt: 1, results: [
      { phoneKey: "k", name: "K", gamesPlayed: 6, wins: 3, losses: 3, pointsFor: 55, pointDiff: -2, finalRank: 1, podium: 1, partial: false, status: "active" } ]});
    const c = playerCareer(L, "k");
    console.assert(c.tournaments === 2 && c.wins === 6 && c.games === 10, "career sums across records", c);
    console.assert(Math.abs(c.winPct - 0.6) < 1e-9 && c.bestFinish === 1 && c.podiums[1] === 1 && c.podiums[2] === 1, "career derived fields", c);
  }
  ```

- [ ] **Step 3: Verify & commit**

  ```bash
  git add index.html
  git commit -m "feat(lifetime): derive-on-read career aggregation"
  ```

## Task A6: LifetimeStore facade + NullBackend + localStorage

**Files:** Modify `index.html` (`RUMBLE:LIFETIME`, `TESTS`)

- [ ] **Step 1: Implement the facade**

  Persists the owner-namespaced shape from the spec. `NullBackend` is a no-op so all methods work signed-out.

  ```js
  const LIFETIME_KEY = "pb_lifetime_v1";
  const NullBackend = { connect(){}, disconnect(){}, push(){return Promise.resolve();}, deleteRemote(){return Promise.resolve();}, pull(){return Promise.resolve(null);} };

  const LifetimeStore = (() => {
    let backend = NullBackend;
    function readAll() {
      try { const raw = localStorage.getItem(LIFETIME_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
      return { schemaVersion: 1, activeOwner: "local", ledgers: { local: emptyLedger() } };
    }
    function writeAll(all) { try { localStorage.setItem(LIFETIME_KEY, JSON.stringify(all)); } catch (e) { console.warn("lifetime save failed", e); } }
    function active(all) { all.ledgers[all.activeOwner] = all.ledgers[all.activeOwner] || emptyLedger(); return all.ledgers[all.activeOwner]; }

    return {
      setBackend(b) { backend = b || NullBackend; },
      getLedger() { return active(readAll()); },
      putTournamentRecord(record) {
        const all = readAll(); const led = active(all);
        const merged = ledgerPutRecord(led, record);
        if (merged.sync.pendingTournamentIds.indexOf(record.id) === -1) merged.sync.pendingTournamentIds.push(record.id);
        all.ledgers[all.activeOwner] = merged; writeAll(all);
        backend.push(record).catch(() => {});
        return merged;
      },
      removeTournament(id) {
        const all = readAll(); const led = active(all);
        const tournaments = Object.assign({}, led.tournaments); delete tournaments[id];
        led.tournaments = tournaments;
        if (led.sync.pendingDeletes.indexOf(id) === -1) led.sync.pendingDeletes.push(id);
        writeAll(all);
      },
      removePlayer(phoneKey) {
        const all = readAll(); const led = active(all);
        const players = Object.assign({}, led.players); delete players[phoneKey]; led.players = players;
        for (const t of Object.values(led.tournaments)) t.results = t.results.filter(r => r.phoneKey !== phoneKey);
        writeAll(all);
      },
      clearLedger() { const all = readAll(); all.ledgers[all.activeOwner] = emptyLedger(); writeAll(all); },
      allRecords() { return Object.values(active(readAll()).tournaments); },
      career(phoneKey) { return playerCareer(active(readAll()), phoneKey); },
      careers() { return allCareers(active(readAll())); },
      exportJSON() { return JSON.stringify(active(readAll()), null, 2); },
      importJSON(text, opts) {
        const incoming = JSON.parse(text);
        if (!incoming || typeof incoming !== "object" || !incoming.tournaments) throw new Error("invalid lifetime export");
        const all = readAll(); const led = active(all);
        all.ledgers[all.activeOwner] = (opts && opts.merge) ? mergeLedgers(led, incoming) : incoming;
        writeAll(all);
      },
    };
  })();
  ```

- [ ] **Step 2: Add self-tests** (use a unique key guard so tests do not clobber real data)

  ```js
  // Lifetime A6 — store round-trips (save/restore real key around the test)
  {
    const saved = localStorage.getItem("pb_lifetime_v1");
    localStorage.removeItem("pb_lifetime_v1");
    const rec = { id: "t1", completedAt: 1, revisedAt: 1, results: [
      { phoneKey: "5550000009", name: "Z", gamesPlayed: 2, wins: 1, losses: 1, pointsFor: 20, pointDiff: 0, finalRank: 3, podium: 3, partial: false, status: "active" } ]};
    LifetimeStore.putTournamentRecord(rec);
    console.assert(LifetimeStore.allRecords().length === 1, "store persists record");
    LifetimeStore.putTournamentRecord(rec); // idempotent
    console.assert(LifetimeStore.allRecords().length === 1, "store idempotent on same id");
    const json = LifetimeStore.exportJSON();
    LifetimeStore.clearLedger();
    console.assert(LifetimeStore.allRecords().length === 0, "wipe clears");
    LifetimeStore.importJSON(json, { merge: true });
    console.assert(LifetimeStore.allRecords().length === 1, "import restores");
    LifetimeStore.removePlayer("5550000009");
    console.assert(LifetimeStore.career("5550000009").tournaments === 0, "removePlayer scrubs rows");
    if (saved !== null) localStorage.setItem("pb_lifetime_v1", saved); else localStorage.removeItem("pb_lifetime_v1");
  }
  ```

- [ ] **Step 3: Verify & commit**

  ```bash
  git add index.html
  git commit -m "feat(lifetime): LifetimeStore facade with NullBackend + localStorage"
  ```

## Task A7: Recording hook (format dispatch, wired to completion + undo)

**Files:** Modify `index.html` (`RUMBLE:LIFETIME`, finish handlers ~9993 & ~10979, undo path, `TESTS`)

- [ ] **Step 1: Implement record building + the hook**

  `buildTournamentRecord()` reads the live `state`, dispatches by format for stats and final ranking, joins slot→`phoneKey` via `phoneOf`, skips `gamesPlayed===0`, flags `partial`, and sets `podium` only from decided tiers. `recordToLifetimeIfEnabled()` is the single idempotent entry point.

  ```js
  function lifetimeStatsForFormat() {
    const f = state.format, total = state.rounds.length;
    if (f === "stack") return { rows: computeStackStats(total), order: finalRanking() };
    if (f === "king")  return { rows: computeKingStats(total),  order: finalRanking() };
    if (f === "crown") return { rows: crownPlayerStats(),       order: finalRankingCrown() };
    return { rows: computeStats(total, true), order: finalRanking() };
  }

  function buildTournamentRecord() {
    const { rows, order } = lifetimeStatsForFormat();   // order: array of slots, best-first
    const rankOf = {}; order.forEach((slot, i) => { rankOf[slot] = i + 1; });
    const podiumSlots = podiumSlotsFromFinals(); // {slot: 1|2|3} from decided tiers; {} for crown/small fields
    const results = [];
    for (const st of rows) {
      const slot = st.slot;
      const phoneRaw = phoneOf(slot);
      if (!lifetimeTrackable(phoneRaw)) continue;
      const norm = normalizeStatRow(state.format, st);
      if (norm.gamesPlayed === 0) continue;           // never-played / no-show
      const player = (state.players || []).find(p => p.slot === slot) || {};
      results.push(Object.assign({
        phoneKey: lifetimePhoneKey(phoneRaw), name: nameOf(slot), slot,
        status: player.status || "active",
        finalRank: rankOf[slot] || null,
        podium: podiumSlots[slot] || null,
        partial: (player.status === "left") || (player.joinedRound > 1),
      }, norm));
    }
    return {
      id: state.tournamentId, ownerId: currentOwnerId(), schemaVersion: 1,
      completedAt: Date.now(), revisedAt: Date.now(),
      format: state.format, courtCount: state.courtCount,
      trackedPlayerCount: new Set(dedupeRecordResults(results).map(r => r.phoneKey)).size,
      fieldSize: (state.players || []).length,
      results: dedupeRecordResults(results),
    };
  }

  function recordToLifetimeIfEnabled() {
    if (!state.saveToLifetime || !state.tournamentId) return;
    LifetimeStore.putTournamentRecord(buildTournamentRecord());
  }
  function retractLifetimeRecord() {
    if (state.tournamentId) LifetimeStore.removeTournament(state.tournamentId);
  }
  function currentOwnerId() { return "local"; } // replaced in Phase C when signed in
  ```

  Implement `podiumSlotsFromFinals()` using the existing finals tier data: for tiered formats read the decided finals tiers (the same structure the Champions screen renders) and assign 1/2/3 to the top tier's finishers; return `{}` when `state.format === "crown"` or no decided tier exists. (Inspect `buildFinals()`/`finalRanking()` output at implementation time; keep it read-only.)

- [ ] **Step 2: Wire the hook into completion and undo**

  At BOTH finish sites where `state.phase = "done"` is set (Crown ~9993 and tiered finals ~10979), add immediately after the assignment:

  ```js
  recordToLifetimeIfEnabled();
  ```

  In the undo handler, after restoring a snapshot, if the restored `state.phase !== "done"` and a record exists for `state.tournamentId`, retract it:

  ```js
  if (state.phase !== "done") retractLifetimeRecord();
  ```

  (Re-finishing later re-writes the same id, so this is safe.)

- [ ] **Step 3: Add a self-test for record building**

  Build a synthetic RR `state` (mirror the patterns in existing self-tests / `tools/visual-state-fixtures.mjs`: 4 players with phones, 1 decided round, `phase:"done"`, `tournamentId:"test-1"`), then:

  ```js
  // Lifetime A7 — record building (RR)
  {
    const savedState = state, savedLS = localStorage.getItem("pb_lifetime_v1");
    localStorage.removeItem("pb_lifetime_v1");
    state = /* synthetic 4-player RR done-state with phones on slots 1..4 */ buildLifetimeTestState();
    const rec = buildTournamentRecord();
    console.assert(rec.results.length === 4, "one row per trackable player", rec);
    console.assert(rec.results.every(r => r.gamesPlayed > 0), "no gp=0 rows");
    console.assert(rec.id === state.tournamentId, "record id = tournamentId");
    state = savedState;
    if (savedLS !== null) localStorage.setItem("pb_lifetime_v1", savedLS); else localStorage.removeItem("pb_lifetime_v1");
  }
  ```

  Add `buildLifetimeTestState()` next to the test as a small fixture builder (4 players, phones `"555000000"+slot`, one round with two decided games, `format:"rr"`, `phase:"done"`, `tournamentId:"test-1"`, `startedAt:1`).

- [ ] **Step 4: Verify & commit**

  Gates (check:index, ?test=1, ?simulate=0).

  ```bash
  git add index.html
  git commit -m "feat(lifetime): record tournaments on completion with format dispatch"
  ```

---

# Phase B - Local UI (still no cloud)

## Task B1: Save-to-lifetime toggle

**Files:** Modify `index.html` (`RENDER`: setup + done screens)

- [ ] **Step 1:** Add a labeled toggle bound to `state.saveToLifetime` on the setup screen (near the players/phones block) and mirror it on the done screen. On change: set `state.saveToLifetime`, `save()`, `render()`. Include the consent note: "Stores each player's results under their phone number for lifetime stats (on this device; synced when you sign in). Players can ask to be removed."
- [ ] **Step 2:** If toggled on while already `phase==="done"`, call `recordToLifetimeIfEnabled()`; if toggled off while done, call `retractLifetimeRecord()`.
- [ ] **Step 3:** Verify (gates) & commit:

  ```bash
  git add index.html
  git commit -m "feat(lifetime): save-to-lifetime toggle on setup and done"
  ```

## Task B2: Career view

**Files:** Modify `index.html` (`RENDER`)

- [ ] **Step 1:** Add a `renderCareerView()` reachable from the setup screen and/or settings. Render `LifetimeStore.careers()` as a sortable table (default sort: `winPct` desc, secondary `tournaments` desc) with a name/phone search box. Define and render all four states: **empty** ("No lifetime stats yet — enable 'Save to lifetime stats' when you run a tournament."), **loading** (Phase C only; local read is synchronous), **populated**, and **error**.
- [ ] **Step 2:** Row click opens the career card (Task B3).
- [ ] **Step 3:** Verify (gates) & commit:

  ```bash
  git add index.html
  git commit -m "feat(lifetime): career leaderboard view with empty/sort/search states"
  ```

## Task B3: Player career card

**Files:** Modify `index.html` (`RENDER`)

- [ ] **Step 1:** `renderCareerCard(phoneKey)` shows `LifetimeStore.career(phoneKey)` aggregates plus the player's recorded tournaments (date, format, finish, W/L) from `LifetimeStore.allRecords()`. Include a "Remove this player" action calling `LifetimeStore.removePlayer(phoneKey)` (with a confirm), then re-render.
- [ ] **Step 2:** Verify (gates) & commit:

  ```bash
  git add index.html
  git commit -m "feat(lifetime): player career card with per-player delete"
  ```

## Task B4: Data management (export / import / wipe)

**Files:** Modify `index.html` (`RENDER` or `MODALS`)

- [ ] **Step 1:** Add controls (in settings or the Career view): **Export** (download `LifetimeStore.exportJSON()` as a file; show a warning that it contains unencrypted phone numbers), **Import** (file picker → `LifetimeStore.importJSON(text,{merge:true})` with a try/catch surfacing validation errors; show which ledger/account it lands in and confirm), and **Wipe** (`LifetimeStore.clearLedger()` behind a confirm).
- [ ] **Step 2:** Verify (gates) & commit:

  ```bash
  git add index.html
  git commit -m "feat(lifetime): export/import/wipe data management"
  ```

## Task B5: Visual baselines for lifetime UI

**Files:** Modify `tools/visual-state-fixtures.mjs`, `tests/visual/rumble.visual.spec.mjs`

- [ ] **Step 1:** Add fixtures: `setup-lifetime-toggle` (setup state with `saveToLifetime:true`), `career-empty` (empty `pb_lifetime_v1`), and `career-populated` (seed `pb_lifetime_v1` with 2-3 careers). The visual spec seeds BOTH `pb_tourney_v5` and `pb_lifetime_v1` for these states.
- [ ] **Step 2:** Add Playwright tests capturing each new state (mask any `lastSyncedAt`/timestamp text). Generate baselines with `npm run test:visual:update`, review each PNG.
- [ ] **Step 3:** Run all gates (`npm run check:index`, `npm run test:self`, `npm run test:simulate`, `npm run test:visual`) & commit:

  ```bash
  git add tools/visual-state-fixtures.mjs tests/visual
  git commit -m "test(lifetime): visual baselines for toggle and career views"
  ```

> **Shippable checkpoint:** After Phase B, local-first lifetime stats work fully on GitHub Pages with no backend. Phases C/D add cross-device sync and are independently reviewable.

---

# Phase C - Cloud Sync (Firebase Firestore + Auth)

> For all Phase C/D tasks, pin the Firebase SDK version (Task C2) and confirm exact modular API call shapes against current docs at execution time (context7: `/firebase/firebase-js-sdk`).

## Task C1: Firebase project setup (manual) + publishable config

**Files:** Modify `index.html` (a `RUMBLE:LIFETIME` config constant); Create `firebase.json` (later tasks extend it)

- [ ] **Step 1 (manual):** Create a Firebase project. Enable **Authentication** with the chosen provider (Google recommended). Add the GitHub Pages origin (`<user>.github.io`) and any custom domain to **Authentication → Settings → Authorized domains**. Create a **Firestore** database (choose the region deliberately; record it in the spec's residency note). Copy the web app config.
- [ ] **Step 2:** Add the (publishable) web config as a constant in the LIFETIME section:

  ```js
  const FIREBASE_CONFIG = { apiKey: "…", authDomain: "…", projectId: "…", appId: "…" };
  const FIREBASE_SDK_VERSION = "10.x.x"; // pin exact version; same for all SDK modules
  ```

- [ ] **Step 3:** Commit (config is safe to commit; access is enforced by rules + App Check):

  ```bash
  git add index.html
  git commit -m "feat(lifetime): add publishable Firebase config + pinned SDK version"
  ```

## Task C2: Vendor SDK + module bridge

**Files:** Create `vendor/firebase/firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`; Modify `index.html`

- [ ] **Step 1:** Download the pinned modular SDK files into `vendor/firebase/` (served from the GitHub Pages origin — keeps "no build step" true and removes the third-party-CDN/offline-cold-start/supply-chain risks).
- [ ] **Step 2:** Add a single `<script type="module">` (separate from the classic app script) that imports from `vendor/firebase/*`, initializes the app + Firestore (with IndexedDB persistence) + Auth, and exposes a narrow handle plus a readiness promise:

  ```html
  <script type="module">
    import { initializeApp } from "./vendor/firebase/firebase-app.js";
    import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, reauthenticateWithRedirect } from "./vendor/firebase/firebase-auth.js";
    import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
             doc, setDoc, getDocs, collection, deleteDoc, writeBatch } from "./vendor/firebase/firebase-firestore.js";
    try {
      const app = initializeApp(window.FIREBASE_CONFIG);
      const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
      window.__rumbleFb = { app, db, auth: getAuth(app),
        api: { GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, reauthenticateWithRedirect, doc, setDoc, getDocs, collection, deleteDoc, writeBatch },
        ready: true };
      if (window.__rumbleFbOnReady) window.__rumbleFbOnReady();
    } catch (e) { console.warn("Firebase unavailable; staying local-only", e); }
  </script>
  ```

  Expose `window.FIREBASE_CONFIG = FIREBASE_CONFIG;` from the classic script before this module runs. The classic-script code must treat `window.__rumbleFb` as possibly-absent (offline cold start, blocked) and fall back to `NullBackend`.
- [ ] **Step 3:** Verify the app still boots and `?test`=1/`?simulate`=0 with Firebase absent (it must not throw). Commit:

  ```bash
  git add index.html vendor/firebase
  git commit -m "feat(lifetime): vendor Firebase SDK + module bridge with local-only fallback"
  ```

## Task C3: FirestoreBackend

**Files:** Modify `index.html` (`RUMBLE:LIFETIME`)

- [ ] **Step 1:** Implement a `FirestoreBackend(ownerId)` matching the `SyncBackend` shape used by `LifetimeStore` (`push(record)`, `pull()`, plus `deleteRemote(id)`), using `window.__rumbleFb.api`. Paths: `owners/{ownerId}/tournaments/{id}` and `owners/{ownerId}/players/{phoneKey}`. `pull()` returns a ledger built from `getDocs` of both subcollections.

  ```js
  function FirestoreBackend(ownerId) {
    const fb = window.__rumbleFb, { db, api } = fb;
    const tcol = api.collection(db, "owners", ownerId, "tournaments");
    const pcol = api.collection(db, "owners", ownerId, "players");
    return {
      push(record) { return api.setDoc(api.doc(tcol, record.id), record); },
      deleteRemote(id) { return api.deleteDoc(api.doc(tcol, id)); },
      async pull() {
        const led = emptyLedger();
        (await api.getDocs(tcol)).forEach(d => { led.tournaments[d.id] = d.data(); });
        (await api.getDocs(pcol)).forEach(d => { led.players[d.id] = d.data(); });
        return led;
      },
    };
  }
  ```

- [ ] **Step 2:** Commit (no behavior change until wired in C5):

  ```bash
  git add index.html
  git commit -m "feat(lifetime): FirestoreBackend implementing the SyncBackend shape"
  ```

## Task C4: Auth + sign-in/sync UI

**Files:** Modify `index.html` (`RUMBLE:LIFETIME`, `RENDER`)

- [ ] **Step 1:** Add sign-in/out using redirect-based Google auth via `window.__rumbleFb.api`. On `onAuthStateChanged`, set the current user, set `currentOwnerId()` to return `user.uid` when signed in, switch the active ledger (Task C6), and trigger a sync (Task C5). Call `getRedirectResult` on load to complete a redirect.
- [ ] **Step 2:** Add a "Sign in to sync" affordance and a status chip (`Synced` / `Pending` / `Offline`) driven by `LifetimeStore.status()`. Signed-out remains fully functional (local-only).
- [ ] **Step 3:** Verify & commit:

  ```bash
  git add index.html
  git commit -m "feat(lifetime): redirect Google auth + sync status UI"
  ```

## Task C5: Wire sync into LifetimeStore

**Files:** Modify `index.html` (`RUMBLE:LIFETIME`)

- [ ] **Step 1:** Extend `LifetimeStore` with `connect(user)` / `disconnect()` / `syncNow()` / `status()`:
  - `connect(user)`: `setBackend(FirestoreBackend(user.uid))`, set `activeOwner = user.uid`, then `syncNow()`.
  - `syncNow()`: push each id in `pendingTournamentIds`; apply `pendingDeletes` via `deleteRemote`; `pull()` and `mergeLedgers(local, remote)`; clear pending entries only on resolved acks; set `lastSyncedAt`.
  - `status()`: `{ online: navigator.onLine, signedIn: backend!==NullBackend, lastSyncedAt, pendingCount }`.
- [ ] **Step 2:** Trigger `syncNow()` on connect, on `online` events, and after each `putTournamentRecord`/`removeTournament` when signed in. The localStorage `pending*` arrays remain the durable outbox.
- [ ] **Step 3:** Manual verify: sign in on two browsers, complete a tournament with the toggle on, confirm it appears on the second after sync; complete offline then reconnect → flush. Commit:

  ```bash
  git add index.html
  git commit -m "feat(lifetime): cross-device sync via pending-outbox + merge"
  ```

## Task C6: Sign-out evict, account switch, anonymous merge

**Files:** Modify `index.html` (`RUMBLE:LIFETIME`, `RENDER`)

- [ ] **Step 1:** On sign-out: `disconnect()` (`setBackend(NullBackend)`), set `activeOwner = "local"`, and **evict** the signed-in owner's cached ledger from `localStorage` (recoverable from cloud on next sign-in). Offer an explicit, warned "keep a local copy" opt-out.
- [ ] **Step 2:** On account switch: load/pull the new `uid`'s ledger; never comingle.
- [ ] **Step 3:** Anonymous-data merge: on first sign-in with a non-empty `local` ledger, show a dialog listing each anonymous tournament (date/format/players) for explicit per-item selection (default none); selected items merge into the account ledger. Add a "clear anonymous data" control and a "this device only" note in the Career view when `activeOwner==="local"`.
- [ ] **Step 4:** Verify & commit:

  ```bash
  git add index.html
  git commit -m "feat(lifetime): sign-out eviction, account switch, explicit anonymous merge"
  ```

---

# Phase D - Security, Privacy & Release

## Task D1: Firestore security rules

**Files:** Create `firestore.rules`, `firebase.json`

- [ ] **Step 1:** Write owner-scoped rules with explicit per-collection matches (no `{document=**}`), split create/update/delete, and body validation:

  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{db}/documents {
      function isOwner(ownerId) { return request.auth != null && request.auth.uid == ownerId; }
      match /owners/{ownerId}/tournaments/{tid} {
        allow read, delete: if isOwner(ownerId);
        allow create, update: if isOwner(ownerId)
          && request.resource.data.ownerId == ownerId
          && request.resource.data.results.size() <= 64;
      }
      match /owners/{ownerId}/players/{phoneKey} {
        allow read, delete: if isOwner(ownerId);
        allow create, update: if isOwner(ownerId) && phoneKey.matches('^[0-9]+$');
      }
    }
  }
  ```

- [ ] **Step 2:** Add `firebase.json` pointing at the rules + emulator config. Deploy rules from the file only (`firebase deploy --only firestore:rules`); never edit rules in the console.
- [ ] **Step 3:** Commit:

  ```bash
  git add firestore.rules firebase.json
  git commit -m "feat(lifetime): owner-scoped Firestore security rules"
  ```

## Task D2: Rules emulator negative tests

**Files:** Create `tests/rules/lifetime-rules.test.mjs`; Modify `package.json`

- [ ] **Step 1:** Add a dev dependency `@firebase/rules-unit-testing` and a script:

  ```json
  { "scripts": { "test:rules": "firebase emulators:exec --only firestore \"node --test tests/rules/lifetime-rules.test.mjs\"" } }
  ```

- [ ] **Step 2:** Write negative tests asserting user A cannot create/get/list/update/delete under user B's `tournaments` or `players`, and that body validation rejects oversized `results` and a non-numeric `phoneKey`. Include positive tests (owner can CRUD their own).
- [ ] **Step 3:** Run `npm run test:rules` (all pass) & commit:

  ```bash
  git add package.json package-lock.json tests/rules
  git commit -m "test(lifetime): emulator negative tests for security rules"
  ```

## Task D3: App Check

**Files:** Modify `index.html` (module bridge)

- [ ] **Step 1 (manual):** Register the site for App Check (reCAPTCHA) in the Firebase console; enable enforcement on Firestore.
- [ ] **Step 2:** Initialize App Check in the module bridge (import `initializeAppCheck`, `ReCaptchaV3Provider` from `vendor/firebase/firebase-app-check.js`) before Firestore use. Keep the local-only fallback if App Check init fails.
- [ ] **Step 3:** Verify a signed-in sync still works; commit:

  ```bash
  git add index.html vendor/firebase
  git commit -m "feat(lifetime): enable App Check on the Firebase clients"
  ```

## Task D4: Cloud deletion completeness + privacy copy

**Files:** Modify `index.html` (`RUMBLE:LIFETIME`, `RENDER`)

- [ ] **Step 1:** Make `removePlayer`/`clearLedger` propagate to Firestore when signed in: per-player delete also deletes/updates each remote `tournaments/{id}` doc to drop that `phoneKey` row (delete the tournament doc if it becomes empty) and deletes `players/{phoneKey}`; wipe enumerates and `writeBatch`-deletes every doc under both subcollections; `pendingDeletes` survive sign-out/switch until acked.
- [ ] **Step 2:** Add the privacy notice text near the toggle and a short "Your lifetime data" help blurb (on-device + owner-scoped cloud; how to delete; retention = until deleted; region noted). Mirror the spec's Privacy section.
- [ ] **Step 3:** Manual verify deletes propagate to the cloud (including `results`-row scrub); commit:

  ```bash
  git add index.html
  git commit -m "feat(lifetime): cloud-complete deletion + privacy notices"
  ```

## Task D5: Release - service worker cache + vendored SDK precache

**Files:** Modify `sw.js`

- [ ] **Step 1:** Add the `vendor/firebase/*` files to the SW `SHELL` precache list and bump the cache `VERSION` (e.g. `v8` → `v9`). This is the one task permitted to change `sw.js`.
- [ ] **Step 2:** Verify offline cold-load behavior (the app loads; Firebase available after one online visit) and run all gates.
- [ ] **Step 3:** Commit:

  ```bash
  git add sw.js
  git commit -m "chore(sw): precache vendored Firebase SDK and bump cache version"
  ```

---

## Final Acceptance Checklist

- [ ] `RUMBLE:LIFETIME` boundary added and `npm run check:index` passes.
- [ ] `index.html?test` ends at exactly 1 failure (all lifetime self-tests pass); `index.html?simulate` ends at 0.
- [ ] Identity (`lifetimePhoneKey`/`lifetimeTrackable`), pure ledger merge/dedupe, cross-format normalization, and aggregation are unit-tested inline and pass.
- [ ] Tournaments record on completion for every format (RR/Gauntlet/Stack/King/Crown) with correct slot→phone join, gp=0 skipped, partial flagged, podium only from decided tiers; undo retracts.
- [ ] Career view (empty/populated/sort/search), career card (per-player delete), and export/import/wipe work locally with no backend.
- [ ] Visual baselines exist for toggle + career states and `npm run test:visual` passes.
- [ ] Firebase is vendored (no CDN, no build step); the module bridge falls back to local-only when Firebase is absent.
- [ ] Cross-device sync works (two devices converge; offline completion flushes on reconnect) via the durable localStorage outbox + merge-by-id.
- [ ] Sign-out evicts the cached ledger; account switch does not comingle; anonymous data is never blanket-merged.
- [ ] `firestore.rules` is owner-scoped with body validation; `npm run test:rules` (emulator negative tests) passes; App Check enabled.
- [ ] Per-player delete and wipe propagate to the cloud, scrubbing `results` rows; privacy notices present.
- [ ] `sw.js` cache bumped and vendored SDK precached (release task only).
- [ ] Root `index.html` remains the committed, deployable app; no framework, no build step.
