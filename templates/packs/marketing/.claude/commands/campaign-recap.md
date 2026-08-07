---
name: campaign-recap
description: Write the results and learnings recap for a campaign that's reached status done — the close-the-loop partner to /draft-campaign, grounded in what actually happened, not projected
---

# /campaign-recap

`/draft-campaign` writes the brief before a campaign runs; this writes what actually happened
after it's `done` — the two exist as a pair, and a brief with no recap is half a record.

## How to proceed

1. Ask which campaign this is for, if not given (a `product.campaign` id). Confirm its `status`
   is actually `done` — if it's still `planned` or `running`, say so; there's nothing to recap
   yet, and `/campaign-status` is the right command for an in-flight rollup instead.
2. Gather what's actually recorded: the campaign's original `goal` and `channel`, and any notes
   in `notes/company/` or `notes/market/` about how it performed (results, feedback, numbers
   someone already recorded — never invent metrics that weren't tracked).
3. Write the recap:
   - What was the goal, and did it happen — plainly, not spun positive if it didn't.
   - What's actually known about the outcome (only what's recorded; say "not tracked" for
     anything that isn't, rather than guessing a number).
   - One or two concrete learnings for the next campaign of this shape.
4. Offer to save it as a note under `notes/company/` (per `.claude/rules/notes-touch.md`'s
   frontmatter schema) so the next `/draft-campaign` for something similar has it to draw on.

## Notes

- Don't fabricate metrics to make the recap feel complete — "results weren't tracked for this
  campaign" is a more useful record than an invented number, and it's a real finding worth
  fixing for next time.
- This is a record of what happened, not a performance review of whoever ran it.
