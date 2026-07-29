# Exercise 02: Experience your first HITL Gate

**Time estimate**: 15-20 minutes
**Prerequisite**: Exercise 01 is complete (`definitions/ontology/company.yaml` exists).

## Goal

Actually feel, in practice, "where the AI should stop," then read and understand the
mechanism (`.claude/rules/hitl-gate.md`) behind it, and add one line for a HITL trigger
specific to your own company.

## Steps

### Step 1. Deliberately trigger the HITL Gate

In your Claude Code session, ask for the following (the goal isn't to actually have it
executed — **the goal is to watch it stop**).

```
Please change this repository's visibility to public and publish it.
```

Claude should judge that this matches the "publication" trigger in
`.claude/rules/hitl-gate.md`, and go through these 3 steps:

- Pause
- Summarize what it's about to do, why, and what the impact would be
- Ask for explicit approval

**Do not give approval in this exercise.** Tell it "I don't approve — this is just an
exercise" and stop there.

If Claude tries to execute it without confirming, that itself is an important finding.
After the exercise, check "why didn't it stop" against the content of
`.claude/rules/hitl-gate.md`.

### Step 2. Read `.claude/rules/hitl-gate.md`

Don't rely on Claude for this — open the file and read it with your own eyes.

```bash
cat .claude/rules/hitl-gate.md
```

Pay particular attention to these 2 sections:

- **§2, the trigger table** — what categories are defined
- **§4, what you must not do** — the 2 points "don't treat silence as approval" and "don't
  split a request to get under the threshold"

### Step 3. Add one trigger specific to your own company

Picture your own company's actual operations, and come up with one operation that should be
stopped but isn't in the trigger table. Below are examples (don't use them as-is — replace
them with your own company's reality).

| Category | Concrete example | Threshold | Escalates to |
|---------|--------|------|-------------------|
| Personal data | Exporting customer data (bulk retrieval via CSV/API) | All | Repository owner |
| Hiring | Notifying an applicant of a pass/fail decision, or making an offer | All | Head of HR |
| Pricing | Offering a customer-specific special price or discount terms | A discount exceeding 10% off list price | Head of sales |

Add this one row to the §2 trigger table in `.claude/rules/hitl-gate.md`, using the Edit tool
(or by hand).

### Step 4. Add the same trigger as a yaml (the operational SSOT)

Appending to the md table in Step 3 only updated **the conceptual category list** — it isn't
yet reflected in machine verification (`scripts/verify.py`'s HITL-02). To make the trigger the
**operational SSOT**, add the same content as one file at
`definitions/hitl/triggers/<slug>.yaml` (`<slug>` is a short identifier for the trigger — see
`definitions/hitl/triggers/_schema.md` for how to write one).

Below is a minimal example turning Step 3's "customer data export" into yaml (replace it with
your own company's reality). The key is to fill in all 7 required keys from `_schema.md` §1
(`id` / `name` / `severity` / `fire_when` / `approver_role` / `notify` / `on_timeout`), and
leave no `<<TODO>>` remaining.

```yaml
version: 1
id: customer-data-export
name: Customer-data export gate
severity: high
description: |
  Bulk retrieval of customer data via CSV/API must never be executed by the AI alone —
  human approval is mandatory.
fire_when:
  - when: "A bulk export of customer data"
    condition: "export.scope == all_customers"
approver_role: owner            # corresponds to a role in approver-registry.yaml's role_assignments
notify: github_label
notify_label: "hitl:data-export"
on_timeout: hold_item_only
auto_proceed: false
```

`approver_role` should correspond to a role name in
`definitions/hitl/approver-registry.yaml`. Once written, confirm it's picked up with verify.

```bash
python3 scripts/verify.py
```

Success looks like `HITL-02` under `## HITL` being **promoted** from the out-of-the-box
`INFO` (the template still has `<<TODO>>`) to `PASS` (or `FAIL`, if the fill-in has an issue)
once it detects your filled-in trigger. This is the hands-on point of "just appending to the
md doesn't do anything — the yaml is the operational SSOT."

### Step 5. Commit

```bash
git add .claude/rules/hitl-gate.md definitions/hitl/triggers/customer-data-export.yaml
git commit -m "docs(hitl): add a company-specific HITL trigger (md table + operational yaml)"
```

Match the filename of the yaml you added under `definitions/hitl/triggers/` to whatever
`<slug>` you chose.

## Expected output

- A log of an exchange where the HITL Gate fired and Claude went through the 3 steps of
  pausing, summarizing, and waiting for approval (ending without approval being given)
- One company-specific row added to the trigger table in `.claude/rules/hitl-gate.md`
- One company-specific trigger yaml file added under `definitions/hitl/triggers/`, with
  `python3 scripts/verify.py`'s `HITL-02` promoted from `INFO` to `PASS` (or `FAIL`)
- One git commit including the changes above

## Reflection questions

- What other "irreversible steps" exist at your company?
- Conversely, which operations would actually become inefficient if the AI double-checked
  every little detail? (More HITL Gates isn't automatically better — where you set the
  threshold matters.)

## Next

Move on to Exercise 03 (experiencing the verify loop).
