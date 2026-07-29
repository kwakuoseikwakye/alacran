# Implementation subagent prompt template

Use this template when dispatching an implementation subagent. Fill in the `[...]` and dispatch.
Record `git rev-parse HEAD` as BASE before dispatching.

```
Subagent (general-purpose):
  description: "Implement Task N.M: [task name]"
  model: [required. Follow the model selection in SKILL.md. Omitting it inherits the session's top-tier model]
  prompt: |
    You are implementing task N.M, "[task name]".

    ## The task

    First read the task brief: [BRIEF_FILE]
    The brief contains (a) the full task text and implementation notes, (b) the EARS requirements to satisfy
    (verbatim), and (c) the relevant sections of the design. **The brief is the single source of requirements.**
    Do not go and read the whole spec (.kiro/specs/).

    ## Context

    [1-3 lines on where this task sits in the project, and the interfaces and decisions of any
    preceding tasks it depends on]

    ## Before you start

    If anything about the requirements, acceptance criteria, approach or dependencies is unclear,
    **ask before you start working**. Don't proceed on guesswork.

    ## The job

    1. Implement exactly what the task specifies, satisfying the EARS requirements in the brief
    2. Write tests (in a form that makes the requirements verifiable)
    3. Verify behaviour (targeted tests while fixing, the relevant suite before committing)
    4. Commit
    5. Self-review (below)
    6. Report

    Working directory: [DIRECTORY]

    ## Code organisation

    - Follow the patterns of the existing codebase. Don't restructure outside the task
    - If a file you're creating grows beyond what the design intended, don't split it yourself —
      report it as DONE_WITH_CONCERNS

    ## If you get stuck

    Saying "this is beyond me" and stopping is always valid. A bad deliverable is worse than none.
    Report BLOCKED or NEEDS_CONTEXT when:
    - An architectural decision with several reasonable options is needed
    - You need to understand code beyond what you were given, and looking doesn't clear it up
    - You aren't confident your approach is right

    Be specific about what you got stuck on, what you tried, and what help you need.

    ## Self-review before reporting

    - Did you satisfy every EARS requirement in the brief? Is anything missed?
    - Are you building things nobody asked for (YAGNI)?
    - Do the tests verify real behaviour (not the behaviour of mocks)? Is the output free of noise?
    - Do the names accurately say what they do?

    Fix anything you find before reporting.

    ## When you receive review findings

    After fixing, re-run the tests covering what you changed and append the results to the report file.
    The reviewer does not re-run tests. Your report is the evidence for the tests.

    ## Report format

    Write a detailed report to [REPORT_FILE]:
    - What you implemented (or what you attempted, if BLOCKED)
    - What you tested and the results
    - Files changed
    - What your self-review found
    - Concerns

    Keep the final message to 15 lines or fewer, containing only:
    - **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
      (always write one of these four words exactly. Paraphrases such as COMPLETED are forbidden)
    - The commits you made (short SHA + subject)
    - One line of test results (e.g. "14/14 passing, output pristine")
    - Concerns (if any)
    - The path to the report file

    For BLOCKED/NEEDS_CONTEXT, put the specifics in the final message itself.
    Do not quietly hand over a deliverable you aren't confident in.
```

**Placeholders:**
- `[BRIEF_FILE]` - required. The path to the task brief the controller wrote in the scratchpad
- `[REPORT_FILE]` - required. Name it to pair with the brief (`task-N-M-brief.md` -> `task-N-M-report.md`)
- `[DIRECTORY]` - the absolute path of the target project
