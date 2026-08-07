---
name: draft-proposal
description: Draft a formal proposal or quote for a lead who's reached the proposal_sent stage, grounded in their actual recorded needs and this company's own pricing/offering info — never a generic template
---

# /draft-proposal

The action that actually corresponds to a lead's `stage: proposal_sent` — `/follow-up-lead`
keeps the relationship warm; this is the document that stage exists to produce.

## How to proceed

1. Ask which lead this is for, if not already given (a `customer.lead` id, or enough detail to
   find one). Confirm it's genuinely ready for a proposal — if `stage` isn't already
   `qualified` or `proposal_sent`, say so and ask whether this is premature.
2. Gather what's actually known:
   - The lead's own notes in `notes/clients/<slug>/` — their stated needs, pain points, and
     anything discussed about scope or budget.
   - This company's own pricing or service details from `notes/company/` — never invent a price
     or package that isn't recorded anywhere.
3. Draft the proposal around the lead's own stated problem, not a generic feature list: what
   they need, what's being proposed to address it, and pricing grounded in what's on file. If
   pricing genuinely isn't recorded, say so and ask rather than guessing a number.
4. Keep commercial terms clearly marked as a draft — a specific dollar figure or contract term
   in this document is exactly what `.claude/rules/hitl-gate.md`'s Money and Contracts rows
   exist for. Show the draft to the user for the actual approval; this command never sends it.
5. If the proposal is approved and sent, suggest updating the lead's `stage` to `proposal_sent`
   in the ontology (if it isn't already) per `.claude/rules/definitions-touch.md`.

## Notes

- If there's not enough recorded detail to ground a real proposal, say so — a proposal built on
  invented specifics is worse than no proposal, since it commits the company to something it
  never actually decided.
- Never write a lead's real financial details or negotiated terms directly into `definitions/`
  beyond an order-of-magnitude — see `.claude/rules/definitions-touch.md`.
