---
name: stock-note
description: Interactively file an L2 note (company-note / market / client-note / sop) and save it to notes/ on the correct shelf with the correct frontmatter (any time)
---

# /stock-note

A friction-reducing command that lets you file notes in the L2 description layer designed in
`docs/decisions/2026-07-03-obsidian-context-stock.md` (Decision RFC) without having to memorise
the shelves and frontmatter. Follows the shared schema in `.claude/rules/notes-touch.md`.

`/decision` (decision) and `/retro` (retro) already have dedicated commands, so this command
covers the 4 types `company-note` / `market` / `client-note` / `sop`.

## How to proceed

1. Ask the user for the **type** (one at a time, choosing from the following):
   - `company-note` — your own company's story (history, strategy memos, background to management policy)
   - `market` — information about other companies (competitors, market, potential partners). Public information only
   - `client-note` — ad-hoc notes on a client (meeting notes, non-confidential summaries of minutes)
   - `sop` — standard operating procedures (SOP)
2. Ask for the **content** (title, key points of the body).
3. Additional questions by type:

   | type | What else to ask |
   |------|---------------|
   | `market` | `source:` (URL or "verbal" etc.), `observed_at:` (the point in time the information refers to, as an absolute date) |
   | `client-note` | The client's slug, and the topic (used in the filename). Match the slug to `definitions/clients/<slug>/` |
   | `sop` | `team_id:` (match the team_id in `definitions/`), and `related_skill:` if there is a related skill |
   | `company-note` | No additional questions |

4. For `client-note`, check whether `definitions/clients/<slug>/` exists:
   ```bash
   ls definitions/clients/<slug>/ 2>/dev/null
   ```
   If it doesn't exist, ask the user: "This client isn't registered in `definitions/` yet. Would you like to
   register it as structural information with `/ingest-context` first, or leave this as an L2 note as-is?"
5. Get today's date and determine the file path using the naming convention for each type:

   | type | Path |
   |------|------|
   | `company-note` | `notes/company/<slug>.md` |
   | `market` | `notes/market/<slug>.md` |
   | `client-note` | `notes/clients/<client-slug>/<YYYY-MM-DD>-<topic>.md` |
   | `sop` | `notes/sops/<slug>.md` |

   Generate a short slug of alphanumerics and hyphens for `<slug>` / `<topic>` from the content, and confirm it with the user.
6. Write using the following template:

   ```markdown
   ---
   type: <type>
   status: draft
   created: <YYYY-MM-DD>
   updated: <YYYY-MM-DD>
   tags: []
   # --- per-type keys (only those that apply) ---
   client: <slug>             # client-note only
   source: <URL or verbal>    # market only
   observed_at: <YYYY-MM-DD>  # market only
   team_id: <id>              # sop only
   related_skill: <skill name>  # sop only, optional
   ---

   # <Title>

   <Body>
   ```

7. After generating it, summarise the content and file path for the user and confirm whether to leave
   `status` as `draft` or set it to `active`.

## Notes

- Do not overwrite an existing L2 note. If the request is to append or amend, Read first, then Edit.
- To promote a note in `notes/inbox/` onto a shelf, use `/ingest-context inbox`
  (`.claude/commands/ingest-context.md` §6) rather than this command
  (that is the proper route, because it goes through quarantine).
- Check that you are not about to write real names, real amounts, or credentials into the body (`.claude/rules/notes-touch.md` §4).
