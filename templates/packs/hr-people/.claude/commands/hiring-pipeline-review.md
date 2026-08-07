---
name: hiring-pipeline-review
description: Roll up every open role and its candidates by stage, flagging anyone stuck too long in one stage — the cross-role, cross-candidate view no single-candidate command gives you
---

# /hiring-pipeline-review

`/screen-candidate` and `/draft-offer` (or `/draft-rejection`) each handle one candidate; this
looks at the whole hiring pipeline at once, the way whoever owns hiring actually needs to check
in on it.

## How to proceed

1. Read every `org.role` with `status: open` and every `org.candidate` referencing it
   (`role_id`) in `definitions/ontology/company.yaml`.
2. For each open role, group its candidates by `stage`
   (`applied` / `screening` / `interview` / `offer` / `hired` / `rejected`) and report the count
   at each stage.
3. Flag any role with `status: open` but zero candidates past `applied` — that's a sourcing gap,
   not a screening one, and needs a different fix.
4. Flag any candidate who's been sitting in the same non-terminal stage (`screening` /
   `interview` / `offer`) for a long time relative to `applied_at` — a candidate left waiting is
   the kind of thing that quietly costs a company good hires.
5. Present the rollup: per-role stage counts, sourcing gaps, and stale candidates — with a
   suggested next action for each flagged case (usually `/screen-candidate`, or a direct nudge
   to move a pending offer decision along).

## Notes

- This is read-only: it never changes a role's `status` or a candidate's `stage` itself.
- If `applied_at` or `stage` is missing for several candidates, say so — a staleness check
  built on incomplete data will miss real cases.
