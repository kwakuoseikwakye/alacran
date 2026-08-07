---
name: decision-prep
description: Turn an open question into a decision-ready one-pager — options, tradeoffs, who's affected — before a leadership meeting, feeding into docs/decisions/
---

# /decision-prep

`/weekly-briefing` reports what already happened; this prepares what still needs deciding, so a
leadership conversation starts from a real brief instead of a raw problem statement.

## How to proceed

1. Ask what decision this is for, if not already given — a plain-language question, or a
   pending item already surfaced in `docs/decisions/` or a recent `/weekly-briefing`.
2. Gather what's actually relevant: check `notes/company/`, `notes/market/`, and any
   `org.role` / `customer.account` / `product.offering` entities the decision touches, so the
   options below are grounded in real information rather than assumed.
3. Write the one-pager, matching a Decision RFC's shape so it can become one directly:
   - **The question**, stated plainly, in one or two sentences.
   - **2-3 real options**, each with a one-line tradeoff — don't manufacture options that don't
     genuinely exist just to look thorough.
   - **Who's affected** — which role, team, or customer segment the decision actually changes
     things for.
   - **What happens if this isn't decided** — the cost of delay, if there is one.
4. Do not recommend a single option as if the decision is already made — leadership decides;
   this prepares the ground so they can, faster and with less back-and-forth.
5. Offer to save it under `docs/decisions/` as a draft RFC (following this starter's decision-
   record convention) so the meeting's actual choice has something concrete to be recorded
   against.

## Notes

- If a decision covers money, contracts, or an irreversible operation, name that explicitly and
  point at `.claude/rules/hitl-gate.md` — this command preps the brief, it doesn't grant
  approval.
- A one-pager with only one real option isn't a decision brief, it's a proposal wearing a
  decision brief's format — say so if that's genuinely the case rather than inventing a second
  option to fill the template.
