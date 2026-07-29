---
name: retro
description: Run a retrospective interactively and save it to docs/retros/YYYY-MM-DD-retro.md (Phase 5: Record)
---

# /retro

Borrowing the structure of `docs/templates/retrospective-template.yaml` (Keep / Problem / Try) in a
lightweight way, run a retrospective on this cycle or session.

## How to proceed

1. If `docs/templates/retrospective-template.yaml` exists, Read it to get a sense of the KPT approach
   (Keep / Problem / Try). The dialogue below works even if it doesn't exist.
2. Ask the user the following interactively (one at a time):
   - **Keep (what to continue)**: what patterns worked well this time, and what ways of working do you want to keep?
   - **Problem**: where did you get stuck, what was unexpected, what was inefficient?
   - **Try (what to try next)**: name 1-3 improvement actions you want to try in the next cycle.
3. Get today's date and save to `docs/retros/<YYYY-MM-DD>-retro.md` in the following format (the frontmatter
   follows the shared L2 schema in `docs/decisions/2026-07-03-obsidian-context-stock.md` §3.
   If the target team is settled, match `team_id` to the team_id in `definitions/`; otherwise omit it):

   ```markdown
   ---
   type: retro
   status: active
   created: <YYYY-MM-DD>
   updated: <YYYY-MM-DD>
   tags: []
   ---

   # Retro <YYYY-MM-DD>

   ## Keep

   - <the user's answer>

   ## Problem

   - <the user's answer>

   ## Try

   - <the user's answer>

   ## Next actions

   - [ ] <a Try turned into a concrete action. Include an owner and rough due date if there is one>
   ```

4. Create the `docs/retros/` directory if it doesn't exist, then save.
5. After saving, summarise the content for the user. If any Try item looks like it could become a
   "Next action", suggest carrying it into `/create-epic` or a normal Issue.

## Notes

- A retrospective is valuable because it's honest. Don't dress it up as though things went well; write the Problem frankly.
- For the important items raised under Try, check at the start of the next session that they are reflected in
  "Next up" in the HANDOFF.md produced by `/handoff` — that is what connects one cycle to the next.
- Do not retroactively bulk-edit existing retro files (those without frontmatter).
  Apply this schema from newly created files onward.
