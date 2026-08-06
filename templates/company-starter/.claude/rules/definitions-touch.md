---
description: Discipline that applies only when editing definitions/** (your company's real data). Enforces its treatment as the SSOT.
paths:
  - definitions/**
---

# Rules for working in definitions/

> This file is a rule scoped with `paths:` to everything under `definitions/` (real data such as your company
> ontology and HITL triggers). A worked example of "open it only when you need it" from L2 of the concepts guide.
> Its trigger conditions are, precisely:
>
> - **Read**: reading `definitions/**` loads this file, per the official specification.
> - **Edit**: Claude Code always Reads the target before editing, so this is covered indirectly via that preceding Read.
> - **New Write**: there is a known limitation whereby this file is not loaded when creating a new file without
>   going through an existing one (anthropics/claude-code#23478 — the highest-risk path, since it writes new YAML
>   that may contain PII).
>   This write-path gap is closed by `.claude/hooks/definitions-touch-context.sh` (a PreToolUse hook), which acts
>   as a guarantee layer by injecting the same discipline into the context (Issue #38).

## 0. Where this sits

`definitions/` is the **SSOT (Single Source of Truth)** of this template.
"Your company's real data", derived from the templates in `docs/templates/`, lives here.
This is the **source data**, not a generated artefact (report, agent instruction, slide deck, etc.).

- Touching this directly means rewriting the declarative definition of the company itself.
- When you want to fix a generated artefact, the first place to suspect is always the `definitions/` side.
- Conversely, once you fix `definitions/`, the generated artefacts are rebuilt to follow (`definitions/` is the truth).

## 1. Check before you touch anything (5 seconds)

Before calling Edit / Write, confirm:

1. ✅ Is the `entity` / `attribute` you're about to change referenced from other files?
   (check with `grep -r "customer.account" definitions/`)
2. ✅ Is this a structural change that should bump `schema_version` to today's date?
3. ✅ Does the change contain a decision that ought to be recorded as a Decision RFC (`docs/decisions/`)?
4. ✅ Are you **about to embed PII directly**, such as a customer or personal name (-> see section 3)?

## 2. Schema versioning conventions

There is a `schema_version` field at the top of `definitions/ontology/*.yaml`.

| Kind of change | What to do with schema_version |
|---|---|
| Simple addition or correction of values (e.g. adding one new customer) | No update needed |
| Adding or removing an entity or attribute | **Update to today's date (`YYYY-MM-DD-company`)** |
| Adding or removing a domain | **Always update, and write an RFC with `/decision`** |

Use absolute dates (relative expressions such as "yesterday" or "last week" are forbidden — your future self won't be able to read them).

## 3. Handling PII and secrets

`definitions/` is a folder that is expected to be **committed to git**. Do not write the following into it directly:

- Customers' real names, email addresses or phone numbers
- Employees' personal information
- API keys, passwords or tokens
- Real contract amounts (a range or an order of magnitude is acceptable)

**Where they go instead:**

- Credentials -> `secrets/` (gitignored)
- Customer-specific information -> reference by id and manage the real data separately (CRM, spreadsheet, etc.)
- Contract details -> limit yourself to referencing the location of the original contract by URL or file path

If you're unsure, re-read the "publication" and "credentials" triggers in `.claude/rules/hitl-gate.md`.

## 4. Before deleting anything

Deleting an entity or attribute is a destructive operation. Always run this before deleting:

```bash
# find references to what you're deleting
grep -rn "<id being deleted>" definitions/ docs/ .claude/
```

If you find references, deal with the referring side first, then delete. Silent deletion is forbidden.

## 5. Recording changes afterwards

If you make a structural change to `definitions/` (a case requiring an update in section 2), then at the end of the session:

1. Add one line to `HANDOFF.md` with `/handoff` describing "what changed in schema_version this time"
2. For a big change such as adding or removing a domain, write a Decision RFC with `/decision`

This is the implementation of L6 of the concepts guide, "conversations are disposable, rules go on the map".
Even when a conversation is cut short, the next session can trace "why the schema ended up this way".

## 6. Relationship to the Scope Contract

Changes to `definitions/` need to be treated more carefully than other code edits. Because:

- They can be exposed outside the company via generated artefacts (wrong real data reaching a customer)
- The history is hard to follow (it is difficult to reconstruct later "why this entity disappeared")

So declare the Scope Contract's **NOT CHANGE** more strictly than usual.
"While I'm here, let me fix this entity name too" runs directly against the spirit of this file.

---

*company-starter — definitions/ path-scoped rule (a worked `paths:` example from L2 of the concepts guide)*
