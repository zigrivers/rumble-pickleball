# Skill-Balanced Pairing (Label Presets) — Design Spec

**Date:** 2026-06-29
**Status:** Approved design, pending implementation plan
**Scope:** Setup UI in `index.html`. Zero scheduler changes — the existing two-group infrastructure handles this entirely.

---

## 1. Problem

Social pickleball groups with mixed skill levels want to pair one stronger player with one weaker player per team, creating a more competitive playing field. The app already supports this mechanically — "Mixed mode" pairs one player from Group A with one from Group B, regardless of what those groups mean. But the UI hardcodes "Men / Women" as the only obvious option, so a manager wanting skill balancing would have to know to use "Edit labels" and type custom names.

## 2. Goals

- **Make skill balancing a one-tap choice.** A preset dropdown next to the Mixed mode toggle: "Men / Women", "Advanced / Social", or "Custom…".
- **Labels propagate everywhere.** Per-player toggles, team badges, bye banner, and "Why?" explanations all use the selected vocabulary automatically.
- **Zero scheduler changes.** The scheduler operates on generic "a"/"b" groups. This feature is purely a UI shortcut that sets `mixedGroupLabels`.

## 3. Non-goals

- **No two-dimensional tagging.** A tournament uses either gender tags or skill tags, not both simultaneously. (Deliberately rejected during brainstorming — either/or per tournament.)
- **No scheduler changes.** Pairing logic is group-label-agnostic.
- **No new state fields.** `mixedGroupLabels` already exists and is persisted.
- **No round-plan mode description changes.** The round-plan feature is not yet shipped. When it lands, its descriptions will naturally read from `mixedGroupLabels` at that time. This spec does not couple to unshipped code.

## 4. The preset selector

### 4.1 Location

Inside the existing `renderMixedModeToggle` card on the setup screen. When `mixedMode` is ON, a dropdown appears below the toggle:

```
┌──────────────────────────────────────────────────┐
│  Mixed mode (pair 1 + 1)              [ ON ]      │
│                                                   │
│  Pair by:  [ Men / Women        ▾ ]               │
│            [ Advanced / Social  ]                 │
│            [ Custom…            ]                 │
│                                                   │
│            [ Edit labels ]                        │
└──────────────────────────────────────────────────┘
```

### 4.2 Preset options

| Preset | Sets `mixedGroupLabels` to | Description |
|---|---|---|
| **Men / Women** | `{ a: "Men", b: "Women" }` | Default. Traditional mixed doubles. |
| **Advanced / Social** | `{ a: "Advanced", b: "Social" }` | Skill-balanced pairing. "Advanced" for stronger players, "Social" for the rest. Avoids "Open" which means highest division in pickleball terminology. |
| **Custom…** | Opens the existing Edit Labels modal | Free-text labels for any two-group split. |

**Why "Advanced / Social" not "Skilled / Open":** In pickleball, "Open" denotes the highest/unrestricted division (open play, open bracket). Using "Open" for the weaker group is semantically backwards and would confuse the exact audience this preset targets. "Advanced / Social" reads naturally for social groups and avoids the collision.

### 4.3 Preset table and detection

A single source-of-truth table drives both the dropdown options and preset detection:

```js
const PAIRING_PRESETS = [
  { id: "gender",  label: "Men / Women",      a: "Men",      b: "Women" },
  { id: "skill",   label: "Advanced / Social", a: "Advanced",  b: "Social" },
];
```

**Detection** uses normalized comparison (trimmed, lowercase) so minor whitespace/casing differences don't cause false "Custom":

```js
function detectPreset() {
  const labels = state.mixedGroupLabels || {};
  const norm = s => (s || "").trim().toLowerCase();
  for (const p of PAIRING_PRESETS) {
    if (norm(labels.a) === norm(p.a) && norm(labels.b) === norm(p.b)) return p.id;
  }
  return "custom";
}
```

### 4.4 Pure `applyPairingPreset` function

The dropdown handler calls a pure function (extracted for testability — the codebase uses inline `console.assert`, not a DOM test harness):

```js
function applyPairingPreset(presetId) {
  const preset = PAIRING_PRESETS.find(p => p.id === presetId);
  if (preset) {
    state.mixedGroupLabels = { a: preset.a, b: preset.b };
  }
  save();
  render();
}
```

### 4.5 Custom dropdown display

When preset is "custom", the dropdown shows the active values so the manager can see what's set without opening the modal:

```
  Pair by:  [ Custom (Club A / Club B)  ▾ ]
```

### 4.6 Relationship to "Edit labels" link

The existing "Edit labels" link stays — it's the manual path. "Custom…" in the dropdown opens the same modal. If the manager edits labels to something non-standard via the modal, the dropdown shows "Custom (a / b)" on next render.

## 5. Label propagation

### 5.1 What already works (no changes needed)

| Surface | How it reads labels | Already adapts? |
|---|---|---|
| Per-player toggle buttons | `mixedToggleLabels()` → first char of label | Yes — "Advanced" → "A", "Social" → "S" |
| Team badges on court cards | `mixedBadgeForTeam()` → `mixedToggleLabels()` | Yes — "A·S" |
| Bye banner group tally | `state.mixedGroupLabels.a` / `.b` directly | Yes — "1 Advanced · 1 Social" |
| Collision-safe fallback | `mixedToggleLabels()` → truncate → numeric | Yes — "Advanced" / "Social" → "A" / "S" (distinct) |

### 5.2 Fixes needed — hardcoded strings

**Fix 1 — Setup warning text.** The current setup warning contains a hardcoded `"some same-gender teams needed"` phrase. This must use generic terminology:

Current: `"some same-gender teams needed"`
Updated: `"some same-group teams needed"` (generic — works for both gender and skill)

**Fix 2 — "Why?" explanation.** Currently hardcodes "mixed" language. Should use the group labels:

Current: *"Rumble keeps teams mixed (1 + 1) when the roster allows."*
Updated: *"Rumble pairs across groups (1 {labelA} + 1 {labelB}) when the roster allows."*

Both are string interpolation changes in existing handlers.

### 5.3 Unequal-groups setup hint

Skill distributions in social groups are often skewed (more beginners than strong players). When the two groups have unequal counts and the imbalance would produce same-group fallback teams, the setup warning should say so explicitly:

> *"7 Advanced / 3 Social: some same-group teams needed to fill all courts."*

This uses the existing group-tally logic already computed for the warning. For gender mode it reads "7 Men / 3 Women" — same code path, different labels.

### 5.4 What does NOT change

- Scheduler — zero changes. `pairMixedAware`, `dealBalancedCourts`, `allocateByesForMode` all operate on generic "a"/"b" groups.
- State shape — `mixedGroupLabels` already exists. No new state fields.
- Migration — nothing to migrate. Existing tournaments already have `mixedGroupLabels: {a: "Men", b: "Women"}`.

## 6. Testing strategy

### 6.1 Unit tests

| Test | Setup | Assert |
|---|---|---|
| **Advanced/Social preset sets labels** | `applyPairingPreset("skill")` | `mixedGroupLabels` = `{a: "Advanced", b: "Social"}` |
| **Men/Women preset sets labels** | `applyPairingPreset("gender")` | `mixedGroupLabels` = `{a: "Men", b: "Women"}` |
| **detectPreset matches Advanced/Social** | Labels = `{a:"Advanced", b:"Social"}` | Returns `"skill"` |
| **detectPreset matches Men/Women** | Labels = `{a:"Men", b:"Women"}` | Returns `"gender"` |
| **detectPreset normalizes case/whitespace** | Labels = `{a:" men ", b:"WOMEN"}` | Returns `"gender"` |
| **detectPreset returns custom for unknown** | Labels = `{a:"Club A", b:"Club B"}` | Returns `"custom"` |
| **`mixedToggleLabels` with Advanced/Social** | Labels = Advanced/Social | Returns `{a: "A", b: "S"}` |

### 6.2 Regression test

Existing mixed-mode tests (Men/Women labels) must all pass unchanged. The preset dropdown is additive — it just writes to `mixedGroupLabels`, which already exists and is already tested.

### 6.3 Manual QA

1. Set up 8 players, toggle mixed mode on, select "Advanced / Social" preset.
2. Verify toggle buttons show "A" / "S" instead of "M" / "W".
3. Start tournament, verify team badges show "A·S".
4. Verify bye banner shows "1 Advanced · 1 Social".
5. Switch preset back to "Men / Women" — verify everything relabels.
6. Select "Custom…" — verify modal opens, type custom labels, verify dropdown shows "Custom (a / b)".
7. Verify setup warning says "same-group" (not "same-gender").

## 7. Architecture summary

- **No new state fields.** `mixedGroupLabels` already exists.
- **No scheduler changes.** All pairing logic uses generic "a"/"b" groups.
- **New data:** `PAIRING_PRESETS` table (source of truth for presets + detection).
- **New pure functions:** `applyPairingPreset(id)`, `detectPreset()` — testable without DOM.
- **One new UI component:** preset dropdown in `renderMixedModeToggle`.
- **Two string fixes:** setup warning ("same-group" not "same-gender"), "Why?" explanation (uses labels).
- **One enhancement:** unequal-groups warning adapts to label vocabulary.
- **Migration:** none. Existing tournaments already have `mixedGroupLabels`.

## 8. Resolved questions

All questions from design and MMR review are resolved:

- **"Open" terminology:** renamed to "Advanced / Social" — "Open" means highest division in pickleball (claude).
- **Round-plan coupling:** §5.3 dropped — round-plan description helper will be built when round-plan ships, not coupled here (claude).
- **Preset detection brittleness:** normalized comparison (trim + lowercase) via centralized `PAIRING_PRESETS` table + `detectPreset()` (codex/antigravity).
- **Testability:** `applyPairingPreset` and `detectPreset` extracted as pure functions (claude).
- **Hardcoded "same-gender":** fixed to "same-group" in setup warning (antigravity).
- **"Why?" explanation:** uses `mixedGroupLabels` for interpolation (antigravity).
- **Custom dropdown display:** shows active custom values (antigravity).
- **Unequal skill distributions:** setup hint shows group counts and warns about fallbacks (claude).
