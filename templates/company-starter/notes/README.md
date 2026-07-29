# notes/ — the L2 description layer (an Obsidian-compatible context stock)

This directory is the **L2 description layer** established by
`docs/decisions/2026-07-03-obsidian-context-stock.md` (Decision RFC, accepted). It
accumulates stories, observations, and procedures as Markdown with frontmatter. Opening this
repo as a vault in Obsidian (desktop / mobile) gets you GUI browsing and capture, but
**everything here degrades gracefully to plain Markdown + YAML with no Obsidian
installed** (the app-independence principle).

## The 2-layer structure

| Layer | Location | Role |
|----|------|------|
| **L1 machine layer (SSOT)** | `definitions/**/*.yaml` | The declarative definition of the business structure. Unrelated to this directory, unchanged |
| **L2 description layer (this directory)** | `notes/` / `docs/decisions/` / `docs/retros/` | Stories, observations, procedures. References L1 by id, in frontmatter |

L2 → L1 references go through frontmatter's `entities:` / `client:` / `team_id:`. Don't point
at L1 (YAML) with a wikilink. See the RFC itself for details.

## Shelves (subdirectories)

| Shelf | Contents | Naming rule |
|----|------|----------|
| `company/` | Your own company's story (history, strategy memos, the background of management policy) | Free |
| `market/` | Information about other companies (competitors, market, potential partners). `source:` and `observed_at:` are mandatory | `<slug>.md` |
| `clients/` | Ad-hoc notes on clients (meeting notes, non-confidential summaries of minutes) | `<client-slug>/YYYY-MM-DD-<topic>.md` |
| `sops/` | Standard operating procedures (SOPs) | `<slug>.md` |
| `inbox/` | Uncategorized raw memos. **The only shelf the owner may write to freely** | Free (see `inbox/README.md` for details) |

## The common frontmatter schema

Every L2 note carries the following keys (see RFC §3 for the required keys per type).

```yaml
---
type: company-note | market | client-note | sop | inbox | decision | retro | digest
status: draft | active | superseded
created: 2026-07-03 # absolute dates only
updated: 2026-07-03
tags: []
---
```

## Write conventions

- The **owner** may write freely only into `notes/inbox/`. They do not place new files
  directly onto `definitions/` (L1) or any of the `notes/` shelves (`company/` `market/`
  `clients/` `sops/`).
- Promotion from inbox to a shelf goes **via `/ingest-context`** (quarantine → classify →
  file). Inbox mode is implemented (Issue #73) — running `/ingest-context inbox` quarantines,
  classifies, and files every unprocessed note in one batch.
- Never write real names, real amounts, or credentials into inbox either (when unsure, use
  `secrets/`).

## Link and notation conventions (excerpt)

- Wikilinks (`[[...]]`) only within L2, and only where they resolve uniquely. A
  root-relative full path is preferred
- Embeds `![[...]]`, block refs `^xxx`, and Dataview / Bases query blocks are forbidden
  (app-dependent + fake-green risk)
- Callouts (`> [!note]`) are allowed (they still read fine as a blockquote even if degraded)

See
[`docs/decisions/2026-07-03-obsidian-context-stock.md`](../docs/decisions/2026-07-03-obsidian-context-stock.md)
for the detailed design rationale and the staged rollout plan (Phase A/B/C).

The discipline for Editing / Writing in `notes/` (mandatory frontmatter, write conventions,
PII boundary) is consolidated in
[`.claude/rules/notes-touch.md`](../.claude/rules/notes-touch.md) (a path-scoped rule,
auto-loaded whenever `notes/**` is touched). To avoid duplicating that file, treat it as
authoritative over this README.
