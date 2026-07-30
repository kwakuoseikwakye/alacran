---
name: triage-ticket
description: Assess a support ticket's priority and suggest routing, grounded in the ticket's own content and any prior history with the customer — categorizes only, never resolves or closes the ticket itself
---

# /triage-ticket

Look at one support ticket and work out how urgent it actually is and who should handle it,
instead of leaving every ticket in one undifferentiated queue.

## How to proceed

1. Ask which ticket this is for, if not already given (a `customer.ticket` id from
   `definitions/ontology/`, or enough detail to identify it).
2. Gather what's actually known:
   - The ticket's own `subject`, `channel`, and any description already recorded.
   - Check `notes/clients/<slug>/` for prior history with this customer — a repeat issue or a
     customer already flagged as at-risk changes how urgent this is.
3. Assess:
   - **Priority** (`low` / `medium` / `high` / `urgent`) — base this on actual signal (data
     loss, a blocked paying customer, a security report) rather than defaulting to `medium` for
     everything.
   - **Suggested routing** — which role (`org.role`) this best fits, and why.
4. Write a short triage note: priority, routing suggestion, and the one or two facts that
   justify it.
5. Offer to save the assessment onto the ticket's own record under `definitions/ontology/` (if
   the user wants it tracked) or as a note in `notes/company/` — never overwrite the ticket's
   `status` yourself; that's the human's call.

## Notes

- This command **categorizes a ticket — it does not resolve, close, or reply to it.** Use
  `/draft-response` for the reply itself.
- If there's not enough information to assess priority confidently, say so rather than
  guessing — an honest "needs more info" beats a fabricated priority level.
