---
name: campaign-status
description: Roll up every campaign that's planned or running, flagging anything past its ends_at with no recap filed — the cross-campaign view no single-campaign command gives you
---

# /campaign-status

`/draft-campaign` and `/campaign-recap` each handle one campaign; this looks at all of them at
once, the way whoever owns marketing actually needs to check in on the calendar.

## How to proceed

1. Read every `product.campaign` entity in `definitions/ontology/company.yaml`.
2. Group by `status` (`planned` / `running` / `done`) and report what's active right now and
   what's coming up, ordered by `starts_at`.
3. Flag anything whose `ends_at` has already passed but is still marked `running` (or
   `planned`) — that's either stale ontology data or a campaign that needs closing out.
4. Cross-check `done` campaigns against `notes/company/` for a `/campaign-recap` — flag any
   `done` campaign with no recap on file as a gap to fill.
5. Present a short status report: what's live, what's upcoming, and the two flagged lists above.

## Notes

- This is read-only: it reports on the campaign calendar, it never changes a campaign's
  `status` or writes a recap itself — that's `/campaign-recap`'s job.
- If dates are missing on several campaigns, say so rather than silently skipping the
  staleness check for them.
