# Player Phone Numbers + Text Results — Design Spec

**Status:** Approved (brainstorm); revised after multi-model review
**Author:** Claude (with Ken)
**Date:** 2026-06-07
**App:** `index.html` (now hosted at `https://zigrivers.github.io/rumble-pickleball/` as a PWA)

## Goal

Optionally capture each player's cell number at setup, and at the end of a
tournament (and mid-event) offer a one-tap action that opens Messages with a
personalized results recap prefilled for each player. Numbers are remembered
across events by name so a regular group only enters them once.

## Constraints / decisions (from brainstorm)

- **Client-only.** No backend can send SMS, so delivery is **per-player drafts**:
  an `sms:` deep link that opens the user's Messages app with the recipient and
  a prefilled body; the user taps send. ~8 taps for a full group — accepted.
- **Capture UX = inline field per row** (brainstorm option A): a second, optional
  phone input beside each name on the setup screen.
- **Roster remembered by name** (brainstorm option): a `localStorage` map keyed
  by lowercased name auto-fills numbers on future events; managed (view/delete)
  in Settings.
- **Message = recap with full standings** (brainstorm option B): personalized
  "You: #N of M (…)" line, champions, and the **complete** ranking, each row
  with the record in parentheses.
- **Availability = done screen + mid-event.**

### Delivery reliability (revised after review)

`sms:<number>?body=<text>` prefills recipient + body on **modern iOS/macOS**, but
Apple's archived URL-scheme doc predates body support, and behavior varies by OS
version — so body prefill is **best-effort**, not guaranteed. Therefore v1 ships
**two actions per player**:

1. **Text** — `sms:` deep link (recipient always set; body best-effort).
2. **Copy** — `navigator.clipboard.writeText(message)` (a secure-context API now
   available because the app is served over HTTPS). Guarantees the recap can
   always be delivered (paste into Messages, WhatsApp, email, anywhere), and
   covers desktop browsers without a Messages handler.

The implementation plan must include a **physical-device check** of `?body=`
prefill on current iOS before relying on it.

## Format scope (revised after review)

v1 result texting covers **Round Robin and Gauntlet** — the formats whose done
screen ranks by `computeStats` points→wins→diff (`rankPlayersForFormat` → `rankPlayers`),
so the texted numbers exactly match the screen.

**Stack** (Stack Score, `computeStackStats`) and **King** (King Score,
`computeKingStats`) rank by format-specific composite metrics, and **Crown** has
its own `renderDoneScreenCrown` / `finalRankingCrown()` — a recap for these would
either misreport or need separate builders, so their recap is **deferred**.

To avoid dead-end data entry, phone **capture and the saved roster work in every
format** (numbers are cross-event and worth collecting regardless), but on the
Stack/King/Crown done screen the texting card renders a short note instead of
buttons: *"Texting results isn't available for this format yet."*

## Data model

**Per tournament** — a phone array parallel to the existing slot arrays:

- `newState()` gains `rawPhones` initialized to the **same length as `rawNames`**
  (`Array(rawNames.length).fill("")`), parallel to `rawNames` (pre-shuffle, edited
  on the setup screen).
- **`startTournament()` builds canonical records before shuffling** (avoids
  re-matching names after the shuffle, and pins trimming/normalization once):
  ```
  records = names.map((n, i) => ({ name: n.trim(), phone: normalizePhone(rawPhones[i]) }))
  shuffled = shuffle(records)
  state.slots  = shuffled.map(r => r.name)
  state.phones = shuffled.map(r => r.phone)   // parallel to slots; "" if none
  ```
- `load()` migration is **length-aware**: if a saved tournament lacks
  `rawPhones`/`phones`, default
  `state.rawPhones = Array((state.rawNames||[]).length).fill("")` and
  `state.phones = Array((state.slots||[]).length).fill("")`, so old saves of any
  player count stay index-aligned.

**Saved roster** — `localStorage` key `pb_roster_v1`:

```json
{ "ken": "+15551234567", "adrian": "+15558872210" }
```

- Key = `name.trim().toLowerCase()`. Values are normalized numbers.
- Helpers: `loadRoster()` → object (`{}` if absent/corrupt); `rosterPhoneFor(name)`
  → stored number or `""` (trims+lowercases the lookup);
  `saveRosterEntry(name, phone)` — **upsert if phone is valid, delete the key if
  phone is empty/invalid** (so blanking a field at setup removes a saved number);
  `deleteRosterEntry(name)`; `clearRoster()`.
- Display names always come from the trimmed `slots`/`rawNames` value, not the
  lowercased key.

### Known limitation — homonyms

The roster is keyed by name only, so two different people who share a name across
events collapse to one entry (last save wins). v1 accepts this (the target is a
small regular group with distinct names) and **surfaces it**: a one-line note in
the Settings roster section ("numbers are matched by name") so the user
understands why a number might auto-fill unexpectedly.

## Helpers

**Pure utilities (unit-testable directly via `?test`):**

- **`normalizePhone(raw)`** → strip all characters except digits and a single
  leading `+`. (`"(555) 201-3344"` → `"5552013344"`; `"+1 555 201 3344"` →
  `"+15552013344"`.)
- **`isValidPhone(raw)`** → `normalizePhone(raw)` has ≥ 7 digits. Anything else
  counts as "no number."
- **`smsHref(phone, body)`** → `"sms:" + normalizePhone(phone) + "?body=" +
  encodeURIComponent(body)`.
- Roster CRUD: `loadRoster` / `rosterPhoneFor` / `saveRosterEntry` /
  `deleteRosterEntry` / `clearRoster` (round-trippable against a seeded
  `localStorage`).

**State-dependent helper (tested via the `?test` harness with a seeded tournament,
not a pure unit):**

- **`buildResultsMessage(slot, mode)`** → the recap string for the player in
  `slot`. `mode` is `"final"` or `{ throughRound: N }`. It reads tournament state
  (`slots`, `finals`, stats, rankings), so its tests seed a full tournament
  (including finals) and assert the output — it is explicitly **not** pure.

### Message format — final mode (RR / Gauntlet only)

Order from `finalRanking()` (tournament-tier order); numbers from
`computeStats(totalRegularRounds(), true)` (finals-inclusive) — identical to the
done-screen Final Standings table, so the text always matches what's on screen.
`computeStats` already returns `points`, `wins`, `losses`, and `diff` per player.

```
🏓 Rumble Pickleball — tonight's results

You: #3 of 8 (5W 2L, +18 pts)

🥇 Ken & Adrian
🥈 Joe & Kris

Final standings:
1. Ken (7W, 77 pts)
2. Hal (5W, 69 pts)
3. Adrian (4W, 65 pts)
4. Joe (3W, 61 pts)
5. Cy (3W, 58 pts)
6. Dee (2W, 54 pts)
7. Fay (2W, 50 pts)
8. Gus (0W, 41 pts)

GG! 🎾
```

- "You:" line: position = `finalRankingOrder.indexOf(slot) + 1`; record =
  `Wwins W Llosses L, ±diff pts` from the finals-inclusive stats.
- **Champion lines are guarded:** include 🥇/🥈 only when `state.finals` is
  present. (RR and Gauntlet both build finals before the done screen, and final
  mode is only ever invoked from the done screen, so this is defensive — but it
  keeps the builder safe if called without finals.)
- Leaderboard rows: `N. Name (XW, YY pts)` for all players — wins and points
  only (no diff/L), matching the approved mockup.

### Message format — mid-event mode (`{ throughRound: N }`)

Order and numbers from `rankPlayers(N)` / `computeStats(N, false)`. **No champion
lines.** Header/footer mark it interim:

```
🏓 Rumble Pickleball — standings through 4 rounds

You: #3 of 8 (3W 1L, +12 pts)

Standings:
1. ...
...
8. ...

(not final — more rounds to play) 🎾
```

A full 8-player leaderboard runs ~300–400 characters. iMessage has no practical
limit; SMS auto-segments. Acceptable.

## UI integration

1. **Setup screen (`renderSetup`)** — each name row gains a second optional input
   (`📱 optional`, `type="tel"`, `inputmode="tel"`). On `input`, write
   `state.rawPhones[i]` and `save()`. Layout per brainstorm mockup A (name ~flex 2,
   phone ~flex 1.4). The paste flow stays **names-only**.

   **Roster auto-fill with staleness handling:** track per row whether the phone
   was roster-autofilled vs. manually edited (e.g. a parallel `_autofilled[i]`
   flag, not persisted). On a name-field change: if the row's phone is empty OR
   was autofilled-and-not-since-manually-edited, set
   `rawPhones[i] = rosterPhoneFor(newName)` (which may be `""`) and mark the row
   autofilled. A manual edit of the phone field clears the autofilled flag and
   locks the value. This prevents "Ken" → "Kenneth" leaving Ken's number on
   Kenneth's row.

2. **`startTournament()`** — build `state.phones` from canonical records (above),
   then reconcile the roster for each setup row: valid phone → `saveRosterEntry`;
   empty phone for a name already in the roster → delete that key.

3. **Done screen (`renderDoneScreen`, RR/Gauntlet)** — a "📱 Text results" card
   listing every player. Each player **with** a valid number gets a **Text**
   action (`sms:` href from `smsHref(...)`) and a **Copy** action
   (`navigator.clipboard.writeText`); players **without** a number render greyed
   as "<name> — no number". Body = `buildResultsMessage(slot, "final")`. On
   Stack/King/Crown done screens, the card shows the "not available for this
   format yet" note instead.

4. **Playing screen (`renderPlaying`, RR/Gauntlet)** — a parallel, secondary
   "📱 Text standings" card, available once ≥ 1 round is complete. Body =
   `buildResultsMessage(slot, { throughRound: completedRounds })`.

5. **Settings (`openSettings`)** — a "Saved numbers" section: the homonym note,
   a list of roster entries (trimmed display name + number) each with a ✕ delete
   button, and a "Clear all saved numbers" action. The existing **Clear All**
   destructive action is extended to also `clearRoster()` so numbers never
   outlive an explicit wipe.

## Privacy (revised after review)

Accurate statement (to appear in the Settings roster section and the spec's
acceptance criteria):

> Phone numbers are stored only in this browser's `localStorage` — unencrypted,
> local to this site's origin and this browser profile. They are **never
> transmitted over the network**; they leave the device only when you tap **Text**
> (which opens your Messages app with a draft) or **Copy**. Note that
> `localStorage` is plaintext and may be included in browser/device backups or
> profile sync. **Important:** because the app is hosted on the shared
> `zigrivers.github.io` origin, any other page you host under that same origin can
> read this storage. Use **Settings → Saved numbers** or **Clear All** to remove
> stored numbers.

Acceptance criteria tied to privacy: deleting a roster entry removes it from
`localStorage`; **Clear All** empties the roster; no code path sends a number to
any network endpoint.

## Error / edge handling

- No valid number → player shown as "no number"; no Text/Copy buttons.
- Ties in standings → "#N" is the player's index in the ranking array; ties share
  the documented tie-break order already used on screen.
- Mid-event with 0 completed rounds → the "Text standings" card is hidden.
- `sms:` not handled (desktop without Messages) → the **Copy** action is the
  fallback; the spec does not depend on `sms:` succeeding.
- Stack/King/Crown done screen → explanatory note, no buttons (capture/roster
  still functioned during setup).
- Loading a legacy save (no phone fields) → length-aware migration; app continues
  normally; no per-slot index errors.

## Testing

- **Pure utilities (`?test` asserts):** `normalizePhone` (formatting variants,
  leading `+`); `isValidPhone` (too-short rejected); `smsHref` (exact string,
  body URL-encoded); roster `saveRosterEntry` upsert **and delete-on-empty**,
  `rosterPhoneFor` trims+lowercases, `clearRoster`, corrupt-JSON → `{}`.
- **State-dependent (`?test` harness, seeded tournament):**
  `buildResultsMessage` final mode — "You:" position/record, 🥇/🥈 lines present,
  full leaderboard, and **numbers equal `computeStats(total, true)`** (parity with
  the done screen); mid-event mode — no champion lines, "through N rounds" header,
  correct interim order; champion-line guard when `finals` is null;
  canonical-record build produces `phones` aligned to `slots`.
- **Migration:** legacy save without phone fields loads, `rawPhones`/`phones` get
  the right lengths, setup renders without `undefined`.
- **UI (agent-browser):** setup phone fields persist; roster auto-fill on name
  entry, including the **"Ken"→"Kenneth" re-resolve** case and manual-edit lock;
  startTournament upserts valid numbers and **deletes** a blanked one; done-screen
  list shows Text+Copy for numbered players and greys the rest; a Text button's
  `href` equals the expected `smsHref` (assert the link, don't launch Messages);
  Copy writes the expected text to the clipboard; Settings delete removes a roster
  entry; Clear All empties the roster; Stack/King/Crown done screen shows the
  "not available yet" note (and loads without throwing).
- **Regression:** existing `?test` and `?simulate` still pass; the simulation
  harness is unaffected (it enters no phones).

## Deliberately out of scope (YAGNI)

`navigator.share` share-sheet (Copy + sms: already cover delivery; share can't
prefill a recipient); contact-picker integration; extended `Name, phone` paste
format (brainstorm chose inline fields); Stack/King/Crown recaps (deferred, see
Format scope); per-person disambiguation/IDs for homonyms; delivery confirmation;
group threads; any encryption of stored numbers.
