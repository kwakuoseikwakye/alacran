---
name: follow-up-lead
description: Draft a personalized follow-up for a specific lead, based on the actual notes/conversation history you have on them — not a generic "just checking in" template
---

# /follow-up-lead

Draft a follow-up message for one specific lead or contact, using what's actually known about
them rather than a generic template.

## How to proceed

1. Ask which lead or contact this is for, if not already given (a name, or a
   `customer.lead`/`customer.contact` id from `definitions/ontology/`).
2. Gather what's actually known:
   - Check `notes/clients/<slug>/` for any prior meeting notes or conversation history.
   - Check the lead's `stage` in the ontology (new / contacted / qualified / proposal_sent) —
     the right follow-up is different for someone who just downloaded something versus someone
     waiting on a proposal.
3. Draft a message that **references something specific from the actual history** (their last
   question, a concern they raised, something they mentioned about their own business) rather
   than "just wanted to follow up." A follow-up that could have been sent to anyone is worse
   than no follow-up.
4. Keep it short and end with one clear, low-friction next step (a specific question, a
   proposed time, not "let me know if you have any questions").
5. Show the draft to the user. **Never send it yourself** — this drafts the message only; the
   user sends it through their own email or CRM.

## Notes

- If there's no real history to draw on yet (a brand-new lead), say so rather than inventing
  detail that isn't there — draft a genuine first-touch message instead of faking familiarity.
- Don't write anything into `notes/` that contains a lead's real financial details or contract
  terms beyond an order-of-magnitude — see `.claude/rules/definitions-touch.md` for where that
  kind of detail belongs instead.
