# Skill-Balanced Pairing (Label Presets) — Design Spec

**Date:** 2026-06-29
**Status:** Approved design, pending implementation plan
**Scope:** Setup UI in `index.html`. Zero scheduler changes — the existing two-group infrastructure handles this entirely.

---

## 1. Problem

Social pickleball groups with mixed skill levels want to pair one stronger player with one weaker player per team, creating a more competitive playing field. The app already supports this mechanically — "Mixed mode" pairs one player from Group A with one from Group B, regardless of what those groups mean. But the UI hardcodes "Men / Women" as the only obvious option, so a manager wanting skill balancing would have to know to use "Edit labels" and type custom names.

## 2. Goals

- **Make skill balancing a one-tap choice.** A preset dropdown next to the Mixed mode toggle: "Men / Women", "Skilled / Open", or "Custom…".
- **Labels propagate everywhere.** Per-player toggles, team badges, bye banner, round-plan descriptions, and "Why?" explanations all use the selected vocabulary automatically.
- **Zero scheduler changes.** The scheduler operates on generic "a"/"b" groups. This feature is purely a UI shortcut that sets `mixedGroupLabels`.

## 3. Non-goals

- **No two-dimensional tagging.** A tournament uses either gender tags or skill tags, not both simultaneously. (Deliberately rejected during brainstorming — either/or per tournament.)
- **No scheduler changes.** Pairing logic is group-label-agnostic.
- **No new state fields.** `mixedGroupLabels` already exists and is persisted.
- **No changes to the round-plan mode set.** "Mixed" still means "pair across groups" internally; only its display name adapts.

## 4. The preset selector

### 4.1 Location

Inside the existing `renderMixedModeToggle` card on the setup screen. When `mixedMode` is ON, a dropdown appears below the toggle:

```
┌──────────────────────────────────────────────────┐
│  Mixed mode (pair 1 + 1)              [ ON ]      │
│                                                   │
│  Pair by:  [ Men / Women        ▾ ]               │
│            [ Skilled / Open     ]                 │
│            [ Custom…            ]                 │
│                                                   │
│            [ Edit labels ]                        │
└──────────────────────────────────────────────────┘
```

### 4.2 Preset options

| Preset | Sets `mixedGroupLabels` to | Description |
|---|---|---|
| **Men / Women** | `{ a: "Men", b: "Women" }` | Default. Traditional mixed doubles. |
| **Skilled / Open** | `{ a: "Skilled", b: "Open" }` | Skill-balanced pairing. |
| **Custom…** | Opens the existing Edit Labels modal | Free-text labels for any two-group split. |

### 4.3 Detection of current preset

The dropdown detects which preset is active by comparing `state.mixedGroupLabels` against the known presets. If neither matches (manager typed custom labels), "Custom" is shown as the selected option.

### 4.4 Relationship to "Edit labels" link

The existing "Edit labels" link stays — it's the manual path. "Custom…" in the dropdown opens the same modal. If the manager edits labels to something non-standard via the modal, the dropdown shows "Custom" on next render.

## 5. Label propagation

### 5.1 What already works (no changes needed)

| Surface | How it reads labels | Already adapts? |
|---|---|---|
| Per-player toggle buttons | `mixedToggleLabels()` → first char of label | Yes — "Skilled" → "S", "Open" → "O" |
| Team badges on court cards | `mixedBadgeForTeam()` → `mixedToggleLabels()` | Yes — "S·O" |
| Bye banner group tally | `state.mixedGroupLabels.a` / `.b` directly | Yes — "1 Skilled · 1 Open" |
| Setup warning text | `state.mixedGroupLabels.a` / `.b` | Yes |
| Collision-safe fallback | `mixedToggleLabels()` → truncate → numeric | Yes — "Skilled" / "Open" → "S" / "O" (distinct) |

### 5.2 What needs a small fix

**"Why?" explanation for same-group fallback teams** currently hardcodes "same-group team" language. It should use the group labels so it reads naturally for skill mode:

Current: *"Rumble keeps teams mixed (1 + 1) when the roster allows."*
Updated: *"Rumble pairs across groups (1 {labelA} + 1 {labelB}) when the roster allows."*

This is one string interpolation change in the existing `whyButton` handler.

### 5.3 Round-plan mode descriptions

The round-plan dropdown currently shows "Mixed" and "Gender" as static labels. A new helper `roundPlanModeDescription(mode)` returns label-adaptive descriptions:

| Label preset | `"mixed"` mode reads as | `"gender"` mode reads as |
|---|---|---|
| Men / Women | "Mixed (1M + 1W)" | "Gender (same group)" |
| Skilled / Open | "Balanced (1 S + 1 O)" | "Level (same group)" |
| Custom | "Across groups" | "Within groups" |

```js
function roundPlanModeDescription(mode) {
  const labels = state.mixedGroupLabels || { a: "Men", b: "Women" };
  const a = labels.a.charAt(0), b = labels.b.charAt(0);
  if (mode === "mixed") return "Balanced (1 " + a + " + 1 " + b + ")";
  if (mode === "gender") return "Level (same group)";
  if (mode === "blend") return "Blend";
  return "Open";
}
```

### 5.4 What does NOT change

- Scheduler — zero changes. `pairMixedAware`, `dealBalancedCourts`, `allocateByesForMode` all operate on generic "a"/"b" groups.
- Round-plan internals — `{mode: "mixed"}` still means "pair across groups."
- State shape — `mixedGroupLabels` already exists. No new state fields.
- Migration — nothing to migrate. Existing tournaments already have `mixedGroupLabels: {a: "Men", b: "Women"}`.

## 6. Testing strategy

### 6.1 Unit tests

| Test | Setup | Assert |
|---|---|---|
| **Skilled/Open preset sets labels** | Select "Skilled / Open" preset | `mixedGroupLabels` = `{a: "Skilled", b: "Open"}` |
| **Men/Women preset sets labels** | Select "Men / Women" preset | `mixedGroupLabels` = `{a: "Men", b: "Women"}` |
| **Custom shows "Custom" in dropdown** | Manually edit labels to "A/B Club" | Dropdown selected = "Custom" |
| **`mixedToggleLabels` with Skilled/Open** | Labels = Skilled/Open | Returns `{a: "S", b: "O"}` |
| **`roundPlanModeDescription` adapts** | Labels = Skilled/Open, mode = "mixed" | Returns "Balanced (1 S + 1 O)" |

### 6.2 Regression test

Existing mixed-mode tests (Men/Women labels) must all pass unchanged. The preset dropdown is additive — it just writes to `mixedGroupLabels`, which already exists and is already tested.

### 6.3 Manual QA

1. Set up 8 players, toggle mixed mode on, select "Skilled / Open" preset.
2. Verify toggle buttons show "S" / "O" instead of "M" / "W".
3. Start tournament, verify team badges show "S·O".
4. Verify bye banner shows "1 Skilled · 1 Open".
5. Switch preset back to "Men / Women" — verify everything relabels.
6. Select "Custom…" — verify modal opens, type custom labels, verify they propagate.
7. Open round plan — verify mode descriptions use skill vocabulary.

## 7. Architecture summary

- **No new state fields.** `mixedGroupLabels` already exists.
- **No scheduler changes.** All pairing logic uses generic "a"/"b" groups.
- **One new UI component:** preset dropdown in `renderMixedModeToggle`.
- **One new helper:** `roundPlanModeDescription(mode)` — returns label-adaptive description.
- **One string fix:** "Why?" explanation uses group labels instead of hardcoded text.
- **Migration:** none. Existing tournaments already have `mixedGroupLabels`.

## 8. Open questions

None at design time.
