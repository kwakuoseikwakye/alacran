---
name: check-notion
description: Summarize recently-edited Notion pages and databases shared with this company's connected integration, in notes/company/notion-checks/ (read-only — never writes to Notion)
---

# /check-notion

Summarize what's recently changed in the Notion workspace this company's connected integration can see.
**Read-only**: never creates, edits, moves, or archives anything in Notion.

Prerequisite: a Notion integration must be connected. If the fetched data below says nothing is connected (or
nothing is shared), create a Notion internal integration and save its token as `NOTION_TOKEN` in this
repo's own `.env` (never through the control panel), and walks through sharing pages with the integration from
each page's `···` menu → `Connections`. A valid token with nothing shared still returns zero results — that's
expected, not a failure.

The data below has already been fetched for you by the control panel. You have no Notion credentials of your
own and no Bash access for this command.

## How to proceed

1. Read the fetched search results below (title, type, last-edited date, URL — nothing else was fetched; page
   and database *content* was deliberately not pulled in this first pass).
2. Write the summary to `notes/company/notion-checks/<YYYY-MM-DD>-notion-check.md` using today's date
   (create the directory first if it doesn't exist):

   ```markdown
   ---
   type: notion-check
   status: active
   created: <YYYY-MM-DD>
   tags: []
   ---

   > This file is a read-only snapshot of what's changed in Notion recently.

   # Notion check <YYYY-MM-DD>

   ## Recently edited
   - [page] <title> — edited <date> — <url>
   ```

   If the fetch says nothing is shared with the integration yet, write that note under "## Recently edited"
   instead of an empty list — it's the expected first-run state, not an error.

## Iron rules

- **Read-only.** This command never creates, edits, moves, or archives anything in Notion.
- Only use the title, type, date, and URL already provided above — do not attempt to fetch page content;
  no Notion credentials are available to this command for that.
- Write one file, then finish.
