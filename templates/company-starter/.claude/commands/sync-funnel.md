---
name: sync-funnel
description: Reconcile this company's funnel leads in records/funnel/leads.yaml from recent notes, comms, and interactions
---

# /sync-funnel

Reconcile this company's funnel leads in `records/funnel/leads.yaml` from recent notes, comms, and customer interactions.

## Rules

1. Read `records/funnel/leads.yaml` first. Each entry must follow the schema:
   - `id`: unique kebab-case identifier
   - `name`: company or lead name
   - `stage`: `new` | `qualified` | `negotiation` | `won` | `lost`
   - `source`: connector ID or `manual`
   - `owner`: `agent` | `human`
   - `value`: numeric amount
   - `currency`: e.g. `USD`
   - `first_seen`: YYYY-MM-DD
   - `last_touch`: YYYY-MM-DD
   - `provenance`: optional array of `{ claim, said_by, said_on, source }`

2. Scan `notes/company/` and comms for any new leads, deal progress, or stage updates. Record honest provenance for any update found.

3. **Stop at the gate.** If a lead update involves committing to spend, quoting a price, discounting, or contract obligations, draft the details into `records/funnel/leads.yaml` and STOP — do not send any outward communication.

Write only `records/funnel/leads.yaml`. Do not run any commands or commit.
