---
name: ingest-context
description: Quarantine external material, URLs and text, then safely ingest them onto the correct shelf in definitions/ (Phase 1: Definition)
---

# /ingest-context

Takes in company material, URLs and text and, **after quarantining anything confidential**, formats and
ingests it onto the correct shelf in `definitions/`. Rather than pouring straight onto the shelves, it goes
through a draft staging area (`definitions/.staging/`, gitignored) in a "two-phase write" that prevents
confidential material getting mixed in and the shelves descending into disorder. The thinking behind this is
in `docs/concepts/context-funnel.md`.

It can also be used to quarantine unprocessed notes that have accumulated in notes/inbox/ (free-form memos
written by the owner) and promote them to L1 (`definitions/`) or L2 (the shelves under `notes/`)
(inbox mode, see §6).

## Usage

```
/ingest-context <path to material / URL / pasted text>   # normal mode
/ingest-context inbox                                     # inbox mode (batch-process notes/inbox/)
```

## How to proceed (intake -> quarantine -> route -> store)

### 1. Intake

- Save the received material, URL or text as a temporary file in `definitions/.staging/` first
  (create the directory if it doesn't exist. It is gitignored, so raw data goes no further than here).
- For a URL, extract the key points as text and likewise put it in `.staging/`.

### 2. Quarantine — confidentiality scan

- Scan the saved content for any of the following:
  - Credentials (API keys, tokens, passwords, private keys)
  - Real contract amounts and unit prices under real names (actual figures rather than a band of magnitude)
  - Personal information (names, email addresses, phone numbers, addresses)
  - Unannounced business information (new products, campaigns, business alliances, personnel matters, etc. — anything not yet public)
- **If you find even one, stop there.** Tell the user "this is confidential. Put it in `secrets/`
  (which is gitignored) and reference it by id from the `definitions/` side", and confirm whether to
  proceed with a version that excludes the material in question.
- For anything you're unsure about, check it against the "credentials" and "publication" triggers in `.claude/rules/hitl-gate.md`.

### 3. Route — decide which shelf

- Decide which of the shelves below the content belongs to, propose it to the user, and get confirmation:

  | Shelf | What goes there |
  |----|---------|
  | `definitions/ontology/` | Business structure (entities/events/relations for customer, org, product) |
  | `definitions/kpi/` | Per-team KPI measurement specifications |
  | `definitions/hitl/` | Triggers for operations requiring approval, and the approver registry |
  | `definitions/clients/<slug>/` | Non-confidential structural information about a client |

- If it doesn't fit any shelf, don't force it in — mark it "on hold" and consult the user.

### 4. Store

- Format it to match the conventions of the relevant shelf (each shelf's README / the templates in `docs/templates/`) and write it.
  - For ontology, match the conventions in `docs/templates/ontology-schema-reference.md`.
  - For kpi / retro / cycle, match the structure of `docs/templates/*-template.yaml` and state `team_id` explicitly.
  - For clients there is no template in `docs/templates/`, so format it by referring to the 3-file structure in
    `definitions/clients/README.md` and the completed example at `examples/harukaze-ec/definitions/clients/midori-hotel/`.
- Once written, clean up the temporary file in `definitions/.staging/`.

### 5. Reporting and handover

- Report as a bulleted list what went where and how it was formatted.
- Ask whether you may `git add` before committing (commit only after the user confirms).
- Then prompt the user to record the ingestion history in `HANDOFF.md` with `/handoff`.

## 6. Inbox mode (`notes/inbox/` -> a `notes/` shelf or `definitions/`)

The implementation of §4/§6 of `docs/decisions/2026-07-03-obsidian-context-stock.md` (Decision RFC).
Quarantines memos the owner wrote freely into `notes/inbox/` and promotes them to the right destination.
Unlike `.staging/`, `notes/inbox/` **is tracked by git**, so "promotion = moving the original file out of
inbox with `git mv`" is what marks it as promoted (there is no separate marker).

### 6.1 Detection

- List `notes/inbox/*.md` (excluding `README.md`).
- Process one file at a time (do not pour multiple files onto the shelves at once — err on the safe side).

### 6.2 Quarantine

- Scan by the same criteria as section 2 of normal mode. If you find confidential material, stop the same way and
  guide the user to move it to `secrets/` (leave the inbox file as-is; re-run once the user has moved it).

### 6.3 Routing — L1 or L2, and if L2, which shelf

- **Structural information** (a new client, a KPI change, an added HITL trigger, etc. — changes to the business structure itself)
  -> follow the L1 routing in sections 3-4 of normal mode. Also apply the schema_version judgement in
  `.claude/rules/definitions-touch.md`.
- **Stories, observations and procedures** (everything else) -> L2. Determine the `type` according to the shelf map in
  RFC §2, propose it to the user, and get confirmation:

  | type | Shelf | Additional frontmatter to confirm |
  |------|-----|---------------------------|
  | `company-note` | `notes/company/` | — |
  | `market` | `notes/market/<slug>.md` | `source:` (URL or "verbal" etc.), `observed_at:` (the point in time the information refers to) |
  | `client-note` | `notes/clients/<client-slug>/YYYY-MM-DD-<topic>.md` | `client:` (a slug matching `definitions/clients/<slug>/`. If it doesn't match, treat it as a new client and check the L1 side first) |
  | `sop` | `notes/sops/<slug>.md` | `team_id:` (matching the team_id in `definitions/`) |

- If you can't decide either way, don't force the promotion — consult the user and leave it in inbox for this round.

### 6.4 Store

- Apply the shared frontmatter schema from `.claude/rules/notes-touch.md` (`type` / `status: active` /
  `created` / `updated` / `tags`) plus the per-type keys confirmed in 6.3.
  For `created`, use the date in the inbox filename if it contains one; otherwise use today's date.
- Once confirmed, move it with `git mv notes/inbox/<file> <destination>` and add the frontmatter
  (since this is a move rather than a new file, the two-phase write via `.staging/` used in normal mode isn't needed).
- For routing to L1, follow the store procedure in section 4 of normal mode (only in that case, delete the
  original inbox file after storing).

### 6.5 Reporting and handover

- For each file processed, report as a bulleted list where it came from, where it went, and under which type it was promoted.
- Ask whether you may `git add` before committing (commit only after the user confirms, as in normal mode).
- Record the inbox processing status (number unprocessed, number processed this time) in `HANDOFF.md` with `/handoff`.

## Notes

- `definitions/.staging/` is the holding area for raw data before inspection. Only what passes inspection is
  promoted to the real shelves in `definitions/` (phase 1 -> phase 2). Do not commit the contents of `.staging/`.
- `notes/inbox/` corresponds to phase 1 in inbox mode, but unlike `.staging/` it is tracked by git
  (see `notes/inbox/README.md`).
- Do not distribute information push-style. Behave as a "librarian" who merely keeps the shelves in order, and let
  agents Read for themselves when they need to (pull model).
- If you find confidential material, don't quietly bury it — always tell the user and guide them to move it to `secrets/`.
