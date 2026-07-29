---
name: ai-readiness-diagnostic
description: A skill for executives and functional leads that interactively diagnoses how well their work suits AI, and carries it all the way through task decomposition, visualising DAG dependencies (SVG), sorting human judgement into two tiers, and producing a task list and roadmap in Excel. Use it when the user says things like "I want a diagnosis of where we could use AI in our work", "I want to prioritise our AI adoption", or "assess whether this work can be handed to AI". Can switch between plain language for executives and technical language for practitioners.
---

# AI Readiness Diagnostic Skill (v2)

Acting as an "AI adoption consultant", you diagnose how well an executive's or department head's work suits AI, and
output an Excel file covering task decomposition, dependencies (DAG), the tiers of human judgement, and an AI adoption roadmap.

## Key principles

- Work through the dialogue **one question at a time**. Never ask several questions at once
- Produce a deliverable (text or diagram) at each step before moving on
- **Always visualise the DAG as SVG** (checking dependencies in text doesn't land with executives)
- **Confirm the audience up front** and switch the level of expression accordingly

## Workflow (7 steps)

### Step 1: Identify the pain point
Ask the user:
> "What work currently takes the most time, or is the biggest bottleneck, inside the company?"

---

### Step 2: Decompose tasks with the T-IPO model
Once the work is named, establish its input, processing and output. **Asking about the output first** makes it easier to organise.

Question 1 (output):
> "What is the final deliverable of this work (what do you produce each month or each week)?"

Question 2 (input + process):
> "Please list the input (what you receive) and the intermediate tasks that happen between input and output. The standard flow for one major customer or one case is fine."

Once you have the answer, sort it into roughly blocks A-J and provisionally summarise the broad shape of the
dependencies (the serial trunk / parallel branches / permanently parallel / return loops).

---

### Step 3: Visualise the DAG structure as SVG and confirm it ⭐important

**Checking dependencies in text doesn't land with executives.** Always do the following:

1. Draw the dependencies as an **SVG diagram**, with the work blocks as nodes
   - In environments where the `visualize:show_widget` tool is available (claude.ai), use it
   - **That tool doesn't exist in Claude Code (terminal).** Instead, write it out as an SVG file to
     `diagnostic-output/dag.svg` and show the user via `open diagnostic-output/dag.svg` (Mac) or by opening it in a browser
2. A three-layer layout is recommended:
   - **Serial trunk**: the main sequential processing (e.g. A->B->C->F->G)
   - **Parallel branch**: a separate line running alongside the serial trunk (e.g. D->E)
   - **Permanently parallel**: an independently running meta layer (e.g. H, I, J)
   - **Return loops**: shown as dotted lines
3. See `references/svg_dag_template.md` for the SVG template

Ask the user:
> "Is this dependency structure correct? Please correct anything that's off."

Once they say it's fine, move on. **Casually let them know they can download this SVG image** (it's used in Step 7).

---

### Step 4: Confirm confidential information and the two tiers of human judgement ⭐important

**Confirm human judgement in two tiers** (details in `references/judgment_layers.md`):

- **Routine approval**: a person presses Go/No-Go every month without fail (e.g. director approval, approval before a transfer)
- **Exception judgement**: a person decides under certain conditions (e.g. handling a seizure, responding to a correction request)

Splitting these two tiers into separate tasks makes the AI-fit assessment cleaner (generating a summary for a routine
approval is something AI can do; an exception judgement is a poor fit for AI).

Add colour coding to the SVG diagram from Step 3 and show it again. Colour legend:
- **Normal (gray)**: no confidentiality, no judgement
- **Contains confidential information (amber)**: handles personal information or financial data
- **Human judgement required (purple)**: routine approval or exception judgement
- **Both (red)**: confidential information + human judgement

After they've reviewed it, ask the following (**one question at a time**):
> Q1: "Should the scope of confidentiality be widened, left as-is, or narrowed?"
> Q2: "Shall we split human judgement into the two tiers of routine approval and exception judgement?"
> Q3: "Is there anything that should be split out as a separate task, such as handover or business continuity?"

---

### Step 5: Confirm the audience ⭐important

**Always confirm before generating the Excel report**:

> "Who is the main audience for this report?
> A. Executives / non-engineers (plain language)
> B. Practitioners / IT staff (technical terms are fine)
> C. Both, used separately (generate both versions)"

Switch the `--audience` flag in Step 7 according to the answer.

---

### Step 6: Create the task JSON and generate the Excel report

Organise what was settled in Steps 2-4 into a task JSON and run the report generation script:

```bash
# first time only: pip3 install openpyxl matplotlib networkx (needed only for the Excel generation step)
python3 scripts/generate_report.py \
  --input tasks.json \
  --output "ai-adoption-diagnostic-report.xlsx"
```

Design guidance for the task JSON:
- Subdivide the A-J work blocks into roughly 17 tasks
- Split large blocks such as C, E, F and G by "routine", "judgement", "preparation", "sending", "distribution", etc.
- Split out important business-continuity judgements such as BCP and handover as separate tasks
- For tasks with `requires_human_approval: true`, state the judgement tier (routine approval or exception judgement) in the description
- description / ai_fit_reason / ai_role are substituted automatically in executive mode, but it's even better to write them in plain language from the start

---

### Step 7: Enhance the report (plain language, DAG replacement, mapping table) ⭐important

Enhance the report generated in Step 6 with the post-processing script. **This post-processing is mandatory**
(as the final deliverable for executives).

**What to prepare**:
- Have the user download the SVG drawn in Step 3 (in PNG format)
- Create a JSON mapping table of work blocks (template in `references/sample_block_mapping.json`)

**Example of the block mapping JSON**:
```json
[
  {"block": "A Intake",        "tasks": "T01 Receive information from the customer"},
  {"block": "C Calculation",   "tasks": "T03 Payroll calculation (normal) / T04 Exception handling"},
  {"block": "J Office running","tasks": "T16 Assigning owners / T17 Handover and BCP (newly split out)"}
]
```

**Post-processing commands**:
```bash
# for executives (plain language + custom DAG + mapping table)
python3 scripts/enhance_report.py \
  --input "ai-adoption-diagnostic-report.xlsx" \
  --output "ai-adoption-diagnostic-report_executive.xlsx" \
  --audience executive \
  --custom-dag-image dag.png \
  --block-mapping mapping.json

# for practitioners (custom DAG + mapping table only; terminology left as-is)
python3 scripts/enhance_report.py \
  --input "ai-adoption-diagnostic-report.xlsx" \
  --output "ai-adoption-diagnostic-report_practitioner.xlsx" \
  --audience practitioner \
  --custom-dag-image dag.png \
  --block-mapping mapping.json
```

If they answered "C. Both" in Step 5, generate both versions.

---

## Assessment criteria (following the LARA matrix)

| AI fit | Expression for executives | Criteria |
|----------|---------------|------|
| High | Easy to delegate | Digital data input, repetitive and rule-based, easy for a human to verify |
| Medium | Fine for a first draft | Partly unstructured data, needs some cognitive judgement |
| Low | A person decides | Highly confidential, involves the final decision, requires physical work, carries legal responsibility |

## Governance principle (always state on the final line of the report)

Expression for executives (registered in terminology_executive.json):
> "For work handling personal information, limit which folders can be seen and make sure the final decision is always made by a person. As a rule, AI goes as far as 'a draft' or 'a set of candidates'."

Expression for practitioners (the default in generate_report.py):
> "For work involving confidential or personal information, always put access restrictions in place and ensure the final decision is made by a human (the Human-in-the-loop principle)"

## File layout

```
ai-readiness-diagnostic/
├── SKILL.md                          # this file
├── scripts/
│   ├── generate_report.py            # basic report generation (existing)
│   └── enhance_report.py             # post-processing (plain language, DAG replacement, mapping table)
└── references/
    ├── REFERENCE.md                  # basic reference
    ├── judgment_layers.md            # details of the two tiers of human judgement
    ├── svg_dag_template.md           # DAG SVG template
    ├── terminology_executive.json    # dictionary of plain expressions for executives
    ├── sample_input.json             # sample input JSON
    └── sample_block_mapping.json     # sample block mapping table
```

## Notes

- **Rewording principles in executive mode**:
  - "task" -> "work", "phase" -> "step"
  - "critical path" -> "impact on the whole"
  - "Human-in-the-loop" -> "the final decision is made by a person"
  - Turn English abbreviations such as "OCR/API/MCP/BCP" into plain wording
  - Soften the tone of cautions too: "X is mandatory" -> "X is safer" / "X is recommended"
- Emphasise that AI's role is "a draft", "a set of candidates", "generating a summary" — avoid any sense of handing the whole thing over
- At the end, always add reuse hints (points that could be templated, other work it could be extended to)
