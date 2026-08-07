---
name: debug-issue
description: Turn a reported bug (a customer.issue, a stack trace, or "X is broken") into a confirmed reproduction, a root cause, and a fix — in that order, never straight to a patch
---

# /debug-issue

Systematic debugging for a reported problem: find why it actually breaks before touching
anything. Root cause over symptom, the same discipline `.claude/rules/scope-contract.md`
expects of any change.

## How to proceed

1. Restate the report as a concrete, reproducible scenario: exact input, exact steps, exact
   observed behavior versus expected. If it's a `customer.issue` entity, check its severity and
   any notes in `definitions/ontology/`; if it's a stack trace or log line, read enough
   surrounding code to understand what path actually produced it.
2. **Reproduce it before theorizing.** Run the real code path — a script, a test, the app
   itself — and confirm you see the same failure the report describes. If you can't reproduce
   it, say so explicitly; don't guess at a fix for a bug you haven't actually watched happen.
3. Find the root cause, not the nearest symptom:
   - Trace the failure backward from where it's observed to where it actually originates —
     the two are often different functions, sometimes different files entirely.
   - Grep every other caller of the function you're about to blame. If the bug lives in shared
     logic, every sibling caller has the same latent bug even though only one was reported.
4. Write the fix at the root cause, scoped per `.claude/rules/scope-contract.md` — not a guard
   clause at the one call site that happened to get reported, unless the shared function
   genuinely can't be fixed in place.
5. Write a test that reproduces the original failure and fails without the fix (see
   `/write-tests` for this repo's conventions) — that's what proves the fix actually fixes it,
   not just "looks right."
6. If this came in as a `customer.issue`, update its `status` in the ontology per
   `.claude/rules/definitions-touch.md` once the fix is confirmed.

## Notes

- If reproduction fails after a genuine attempt, don't fabricate a plausible-sounding cause —
  report what you tried and what you'd need (more logs, a specific environment, the reporter's
  exact steps) to go further.
- A fix scoped to "make the reported case stop failing," with no attempt to find why it
  happened, is a patch, not a fix — the extra few minutes tracing the real cause pays for
  itself the next time the same root cause shows up somewhere else.
