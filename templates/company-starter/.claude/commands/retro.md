---
name: retro
description: Write a retrospective in docs/retros/ — what happened, what it cost, and the one change worth making
---

# /retro

Look back at a period of work and write down what's worth carrying forward.
Today's date goes in the filename: `docs/retros/YYYY-MM-DD-retro.md`.

## Gather

- Read recent `notes/` and `docs/decisions/` for the period under review.
- Read `git log` for the same window if the company has code.
- Ask the user what period to cover if it isn't obvious.

## Write

```markdown
---
kind: retro
date: YYYY-MM-DD
window: YYYY-MM-DD..YYYY-MM-DD
---

# Retro — YYYY-MM-DD

## What we set out to do

## What actually happened
<!-- Including the parts that didn't work. Especially those. -->

## What it cost
<!-- Time, money, opportunity. Estimates are fine; say they're estimates. -->

## What we'd do differently

## The one change
<!-- Exactly one thing to change before the next cycle. Not a list. -->
```

## Rules

- **Name the failure plainly** if there was one. A retro that reads like a
  status report is a wasted retro.
- **"The one change" is one.** A list of five improvements is a list of zero
  improvements.
- **Don't assign blame to people.** Describe the situation that made the
  outcome likely.
- If the change belongs in `definitions/`, say so — but change it there in a
  separate step, not in this file.
- Don't commit. The user reads the diff first.
