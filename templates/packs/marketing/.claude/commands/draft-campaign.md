---
name: draft-campaign
description: Draft a marketing campaign brief (audience, channel, message, CTA) from a short prompt describing the goal, using this company's own ontology and voice — not a generic template filled with placeholders
---

# /draft-campaign

Turn a rough goal ("get more signups before the end of the month", "announce the new pricing")
into a real campaign brief, grounded in what this company actually is — not a generic
fill-in-the-blank template.

## How to proceed

1. Read `definitions/ontology/company.yaml` first. The audience, offering, and tone should come
   from what's actually there (the `customer` and `product` domains), not be invented fresh
   each time.
2. Ask the user anything genuinely missing before drafting: the goal, the target segment (a
   specific `customer.lead`/`customer.account` slice if one applies), and which channel
   (`product.campaign.channel`: email / social / paid_ads / content / event).
3. Draft the brief:
   - **Goal**: one sentence, ideally with a number attached (e.g. "50 trial signups by the
     15th"), not just "raise awareness."
   - **Audience**: who specifically this is for, and why they'd care right now.
   - **Message**: the one thing the campaign wants the audience to believe or feel.
   - **Channel & format**: where it runs and what it looks like there (a subject line for
     email, a hook for social, an ad's headline + body for paid).
   - **Call to action**: the exact next step you want the reader to take.
4. Write the actual draft copy for the chosen channel, in the voice `definitions/ontology/company.yaml`
   implies — not marketing-generic language if that's not how this company actually talks.
5. Offer to save it: either as a new entry under `product.campaign` in the ontology (if the
   user wants to track it as a real campaign) or as a note in `notes/company/` if it's just a
   draft for now.

## Notes

- This drafts copy; it never sends anything or posts to any real channel on its own.
- If the campaign involves a price change, a new contract term, or anything else that matches
  a trigger in `.claude/rules/hitl-gate.md`, say so and get approval before treating it as final.
