---
name: decision
description: Interactively file a Decision RFC and generate docs/decisions/YYYY-MM-DD-{slug}.md (Phase 5: Record)
---

# /decision

Record a Decision RFC in `docs/decisions/` so the reasoning behind a decision can be traced later.

## How to proceed

1. Ask the user the following interactively (one at a time):
   - **Context**: under what circumstances and constraints did this decision become necessary?
   - **Decision**: what did you decide? (in a form you can state in one sentence)
   - **Rationale**: why did you think that decision was the best one?
   - **Alternatives Considered**: what other options did you consider, and why didn't you adopt them?
   - **Consequences**: what changes as a result of this decision? (both good and bad effects)
2. Generate a short slug from the decision (alphanumerics and hyphens only, 2-4 words).
3. Get today's date with the `date` command and determine the file path:
   ```
   docs/decisions/<YYYY-MM-DD>-<slug>.md
   ```
4. Write using the following template (the frontmatter follows the shared L2 schema in
   `docs/decisions/2026-07-03-obsidian-context-stock.md` §3; keep the existing `date`/`status`
   for backward compatibility and add `type`/`created`/`updated`/`tags`):

   ```markdown
   ---
   date: <YYYY-MM-DD>
   status: proposed
   type: decision
   created: <YYYY-MM-DD>
   updated: <YYYY-MM-DD>
   tags: []
   ---

   # <Title of the Decision>

   ## Context

   <the user's answer>

   ## Decision

   <the user's answer>

   ## Rationale

   <the user's answer>

   ## Alternatives Considered

   <the user's answer. A bulleted list is recommended>

   ## Consequences

   <the user's answer>
   ```

5. After generating it, summarise the content for the user and confirm whether to leave `status` as
   `proposed` or settle it as `accepted` right now.

## Values for status

| status | Meaning |
|--------|------|
| `proposed` | At the proposal stage. Not yet settled |
| `accepted` | Settled, and a decision to act on |
| `superseded` | Replaced by a later, different Decision (keep the original file rather than deleting it) |

## Notes

- Do not overwrite an existing Decision. If the content changes, create a new Decision, update the old one's
  frontmatter to `status: superseded`, and add a reference to the new file.
- When you change `status` (e.g. `proposed` -> `accepted`), update `updated` to the same date.
- Do not retroactively bulk-edit existing files (those without `type`/`created`/`updated`/`tags`).
  Apply this schema from newly created files onward.
- For a Decision involving money, contracts, or irreversible operations, always check whether it matches a
  trigger in `.claude/rules/hitl-gate.md`. If it does, get human approval before recording the Decision.
