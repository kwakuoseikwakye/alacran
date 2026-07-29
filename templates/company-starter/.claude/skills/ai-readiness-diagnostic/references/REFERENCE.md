# AI Readiness Diagnostic Skill — reference guide

## Using the scripts

### Demo run (sample data)
```bash
python3 scripts/generate_report.py --demo --output diagnostic-report.xlsx
```

### Run with real data
```bash
python3 scripts/generate_report.py --input tasks.json --output diagnostic-report.xlsx
```

---

## Input JSON schema

```json
{
  "business_name": "the business area (e.g. Monthly close)",
  "company": "company name",
  "interviewer_notes": "interview notes (free text)",
  "tasks": [
    {
      "id": "T01",                          // task ID (T01-T99 recommended)
      "name": "task name",
      "description": "detailed description of the task",
      "input": "the data coming into this task",
      "output": "what this task produces",
      "owner": "the person or department responsible",
      "duration_hours": 4,                  // effort per occurrence (hours)
      "frequency": "Monthly",               // how often (Daily/Weekly/Monthly/Quarterly/Yearly)
      "is_confidential": false,             // does it involve confidential information?
      "requires_human_approval": false,     // does it need a human's final approval?
      "ai_fit": "High",                     // AI fit: High/Medium/Low
      "ai_fit_reason": "explanation of the reasoning",
      "ai_role": "the concrete role AI can take on",
      "dependencies": ["T00"]               // list of predecessor task IDs (empty array if none)
    }
  ]
}
```

---

## Criteria for AI fit (following the LARA matrix)

| Fit | Conditions | Examples |
|:---:|:---|:---|
| **High** | Digital data input, repetitive and rule-based, easy for a human to verify | Data transcription, sorting email, text scanning |
| **Medium** | Partly unstructured data, needs some cognitive judgement, AI drafts and a human checks | Journal entries, variance commentary, report writing |
| **Low** | Highly confidential, involves the final decision, strong legal or compliance constraints | Audit response, hiring decisions, signing contracts |

---

## Structure of the output Excel

| Sheet name | Content |
|:---|:---|
| Summary | Business area and company details, the AI-fit tally, expected effort savings |
| Task list | Full detail for every task (dependencies, DAG metrics, AI fit) |
| Dependency DAG | Visualisation of the task dependencies (colour-mapped by AI fit) |
| Adoption roadmap | The AI adoption plan by phase (priorities and things to watch) |

---

## The DAG metrics explained

| Column | Meaning |
|:---|:---|
| Order | Topological sort order (1 is first) |
| Parallel group | Tasks sharing a group number can run in parallel |
| Critical | Tasks marked * are on the critical path, so a delay there affects everything |
| Earliest start (h) | The earliest a task can start once its predecessors are done (cumulative effort) |
