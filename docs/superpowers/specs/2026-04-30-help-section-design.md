# Help Section Design

**Date:** 2026-04-30  
**Status:** Approved

## Overview

Extend the existing "How this works" modal (`openHowItWorksModal()`) with a reusable "Reference" section below the format rules. The first two entries are Rally Scoring and Side Out Scoring, each with visual explanations (comparison/rules table, court diagrams, scored walkthrough).

No new modals, tabs, or entry points. Everything lives inside the existing modal, already accessible from Settings.

## Placement

`openHowItWorksModal()` currently renders three `<details>` accordions: Round Robin, Stack Format, Crown Court. After these, add:

1. A visual divider (horizontal rule or styled separator)
2. A small "Reference" label (muted, uppercase, styled like a section heading)
3. Two new `<details>` accordions using the existing `rules` CSS class

Both reference accordions are collapsed by default (no `open` attribute). They are not tied to the active format.

## Rally Scoring Accordion

**Label:** "Rally Scoring"

Three visual blocks rendered as inline HTML/CSS inside the `<details>` body, using the app's CSS variables (`--bg`, `--panel`, `--panel-2`, `--border`, `--text`, `--muted`, `--accent`, `--good`).

### Block 1: Comparison Table

Three-column table comparing Rally vs. Sideout scoring:

| | Rally | Sideout |
|---|---|---|
| Who can score? | Rally winner | Serving team only |
| Servers per turn | 1 | 2 (each player serves once) |
| Score called as | Server – Receiver | Server – Receiver – Server# |
| Win condition | Must win on your serve | Must win on your serve |

Note: The "Score called as" row describes the verbal announcement during play. Walkthrough examples throughout this help section use a fixed **Team A – Team B** order for clarity, regardless of who is serving.

### Block 2: Court Diagrams

Two side-by-side top-down court diagrams labeled "Score: Even (0, 2, 4…)" and "Score: Odd (1, 3, 5…)".

- Each diagram shows a net line, center service line, and four quadrants
- The serving quadrant is highlighted (green tint)
- A 🏓 paddle emoji marks the server's position
- Even score: server in **bottom-right** quadrant (server stands right of center, facing the net)
- Odd score: server in **bottom-left** quadrant (server stands left of center, facing the net)
- Caption: "The serving team's score determines which side they serve from. The receiving team does not switch sides when they win a rally and take the serve — they position according to their own score once they begin serving."

**Scope note:** These diagrams show which side of the court the serving team serves from. Individual partner positions within a team (which player stands where) are not tracked by this app and are outside the scope of this help section.

### Block 3: Score Walkthrough

Intro: "Score is 4–3 (Team A serving, scores shown as Team A – Team B). Team A's score is even → serves from the right."

Two outcome blocks (color-coded):
- **Green block — Team A wins the rally:** Score becomes 5–3 · Team A still serves · score now odd → switch to left side
- **Blue block — Team B wins the rally:** Score becomes 4–4 · Team B now serves · Team B starts from the side matching their score (4 is even → right)

Gold "win condition" block titled "⚡ HOW TO WIN (first to 7, win by 2)":

```
6–5, A serving → A wins → 7–5 ✓ GAME  (reached 7, ahead by 2)

6–6, A serving → A wins → 7–6  (NOT game — only 1 point ahead, keep playing)
7–6, A serving → A wins → 8–6 ✓ GAME  (ahead by 2)

6–6, A serving → B wins → 6–7, B now serving
6–7, B serving → B wins → 7–7  (NOT game — tied)
7–7, B serving → A wins → 7–8, A now serving
7–8, A serving → A wins → 8–8 → keep going until someone leads by 2 on their serve
```

Caption: "You must win the final point on your own serve, and lead by 2. Winning a rally while receiving gives you the point and the serve — but you still need to win one more on your serve to take the game."

## Side Out Scoring Accordion

**Label:** "Side Out Scoring"

Same three-block structure.

### Block 1: Key Rules Table

Two-column key/value table:

| | |
|---|---|
| Score a point? | Only if your team is serving |
| Servers per turn | 2 — each player serves once before side out |
| Score format | My score – Their score – Server # (e.g., "4–3–1") |
| Serve side (after side-out) | Even score → right, odd → left — same rule as rally |
| Within a serving sequence | Server 2 serves from their current position (not reset by score) |
| Game start | `0–0–2` — first team only gets 1 server to keep it fair |

### Block 2: Court Diagrams

Two side-by-side diagrams showing what happens when Server 1 loses their serve:

**Diagram 1 — Server 1 serving:** Labeled "4–3–1, Server 1"
- Score is 4 (even) → Server 1 in **bottom-right** quadrant, serving from right side
- Partner (Server 2) shown faintly in bottom-left quadrant
- Server 1 highlighted in green

**Diagram 2 — Server 2 takes over:** Labeled "4–3–2, Server 2"
- Server 1 lost the rally (no score change, score still 4)
- Server 2 serves from their **current position: bottom-left** quadrant
- Even though the score is 4 (even), Server 2 does NOT reset to right side — they serve from where they stand
- Server 2 highlighted in purple

Caption: "When Server 1 loses a rally, Server 2 serves from their current side (left, in this example). The even/odd rule only resets after a side-out — during a serving sequence, Server 2 stays put. Partners only switch sides within a team when their team scores a point."

### Block 3: Score Walkthrough

Intro: "Score is 4–3–1 (Team A, Server 1 serving, scores shown as Team A – Team B). Score is even → serving from right side."

Three outcome blocks:
- **Green block — Team A wins the rally:** Score becomes 5–3–1 · Same server · score now odd → switch to left side
- **Purple block — Team B wins the rally:** No point scored · Score stays 4–3–2 · Server 2 now takes over and serves from the **left** (their current position)
- **Red block — Team B wins again (Server 2 loses):** No point scored · **Side out** — Team B now has both servers · Score flips to Team B's perspective: 3–4–1

Gold "win condition" block titled "⚡ HOW TO WIN (first to 11, win by 2)":

```
10–8, A serving (Server 1) → A wins → 11–8 ✓ GAME  (reached 11, ahead by 2)

10–9, A serving → A wins → 11–9 ✓ GAME  (reached 11, ahead by 2)

10–9, A serving → B wins → no score, 10–9–2 (Server 2 now)
10–9–2, A serving → B wins → side out, Team B has both servers, score is 9–10–1 from B's view
9–10–1, B serving → B wins → 10–10  (NOT game — tied, keep going)
```

Caption: "Same as rally scoring: the final point must be won on your serve. Win by 2 — a 10–10 game keeps going until someone earns a 2-point lead on their serve."

## Existing Code to Reuse

- `renderRallyScoringHelp()` (line 3099) — existing bullet-list version of rally rules used inline during Crown Court. This is **not** modified; the new help section is a separate, richer rendering. The existing function remains for its current contextual use.
- CSS class `rules` and `rules-body` — used by all existing format `<details>` elements. The new accordions use the same classes for visual consistency.

## Future Topics

The "Reference" section is designed to accept additional `<details>` entries. Candidates for future additions: Match Points, Tiebreakers, Crown Court format overview.

## Files Changed

- `pickleball.html` — `openHowItWorksModal()` function only
