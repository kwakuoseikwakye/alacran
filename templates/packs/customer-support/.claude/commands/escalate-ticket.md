---
name: escalate-ticket
description: Draft the internal escalation for a ticket that needs to go beyond first-line support, grounded in the ticket's actual content and any /triage-ticket assessment already on file
---

# /escalate-ticket

The action step after `/triage-ticket` suggests a ticket needs routing beyond first-line
support — this drafts the actual internal handoff, distinct from `/draft-response`'s
customer-facing reply.

## How to proceed

1. Ask which ticket this is for, if not given (a `customer.ticket` id). Check whether a
   `/triage-ticket` assessment already exists for it — if so, use its priority and routing
   suggestion as the starting point instead of re-assessing from scratch.
2. Gather what's actually known: the ticket's `subject`, `priority`, any prior history in
   `notes/clients/<slug>/`, and why it specifically needs escalation (not just "high priority,"
   but the concrete reason — a security implication, a repeat unresolved issue, something
   outside first-line support's authority to fix).
3. Draft the internal escalation: what the problem is, why it's being escalated now, what's
   already been tried or ruled out, and who (`org.role`) it's going to and why.
4. Show the draft to the user. This is an internal note, not a customer-facing message — never
   send anything to the customer as part of this command; that stays `/draft-response`'s job.
5. Offer to save the escalation as a note in `notes/company/` so the handoff has a record
   independent of whatever chat tool actually carries it.

## Notes

- This command drafts the escalation; it doesn't change the ticket's `status` or `priority`
  itself — confirm those updates with the human handling the handoff.
- If the reason for escalating isn't concrete yet, say so rather than writing a vague
  escalation that just pushes the ticket along without giving the next person enough to act on.
