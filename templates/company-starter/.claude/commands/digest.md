---
name: digest
description: Summarise recent notes into one dated digest under notes/company/digests/, so the week's scattered material becomes something readable
---

# /digest

Read the recent working notes and write one dated summary. The point is to
make a week of scattered notes usable without reading all of them.

## Gather

- Read `notes/inbox/`, `notes/clients/`, `notes/market/` and `notes/sops/`.
- Default to the last 7 days by file modification time. If the user names a
  different window, use that.
- Read `definitions/ontology/company.yaml` first, so you describe things in
  the company's own vocabulary rather than inventing your own.

## Write

Write `notes/company/digests/YYYY-MM-DD-digest.md`:

```markdown
---
kind: digest
date: YYYY-MM-DD
window: YYYY-MM-DD..YYYY-MM-DD
---

# Digest — YYYY-MM-DD

## What moved
<!-- Things that actually changed state. One line each, with the source file. -->

## What's stuck
<!-- Open items with no movement in the window. Say how long. -->

## Worth a decision
<!-- Things that keep coming up and haven't been decided. These become /decision. -->
```

## Rules

- **Cite the source file for every claim.** A digest nobody can trace back
  is just an opinion.
- **Don't editorialise.** If a note is ambiguous, say it's ambiguous.
- **An empty section stays empty.** Don't pad it to look thorough.
- Don't commit. The user reads the diff first.
