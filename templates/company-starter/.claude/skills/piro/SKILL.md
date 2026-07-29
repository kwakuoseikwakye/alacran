---
name: piro
description: A skill that generates a full Kiro-compatible spec set (requirements.md in EARS format / design.md / tasks.md / .config.kiro) and places it in the target project's .kiro/specs/. Triggered by things like "make a Kiro spec", "write the requirements in Kiro format", "a spec for X with piro", or "in a form I can hand to Kiro". The requirements document goes through an HTML review page for human approval before the design and tasks are generated.
---

# piro - Kiro-compatible spec generation

Kiro's little brother, one letter away. From a description of a feature, it generates a spec set that Kiro's Specs
panel recognises as-is. Kiro tends to generate specs in English even when instructed in Japanese, so piro's job is to
produce the requirements definition externally and hand it over.

## Output (destination: `<project>/.kiro/specs/<slug>/`)

| File | Content | Convention |
|---|---|---|
| requirements.md | Requirements document (EARS format) | [reference/requirements-template.md](reference/requirements-template.md) |
| requirements.html | Page for human review (Kiro doesn't read it) | [reference/review-page.md](reference/review-page.md) |
| design.md | Design document (Kiro's official 6 headings) | [reference/design-template.md](reference/design-template.md) |
| tasks.md | Implementation plan (checkboxes + requirement references) | [reference/tasks-template.md](reference/tasks-template.md) |
| .config.kiro | Kiro's spec metadata (single-line JSON) | Step 9 of the flow below |

## Input

- Required: a description of the feature (a single line, or detailed material)
- Optional: the path of the target project (defaults to the current project)
- Optional: language (the default is body text in the project's language + EARS keywords in English. If asked for "all in English", use English)

Don't ask about unknowns — fill them with reasonable assumptions. Present at most 5 of the assumptions you made in the stage-1 report.

## Flow

### Stage 1: Requirements + HTML review

1. Read the target project's CLAUDE.md, README and related code, and take in the context
2. Decide the slug (the feature name in English kebab-case). If `.kiro/specs/<slug>/` already exists,
   confirm with the user that it's OK to overwrite before proceeding
3. Read [reference/ears.md](reference/ears.md) and
   [reference/requirements-template.md](reference/requirements-template.md), and
   generate `.kiro/specs/<slug>/requirements.md`
4. Following [reference/review-page.md](reference/review-page.md), generate
   `.kiro/specs/<slug>/requirements.html` and display it in the browser with `open`
5. Report in the chat and wait for approval. Report only "where the review page is" and "the assumptions you filled in (at most 5)"
6. Reflect any correction into requirements.md and regenerate the HTML (the md is always the source of truth)

### Stage 2: Design + Tasks + metadata (after approval, all in one go, no questions)

7. Read [reference/design-template.md](reference/design-template.md) and generate design.md
8. Read [reference/tasks-template.md](reference/tasks-template.md) and generate tasks.md
9. Generate `.config.kiro` (a single line, no newline):

   ```bash
   printf '{"specId": "%s", "workflowType": "requirements-first", "specType": "feature"}' \
     "$(uuidgen | tr 'A-Z' 'a-z')" > .config.kiro
   ```

10. Run the self-check (below) and report completion (where you put it + how to open it in Kiro)

## Self-check (always run at the end of stage 2)

Machine check:

```bash
python3 <this skill's directory>/scripts/validate.py <spec directory>
```

Confirm all checks pass (exit 0). If any fail, fix them before reporting completion. In addition, check by eye:

- Are the mermaid blocks syntactically valid?
- Are there any hard-coded organisation names, personal names or environment-specific paths (except where they were in the input)?
- Is requirements.html in sync with the latest requirements.md?

## Never do this

- **Do not generate tasks.meta.json.** A known cause of breakage in Kiro's task execution (waves).
  Kiro generates it automatically the first time you "Run Task"
- Do not add fields other than specId / workflowType / specType to `.config.kiro`
- Do not translate EARS keywords or structural headings out of English
- Do not overwrite an existing spec folder without confirming
- Do not conduct an interactive interview before generating (fill in the assumptions and take feedback on the HTML review)

## How to verify in Kiro (check once on first use)

1. Open the destination project in Kiro
2. The spec appears in the Specs panel (= .config.kiro was accepted)
3. requirements / design / tasks render correctly
4. You can run one task from tasks with "Run Task" (at this point Kiro auto-generates tasks.meta.json)
5. Including requirements.html doesn't adversely affect the Specs panel display

## Operating notes

- Don't instruct Kiro to do a "large-scale regeneration" of a spec inside Kiro (a known defect that overwrites whole existing files). Keep to incremental edits
- Post-execution state (`[x]` and tasks.meta.json) is managed by Kiro. When regenerating with piro, always insert an overwrite confirmation
