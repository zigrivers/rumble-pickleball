# Permanent (Lifetime) Player Stats - Design

## Goal

Let an organizer optionally accumulate a player's **lifetime stats across tournaments**, keyed by the player's **phone number** as a stable identity, and have those stats **sync automatically across the organizer's own devices** (e.g. laptop and phone). The app's HTML/CSS/JS continues to ship from GitHub Pages with no build step; only a runtime data dependency is added, and only when the organizer is signed in.

This is **product feature work**, distinct from the technical-enablers effort. It deliberately sets aside the technical-enablers "no runtime dependency" principle for this one feature, as a conscious, scoped trade.

## Scope

This spec covers a single feature: opt-in, phone-keyed, cross-device lifetime player stats with a local-first store and a cloud sync layer.

In scope (v1):

- Phone-keyed lifetime identity and append-only per-tournament records.
- A per-tournament opt-in toggle (organizer-controlled) that records results on completion.
- A local-first store (`localStorage`) that is the on-device source of truth.
- A cloud sync layer (Firebase Firestore) scoped to a signed-in organizer account, with tested security rules.
- A Career view, a per-player career card, sign-in/sync UI, and data management (export/import/delete).

Out of scope (deferred):

- Global, cross-organizer player profiles (the "open it to the world" phase).
- SMS phone-ownership verification, profile claim/consent flows, moderation.
- Real-time multi-device live updates (v1 syncs on load and on change, not live).
- Per-player lifetime **award** tallies, an identity-**merge** tool, partner/chemistry analytics, streaks, lifetime head-to-head, inline lifetime stats on the live standings.

## Relationship To The Technical-Enablers Work

The technical-enablers spec/plan (`docs/superpowers/specs/2026-06-12-technical-enablers-design.md`, `docs/superpowers/plans/2026-06-12-technical-enablers.md`) is a prerequisite foundation, run partially first:

1. Run technical-enablers **Tasks 1-4** first: boundary map + section sentinels, URL gate runner, visual state fixtures, and the Playwright visual playbook. These are the safety nets.
2. Build this lifetime-stats feature on top of that harness.
3. Defer technical-enablers **Tasks 5-7** (the deterministic source-split) until after the feature ships; the split then carries the feature's code along.

Rationale: the regression nets (visual baselines, boundary checks) should exist before a new persistence layer and new UI surfaces are added to the single-file app, but feature value should not block on the churn-heavy source split.

## Current State

- `index.html` is a single-file vanilla HTML/CSS/JS PWA (~13,000 lines as of 2026-06-13), persisted entirely in `localStorage`, served by a cache-first service worker (`sw.js`, cache `VERSION` currently `v8`).
- **The whole app is one classic `<script>`** (no `type="module"`, no ESM imports). `runSelfTests()` is fired synchronously via `queueMicrotask` and tallies `console.assert` failures synchronously. This constrains how Firebase and how new self-tests can be added (see Firebase Integration and Testing).
- **Phone numbers are already first-class.** `normalizePhone()` (keeps a leading `+`, strips other non-digits), `isValidPhone()` (>= 7 digits), `phoneOf(slot)` (reads `player.phone`, falls back to `state.phones[slot-1]`), and `smsHref()` exist; setup captures `rawPhones`/`phones`.
- **A persistent roster already exists**: a separate `localStorage` key (`ROSTER_KEY`, `pb_roster_v1`) mapping `name.toLowerCase() -> phone`, surviving across tournaments and auto-filling phones when a known name is typed.
- **Stats and ranking are format-dispatched, not uniform.** This is the most important fact for this feature:
  - Per-player stats: `computeStats(throughRound, includeFinals)` is **RR/Gauntlet only** (rows keyed by `slot`, fields `wins/losses/points/diff/gp/winRate`, no phone). Stack uses `computeStackStats()`, King uses `computeKingStats()`, Crown uses `crownPlayerStats()` - each with **different field shapes**: Stack tracks `wins/losses/pointsScored/pointsAgainst`; King tracks `wins` but has **no `losses` and no points-against**; Crown uses `gamesWon/gamesLost` over best-of-3 sub-games.
  - Final ordering: `rankPlayersForFormat()` dispatches in-progress ranking; final placement comes from `finalRanking()` (tiered formats) or `finalRankingCrown()` (Crown), **not** `rankPlayers()`.
  - Awards: `computeAwards()` (RR/Stack/King/Gauntlet) and `computeCrownPerformanceAwards()` (Crown) return objects keyed by **display-name/team strings**, with no slot or phone.
- There is **no** cross-tournament aggregation and **no** stable per-tournament identifier today. Tournament state is versioned (`pb_tourney_v5`, with v1-v5 migrations via `backfillStateDefaults()`).

The gap this feature fills: a persistent, **phone-keyed**, **format-normalized** aggregate that accumulates after each finished tournament, shareable across the organizer's devices.

## Locked Decisions

| Decision | Choice |
| --- | --- |
| Identity key | Canonicalized phone number; only valid-phone players are tracked |
| Data model | Append-only per-tournament records keyed by `tournamentId`, aggregates derived on read |
| Opt-in model | Per-tournament toggle, organizer is the consent-holder |
| Storage reach | Cross-device, automatic |
| Architecture | Local-first store + cloud sync layer behind a `LifetimeStore` facade |
| Sharing scope | Global-*ready* architecture, **scoped launch** (data scoped to the signed-in owner) |
| Backend | Firebase Firestore + Firebase Auth |
| Auth | Organizer sign-in; data scoped by `ownerId` (the auth `uid`) |

## Design Principles

- **Local-first; localStorage is the durable source of truth.** Running and recording a tournament never depends on the network. The on-device `pendingTournamentIds`/`pendingDeletes` queue (not the Firestore SDK's in-memory queue) is the authoritative outbox; Firestore offline persistence is enabled as a convenience but never solely trusted.
- **Append-only and idempotent.** Records are immutable except for in-place revision of the same `tournamentId` (bumping `revisedAt`). Cross-device merge is a union keyed by id with last-write-wins by `revisedAt`.
- **One swap seam.** All persistence/sync goes through a `LifetimeStore` facade with a pluggable `SyncBackend` (`NullBackend` = pure local; `FirestoreBackend` = synced). The pure merge/dedupe/aggregation functions take a ledger argument and touch neither the network nor module globals, so they are unit-testable synchronously.
- **Global-ready, scoped now.** Phone key, owner scoping, and real auth are built so a future global phase changes *who can read*, not the identity foundation. No world-facing surface ships in v1.
- **PII is handled as a v1 obligation, not a later concern.** The owner is a controller of third parties' phone numbers the moment data reaches the cloud. Deletion, notice, retention, residency, and breach exposure apply now (see Privacy).
- **Preserve static delivery.** No build step or bundler. The Firebase SDK is vendored into the repo as static files served from the same GitHub Pages origin (see Firebase Integration).

## Approaches Considered

(Condensed; full alternatives were weighed during brainstorming.)

- **Data model:** append-only per-tournament records + derived aggregates (**chosen**) vs. running per-phone counters (not mergeable, breaks on edits) vs. extending the name-keyed roster (wrong identity key, conflates concerns).
- **Storage reach:** local-only (per-device; rejected, fails the cross-device requirement) vs. local-first + cloud sync (**chosen**).
- **Backend:** Firebase Firestore (**chosen**; best offline-first, built-in Auth + rules, free tier) vs. Supabase (documented swap behind the facade) vs. own serverless+DB (more to maintain) vs. GitHub Gist (rejected: client-side token, single-writer).
- **Sharing scope:** global-ready architecture with a **scoped launch** (chosen) over global-on-day-one (a multi-tenant product) or league-only.
- **Auth:** organizer account sign-in (**chosen**) over a shared "group code" (weaker PII security, not global-ready).

## Identity Model

- The lifetime key is a **canonical phone key** produced by a dedicated `lifetimePhoneKey(raw)`: take `normalizePhone(raw)`, strip the leading `+`, and reduce a leading NANP country code (an 11-digit string beginning with `1` drops the `1`). This makes `5552013344`, `15552013344`, and `+15552013344` collapse to one key. Non-NANP numbers are kept as their digit string.
- Eligibility for lifetime tracking requires a stricter check than `isValidPhone()`'s 7-digit minimum: a `lifetimeTrackable(raw)` predicate requiring a canonical key of >= 10 digits. A player who is not trackable plays normally but is **not** recorded. (`isValidPhone` remains for the existing SMS feature.)
- Record-time identity is always resolved via `phoneOf(slot)` (so late-added players whose phone lives only in `state.phones` are not dropped), then canonicalized.
- For each key, the store keeps the **most recent display name** and a capped list (max 5) of prior names as `aliases`, so a name change does not fork identity.
- **Known v1 limitations (accepted):** the same person under two genuinely different numbers stays two careers; a shared/reused number merges two people. There is **no identity-merge tool** in v1 (deferred). Within a single tournament record, duplicate canonical keys are de-duplicated (see Data Model) so one tournament never counts twice for one key.

## Data Model

### On-device (localStorage)

New key `pb_lifetime_v1`, namespaced by owner with an anonymous bucket for signed-out use:

```text
pb_lifetime_v1 = {
  schemaVersion: 1,
  activeOwner: "<ownerId | 'local'>",
  ledgers: {
    "<ownerId | 'local'>": {
      players: {
        "<phoneKey>": { phoneKey, displayName, aliases: [], firstSeenAt, lastSeenAt }
      },
      tournaments: {
        "<tournamentId>": {
          id, ownerId, schemaVersion, completedAt, revisedAt,
          format, courtCount, trackedPlayerCount, fieldSize,
          results: [
            { phoneKey, name, slot, status,
              gamesPlayed, wins, losses, pointsFor, pointDiff,
              finalRank, podium /* 1|2|3|null */, partial /* bool */ }
          ]
        }
      },
      sync: { lastSyncedAt, pendingTournamentIds: [], pendingDeletes: [] }
    }
  }
}
```

- `tournaments` is a **map keyed by `tournamentId`** so writes are idempotent.
- `revisedAt` is the merge tiebreaker.
- `trackedPlayerCount` = distinct canonical phone keys that played >= 1 decided game (trackable players only; it deliberately excludes untrackable/no-phone players and is **not** the field size). `fieldSize` = total roster size, the denominator for podium-on-read context.
- **Per-record de-duplication:** if two slots resolve to the same canonical key in one tournament, their rows are collapsed: sum the game/point counts, and keep the row whose `finalRank` is better, taking that row's `podium`/`partial`/`status`. `playerCareer(phoneKey)` counts **records containing the key** as one tournament each, never per-row, so a shared number never inflates "tournaments played."
- The anonymous `'local'` bucket holds data captured while signed out; it is **not** blanket-merged on sign-in (see Sign-out / Account Switch / Anonymous Data).

### Cross-format results normalization

Each format's stat object is mapped at **record time** into the common `results` schema above:

| Field | RR / Gauntlet | Stack | King | Crown |
| --- | --- | --- | --- | --- |
| `wins` | `wins` | `wins` | `wins` | `gamesWon` (sub-games) |
| `losses` | `losses` | `losses` | `gp - wins` | `gamesLost` |
| `gamesPlayed` | `gp` | `gp` | `gp` | sub-games played |
| `pointsFor` | `points` | `pointsScored` | `pointsScored` | `pointsScored` |
| `pointDiff` | `diff` | `pointsScored - pointsAgainst` | n/a -> 0 (no points-against) | `pointDiff` |

- Lifetime **win %** is defined uniformly as `wins / gamesPlayed` after this normalization, so it is commensurable across formats. Crown contributes sub-game wins/losses (documented; a Crown "win" is not identical to an RR "win" but both reduce to per-game W/L).
- Format-specific advanced metrics (e.g. `stackRate`, `kingScore`, `courtClimbs`) are **not** carried into the lifetime record in v1 (common-denominator set only). The raw tournament remains fully inspectable in the app at the time it is run.

### Cloud (Firestore)

Owner-scoped, with each doc carrying its own `schemaVersion`:

```text
/owners/{ownerId}/tournaments/{tournamentId}   -> tournament record
/owners/{ownerId}/players/{phoneKey}           -> player profile
```

## Storage Architecture: Local-First + Cloud Sync

### The facade

`LifetimeStore` is the only API the app calls. Local methods (work signed-out, offline, synchronous over localStorage): `load`, `putTournamentRecord`, `removeTournament`, `removePlayer`, `clearLedger`, `allRecords`, `playerCareer(phoneKey)`, `allPlayers`, `exportJSON`, `importJSON(text,{merge})`. Sync methods (active only signed in, async): `connect(authUser)`, `disconnect()`, `syncNow()`, `status()` -> `{ online, signedIn, lastSyncedAt, pendingCount }`.

The **pure** functions used by merge/dedupe/aggregation/import are factored to take a ledger object and return a new one (no globals, no I/O), enabling synchronous self-tests.

### Sync and merge semantics

- **On completion (toggle on):** write the record to the active local ledger first, push its id onto `pendingTournamentIds`, then attempt the Firestore write. The on-device pending list - not the SDK - is the durable outbox; on next load any still-pending ids are retried.
- **On load / sign-in:** pull the owner's `tournaments` and `players`, merge by `tournamentId` (union; greater `revisedAt` wins). Player-map merge: union aliases (capped), min `firstSeenAt`, max `lastSeenAt`, newest `displayName` by `lastSeenAt`.
- **Deletes:** tracked in `pendingDeletes` (durable across sign-out/switch); applied to Firestore on next sync; a re-finalize after a delete wins if its `revisedAt` is newer. Pending entries clear only on confirmed server ack.
- **Conflicts are rare by construction:** `tournamentId` (post-`makeScheduleSeed()` seed + `startedAt` ms) is specific to the device/run; ids are unique **per owner** (sufficient given owner scoping). `tournamentId` is an identifier, never an access token.

### Sign-out / Account Switch / Anonymous Data

- **Sign-out:** by default **evict** the owner's cached ledger from the device (it is recoverable from the cloud on next sign-in), so third-party phone numbers do not linger on a shared device. Retaining a local copy is an explicit, warned opt-in.
- **Account switch:** ledgers are kept separate per `ownerId`; switching loads/pulls the new owner's ledger. No comingling.
- **Anonymous data:** the `'local'` bucket is **never** blanket-merged into an account on sign-in (this would leak one organizer's captures into whoever signs in first on a shared device). Instead, each anonymous tournament is tagged with its capture session; the merge UI lists individual tournaments (date, format, player count) for explicit per-item selection, defaulting to none. A "clear anonymous data" control is provided, and the `'local'` bucket shows a "this device only" warning in the Career view.

## Firebase Integration (No Build Step)

- **Vendored SDK, same origin.** The pinned modular Firebase SDK files (`firebase-app`, `firebase-auth`, `firebase-firestore`, all the **same** version string, defined once as a constant) are committed to the repo and served from the GitHub Pages origin. This keeps "no build step" true, removes the third-party-CDN supply-chain and offline-cold-start risks, and lets the service worker precache them.
- **Module bridge.** A single small `<script type="module">` imports the SDK and exposes a narrow, namespaced handle on `window` (e.g. `window.__rumbleFb`) plus a `ready` promise. The existing classic script's `FirestoreBackend` awaits that promise and guards on its presence. If the import fails (offline cold start, blocked origin, CSP), the failure is caught and the app falls back to `NullBackend` without throwing - sync degrades, the app keeps working.
- **Offline durability.** Firestore is initialized with IndexedDB persistence (`initializeFirestore(app, { localCache: persistentLocalCache(...) })`, not the default memory cache). Persistence is best-effort (unavailable in some private-browsing modes); the localStorage outbox remains the real durability guarantee.
- **Service worker.** `sw.js` is cache-first and early-returns on non-GET, so Firestore writes (POST/WebChannel) pass through untouched. The vendored SDK files are added to the SW `SHELL` precache, which requires bumping the SW cache `VERSION` - done in the **release task** that ships Firebase, per the technical-enablers rule against incidental cache bumps.
- **Config is publishable.** The Firebase web config (`apiKey`, etc.) identifies the project and is safe to commit; access is enforced by Auth + security rules + App Check (below), not by hiding the config.

## Auth

- **Method:** organizer sign-in via Firebase Auth. **Redirect-based** Google sign-in is the primary method (`signInWithPopup` is unreliable on iOS Safari / third-party-storage-blocking browsers - the exact PWA-on-phone case). Email-link sign-in, if offered, requires explicit continue/return-URL handling.
- **Ops prerequisites (documented dev-ops, not runtime):** the GitHub Pages origin and any custom domain must be added to Firebase **Authorized Domains** or sign-in throws `auth/unauthorized-domain`.
- **Re-authentication** is required before destructive or exfiltrating actions: export, full wipe, and account switch.

## Security Rules (A Tested, Tracked Artifact)

The rules are the **entire confidentiality boundary** for third parties' phone numbers, so they are a first-class deliverable, not an afterthought:

- Stored as `firestore.rules` in the repo; **console edits are forbidden**; deploys come only from the tracked file.
- **Explicit per-collection matches** (not a catch-all `{document=**}`, which would grant any future subcollection by default). Separate `allow create`, `update`, `delete`, `read`.
- **Authorization:** every operation requires `request.auth.uid == ownerId`.
- **Body validation** on writes: enforce `request.resource.data.ownerId == ownerId` on tournament docs; whitelist top-level keys; enforce field types; cap document size and `results` array length; constrain `phoneKey` to the canonical charset. This blunts a signed-in user scripting arbitrary/oversized writes into their own subtree (free-tier abuse vector).
- **App Check** (reCAPTCHA) is enabled to deter scripted abuse using the public config.
- **Negative tests are mandatory:** using the Firebase Emulator + `@firebase/rules-unit-testing`, assert that user A cannot create/get/list/update/delete anything under user B's `tournaments` or `players`. CI/deploy is gated on these tests. (These run in Node, separate from the browser `?test` harness.)

## Recording Flow

1. **Setup:** a persisted toggle `state.saveToLifetime` (default **off**) on the setup screen, mirrored on the done screen, with copy stating that enabling it stores phone-keyed results locally and (when signed in) in the cloud, and that players can ask to be removed. This toggle is the consent gate.
2. **Start:** `startTournament()` sets `state.startedAt = Date.now()` and, **after** `state.scheduleSeed = makeScheduleSeed()` runs, stamps `state.tournamentId = "<scheduleSeed>-<startedAt>"` exactly once; never recomputed on edits (`startTournament` already `save()`s). Legacy in-progress/done states: `backfillStateDefaults()` stamps `startedAt`/`tournamentId` **only if missing**, using a deterministic fallback - it must **not** read `Date.now()`/random inside backfill, because backfill also runs on read-only display reads (`readDisplayState`) and on every undo (`restoreUndoSnapshot`), and `save()` persists the global `state`, not backfill's argument. The **boot path** persists these once via `save()` after the global `state` is assigned, so the id never re-derives across loads.
3. **Play:** nothing is written to the lifetime store.
4. **Completion:** a single idempotent `recordToLifetimeIfEnabled()` is called from **every** transition into `phase="done"` (the Crown finish handler ~9993 and the tiered-finals finish handler ~10979), guarded by `state.saveToLifetime`. It must tolerate being called repeatedly (re-finish after an undo, or "edit final scores" then re-finalize) - idempotency comes from the `tournamentId` key + `revisedAt` bump. It:
   - selects the format-correct stat source (`computeStats`/`computeStackStats`/`computeKingStats`/`crownPlayerStats`) and the format-correct final ordering (`finalRanking()` or `finalRankingCrown()`);
   - for each slot with a `lifetimeTrackable` phone (resolved via `phoneOf`), normalizes into the common `results` schema, joins `slot -> phoneKey`, sets `finalRank`, `partial` (left/late), and `podium`;
   - **skips slots with `gamesPlayed === 0`** (no-shows / never-played);
   - de-duplicates by canonical key;
   - calls `LifetimeStore.putTournamentRecord(...)` and updates the `players` map.
5. **Edits & undo:** re-finalizing rewrites the same `tournamentId` (new `revisedAt`). An undo that leaves `phase==="done"` (the organizer backs out of the finish to keep playing or abandons it) retracts the record via `removeTournament(id)`; a later re-finish re-writes it. Turning the toggle off for a recorded tournament also calls `removeTournament(id)`. (The app has undo only, no redo.)

### Podium and partial participation

- `finalRank` is taken from the format's final-ranking function for every recorded player.
- `podium` (1/2/3) is **only** a decided finals-tier placement. It is `null` whenever no decided tier covers the player: Crown, fields too small to form tiers (`buildFinals()` makes `tierCount = min(courtCount, floor(activeRanked/4))`, which can be 0 or 1), unseated players, and players who **left** mid-tournament (seeded only if `status==="active"`). The record stores `finalRank` + `fieldSize`; podium is derived/displayed on read.
- Players who left or joined mid-tournament are recorded with their **actual** games played and flagged `partial: true` (and `status`), so aggregation can annotate or filter them. They are excluded from `podium`.

## Aggregation (Derived On Read)

`playerCareer(phoneKey)` scans that key's records (counting each record once) and computes: tournaments played, total wins/losses, lifetime win % (`totalWins / totalGames`), total games, total points-for, average point differential, best `finalRank`, and podium counts derived from records where `podium` is non-null. Aggregation reads **only the stored `results` numbers**; it never re-invokes the `state`-coupled live stat functions. Per-player lifetime **award** tallies are deferred to v2 (award attribution is name/team-string based today and lossy to map to a phone).

## UI Surfaces (v1)

- **Save toggle** (setup + done) with consent copy.
- **Career view:** a new screen reachable from setup/settings - sortable leaderboard (default sort: win %, secondary: tournaments played) with search by name/phone. Defined states: **empty** (no tracked players - the common first run since the toggle defaults off), **loading** (initial Firestore pull), **populated**, and **sync-error**. Empty and populated baselines both go in the visual playbook.
- **Player career card:** aggregates + the player's recorded tournaments (date, format, finish, W/L), with a per-player delete.
- **Sign-in / sync UI:** "Sign in to sync" plus an account + sync-status chip (`Synced` / `Pending` / `Offline`). Signed-out is local-only and fully functional.
- **Data management:** export (with a warning that the file contains unencrypted phone numbers; optional passphrase), import (schema/size/type-validated; on import while signed in, the target account is shown and confirmed - never blanket-merged), delete one player, wipe ledger. Deletes apply to local **and** cloud (see Deletion).

## Privacy / PII

Applies in v1 (not deferred), because real third-party phone numbers reach a real cloud:

- **Controller status & notice.** The signed-in organizer is a controller of others' contact PII. The toggle copy provides notice to players and a removal path. A documented stance for lawful basis is required.
- **Retention.** Default stance documented (v1: retained until deleted); a future auto-expiry is noted.
- **Data residency.** The Firestore region is chosen deliberately and documented; storing identifiable phone numbers of non-US players in a US region is a v1 consideration.
- **Breach exposure.** Storing phones in the cloud creates breach-disclosure duties now; noted in Risks.
- **Deletion (right-to-be-forgotten), defined precisely:** a per-player delete removes `players/{phoneKey}` **and** scrubs that key's row from every `tournaments/{id}` doc (deleting a tournament doc if it becomes empty). A wipe enumerates and deletes every doc under both subcollections (Firestore has no cascade) and clears the pending arrays. Deletions cover local and cloud; tombstones in `pendingDeletes` persist across sign-out/switch until server-acked. Canonical keying (Identity Model) ensures one person maps to one key for both stats and deletion.
- **Export/import** are PII trust boundaries: export warns/optionally encrypts; import validates and bounds input and confirms the destination account.
- **aliases** are capped (max 5) and included in delete/wipe scope.

### Future: Global Phase - Gates

Before any world-facing, cross-organizer surface ships: phone-ownership **verification** (e.g. SMS OTP); a profile **claim/consent** flow; **read-access controls** (so a phone number cannot be used to look up a stranger's name and play history - a real safety concern); **rate-limiting/enumeration** defense for lookups; **audit logging** of reads; **moderation**; **breach-notification**, **data-subject access/rectification**, **residency**, and **deletion-at-scale** processes; and a documented legal posture. Cross-owner aggregation cannot be done client-side under owner-scoped rules - it will require server-side aggregation (a Cloud Function writing a separate, access-controlled collection), reinforcing that the global phase is a distinct, larger effort.

## State Additions

- `state.saveToLifetime: boolean` (default false), persisted; added to `backfillStateDefaults()`.
- `state.startedAt: number` (epoch ms), set once at `startTournament()`, persisted; used to derive `tournamentId`. For legacy states it is backfilled **only if missing** with a deterministic fallback and persisted once from the boot path (never from inside `backfillStateDefaults`, which also runs on read-only reads and undo).
- `state.tournamentId: string`, stamped once at `startTournament()` after `scheduleSeed` is assigned; stable for the tournament's life; for legacy states, derived deterministically and persisted once from the boot path.

## Fit With Technical-Enablers

- **Boundaries:** add **one** new ordered `RUMBLE:LIFETIME` section (store + facade + sync + recording) and register it in the `tools/check-index-boundaries.mjs` ordered array at a defined position (after `STATS`, before `RENDER`); the Career view + auth/sync UI live in the existing `RENDER` section, state additions in `STATE`. (One ordered section, not code scattered across sections.) Built after enabler Tasks 1-4 so it inherits sentinels + baselines.
- **Visual playbook:** add deterministic states - setup-with-toggle, career-empty, career-leaderboard (populated), career-card, signed-out vs signed-in sync chip - with dynamic text (`lastSyncedAt`) masked.
- **Self-tests (`?test`):** cover only the **pure, synchronous** functions (merge/union, per-record dedupe, cross-format normalization, aggregation math, export/import round-trip, per-player delete, wipe) by passing in fixture ledgers - no network, no module globals, no `await` (the harness tallies failures synchronously). The async `SyncBackend` orchestration is covered by the Playwright harness, not `?test`. New asserts must pass; `?test` continues to end at its known **1 failure** (the unrelated keep-awake artifact); `?simulate` stays at **0**. Security rules are tested separately via the emulator.
- **Delivery:** built inside `index.html` within the new sentinel; the deferred source-split (Tasks 5-7) later carries it along.

## Testing Strategy

- Inline `?test`: pure local-store + normalization + aggregation functions, as above.
- Firestore security rules: emulator negative tests (cross-owner deny), gated in CI.
- Manual/Playwright: sign in on two devices/browsers, complete a tournament with the toggle on, confirm the second device reflects it after sync; complete offline then reconnect and confirm flush; verify per-player delete and wipe propagate to the cloud (including `results`-row scrub); verify sign-out evicts the cached ledger; verify the anonymous-merge UI does not blanket-attribute.
- Behavior gates unchanged: `?test` ends at 1 failure, `?simulate` at 0; `npm run check:index` passes once boundary tooling exists.

## Risks And Mitigations

- **Runtime dependency on Firebase / SDK import failure.** Mitigated by local-first design + vendored SDK + caught import failure falling back to `NullBackend`; sync is never load-bearing for running an event.
- **Confidentiality hinges on the rules.** Mitigated by making `firestore.rules` a tracked, emulator-tested, deploy-gated artifact with body validation + App Check; console edits forbidden.
- **PII on a shared device / wrong-account attribution.** Mitigated by evict-on-sign-out, no blanket anonymous merge, explicit import-account confirmation, and re-auth for destructive/exfil actions.
- **Cross-version cloud skew.** Two devices on different app versions share Firestore data; mitigated by per-doc `schemaVersion`, forward-compatible reads (ignore unknown fields, never destructively rewrite on read), and a migration entry point mirroring `backfillStateDefaults`.
- **Identity errors from bad phone data.** Accepted for v1 (no verification); canonical keying + alias names reduce accidental forks; verification is a global-phase gate.
- **Supply chain / breach exposure.** Mitigated by vendoring the SDK (same-origin), App Check, and documenting breach-notification duties.
- **localStorage quota.** The append-only ledger shares the ~5 MB origin budget with `pb_tourney_v5`/roster, and `save()` swallows quota errors; cloud sync is the backstop. Noted; IndexedDB is a future option if volume grows.
- **Single-file growth.** Mitigated by running enabler Tasks 1-4 (boundaries + baselines) before adding this layer.

## Non-Goals

- No global/cross-organizer profiles, SMS verification, claim/consent, or moderation in v1.
- No per-player lifetime award tallies and no identity-merge tool in v1 (conscious deferrals).
- No real-time live multi-device updates in v1 (sync on load and on change only).
- No build step, bundler, or framework.
- No change to tournament scheduling/scoring behavior.
- No removal or rework of the existing name-keyed roster (it remains the setup auto-fill cache; lifetime identity is a separate, phone-keyed concern, resolved via `phoneOf`).
