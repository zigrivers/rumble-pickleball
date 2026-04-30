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

Two-column table comparing Rally vs. Sideout scoring:

| | Rally | Sideout |
|---|---|---|
| Who can score? | Rally winner | Serving team only |
| Servers per turn | 1 | 2 (each player serves once) |
| Score called as | Server – Receiver | Server – Receiver – Server# |
| Win condition | Must win on your serve | Must win on your serve |

### Block 2: Court Diagrams

Two side-by-side top-down court diagrams labeled "Score: Even (0, 2, 4…)" and "Score: Odd (1, 3, 5…)".

- Each diagram shows a net line, center service line, and four quadrants
- The serving quadrant is highlighted (green tint)
- A 🏓 paddle emoji marks the server's position
- Even score: server in bottom-right quadrant (server stands right of center, facing the net)
- Odd score: server in bottom-left quadrant (server stands left of center)
- Caption: "Server's score determines which side to serve from. Only the server switches sides — the receiving team stays put."

### Block 3: Score Walkthrough

Opens with: "Score is 4–3 (Team A serving). Team A's score is even → serves from the right."

Two outcome blocks (color-coded):
- **Green block — Team A wins the rally:** Score becomes 5–3 · Team A still serves · score now odd → switch to left side
- **Blue block — Team B wins the rally:** Score becomes 4–4 · Team B now serves · Team B stays on their side (no switch)

Gold "win condition" block titled "⚡ HOW TO WIN (game at 6–6)":
- `6–6, A serving` → Team A wins rally → **7–6 ✓ GAME**
- `6–6, A serving` → Team B wins rally → 6–7, B now serving
- `6–7, B serving` → Team B wins rally → **7–7** (keep going — win by 2)
- Caption: "You must win the final point on your own serve. If you're receiving and you win the rally, you get the point and the serve — but the game isn't over yet."

## Side Out Scoring Accordion

**Label:** "Side Out Scoring"

Same three-block structure.

### Block 1: Key Rules Table

Single-column key/value table:

| | |
|---|---|
| Score a point? | Only if your team is serving |
| Servers per turn | 2 — each player serves once before side out |
| Score format | My score – Their score – Server # (e.g., "4–3–1") |
| Serve side | Same as rally — even score → right, odd → left |
| Game start | `0–0–2` — first team only gets 1 server to keep it fair |

### Block 2: Court Diagrams

Two side-by-side diagrams: "Server 1 · Score: 4 (even)" and "Server 2 · Score: 4 (even)".

- Both show the serving position in the bottom-left quadrant (even score → right side)
- Server 1 highlighted in green, Server 2 in purple
- Partner shown faintly in the opposite service box
- Caption: "Server 2 steps in from wherever Server 1 finished — partners swap positions when Server 1 loses their serve."

### Block 3: Score Walkthrough

Opens with: "Score is 4–3–1 (Team A, Server 1 serving). Score is even → serving from right side."

Three outcome blocks:
- **Green block — Team A wins the rally:** Score becomes 5–3–1 · Same server · score now odd → switch to left side
- **Purple block — Team B wins the rally:** No point scored · Score stays 4–3–2 · Server 2 now serves from right (score still even)
- **Red block — Team B wins again (Server 2 loses):** No point scored · **Side out** — Team B now has both servers · Score flips: 3–4–1 from Team B's view

Gold "win condition" block titled "⚡ HOW TO WIN (game near 10–9)":
- `10–9–1, A serving` → Team A wins rally → **11–9 ✓ GAME** (win by 2 — no issue)
- `10–9–1, A serving` → Team B wins rally → no score, 10–9–2 or side out if Server 2 also loses
- Caption: "Same as rally scoring: you must win the final point on your own serve. Win by 2 — a 10–10 game keeps going."

## Existing Code to Reuse

- `renderRallyScoringHelp()` (line 3099) — existing bullet-list version of rally rules used inline during Crown Court. This is **not** modified; the new help section is a separate, richer rendering. The existing function remains for its current contextual use.
- CSS class `rules` and `rules-body` — used by all existing format `<details>` elements. The new accordions use the same classes for visual consistency.

## Future Topics

The "Reference" section is designed to accept additional `<details>` entries. Candidates for future additions: Match Points, Tiebreakers, Crown Court format overview.

## Files Changed

- `pickleball.html` — `openHowItWorksModal()` function only
