---
name: weekly-briefing
description: A single cross-functional "how's the business doing" briefing for the week — pulls together activity, decisions, and notes instead of making you check five places
---

# /weekly-briefing

Give a small leadership team (which may genuinely be one person wearing several hats) a single
place to see how the week went, instead of needing to separately run a digest, check decisions,
and read through notes to piece it together themselves.

## How to proceed

1. Run the same aggregation `/digest` does — gather frontmatter from `notes/` and
   `docs/decisions/`/`docs/retros/` for the last 7 days — but organize the result by leadership
   role instead of by note type, using `definitions/ontology/company.yaml`'s `org.role` entries
   (e.g. group activity under "Owner/CEO," "Ops," "Finance" rather than a flat chronological
   list).
2. For each role, summarize in a few lines:
   - What moved (from `notes/company/`, `notes/market/`, `notes/clients/`).
   - Any decisions recorded this week (`docs/decisions/`), with their `status`.
   - Anything still open/unresolved that role should know about.
3. Call out anything that touches a HITL trigger (`.claude/rules/hitl-gate.md`,
   `definitions/hitl/triggers/`) that fired or is pending this week — these are the items a
   generalist reading quickly is most likely to otherwise miss.
4. End with a short "what needs a decision this week" list — genuinely open questions, not
   busywork — pulled from anything marked pending in `docs/decisions/` or left unresolved in
   `notes/inbox/`.
5. Offer to save the briefing as this week's entry under `docs/retros/` (following the shared
   L2 frontmatter schema `.claude/rules/notes-touch.md` describes) so it's kept, not just
   printed to the screen and lost.

## Notes

- This command produces a **summary of what already happened and was already recorded** — it
  never makes a decision on the reader's behalf, and it never invents activity that isn't
  backed by an actual note, commit, or decision record.
- If `org.role` in the ontology hasn't been filled in yet, say so and suggest running
  `/define-company` first — a role-grouped briefing needs the roles to actually exist.
