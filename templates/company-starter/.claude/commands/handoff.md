---
name: handoff
description: Append the current state of play to HANDOFF.md so the next session starts knowing where things stand
---

# /handoff

Update `HANDOFF.md` so whoever opens this repo next — a person or an agent —
knows where things stand without reading the whole history.

## Gather

- What changed this session: `git status` and `git diff --stat`, plus any
  files written.
- What was decided: new files in `docs/decisions/`.
- What was left unfinished, and why it stopped.

## Write

**Append** a new section to `HANDOFF.md`. Preserve everything already in the
file — this is a running log, not a snapshot to overwrite.

```markdown
---

## YYYY-MM-DD

**Where things stand**
<!-- Two or three sentences. Someone with no context should follow it. -->

**Done this session**
<!-- One line each, with the file it landed in. -->

**Left open**
<!-- What stopped, and what it's blocked on. Be specific about the blocker. -->

**Next up**
<!-- The first concrete action for the next session. One thing. -->
```

## Rules

- **Append, never replace.** The old sections are the record.
- **"Left open" is the section that earns this file.** An unfinished thing
  with no note becomes an unfinished thing nobody remembers.
- **Write "Next up" as an action**, not a topic. "Fix the failing ontology
  check" beats "ontology".
- Say if the session ended mid-change with a dirty working tree. That's
  exactly what the next session needs to know first.
- Don't commit. The user reads the diff first.
