---
name: pipeline-review
description: Roll up every lead by stage, flagging anyone stale on last_contacted_at — the cross-pipeline view no single-lead command gives you
---

# /pipeline-review

`/follow-up-lead` handles one lead at a time; this looks at all of them together, the way a
sales lead actually needs to see the pipeline.

## How to proceed

1. Read every `customer.lead` entity in `definitions/ontology/company.yaml`.
2. Group by `stage` (`new` / `contacted` / `qualified` / `proposal_sent` / `won` / `lost`) and
   report a count for each — this is the shape of the pipeline before anything else.
3. Flag anyone stale: no contact recorded in `last_contacted_at` for longer than a reasonable
   window for their stage (a `new` lead going quiet for a week is different from a
   `proposal_sent` lead going quiet for a month — use judgment, not one fixed threshold, and
   say what threshold you used).
4. For each flagged lead, suggest the concrete next action — usually `/follow-up-lead`, but a
   lead stuck in `proposal_sent` for a long time might need the existing draft reviewed with
   `/draft-proposal` instead of just a nudge.
5. Present the rollup as a short report: pipeline counts, the stale list, and suggested next
   actions — not a dump of every lead's full record.

## Notes

- This is read-only: it reports on the pipeline, it never changes a lead's `stage` or contacts
  anyone itself.
- If `source`/`stage` data is missing or clearly stale on many leads, say so — a review built on
  bad underlying data will mislead more than it helps.
