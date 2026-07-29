---
name: check-inbox
description: Check unread mail with the connected Google account (gog CLI) and generate a summary in notes/company/email-checks/ (read-only — never sends, marks as read, changes labels, or archives)
---

# /check-inbox

Check unread mail in the inbox via the connected Google account and generate a summary report.
**Read-only**: never sends mail, marks it as read, changes labels, or archives.

Prerequisite: the `gog` CLI must be authenticated (if it isn't connected, use the `api-connect` skill to connect a Google account).

## How to proceed

1. Fetch unread mail:

   ```
   gog -a auto gmail search "is:unread" --plain --max 20
   ```

   The first line is the header; the second line onward are the results (tab-separated: ID, DATE, FROM, SUBJECT, LABELS, THREAD).
   If there are no result rows, write "No unread mail" and finish.

2. Fetch metadata only for each message (once per ID; do not fetch the body):

   ```
   gog -a auto gmail get <ID> --format metadata --headers From,Subject,Date --plain
   ```

3. Write the summary to `notes/company/email-checks/<YYYY-MM-DD>-inbox-check.md` using today's date
   (create `notes/company/email-checks/` first if it doesn't exist):

   ```markdown
   ---
   type: inbox-check
   status: active
   created: <YYYY-MM-DD>
   tags: []
   ---

   > This file is a read-only snapshot of the inbox.

   # Inbox check <YYYY-MM-DD> (<count> unread)

   ## Unread mail
   - <FROM> — <SUBJECT> (<DATE>)

   ## Observations / things that may need action
   - <1-2 lines if anything looks like it needs a reply or action, based on sender and subject. If there is nothing, write "None">
   ```

## Iron rules

- **Read-only.** Never call `gog gmail send` or `gog gmail messages modify`.
- Do not copy mail bodies, tokens, or personal information into the summary (sender name, subject, and date only).
- Do not run any command other than the two gog commands above (search and get). Write one file, then finish.
