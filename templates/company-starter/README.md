# Your company

An AI company: the durable context your business runs on, in plain files,
plus a set of commands an AI agent uses to work on it.

> Rename this heading to your company's name. Everything else works as-is.

Created with [Alacrán](https://github.com/kwakuoseikwakye/alacran).

## What's here

| Path | What it holds |
| --- | --- |
| `definitions/` | Declarative facts about the business. The source of truth. |
| `definitions/ontology/company.yaml` | Who you serve, what you sell, how value flows. Written by `/define-company`. |
| `notes/` | Working notes — inbox, per-client, market, SOPs. |
| `docs/decisions/` | One file per decision, with the reasoning kept. |
| `docs/retros/` | One file per retrospective. |
| `state/` | Generated status output. Safe to delete and regenerate. |
| `secrets/` | Never committed. Git-ignored except the folder structure. |
| `HANDOFF.md` | Where things stand and what's next, across sessions. |

The split that matters: **`definitions/` and `docs/` are the portable core** —
plain YAML and Markdown that any tool can read. `.claude/` is one adapter on
top of it, for Claude Code specifically. Swap the adapter, keep the company.

## First session

1. Run `/define-company` to fill in `definitions/ontology/company.yaml`.
   Nothing else works well until this exists.
2. Work. Use `/digest` to summarise notes, `/decision` to record a call,
   `/retro` to look back.
3. Run `/verify` (or `python3 scripts/verify.py`) before you commit.
4. End with `/handoff` so the next session knows where you left off.

## Commands

| Command | What it does |
| --- | --- |
| `/define-company` | Write the company ontology from a short interview. |
| `/digest` | Summarise recent notes into a dated digest. |
| `/decision` | Record a decision and its reasoning. |
| `/retro` | Write a retrospective. |
| `/handoff` | Append the current state to `HANDOFF.md`. |
| `/verify` | Check the repo's own invariants. |
| `/check-inbox` | Summarise unread mail. Read-only. |
| `/check-notion` | Summarise a Notion workspace. Read-only. |
| `/triage-email` | Route one email to the right repo. Read-only. |
| `/triage-issue` | Draft a triage note for one issue. Read-only. |

The four read-only commands need a connection set up first — see Alacrán's
Connect page.

## Rules of thumb

- **Facts go in `definitions/`, thinking goes in `notes/`, conclusions go in
  `docs/decisions/`.** If you can't tell which, it's a note.
- **Never put a credential in a tracked file.** `secrets/` is ignored for a
  reason; `.env` too.
- **A decision without its reasoning is a rumour.** Write down why, not just
  what.
