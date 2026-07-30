---
name: plan-feature
description: Turn a raw feature request into a scoped brief and a short design plan before any code is written — the requirements-then-design step, done in one session instead of two handoffs
---

# /plan-feature

Take a feature request in whatever rough shape it arrives (a sentence, a bug report, a customer
complaint) and turn it into something a session — this one or a later one — can actually
implement without re-deriving the requirements from scratch halfway through.

## How to proceed

1. **Restate the request as a problem, not a solution.** If the request already prescribes an
   implementation ("add a checkbox that..."), ask what problem the checkbox is meant to solve —
   the eventual design may be a better fit than the one first suggested.
2. **Write the scope brief**, matching this starter's own discipline
   (`.claude/rules/scope-contract.md`):
   - **Problem statement**: one or two sentences, in plain language.
   - **In scope**: what this specific piece of work will change.
   - **Out of scope**: what it deliberately will not touch, even if related.
   - **Acceptance criteria**: how you'd know it's actually done — concrete and checkable, not
     "works well."
3. **Sketch the design**: which files/areas will change, and — if there's a genuine choice to
   make — 2-3 approaches with a one-line tradeoff each, and which one you'd pick and why. Don't
   manufacture alternatives that don't exist just to look thorough.
4. **Name the risks**: anything that could make this bigger than it looks (a shared component
   many things depend on, a data migration, a HITL-gated operation per
   `.claude/rules/hitl-gate.md`).
5. File this as a GitHub Issue per `.claude/rules/issue-first.md` before implementation starts,
   with the brief above as the Issue body.

## Notes

- This is deliberately a planning step, not an implementation one. If you're tempted to just
  start writing code because the plan seems obvious, write the brief anyway — it's the
  artifact the next session (or `/code-review` later) checks the actual change against.
- For a composite feature (3+ meaningfully separate pieces), use `/create-epic` instead to
  break it into child Issues rather than planning it as one lump.
