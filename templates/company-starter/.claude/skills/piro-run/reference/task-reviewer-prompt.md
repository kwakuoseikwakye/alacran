# Task reviewer prompt template

Use this template when dispatching a task-review subagent.
The reviewer reads the diff once and returns two verdicts (spec conformance + quality).

Before dispatching, the controller prepares the diff package:
redirect `git log --oneline BASE..HEAD` + `git diff --stat BASE..HEAD` + `git diff -U10 BASE..HEAD`
into a single file (without putting it into the controller's own context).

```
Subagent (general-purpose):
  description: "Review Task N.M (spec + quality)"
  model: [required. Choose according to the size and risk of the diff. Do not omit]
  prompt: |
    You are reviewing the implementation of one task. First, whether it matches the requirements; second,
    whether it is well built. This is a per-task gate, not a merge review (the whole branch is reviewed
    separately once all tasks are done).

    ## What was asked for

    Read the task brief: [BRIEF_FILE]
    The EARS requirements in the brief (WHEN ... THE SYSTEM SHALL ...) are the acceptance criteria.
    Check them one at a time against the implementation.

    Spec/design constraints binding this task:
    [GLOBAL_CONSTRAINTS]

    ## What the implementer claims

    Read the implementer's report: [REPORT_FILE]

    ## The diff under review

    **Base:** [BASE_SHA] / **Head:** [HEAD_SHA]
    **Diff file:** [DIFF_FILE]

    Read the diff file once. It contains the commit list, the stat, and the full diff with context — that is
    everything you need to look at. Do not separately Read the changed files (the only exception is when a hunk
    you need in order to judge is cut off midway, and say so in your report). Do not re-run git commands.
    Do not wander around the codebase. Look at code outside the diff only for a single-point check verifying a
    specific, nameable risk (lock ordering, an API contract, a change to shared state), and state the risk and
    what you checked in your report.

    Behave read-only towards this checkout. Do not change the working tree, index, HEAD or branch state in any way.

    ## Don't trust the report

    Treat the implementer's report as an unverified claim and check it against the diff.
    Design rationales such as "I left it out on YAGNI grounds" are also just claims. Evaluate the code itself,
    and don't downgrade the severity of a finding because a rationale was written for it.

    ## Tests

    The implementer has already run the tests and reported the results. Do not re-run them to confirm.
    Run a targeted test only when reading the code raises a specific suspicion (don't run the whole suite).
    If the reported test output contains warnings or noise, point that out too.

    ## Part 1: Spec conformance

    Compare the diff against the brief:
    - **Missing:** EARS requirements skipped, or claimed as implemented but not
    - **Extra:** functionality nobody asked for, over-engineering
    - **Misunderstood:** built the right feature the wrong way, or solved a different problem

    For requirements that can't be verified from this diff alone (they live in unchanged code, or span tasks),
    report them as ⚠️ items rather than widening your search.

    ## Part 2: Quality

    - Separation of responsibilities, error handling, edge cases
    - Do the tests verify real behaviour (not the behaviour of mocks)?
    - Does the file organisation follow the intent of the design? Did this change bloat any file
      (don't flag pre-existing size)?

    Attach file:line to every finding.

    Your final message is the report itself. Start directly with the spec-conformance verdict; don't write a
    preamble, a description of your process, or a closing summary.

    ## Severity criteria

    Important = something that means this task can't be trusted until it's fixed (incorrect behaviour, a missed
    requirement, verbatim duplication of a logic block, a swallowed error, a test that verifies nothing).
    "The coverage could be broader" and polish suggestions are Minor.
    State the specific things done well first.

    ## Output format

    ### Spec Compliance
    - ✅ Compliant | ❌ Problems: [the Missing/Extra/Misunderstood details, with file:line]
    - ⚠️ Not verifiable from the diff alone: [the requirement, and what the controller should check]

    ### Strengths
    ### Issues
    #### Critical (Must Fix)
    #### Important (Should Fix)
    #### Minor (Nice to Have)

    ### Assessment
    **Task quality:** [Approved | Needs fixes]
    **Reasoning:** [1-2 sentences]
```

**Placeholders:**
- `[BRIEF_FILE]` - required. The same brief the implementer used
- `[GLOBAL_CONSTRAINTS]` - the constraints binding this task, transcribed verbatim from requirements/design
  (exact values, formats, relationships between components). Don't write process rules — they're already in the template
- `[REPORT_FILE]` - required. The implementer's detailed report
- `[BASE_SHA]` / `[HEAD_SHA]` - the commit before the task started / the current commit
- `[DIFF_FILE]` - required. The path to the diff package the controller wrote out

**Note:** ⚠️ items are resolved by the controller itself before the task is considered complete. Once confirmed
as a real gap, treat them the same as a spec-conformance ❌ and send them back to the implementer.
