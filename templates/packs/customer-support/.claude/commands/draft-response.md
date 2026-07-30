---
name: draft-response
description: Draft a reply to a support ticket, grounded in the ticket's own content and the customer's actual history — not a generic "thanks for reaching out" template
---

# /draft-response

Draft a reply for one specific support ticket, using what's actually known about the issue and
the customer rather than a generic template.

## How to proceed

1. Ask which ticket this is for, if not already given (a `customer.ticket` id from
   `definitions/ontology/`, or enough detail to identify it).
2. Gather what's actually known:
   - The ticket's own `subject` and any description already recorded.
   - Check `notes/clients/<slug>/` for prior conversation history — a customer who's already
     explained their setup once shouldn't be asked to repeat it.
3. Draft a reply that **references the specific issue** (what they actually reported, what
   you're proposing to do about it) rather than a generic acknowledgment. If the fix needs a
   concrete next step from the customer, say exactly what it is.
4. Keep it short and end with a clear next step (what happens next, or what you need from
   them) rather than an open-ended "let us know if you need anything else."
5. Show the draft to the user. **Never send it yourself** — this drafts the reply only; the
   user sends it through their own support tool or inbox.

## Notes

- If there's no real history to draw on yet (a brand-new ticket), say so rather than inventing
  detail that isn't there — draft a genuine first-response instead of faking familiarity.
- Don't write a customer's real name, email, or ticket contents containing PII directly into
  `definitions/` — see `.claude/rules/definitions-touch.md` for where that kind of detail
  belongs instead.
