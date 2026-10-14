---
name: decision
description: Record one decision and the reasoning behind it in docs/decisions/ — what was chosen, what was rejected, and what would change our mind
---

# /decision

Write down one decision so that in six months someone can tell whether it
still holds. A decision without its reasoning is a rumour.

## Before you write

Read `definitions/ontology/company.yaml` for the company's own vocabulary,
and skim `docs/decisions/` for anything this decision supersedes. If it
contradicts an earlier decision, say so explicitly and name the file.

Ask the user for anything you don't have — especially the alternatives that
were rejected, which is the part people skip and the part that ages best.

## Write

Write `docs/decisions/YYYY-MM-DD-<slug>.md`:

```markdown
---
kind: decision
date: YYYY-MM-DD
status: accepted
supersedes: <!-- earlier decision file, or omit -->
---

# <The decision, as a statement>

## Context
<!-- What situation forced a choice. Facts, not narrative. -->

## Decision
<!-- What we're doing. One paragraph, active voice. -->

## Why
<!-- The reasoning. This is the section that matters. -->

## Alternatives rejected
<!-- Each option considered, and the specific reason it lost. -->

## What would change our mind
<!-- The observation that would make us revisit this. -->
```

## Rules

- **`## Why` and `## Alternatives rejected` are not optional.** `/verify`
  fails a decision file with no reasoning section.
- **Record the decision that was actually made**, including if it was made on
  instinct or under time pressure. "We picked this because we had two days"
  is real reasoning and useful later; a retrofitted rationale is not.
- **`status: accepted` only if it's decided.** If it isn't, this is a note.
- Don't commit. The user reads the diff first.
