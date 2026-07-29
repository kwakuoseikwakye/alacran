---
date: 2026-07-03
type: template-package-readme
---

# Generic template distribution package

> A set of templates for rolling out ontology-driven autonomous operation (SSOT YAML/Markdown +
> HITL Gate + business cycles) to **any company**. Runs on plain Claude Code + GitHub alone.

---

## 1. What this template lets you do

Designed to be operating-model neutral, it applies to any delivery shape:

- **Dedicated** (contracted / advisory / embedded — going deep with each customer)
- **Product** (delivering a product to many, with a light touch)
- **Hybrid** (start dedicated, then productize to scale)

Regardless of industry or operating model, you can stand up SSOT-driven autonomous operation
at minimal cost. See `docs/templates/path-selector.md` for how to choose an operating model.

---

## 2. Bundled files

| File | Purpose | Needs editing? |
|---|---|---|
| `README-template.md` | This file (guide only) | No |
| `onboarding-checklist.md` | The new-company setup procedure | No (a runbook) |
| `path-selector.md` | The operating-model selection guide | No (reference only) |
| `AGENTS-template.md` | Agent system design guidelines (principles + 6-way role taxonomy + skeleton) | No (reference only) |
| `ontology-starter.yaml` | A minimal ontology (customer + org + product) | **Yes** (reflects your own company's data) |
| `ontology-schema-reference.md` | The entity / event / relation notation guide | No (reference only) |
| `kpi-measurement-template.yaml` | A template for per-team KPI measurement specifications | Optional (if you run KPIs) |
| `cycle-plan-template.yaml` | A template for business cycle plans | Optional |
| `retrospective-template.yaml` | A template for retrospectives (KPT + pivot decisions) | Optional |
| `common-kpi-pattern.yaml` / `common-retro-pattern.yaml` | An explanation of the common skeleton for KPIs/retrospectives | No (reference only) |
| `cycle-execution-log-schema.yaml` | The schema for the cycle log (cycle.jsonl) | No (reference only) |

HITL trigger templates live in `definitions/hitl/triggers/` (`_schema.md` + `*.yaml`).

---

## 3. Recommended setup order

```
Step 1. Read path-selector.md -> decide your operating model
Step 2. Follow onboarding-checklist.md
Step 3. Build definitions/ontology/company.yaml with /define-company
Step 4. Fill in the definitions/ shelves that fit your chosen model
Step 5. Verify with python3 scripts/verify.py
Step 6. Append the onboarding history to HANDOFF.md (/handoff)
```

See `onboarding-checklist.md` for details.

---

## 4. This template's design principles

| Principle | Description |
|---|---|
| **Enforces the Pull Model** | The template doesn't push. An agent Reads CLAUDE.md / the ontology itself, when it needs to |
| **Operating-model neutral** | Stays abstract enough to apply to dedicated / product / hybrid alike |
| **Start minimal** | Ships only a minimal 3-domain ontology (customer/org/product). Add the rest when you need it |
| **Industry-agnostic** | Industry-specific entities (e.g. an EC company's sku) aren't included in the template. Each company adds its own |

---

## 5. Before and after filling it in

- **Before filling in (right after distribution)**: `definitions/` is an empty skeleton with
  READMEs. The templates live in `docs/templates/`.
- **After filling in**: each subdirectory under `definitions/` (ontology / kpi / cycles / retro
  / hitl / clients) is filled with your own company's real data.
- **A worked example of the finished shape**: `examples/harukaze-ec/` (a fictional EC
  company's complete, filled-in set. Read-only).

See `docs/directory-map.md` for a before/after comparison of the folder layout.

---

## 6. Who this is distributed to

| Audience | Delivery form |
|---|---|
| Another in-house department | Create a new private repo from this template via "Use this template" |
| An external engagement | Extract just the template parts and bundle them with the deliverable |

---

## 7. Related documents

- `CLAUDE.md` — this template's operating constitution (the 5-phase workflow + 6 principles +
  context map)
- `docs/starter-manual.md` — a beginner's guide starting from a 15-minute setup
- `.claude/rules/scope-contract.md` / `issue-first.md` / `hitl-gate.md` — the 3 major disciplines

---

*Template Distribution Package*
