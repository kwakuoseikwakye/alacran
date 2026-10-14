---
name: sync-finances
description: Reconcile this company's financial transactions in records/finances/transactions.yaml from invoices, receipts, and account activity
---

# /sync-finances

Reconcile this company's financial transactions in `records/finances/transactions.yaml` from recent invoices, receipts, and bank/accounting activity.

## Rules

1. Read `records/finances/transactions.yaml` first. Each entry must follow the schema:
   - `id`: unique transaction identifier
   - `date`: YYYY-MM-DD
   - `description`: transaction description
   - `amount`: positive number
   - `currency`: e.g. `USD`
   - `type`: `income` | `expense`
   - `category`: category name
   - `account`: account name or source
   - `status`: `cleared` | `pending` | `failed`
   - `provenance`: optional provenance list

2. Scan `notes/company/` and receipts for cleared or pending financial movements.

3. **Stop at the gate.** If an expense requires payment, wire transfer, or spend commitment, record it as pending/draft and STOP — do not initiate any payments or outward transfers.

Write only `records/finances/transactions.yaml`. Do not run any commands or commit.
