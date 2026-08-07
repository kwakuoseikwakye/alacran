---
name: investor-update
description: Draft a periodic external update for investors or the board, using the same real company data as /weekly-briefing — always routed through the HITL gate before it goes anywhere, since this leaves the company
---

# /investor-update

`/weekly-briefing` is for the team, internal, and safe to leave unreviewed. This is the same
underlying data aimed at investors or the board — external, and treated with the care that
implies.

## How to proceed

1. Establish the period this update covers (default: since the last investor update, or the
   last month/quarter if this is the first one) and who it's actually going to.
2. Gather what's actually recorded — the same sources `/weekly-briefing` uses:
   `customer.account` status changes, `product.offering` status, decisions in
   `docs/decisions/`, and notes in `notes/company/` / `notes/market/` — never invent a metric or
   milestone that isn't backed by an actual record.
3. Draft the update in the register this audience expects: headline progress, key metrics
   (only ones actually tracked), notable risks or challenges named plainly rather than
   downplayed, and what's coming next.
4. Do not include anything from `notes/clients/` or `customer.contact`-level detail that
   identifies a specific customer without their comfort with that being shared externally —
   aggregate or anonymize instead.
5. **This draft does not get sent, posted, or shared by this command.** Per
   `.claude/rules/hitl-gate.md`'s Publication row, any external communication requires explicit
   human approval before it goes anywhere — present the draft and stop.

## Notes

- If a genuinely bad-news item exists (a churned account, a missed milestone), include it
  honestly rather than omitting it — an investor update that only ever says things are fine
  stops being trusted exactly when it matters most.
- Don't round a real number up or down to sound better — use the actual figure on file, or say
  it isn't tracked.
