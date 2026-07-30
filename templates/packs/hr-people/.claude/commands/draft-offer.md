---
name: draft-offer
description: Draft an offer letter grounded in the role and comp band on file — always routes through the HITL gate before anything is treated as final, since compensation and contract terms are named triggers there
---

# /draft-offer

Draft an offer letter for a specific candidate and role, using what's actually on file rather
than inventing terms.

## How to proceed

1. Ask which candidate and role this is for, if not already given (an `org.candidate` id and
   its `role_id` from `definitions/ontology/`).
2. Gather what's actually known: the role's `name`/`team`, and the compensation band or terms
   the user gives you — **never assume or invent a number that wasn't provided.**
3. Draft the offer letter: role, start date (ask if not given), compensation as provided, and
   any standard terms the user tells you to include.
4. **Compensation and contract terms are named triggers in `.claude/rules/hitl-gate.md`** — pause
   here, summarize exactly what's about to be offered and to whom, and get explicit approval
   before treating the draft as final or suggesting it be sent.
5. Show the draft to the user. **Never send it yourself** — this drafts the letter only; the
   user sends it through their own channel once approved.

## Notes

- If the comp band or terms aren't provided, ask rather than filling in a plausible-sounding
  number — a fabricated figure in a real offer letter is exactly the kind of mistake the HITL
  gate exists to catch before it goes out.
- This drafts one offer; it never updates the candidate's `stage` to `offer`/`hired` itself —
  that's the human's call once the process actually moves.
