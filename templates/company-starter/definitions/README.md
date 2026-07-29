# definitions/ — the SSOT of your company context

This tree is the **Single Source of Truth** where your company's declarative definitions live
(ontology, approval triggers, KPIs, cycles, retrospectives, and optionally client information).
It is always where the **source data** collects — never a generated artefact (a report, a slide
deck, an agent instruction).

Templates live in `docs/templates/`. Copy the template each subdirectory's README points to and
fill it in. Filled-in complete examples live in `examples/harukaze-ec/` (read-only — don't touch).

## Fill-in order (fill top to bottom and you won't get lost)

| Order | Subdirectory | What goes there | Template it's based on |
|----|-----------------|-----------|-------------|
| 1 | `ontology/` | Definition of the business structure (customer / org / product) | `docs/templates/ontology-starter.yaml` |
| 2 | `hitl/` | Trigger definitions for operations needing human approval | `hitl/triggers/_schema.md` + `triggers/*.yaml` (templates) |
| 3 | `kpi/` | KPI measurement specifications per team/department | `docs/templates/kpi-measurement-template.yaml` |
| 4 | `cycles/` | Business cycle (weekly/monthly) plans | `docs/templates/cycle-plan-template.yaml` |
| 5 | `retro/` | The shape of retrospectives (KPT + pivot decisions) | `docs/templates/retrospective-template.yaml` |
| — | `clients/` | Non-confidential structural information about clients (**optional**) | see each sub-README |

`clients/` may stay empty for a self-contained company.

## The boundary with secrets (important)

`definitions/` is committed to git. Only **non-confidential structural information** belongs
here. Don't write real names, real contract amounts, credentials, or personal information —
put those in `secrets/` (gitignored) instead. If you're unsure, re-read the PII-handling
section of `.claude/rules/definitions-touch.md`.
