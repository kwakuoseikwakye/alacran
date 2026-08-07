---
name: ticket-trends
description: Scan open tickets for a recurring theme and flag it as a probable product bug rather than N unrelated complaints — root cause over symptom, applied across the whole queue
---

# /ticket-trends

The same principle a software-engineering company's `/debug-issue` applies to one bug — three
tickets reporting the same underlying problem are one bug wearing three names, not three
separate cases each needing their own reply.

## How to proceed

1. Read every open `customer.ticket` (`status: open` or `pending`) in
   `definitions/ontology/company.yaml`, plus their `subject` and any linked notes in
   `notes/clients/`.
2. Group tickets that describe the same underlying problem, even if worded differently — go by
   what's actually being reported, not just matching keywords in the `subject`.
3. For any group of 2 or more tickets sharing a root cause, flag it: how many tickets, what the
   shared problem actually is, and the specific evidence (which tickets, what they each said)
   that supports treating them as one issue rather than a coincidence.
4. For a flagged group, suggest it as a candidate `customer.issue` for whichever engineering
   repo it points to (if this is a genuine product bug, not a one-off support-process gap) —
   this command doesn't file it itself, since routing it there is a judgment call a human
   should confirm.
5. Present the report: trend groups found, if any — "no clear pattern" is a legitimate, useful
   result. Don't force tickets into a group that isn't really there just to have something to
   report.

## Notes

- This is read-only and diagnostic — it doesn't triage, respond to, or close any ticket itself;
  see `/triage-ticket` and `/draft-response` for those.
- A trend flagged here still needs a human (or a `/debug-issue`-style pass on the actual repo)
  to confirm and fix the root cause — this command's job ends at "here's a pattern worth
  looking at."
