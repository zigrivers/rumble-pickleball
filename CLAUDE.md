<!-- coding-skill:start v1.0.0 (managed by coding-skill - do not edit manually) -->
# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Communicate Progress

**Narrate what you're doing, not what you did.**

Before executing any plan with more than one edit or command:
- Announce each step before starting it, not after.
- Confirm completion in one line.
- Flag unexpected findings immediately - don't silently adapt and continue.

Keep narration minimal - one line per step.

Bad:  Twelve silent edits, then a final summary.
Good: "Editing src/auth.ts…" → [edits] → "Done. Moving to src/user.ts."

The test: Could a reader interrupt at the right moment without reading the diff?

## 6. Trace Before Building

**Enumerate system states explicitly before touching code.**

When changes cross a module boundary, or when data flows through three or more components:
- Draw the state diagram. Every input type, every transition.
- Write down assumptions about inputs, outputs, edge cases. Name what you don't know.
- Check the map against the code before implementing.

Redundant tools, unnecessary indirections, and wrong abstractions become visible once states are explicit.

A separate reasoning pass (e.g., a subagent in Claude Code) is a useful vehicle, but the technique is the tracing, not the vehicle.

The test: Can you draw the state diagram from memory before you touch code?

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

<!-- coding-skill:end -->