# Player Phone Numbers + Text Results — Design Spec

**Status:** Approved (brainstorm)
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
  an `sms:<number>?body=<encoded>` link that opens the user's Messages app with
  recipient + body prefilled; the user taps send. ~8 taps for a full group —
  accepted. (Verified: iOS/macOS support single-recipient `sms:` with `?body=`;
  comma-separated multi-recipient links are unreliable on Apple, so we never use
  them.)
- **Capture UX = inline field per row** (brainstorm option A): a second, optional
  phone input beside each name on the setup screen.
- **Roster remembered by name** (brainstorm option): a `localStorage` map keyed
  by lowercased name auto-fills numbers on future events; managed (view/delete)
  in Settings.
- **Message = recap with full standings** (brainstorm option B): personalized
  "You: #N of M (…)" line, champions, and the **complete** ranking, each row
  with the record in parentheses.
- **Availability = done screen + mid-event.** Final recap on the done screen;
  an interim "standings through N rounds" recap during play.
- **Privacy:** numbers live only in `localStorage` and leave the device only
  through the user's own Messages app. Nothing is sent anywhere automatically.

**Format scope:** v1 covers the standard formats (Round Robin, Stack, King,
Gauntlet) which share `renderDoneScreen` / `computeStats` / `finalRanking`.
Capture works for any format (phones are entered the same way), but **Crown
Court** — which has its own `renderDoneScreenCrown`, match-points model, and
`finalRankingCrown()` — is a follow-up: its message builder and done-screen
button list are not in v1. (Phone capture and the saved roster still function in
a Crown event; only the Crown recap text/button is deferred.)

**Deliberately out of scope (YAGNI):** contact-picker integration; `navigator.share`
share-sheet and clipboard fallbacks (HTTPS now makes these *possible* — recorded
as a future enhancement, not built now, because `sms:` already prefills the
recipient which Web Share cannot); extended `Name, phone` paste format (brainstorm
chose inline fields, not the paste format); delivery confirmation; group threads.

## Data model

**Per tournament** — a phone array parallel to the existing slot arrays:

- `newState()` gains `rawPhones: ["","","","","","","",""]` (parallel to
  `rawNames`, pre-shuffle, edited on the setup screen).
- On `startTournament()`, after `state.slots = shuffle(names)`, build
  `state.phones` parallel to `state.slots`: for each slot, look up the player's
  name in `rawNames` and copy the matching `rawPhones` entry. Names are
  validated unique, so the name is a safe key. `state.phones[i]` is the
  normalized number (or `""`) for the player named `state.slots[i]`.
- `load()` migration: if a saved tournament lacks `rawPhones`/`phones`, default
  them to arrays of `""` so older saves keep working.

**Saved roster** — `localStorage` key `pb_roster_v1`:

```json
{ "ken": "+15551234567", "adrian": "+15558872210" }
```

Keys are `name.trim().toLowerCase()`. Helpers:
- `loadRoster()` → object (`{}` if absent/corrupt).
- `rosterPhoneFor(name)` → stored number or `""`.
- `saveRosterEntry(name, phone)` — upsert (skips empty names/phones).
- `deleteRosterEntry(name)`.
- `clearRoster()`.

## Pure helpers (unit-testable via `?test`)

- **`normalizePhone(raw)`** → strip all characters except digits and a single
  leading `+`. (`"(555) 201-3344"` → `"5552013344"`; `"+1 555 201 3344"` →
  `"+15552013344"`.)
- **`isValidPhone(raw)`** → `normalizePhone(raw)` has ≥ 7 digits. Anything else
  counts as "no number" (field treated as blank for texting).
- **`smsHref(phone, body)`** → `"sms:" + normalizePhone(phone) + "?body=" +
  encodeURIComponent(body)`.
- **`buildResultsMessage(slot, mode)`** → the recap string for the player in
  `slot`. `mode` is `"final"` or `{ throughRound: N }`.

### Message format — final mode

Order from `finalRanking()` (tournament-tier order); numbers from
`computeStats(totalRegularRounds(), true)` (finals-inclusive) — identical to the
done-screen Final Standings table, so the text always matches what's on screen.

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

- "You:" line: position = `finalRankingOrder.indexOf(slot) + 1`; record shows
  `W`, `L`, and signed `+/- pts` from the finals-inclusive stats.
- 🥇 line = championship winners' team name; 🥈 = consolation winners' team name
  (from `state.finals`).
- Leaderboard rows: `N. Name (XW, YY pts)` — wins and points only (no diff/L),
  matching the approved mockup, for all players.

### Message format — mid-event mode (`{ throughRound: N }`)

Order and numbers from `rankPlayers(N)` / `computeStats(N, false)`. **No
champion lines.** Header and footer make clear it is interim.

```
🏓 Rumble Pickleball — standings through 4 rounds

You: #3 of 8 (3W 1L, +12 pts)

Standings:
1. ...
...
8. ...

(not final — more rounds to play) 🎾
```

Note: recaps with a full 8-player leaderboard run ~300–400 characters.
iMessage has no practical limit; SMS auto-segments. Acceptable.

## UI integration

1. **Setup screen (`renderSetup`)** — each name row gains a second optional
   input: `📱 optional` placeholder, `type="tel"`, `inputmode="tel"`. On `input`,
   write `state.rawPhones[i]` and `save()`. When a name field matches a roster
   key (case-insensitive) and its phone field is empty, auto-fill the roster
   number. Layout per brainstorm mockup A (name ~flex 2, phone ~flex 1.4).
   The paste flow stays **names-only**; pasted names still trigger roster
   auto-fill.

2. **`startTournament()`** — build `state.phones` (above) and upsert each
   non-empty name→phone pair into the roster via `saveRosterEntry`.

3. **Done screen (`renderDoneScreen`)** — a "📱 Text results" card listing every
   player. Each player **with** a valid number renders a tap-to-text button
   (`<a href="smsHref(...)">Text <name></a>` styled as a button, or a button
   that sets `location.href`); players **without** a number render greyed as
   "<name> — no number". Body = `buildResultsMessage(slot, "final")`.

4. **Playing screen (`renderPlaying`)** — a parallel "📱 Text standings" card
   (collapsed/secondary so it doesn't crowd scoring), available once ≥ 1 round
   is complete. Body = `buildResultsMessage(slot, { throughRound: completedRounds })`.

5. **Settings (`openSettings`)** — a "Saved numbers" section listing roster
   entries (name + masked/partial number) each with a ✕ delete button, plus a
   "Clear all saved numbers" action. The existing **Clear All** destructive
   action also clears the roster (it currently wipes tournament state; extend it
   to `clearRoster()` so numbers don't outlive an explicit wipe).

## Error / edge handling

- No valid number → player shown as "no number"; no text button. The feature
  degrades to "text whoever has a number."
- Ties in standings → "#N" is the player's index in the ranking array; ties
  share the documented tie-break order already used on screen.
- Mid-event with 0 completed rounds → the "Text standings" card is hidden.
- `sms:` not handled by the device (e.g. a desktop browser with no Messages) →
  the link simply does nothing; this is an accepted limitation of the
  client-only approach (the primary target is phones/Macs with Messages).

## Testing

- **Pure functions (`?test` asserts):** `normalizePhone` (formatting variants,
  leading `+`), `isValidPhone` (too-short rejected), `smsHref` (exact string,
  body URL-encoded), roster upsert/lookup/delete round-trip, and
  `buildResultsMessage` for both modes — assert the "You:" line position/record,
  champion lines present only in final mode, full leaderboard rows, and that
  final-mode numbers equal the done-screen `computeStats(total, true)` values.
- **UI (agent-browser):** setup phone fields persist and auto-fill from roster;
  done-screen list shows text buttons for numbered players and greys the rest;
  the `href` of a text button equals the expected `smsHref` (we can assert the
  link, not launch Messages); Settings delete removes a roster entry; Clear All
  empties the roster.
- **Regression:** existing `?test` and `?simulate` still pass; the simulation
  harness is unaffected (it doesn't enter phones).

## Sequencing note

This builds on the now-live HTTPS PWA. If a later iteration wants share-sheet or
clipboard fallbacks, HTTPS already enables them; they are intentionally excluded
from v1 to keep scope tight, since `sms:` per-player drafts already prefill the
recipient.
