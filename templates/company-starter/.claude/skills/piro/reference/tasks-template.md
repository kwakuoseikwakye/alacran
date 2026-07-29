# tasks.md template (as Kiro actually uses it)

## Structure

```markdown
# Implementation Plan: <feature name>

## Overview

[One paragraph summarising the implementation approach]

## Tasks

- [ ] 1. <major task name>
  - [ ] 1.1 <subtask name>
    - <implementation note (what to do in which file)>
    - <implementation note>
    - _Requirements: 1.1, 1.2_

  - [ ]* 1.2 <optional task (tests, etc.)>
    - <note>
    - _Requirements: 1.3_

- [ ] 2. <major task name>
  - [ ] 2.1 <subtask name>
    - <note>
    - _Requirements: 2.1_

- [ ] 3. Checkpoint - <what to verify at this milestone (the build passes, the tests pass, etc.)>

## Notes

[Implementation language, prerequisites, and an explanation of which tasks can be skipped]
```

## Conventions

- Numbering is only 2 levels, `1.` / `1.1`. Don't create a third level
- All state markers start as `[ ]`. Don't use `[x]`, `[-]` or `[~]` in the initial generation
  (managing post-execution state is Kiro's job)
- Optional tasks are `- [ ]*` (the `*` goes immediately after the `]`, before the number). Kiro's convention is to use this for test tasks
- Subtasks involving implementation end with `- _Requirements: N.M[, N.M...]_` (italics wrapped in
  underscores, comma-separated). Only reference numbers that actually exist in requirements.md
- Make sure every Requirement (N) is referenced by at least one task
- Insert a "Checkpoint" task every few tasks (compile / test / behaviour check)
- **Never create tasks.meta.json** (Kiro auto-generates it the first time a task is run)
