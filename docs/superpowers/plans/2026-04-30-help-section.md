# Help Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reference" section to the "How this works" modal with visual Rally Scoring and Side Out Scoring help cards, each containing a comparison table, court diagrams, and a scored walkthrough with win condition.

**Architecture:** Two new builder functions (`buildRallyScoringHelp`, `buildSideOutScoringHelp`) return `<details>` accordion elements. `openHowItWorksModal()` appends them below the existing format accordions under a "Reference" heading. All content is static HTML rendered via `innerHTML` on a container div, using the app's CSS variables for theming.

**Tech Stack:** Vanilla JS, single HTML file (`pickleball.html`), no build step. Dark theme via CSS custom properties (`--bg`, `--panel`, `--panel-2`, `--border`, `--text`, `--muted`, `--accent`, `--good`, `--bad`, `--court1`, `--court2`).

---

## File Map

| File | Change |
|------|--------|
| `pickleball.html:3118–3119` | Insert `buildRallyScoringHelp()` and `buildSideOutScoringHelp()` (new functions after existing `renderRallyScoringHelp`) |
| `pickleball.html:5047–5048` | Insert Reference section header + accordion calls in `openHowItWorksModal()` |

---

## Task 1: Scaffold — Reference section + empty accordion stubs

**Files:**
- Modify: `pickleball.html:3118` (insert after `renderRallyScoringHelp`)
- Modify: `pickleball.html:5047` (insert after the format-accordions `for` loop in `openHowItWorksModal`)

- [ ] **Step 1: Insert two stub builder functions after `renderRallyScoringHelp` (line 3118)**

Find line 3118 (the closing `}` of `renderRallyScoringHelp`). Insert after it:

```js
function buildRallyScoringHelp() {
  const det = el("details", { class: "rules", style: "margin-bottom: 10px;" });
  det.appendChild(el("summary", null, "Rally Scoring"));
  const body = el("div", { class: "rules-body" });
  det.appendChild(body);
  return det;
}

function buildSideOutScoringHelp() {
  const det = el("details", { class: "rules", style: "margin-bottom: 10px;" });
  det.appendChild(el("summary", null, "Side Out Scoring"));
  const body = el("div", { class: "rules-body" });
  det.appendChild(body);
  return det;
}
```

- [ ] **Step 2: Wire the Reference section into `openHowItWorksModal` (line 5047)**

Find the closing `}` of the format-accordions `for` loop (line 5047). Insert after it, before the `modal.appendChild(el("button",` line:

```js
  const refHeader = el("div", { style: "border-top: 1px solid var(--border); margin: 6px 0 10px; padding-top: 14px;" });
  refHeader.appendChild(el("div", { class: "ka-section-title" }, "Reference"));
  modal.appendChild(refHeader);
  modal.appendChild(buildRallyScoringHelp());
  modal.appendChild(buildSideOutScoringHelp());
```

- [ ] **Step 3: Verify scaffold**

Open `pickleball.html` in a browser. Tap ⚙️ → "How this works". Scroll down — you should see a "REFERENCE" heading followed by two collapsed accordions labelled "Rally Scoring" and "Side Out Scoring". They should be empty when expanded.

- [ ] **Step 4: Commit**

```bash
git add pickleball.html
git commit -m "feat: scaffold help section Reference accordions in How this works modal"
```

---

## Task 2: Rally Scoring — Block 1 (comparison table)

**Files:**
- Modify: `pickleball.html` — replace `buildRallyScoringHelp` with version containing Block 1

- [ ] **Step 1: Replace `buildRallyScoringHelp` with the version below**

```js
function buildRallyScoringHelp() {
  const det = el("details", { class: "rules", style: "margin-bottom: 10px;" });
  det.appendChild(el("summary", null, "Rally Scoring"));
  const body = el("div", { class: "rules-body" });

  const b1 = el("div");
  b1.innerHTML = `
<p style="margin:0 0 14px;">In rally scoring, <strong>every rally scores a point</strong> — no matter who served.</p>
<div style="margin-bottom:18px;">
  <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Rally vs. Sideout</div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr>
      <th style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:left;color:var(--muted);font-weight:600;"></th>
      <th style="padding:7px 10px;border-bottom:1px solid var(--border);color:var(--accent);text-align:center;font-weight:700;">Rally</th>
      <th style="padding:7px 10px;border-bottom:1px solid var(--border);color:var(--muted);text-align:center;font-weight:600;">Sideout</th>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Who can score?</td>
      <td style="padding:7px 10px;color:var(--good);text-align:center;font-weight:600;">Rally winner</td>
      <td style="padding:7px 10px;text-align:center;">Serving team only</td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Servers per turn</td>
      <td style="padding:7px 10px;color:var(--good);text-align:center;font-weight:600;">1</td>
      <td style="padding:7px 10px;text-align:center;">2 (each player once)</td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Score called as</td>
      <td style="padding:7px 10px;color:var(--good);text-align:center;font-weight:600;">Server–Receiver</td>
      <td style="padding:7px 10px;text-align:center;">Server–Receiver–#</td>
    </tr>
    <tr>
      <td style="padding:7px 10px;">Win condition</td>
      <td style="padding:7px 10px;color:var(--good);text-align:center;font-weight:600;">Win on your serve</td>
      <td style="padding:7px 10px;text-align:center;">Win on your serve</td>
    </tr>
  </table>
  <p style="font-size:12px;margin:6px 0 0;">Examples below show Team A – Team B (fixed order). The verbal call uses server score first.</p>
</div>`;
  body.appendChild(b1);

  det.appendChild(body);
  return det;
}
```

- [ ] **Step 2: Verify**

Open `pickleball.html` → ⚙️ → "How this works" → expand "Rally Scoring". You should see the intro sentence and a 4-row comparison table (Who can score / Servers per turn / Score called as / Win condition) with Rally column in gold and Sideout in muted gray.

- [ ] **Step 3: Commit**

```bash
git add pickleball.html
git commit -m "feat: rally scoring help — comparison table"
```

---

## Task 3: Rally Scoring — Block 2 (court diagrams)

**Files:**
- Modify: `pickleball.html` — replace `buildRallyScoringHelp` with version containing Blocks 1+2

- [ ] **Step 1: Replace `buildRallyScoringHelp` with the version below**

```js
function buildRallyScoringHelp() {
  const det = el("details", { class: "rules", style: "margin-bottom: 10px;" });
  det.appendChild(el("summary", null, "Rally Scoring"));
  const body = el("div", { class: "rules-body" });

  const b1 = el("div");
  b1.innerHTML = `
<p style="margin:0 0 14px;">In rally scoring, <strong>every rally scores a point</strong> — no matter who served.</p>
<div style="margin-bottom:18px;">
  <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Rally vs. Sideout</div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr>
      <th style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:left;color:var(--muted);font-weight:600;"></th>
      <th style="padding:7px 10px;border-bottom:1px solid var(--border);color:var(--accent);text-align:center;font-weight:700;">Rally</th>
      <th style="padding:7px 10px;border-bottom:1px solid var(--border);color:var(--muted);text-align:center;font-weight:600;">Sideout</th>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Who can score?</td>
      <td style="padding:7px 10px;color:var(--good);text-align:center;font-weight:600;">Rally winner</td>
      <td style="padding:7px 10px;text-align:center;">Serving team only</td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Servers per turn</td>
      <td style="padding:7px 10px;color:var(--good);text-align:center;font-weight:600;">1</td>
      <td style="padding:7px 10px;text-align:center;">2 (each player once)</td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Score called as</td>
      <td style="padding:7px 10px;color:var(--good);text-align:center;font-weight:600;">Server–Receiver</td>
      <td style="padding:7px 10px;text-align:center;">Server–Receiver–#</td>
    </tr>
    <tr>
      <td style="padding:7px 10px;">Win condition</td>
      <td style="padding:7px 10px;color:var(--good);text-align:center;font-weight:600;">Win on your serve</td>
      <td style="padding:7px 10px;text-align:center;">Win on your serve</td>
    </tr>
  </table>
  <p style="font-size:12px;margin:6px 0 0;">Examples below show Team A – Team B (fixed order). The verbal call uses server score first.</p>
</div>`;
  body.appendChild(b1);

  const b2 = el("div");
  b2.innerHTML = `
<div style="margin-bottom:18px;">
  <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Where to Serve From</div>
  <p style="margin:0 0 10px;font-size:14px;">The <strong style="color:var(--text);">serving team's score</strong> tells you which side to use.</p>
  <div style="display:flex;gap:10px;margin-bottom:8px;">
    <div style="flex:1;text-align:center;">
      <div style="font-size:12px;margin-bottom:6px;">Score: <strong style="color:var(--text);">Even</strong> (0,2,4…)</div>
      <div style="background:#0d2b1a;border:2px solid var(--border);border-radius:8px;padding:6px;position:relative;aspect-ratio:0.85;overflow:hidden;">
        <div style="position:absolute;top:50%;left:0;right:0;height:2px;background:var(--border);"></div>
        <div style="position:absolute;top:0;bottom:50%;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:50%;right:0;background:rgba(16,185,129,0.18);border-radius:0 0 6px 0;"></div>
        <div style="position:absolute;bottom:18%;right:22%;font-size:20px;transform:translate(50%,50%);">🏓</div>
        <div style="position:absolute;bottom:4px;left:50%;right:4px;text-align:center;font-size:10px;color:var(--good);font-weight:700;">RIGHT</div>
      </div>
      <div style="font-size:12px;color:var(--good);margin-top:5px;">Serve from right</div>
    </div>
    <div style="flex:1;text-align:center;">
      <div style="font-size:12px;margin-bottom:6px;">Score: <strong style="color:var(--text);">Odd</strong> (1,3,5…)</div>
      <div style="background:#0d2b1a;border:2px solid var(--border);border-radius:8px;padding:6px;position:relative;aspect-ratio:0.85;overflow:hidden;">
        <div style="position:absolute;top:50%;left:0;right:0;height:2px;background:var(--border);"></div>
        <div style="position:absolute;top:0;bottom:50%;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:0;right:50%;background:rgba(251,191,36,0.15);border-radius:0 0 0 6px;"></div>
        <div style="position:absolute;bottom:18%;left:22%;font-size:20px;transform:translate(-50%,50%);">🏓</div>
        <div style="position:absolute;bottom:4px;left:4px;right:50%;text-align:center;font-size:10px;color:var(--accent);font-weight:700;">LEFT</div>
      </div>
      <div style="font-size:12px;color:var(--accent);margin-top:5px;">Serve from left</div>
    </div>
  </div>
  <p style="font-size:12px;margin:0;">The receiving team does not switch sides when they win the serve — they position based on their own score once they start serving.</p>
</div>`;
  body.appendChild(b2);

  det.appendChild(body);
  return det;
}
```

- [ ] **Step 2: Verify**

Expand "Rally Scoring". Below the table you should see "WHERE TO SERVE FROM" with two side-by-side court diagrams:
- Left diagram: bottom-right quadrant highlighted green, labeled "RIGHT"
- Right diagram: bottom-left quadrant highlighted gold, labeled "LEFT"

Check on a mobile-width viewport — both diagrams should sit side-by-side without overflowing.

- [ ] **Step 3: Commit**

```bash
git add pickleball.html
git commit -m "feat: rally scoring help — court diagrams"
```

---

## Task 4: Rally Scoring — Block 3 (score walkthrough + win condition)

**Files:**
- Modify: `pickleball.html` — replace `buildRallyScoringHelp` with final version containing all 3 blocks

- [ ] **Step 1: Replace `buildRallyScoringHelp` with the final version below**

```js
function buildRallyScoringHelp() {
  const det = el("details", { class: "rules", style: "margin-bottom: 10px;" });
  det.appendChild(el("summary", null, "Rally Scoring"));
  const body = el("div", { class: "rules-body" });

  const b1 = el("div");
  b1.innerHTML = `
<p style="margin:0 0 14px;">In rally scoring, <strong>every rally scores a point</strong> — no matter who served.</p>
<div style="margin-bottom:18px;">
  <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Rally vs. Sideout</div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr>
      <th style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:left;color:var(--muted);font-weight:600;"></th>
      <th style="padding:7px 10px;border-bottom:1px solid var(--border);color:var(--accent);text-align:center;font-weight:700;">Rally</th>
      <th style="padding:7px 10px;border-bottom:1px solid var(--border);color:var(--muted);text-align:center;font-weight:600;">Sideout</th>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Who can score?</td>
      <td style="padding:7px 10px;color:var(--good);text-align:center;font-weight:600;">Rally winner</td>
      <td style="padding:7px 10px;text-align:center;">Serving team only</td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Servers per turn</td>
      <td style="padding:7px 10px;color:var(--good);text-align:center;font-weight:600;">1</td>
      <td style="padding:7px 10px;text-align:center;">2 (each player once)</td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Score called as</td>
      <td style="padding:7px 10px;color:var(--good);text-align:center;font-weight:600;">Server–Receiver</td>
      <td style="padding:7px 10px;text-align:center;">Server–Receiver–#</td>
    </tr>
    <tr>
      <td style="padding:7px 10px;">Win condition</td>
      <td style="padding:7px 10px;color:var(--good);text-align:center;font-weight:600;">Win on your serve</td>
      <td style="padding:7px 10px;text-align:center;">Win on your serve</td>
    </tr>
  </table>
  <p style="font-size:12px;margin:6px 0 0;">Examples below show Team A – Team B (fixed order). The verbal call uses server score first.</p>
</div>`;
  body.appendChild(b1);

  const b2 = el("div");
  b2.innerHTML = `
<div style="margin-bottom:18px;">
  <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Where to Serve From</div>
  <p style="margin:0 0 10px;font-size:14px;">The <strong style="color:var(--text);">serving team's score</strong> tells you which side to use.</p>
  <div style="display:flex;gap:10px;margin-bottom:8px;">
    <div style="flex:1;text-align:center;">
      <div style="font-size:12px;margin-bottom:6px;">Score: <strong style="color:var(--text);">Even</strong> (0,2,4…)</div>
      <div style="background:#0d2b1a;border:2px solid var(--border);border-radius:8px;padding:6px;position:relative;aspect-ratio:0.85;overflow:hidden;">
        <div style="position:absolute;top:50%;left:0;right:0;height:2px;background:var(--border);"></div>
        <div style="position:absolute;top:0;bottom:50%;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:50%;right:0;background:rgba(16,185,129,0.18);border-radius:0 0 6px 0;"></div>
        <div style="position:absolute;bottom:18%;right:22%;font-size:20px;transform:translate(50%,50%);">🏓</div>
        <div style="position:absolute;bottom:4px;left:50%;right:4px;text-align:center;font-size:10px;color:var(--good);font-weight:700;">RIGHT</div>
      </div>
      <div style="font-size:12px;color:var(--good);margin-top:5px;">Serve from right</div>
    </div>
    <div style="flex:1;text-align:center;">
      <div style="font-size:12px;margin-bottom:6px;">Score: <strong style="color:var(--text);">Odd</strong> (1,3,5…)</div>
      <div style="background:#0d2b1a;border:2px solid var(--border);border-radius:8px;padding:6px;position:relative;aspect-ratio:0.85;overflow:hidden;">
        <div style="position:absolute;top:50%;left:0;right:0;height:2px;background:var(--border);"></div>
        <div style="position:absolute;top:0;bottom:50%;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:0;right:50%;background:rgba(251,191,36,0.15);border-radius:0 0 0 6px;"></div>
        <div style="position:absolute;bottom:18%;left:22%;font-size:20px;transform:translate(-50%,50%);">🏓</div>
        <div style="position:absolute;bottom:4px;left:4px;right:50%;text-align:center;font-size:10px;color:var(--accent);font-weight:700;">LEFT</div>
      </div>
      <div style="font-size:12px;color:var(--accent);margin-top:5px;">Serve from left</div>
    </div>
  </div>
  <p style="font-size:12px;margin:0;">The receiving team does not switch sides when they win the serve — they position based on their own score once they start serving.</p>
</div>`;
  body.appendChild(b2);

  const b3 = el("div");
  b3.innerHTML = `
<div>
  <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Example: Score at 4–3</div>
  <p style="margin:0 0 10px;font-size:14px;"><strong style="color:var(--text);">4–3</strong>, Team A serving. Score 4 is even → serve from right.</p>
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
    <div style="background:#0d2b1a;border:1px solid var(--good);border-radius:8px;padding:10px 12px;">
      <div style="font-size:11px;color:var(--good);font-weight:700;margin-bottom:4px;">TEAM A WINS THE RALLY</div>
      <div style="font-size:14px;color:var(--text);">Score → <strong>5–3</strong> · A still serves · 5 is odd → switch to left</div>
    </div>
    <div style="background:#0d1e2b;border:1px solid var(--court1);border-radius:8px;padding:10px 12px;">
      <div style="font-size:11px;color:var(--court1);font-weight:700;margin-bottom:4px;">TEAM B WINS THE RALLY</div>
      <div style="font-size:14px;color:var(--text);">Score → <strong>4–4</strong> · B now serves · 4 is even → B serves from right</div>
    </div>
  </div>
  <div style="background:#1a0e00;border:2px solid var(--accent);border-radius:8px;padding:12px;">
    <div style="font-size:11px;color:var(--accent);font-weight:700;margin-bottom:8px;">⚡ HOW TO WIN — first to 7, win by 2</div>
    <div style="display:flex;flex-direction:column;gap:5px;font-size:13px;font-family:monospace;color:var(--text);">
      <div>6–5, A serving → A wins → <strong style="color:var(--good);">7–5 ✓ GAME</strong></div>
      <div style="color:var(--muted);font-size:12px;padding:2px 0;">— or tie scenario —</div>
      <div>6–6, A serving → A wins → 7–6 <span style="color:var(--muted);">(up by 1, not game)</span></div>
      <div style="padding-left:14px;">7–6, A serving → A wins → <strong style="color:var(--good);">8–6 ✓ GAME</strong></div>
      <div style="padding-left:14px;">7–6, A serving → B wins → 7–7, B serving</div>
      <div style="padding-left:28px;">7–7, B serving → B wins → 8–7 <span style="color:var(--muted);">(not game)</span></div>
      <div style="padding-left:28px;">8–7, B serving → B wins → <strong style="color:var(--good);">9–7 ✓ GAME</strong></div>
    </div>
    <p style="font-size:12px;color:var(--accent);margin:10px 0 0;">Winning while receiving gives you the point and the serve — but you still need to win one more on your own serve to take the game.</p>
  </div>
</div>`;
  body.appendChild(b3);

  det.appendChild(body);
  return det;
}
```

- [ ] **Step 2: Verify**

Expand "Rally Scoring" and scroll to the bottom. You should see:
- "EXAMPLE: SCORE AT 4–3" heading
- Green block: Team A wins → 5–3
- Blue block: Team B wins → 4–4
- Gold bordered "HOW TO WIN" block showing three scenarios with 7–5 GAME, 8–6 GAME, and 9–7 GAME outcomes in green

- [ ] **Step 3: Commit**

```bash
git add pickleball.html
git commit -m "feat: rally scoring help — score walkthrough and win condition"
```

---

## Task 5: Side Out Scoring — Block 1 (key rules table)

**Files:**
- Modify: `pickleball.html` — replace `buildSideOutScoringHelp` with version containing Block 1

- [ ] **Step 1: Replace `buildSideOutScoringHelp` with the version below**

```js
function buildSideOutScoringHelp() {
  const det = el("details", { class: "rules", style: "margin-bottom: 10px;" });
  det.appendChild(el("summary", null, "Side Out Scoring"));
  const body = el("div", { class: "rules-body" });

  const b1 = el("div");
  b1.innerHTML = `
<p style="margin:0 0 14px;">In sideout scoring, <strong>only the serving team can score</strong>. Score is called as three numbers: your score – their score – server number.</p>
<div style="margin-bottom:18px;">
  <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Key Rules</div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;width:45%;">Score a point?</td>
      <td style="padding:7px 10px;color:var(--text);">Only if your team is <strong>serving</strong></td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Servers per turn</td>
      <td style="padding:7px 10px;color:var(--text);"><strong>2</strong> — each player serves once before side out</td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Score format</td>
      <td style="padding:7px 10px;color:var(--text);"><strong>My–Their–Server#</strong> <span style="color:var(--muted);">(e.g. "4–3–1")</span></td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Serve side (after side-out)</td>
      <td style="padding:7px 10px;color:var(--text);">Even → right · odd → left</td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Server 2's side</td>
      <td style="padding:7px 10px;color:var(--text);">Their <strong>current position</strong> — not reset by score</td>
    </tr>
    <tr>
      <td style="padding:7px 10px;">Game start</td>
      <td style="padding:7px 10px;"><code style="background:var(--bg);padding:1px 6px;border-radius:4px;font-size:13px;">0–0–2</code> <span style="color:var(--muted);">— first team gets only 1 server</span></td>
    </tr>
  </table>
</div>`;
  body.appendChild(b1);

  det.appendChild(body);
  return det;
}
```

- [ ] **Step 2: Verify**

Expand "Side Out Scoring". You should see the intro sentence and a 6-row rules table. The "Game start" row should show `0–0–2` in a code-style pill.

- [ ] **Step 3: Commit**

```bash
git add pickleball.html
git commit -m "feat: side out scoring help — key rules table"
```

---

## Task 6: Side Out Scoring — Block 2 (court diagrams)

**Files:**
- Modify: `pickleball.html` — replace `buildSideOutScoringHelp` with version containing Blocks 1+2

- [ ] **Step 1: Replace `buildSideOutScoringHelp` with the version below**

```js
function buildSideOutScoringHelp() {
  const det = el("details", { class: "rules", style: "margin-bottom: 10px;" });
  det.appendChild(el("summary", null, "Side Out Scoring"));
  const body = el("div", { class: "rules-body" });

  const b1 = el("div");
  b1.innerHTML = `
<p style="margin:0 0 14px;">In sideout scoring, <strong>only the serving team can score</strong>. Score is called as three numbers: your score – their score – server number.</p>
<div style="margin-bottom:18px;">
  <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Key Rules</div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;width:45%;">Score a point?</td>
      <td style="padding:7px 10px;color:var(--text);">Only if your team is <strong>serving</strong></td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Servers per turn</td>
      <td style="padding:7px 10px;color:var(--text);"><strong>2</strong> — each player serves once before side out</td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Score format</td>
      <td style="padding:7px 10px;color:var(--text);"><strong>My–Their–Server#</strong> <span style="color:var(--muted);">(e.g. "4–3–1")</span></td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Serve side (after side-out)</td>
      <td style="padding:7px 10px;color:var(--text);">Even → right · odd → left</td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Server 2's side</td>
      <td style="padding:7px 10px;color:var(--text);">Their <strong>current position</strong> — not reset by score</td>
    </tr>
    <tr>
      <td style="padding:7px 10px;">Game start</td>
      <td style="padding:7px 10px;"><code style="background:var(--bg);padding:1px 6px;border-radius:4px;font-size:13px;">0–0–2</code> <span style="color:var(--muted);">— first team gets only 1 server</span></td>
    </tr>
  </table>
</div>`;
  body.appendChild(b1);

  const b2 = el("div");
  b2.innerHTML = `
<div style="margin-bottom:18px;">
  <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Two Servers, One Side-Out Rule</div>
  <p style="margin:0 0 10px;font-size:14px;">At 4–3–1 (score 4, even), Server 1 is on the right. When Server 1 loses, Server 2 takes over from their current side — the left.</p>
  <div style="display:flex;gap:10px;margin-bottom:8px;">
    <div style="flex:1;text-align:center;">
      <div style="font-size:12px;margin-bottom:6px;"><strong style="color:var(--good);">Server 1</strong> · 4–3–1</div>
      <div style="background:#0d2b1a;border:2px solid var(--border);border-radius:8px;padding:6px;position:relative;aspect-ratio:0.85;overflow:hidden;">
        <div style="position:absolute;top:50%;left:0;right:0;height:2px;background:var(--border);"></div>
        <div style="position:absolute;top:0;bottom:50%;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:50%;right:0;background:rgba(16,185,129,0.18);border-radius:0 0 6px 0;"></div>
        <div style="position:absolute;bottom:18%;right:22%;font-size:20px;transform:translate(50%,50%);">🏓</div>
        <div style="position:absolute;top:54%;left:22%;font-size:18px;transform:translate(-50%,0);opacity:0.3;">🏓</div>
        <div style="position:absolute;bottom:4px;left:50%;right:4px;text-align:center;font-size:10px;color:var(--good);font-weight:700;">S1 — RIGHT</div>
      </div>
      <div style="font-size:11px;color:var(--good);margin-top:5px;">Serves from right (even score)</div>
    </div>
    <div style="flex:1;text-align:center;">
      <div style="font-size:12px;margin-bottom:6px;"><strong style="color:var(--court2);">Server 2</strong> · 4–3–2</div>
      <div style="background:#1a0d2b;border:2px solid var(--border);border-radius:8px;padding:6px;position:relative;aspect-ratio:0.85;overflow:hidden;">
        <div style="position:absolute;top:50%;left:0;right:0;height:2px;background:var(--border);"></div>
        <div style="position:absolute;top:0;bottom:50%;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:0;right:50%;background:rgba(167,139,250,0.18);border-radius:0 0 0 6px;"></div>
        <div style="position:absolute;bottom:18%;left:22%;font-size:20px;transform:translate(-50%,50%);">🏓</div>
        <div style="position:absolute;top:54%;right:22%;font-size:18px;transform:translate(50%,0);opacity:0.3;">🏓</div>
        <div style="position:absolute;bottom:4px;left:4px;right:50%;text-align:center;font-size:10px;color:var(--court2);font-weight:700;">S2 — LEFT</div>
      </div>
      <div style="font-size:11px;color:var(--court2);margin-top:5px;">Serves from left (current position)</div>
    </div>
  </div>
  <p style="font-size:12px;margin:0;">Partners only switch sides within their team when they <strong style="color:var(--text);">score a point</strong>. Server 2 stays put when Server 1 loses.</p>
</div>`;
  body.appendChild(b2);

  det.appendChild(body);
  return det;
}
```

- [ ] **Step 2: Verify**

Expand "Side Out Scoring". Below the rules table you should see "TWO SERVERS, ONE SIDE-OUT RULE" with two side-by-side courts:
- Left court: bottom-right quadrant highlighted green, labeled "S1 — RIGHT"
- Right court: bottom-left quadrant highlighted purple, labeled "S2 — LEFT"
- Faint partner paddle visible in the opposite box of each diagram

- [ ] **Step 3: Commit**

```bash
git add pickleball.html
git commit -m "feat: side out scoring help — court diagrams (Server 1 right, Server 2 left)"
```

---

## Task 7: Side Out Scoring — Block 3 (score walkthrough + win condition)

**Files:**
- Modify: `pickleball.html` — replace `buildSideOutScoringHelp` with final version containing all 3 blocks

- [ ] **Step 1: Replace `buildSideOutScoringHelp` with the final version below**

```js
function buildSideOutScoringHelp() {
  const det = el("details", { class: "rules", style: "margin-bottom: 10px;" });
  det.appendChild(el("summary", null, "Side Out Scoring"));
  const body = el("div", { class: "rules-body" });

  const b1 = el("div");
  b1.innerHTML = `
<p style="margin:0 0 14px;">In sideout scoring, <strong>only the serving team can score</strong>. Score is called as three numbers: your score – their score – server number.</p>
<div style="margin-bottom:18px;">
  <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Key Rules</div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;width:45%;">Score a point?</td>
      <td style="padding:7px 10px;color:var(--text);">Only if your team is <strong>serving</strong></td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Servers per turn</td>
      <td style="padding:7px 10px;color:var(--text);"><strong>2</strong> — each player serves once before side out</td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Score format</td>
      <td style="padding:7px 10px;color:var(--text);"><strong>My–Their–Server#</strong> <span style="color:var(--muted);">(e.g. "4–3–1")</span></td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Serve side (after side-out)</td>
      <td style="padding:7px 10px;color:var(--text);">Even → right · odd → left</td>
    </tr>
    <tr style="border-bottom:1px solid var(--panel);">
      <td style="padding:7px 10px;">Server 2's side</td>
      <td style="padding:7px 10px;color:var(--text);">Their <strong>current position</strong> — not reset by score</td>
    </tr>
    <tr>
      <td style="padding:7px 10px;">Game start</td>
      <td style="padding:7px 10px;"><code style="background:var(--bg);padding:1px 6px;border-radius:4px;font-size:13px;">0–0–2</code> <span style="color:var(--muted);">— first team gets only 1 server</span></td>
    </tr>
  </table>
</div>`;
  body.appendChild(b1);

  const b2 = el("div");
  b2.innerHTML = `
<div style="margin-bottom:18px;">
  <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Two Servers, One Side-Out Rule</div>
  <p style="margin:0 0 10px;font-size:14px;">At 4–3–1 (score 4, even), Server 1 is on the right. When Server 1 loses, Server 2 takes over from their current side — the left.</p>
  <div style="display:flex;gap:10px;margin-bottom:8px;">
    <div style="flex:1;text-align:center;">
      <div style="font-size:12px;margin-bottom:6px;"><strong style="color:var(--good);">Server 1</strong> · 4–3–1</div>
      <div style="background:#0d2b1a;border:2px solid var(--border);border-radius:8px;padding:6px;position:relative;aspect-ratio:0.85;overflow:hidden;">
        <div style="position:absolute;top:50%;left:0;right:0;height:2px;background:var(--border);"></div>
        <div style="position:absolute;top:0;bottom:50%;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:50%;right:0;background:rgba(16,185,129,0.18);border-radius:0 0 6px 0;"></div>
        <div style="position:absolute;bottom:18%;right:22%;font-size:20px;transform:translate(50%,50%);">🏓</div>
        <div style="position:absolute;top:54%;left:22%;font-size:18px;transform:translate(-50%,0);opacity:0.3;">🏓</div>
        <div style="position:absolute;bottom:4px;left:50%;right:4px;text-align:center;font-size:10px;color:var(--good);font-weight:700;">S1 — RIGHT</div>
      </div>
      <div style="font-size:11px;color:var(--good);margin-top:5px;">Serves from right (even score)</div>
    </div>
    <div style="flex:1;text-align:center;">
      <div style="font-size:12px;margin-bottom:6px;"><strong style="color:var(--court2);">Server 2</strong> · 4–3–2</div>
      <div style="background:#1a0d2b;border:2px solid var(--border);border-radius:8px;padding:6px;position:relative;aspect-ratio:0.85;overflow:hidden;">
        <div style="position:absolute;top:50%;left:0;right:0;height:2px;background:var(--border);"></div>
        <div style="position:absolute;top:0;bottom:50%;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:50%;width:1px;background:var(--border);"></div>
        <div style="position:absolute;top:50%;bottom:0;left:0;right:50%;background:rgba(167,139,250,0.18);border-radius:0 0 0 6px;"></div>
        <div style="position:absolute;bottom:18%;left:22%;font-size:20px;transform:translate(-50%,50%);">🏓</div>
        <div style="position:absolute;top:54%;right:22%;font-size:18px;transform:translate(50%,0);opacity:0.3;">🏓</div>
        <div style="position:absolute;bottom:4px;left:4px;right:50%;text-align:center;font-size:10px;color:var(--court2);font-weight:700;">S2 — LEFT</div>
      </div>
      <div style="font-size:11px;color:var(--court2);margin-top:5px;">Serves from left (current position)</div>
    </div>
  </div>
  <p style="font-size:12px;margin:0;">Partners only switch sides within their team when they <strong style="color:var(--text);">score a point</strong>. Server 2 stays put when Server 1 loses.</p>
</div>`;
  body.appendChild(b2);

  const b3 = el("div");
  b3.innerHTML = `
<div>
  <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Example: Score at 4–3–1</div>
  <p style="margin:0 0 10px;font-size:14px;"><strong style="color:var(--text);">4–3–1</strong>, Team A serving (Server 1). Score 4 is even → right side.</p>
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
    <div style="background:#0d2b1a;border:1px solid var(--good);border-radius:8px;padding:10px 12px;">
      <div style="font-size:11px;color:var(--good);font-weight:700;margin-bottom:4px;">TEAM A WINS THE RALLY</div>
      <div style="font-size:14px;color:var(--text);">Score → <strong>5–3–1</strong> · Same server · 5 is odd → switch to left</div>
    </div>
    <div style="background:#1a0d2b;border:1px solid var(--court2);border-radius:8px;padding:10px 12px;">
      <div style="font-size:11px;color:var(--court2);font-weight:700;margin-bottom:4px;">TEAM B WINS THE RALLY</div>
      <div style="font-size:14px;color:var(--text);">No point · Score → <strong>4–3–2</strong> · Server 2 serves from left (current position)</div>
    </div>
    <div style="background:#2b1010;border:1px solid var(--bad);border-radius:8px;padding:10px 12px;">
      <div style="font-size:11px;color:var(--bad);font-weight:700;margin-bottom:4px;">TEAM B WINS AGAIN (Server 2 loses)</div>
      <div style="font-size:14px;color:var(--text);">No point · <strong>Side out</strong> · Team B has both servers · From B's view: <strong>3–4–1</strong></div>
    </div>
  </div>
  <div style="background:#1a0e00;border:2px solid var(--accent);border-radius:8px;padding:12px;">
    <div style="font-size:11px;color:var(--accent);font-weight:700;margin-bottom:8px;">⚡ HOW TO WIN — first to 11, win by 2</div>
    <div style="display:flex;flex-direction:column;gap:5px;font-size:13px;font-family:monospace;color:var(--text);">
      <div>10–8, A serving → A wins → <strong style="color:var(--good);">11–8 ✓ GAME</strong></div>
      <div style="color:var(--muted);font-size:12px;padding:2px 0;">— or tie scenario —</div>
      <div>10–9, A serving → A wins → <strong style="color:var(--good);">11–9 ✓ GAME</strong></div>
      <div>10–9, A serving → B wins → no score, 10–9–2 or side out</div>
      <div style="padding-left:14px;">...side out → B serving → score 9–10–1 from B's view</div>
      <div style="padding-left:14px;">9–10, B serving → B wins → 10–10 <span style="color:var(--muted);">(tied, not game)</span></div>
      <div style="padding-left:14px;">...keep going until someone leads by 2 on serve</div>
    </div>
    <p style="font-size:12px;color:var(--accent);margin:10px 0 0;">Same as rally: win the last point on your serve, and lead by 2.</p>
  </div>
</div>`;
  body.appendChild(b3);

  det.appendChild(body);
  return det;
}
```

- [ ] **Step 2: Verify**

Expand "Side Out Scoring" and scroll to the bottom. You should see:
- "EXAMPLE: SCORE AT 4–3–1" heading
- Green block: Team A wins → 5–3–1
- Purple block: Team B wins → 4–3–2, Server 2 left
- Red block: Side out → 3–4–1 from B's view
- Gold "HOW TO WIN" block showing 11–8 and 11–9 wins plus tie scenario

Verify the full "How this works" modal: it should scroll smoothly with both accordions collapsed by default and both expandable independently.

- [ ] **Step 3: Commit**

```bash
git add pickleball.html
git commit -m "feat: side out scoring help — score walkthrough and win condition (complete)"
```

---

## Self-Review Checklist

Spec section → task coverage:

| Spec Requirement | Covered By |
|---|---|
| Reference section with divider + label after format accordions | Task 1 |
| Both accordions collapsed by default, not tied to active format | Task 1 |
| Rally Block 1: 4-row comparison table, Team A–B score note | Task 2 |
| Rally Block 2: two court diagrams, even→right (bottom-right), odd→left (bottom-left) | Task 3 |
| Rally Block 3: 4–3 example, two outcome blocks, win-by-2 gold block | Task 4 |
| Side Out Block 1: 6-row key rules table incl. 0–0–2 start, Server 2 position note | Task 5 |
| Side Out Block 2: Server 1 bottom-right (green), Server 2 bottom-left (purple), partner faint | Task 6 |
| Side Out Block 3: 4–3–1 example, 3 outcome blocks, win-by-2 gold block | Task 7 |
| `renderRallyScoringHelp()` untouched | All tasks (no modification) |
| Only `pickleball.html` modified | All tasks |
