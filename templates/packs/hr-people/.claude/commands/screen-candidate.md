---
name: screen-candidate
description: Summarize a candidate against a role's requirements and draft screening questions, grounded in the actual role and application on file — never makes the accept/reject decision itself
---

# /screen-candidate

Help a hiring team prepare for a candidate conversation, using what's actually on file about
the role and the candidate rather than generic interview advice.

## How to proceed

1. Ask which candidate and role this is for, if not already given (an `org.candidate` id and
   its `role_id`, or enough detail to identify them, from `definitions/ontology/`).
2. Gather what's actually known:
   - The role's own requirements (`org.role`'s `name`, `team`) and anything recorded about it
     elsewhere (a job description in `notes/company/`, if one exists).
   - The candidate's `stage` and anything already noted about their application or a prior
     conversation.
3. Produce two things:
   - **A short fit summary**: where the candidate's background matches the role, and any real
     gaps worth probing — not a generic "strong candidate" writeup.
   - **Screening questions**: 4-6 questions targeted at this role's actual requirements and any
     gaps identified above, not a generic interview-question list.
4. Show both to the user.

## Notes

- **This command never makes the accept/reject/advance decision.** It prepares the human for
  their own conversation and judgment call — it doesn't substitute for it.
- If the role's requirements aren't recorded anywhere yet, say so and ask for them rather than
  inventing what the role probably needs.
- Don't write a candidate's personal contact details or application content directly into
  `definitions/` — see `.claude/rules/definitions-touch.md` for where that kind of detail
  belongs instead.
