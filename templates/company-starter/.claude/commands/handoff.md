---
name: handoff
description: Update HANDOFF.md, take stock of the recent session, and leave session handover information (Phase 5: Record)
---

# /handoff

At the end of a session, update `HANDOFF.md` (repo root) so whoever picks this up next (including your
future self) isn't left guessing. This command puts the `CLAUDE.md` §2.6 "Session handover" principle into practice.

## How to proceed

1. If `HANDOFF.md` exists, Read it and get a sense of the most recent section. If it doesn't exist, create it.
2. Run the following to gather information automatically:
   ```bash
   git log --since='24 hours ago' --oneline
   gh issue list --state open --limit 10
   ls notes/inbox/*.md 2>/dev/null | grep -v README.md   # stock-take of unprocessed notes (empty if notes/ isn't in use)
   ```
   If unprocessed notes remain in `notes/inbox/`, raise processing them with `/ingest-context inbox`
   as a candidate under "Next up" (see `.claude/commands/ingest-context.md` §6 for details).
   In an environment where `gh` is unavailable or no remote is configured, use this fallback:
   ```bash
   git log --since='24 hours ago' --oneline   # this can substitute for the Done today stock-take
   ```
   Skip checking Issue status and state plainly under "Blockers" below that "Issue status unchecked because
   gh is not connected". Once the network is back, make up for it by running `gh issue list` in the next session.
3. Using what you gathered, append a section under today's date (do not overwrite existing content; append at the end).
   **If you ran multiple sessions on the same day**, don't duplicate the heading — distinguish them with a
   count suffix such as `## <YYYY-MM-DD> (2nd)` (or by including the time, e.g. `## <YYYY-MM-DD> 15:00`):

   ```markdown
   ## <YYYY-MM-DD>

   ### Done today
   - <summary of git log. Commit hash + overview>

   ### In flight
   - <work started but not finished. Include the Issue number if there is one>

   ### Next up
   - <what should be done next, in priority order>

   ### Blockers
   - <where things are stuck. Write "None" if there are none>

   ---
   ```

4. **Rotation**: after appending, if the number of date headings (session sections starting with `## `)
   **exceeds 5**, **move** the excess, oldest first, into `docs/handoffs/<YYYY-MM>.md`
   (the month of that session's date) — move, not delete, so the history stays traceable.
   If the archive file doesn't exist, create it with the heading `# HANDOFF archive <YYYY-MM>` and append
   sections in chronological order. After moving, leave the explanatory text at the top of `HANDOFF.md` as-is.
   See `docs/handoffs/README.md` for the detailed operating rules.
5. Cross-check against the results of `gh issue list --state open` and see whether any Issue should be
   reflected in "Next up".
6. You may auto-draft "Done today", "In flight" and "Next up" from git log / issue list, but
   **always confirm "Blockers" with the user**. That information can't be gathered automatically, so don't
   commit it blank. If you are running autonomously (no user present) and can't ask, do not leave it blank
   or write a groundless "None" — state that it is unconfirmed, e.g. "None (not asked, autonomous session —
   please correct if this is wrong)", and prompt for human confirmation in the next session.

## Finally

- Present the draft to the user and get confirmation against this checklist:
  - [ ] Does "Done today" reflect today's work completely and accurately?
  - [ ] Is any unfinished task missing from "In flight"?
  - [ ] Is the priority order in "Next up" right?
  - [ ] Are the blockers written down accurately?
- Once confirmed, update `HANDOFF.md` with Write.
- Ask the user before committing (never commit without permission).
