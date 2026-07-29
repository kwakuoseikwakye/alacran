# definitions/hitl/ — human-approval trigger definitions

Where trigger definitions live that stop the AI just short of "an irreversible step" and insert
human approval. See `.claude/rules/hitl-gate.md` for the overall philosophy (the 5 categories:
money, contracts, irreversible operations, publication, credentials). This is where that
philosophy gets translated into your own actual operations, as **declarative definitions of
individual triggers**.

## Division of roles between the md and the yaml (which one is authoritative)

The table in `.claude/rules/hitl-gate.md` §2 and this `triggers/*.yaml` **play different roles**.

| Location | Role | Character |
|------|------|-------|
| The table in `.claude/rules/hitl-gate.md` §2 | The **category list** of judgement principles (the conceptual overview a human and AI both read) | Representative examples. Not an exhaustive list |
| `definitions/hitl/triggers/*.yaml` | The **operational SSOT** of individual triggers (what machine verification checks) | This one is authoritative |

When adding or changing a trigger, **the yaml is authoritative**. `scripts/verify.py`'s HITL-02
verifies the yaml side — merely appending a row to the md table is reflected nowhere
mechanically. It's enough to update the md table as needed, as a "representative example of the
philosophy's category" (there's no need to keep it 1:1 with the yaml).

> In other words: **adding one more operation that should be stopped = adding one yaml file
> under `triggers/`.** Adding a row to the md table is left as "supplementary reading" for when
> that philosophy falls under a new category.

## Where things go

- `triggers/` — YAML for individual triggers (e.g. purchase orders over a certain amount,
  deleting production data, signing a new contract). Each trigger declares its "fire condition",
  "who to notify", and "who approves". The notification method is normally one of
  `github_label` (adds a label to an Issue to prompt approval) or `manual` (confirm verbally/via
  chat with the person in charge).

## About the trigger templates

- Notation guide: `triggers/_schema.md` (required keys, severity, notification method,
  timeout behavior)
- Trigger templates: `triggers/large-deal.yaml` / `incident.yaml` / `new-ontology-entity.yaml`
  (fill in `<<TODO>>` with your own company's values)
- Approver registry: `approver-registry.yaml` (the role→approver mapping + the degradation
  rule for when there's only one approver)

See `docs/concepts/hitl-async-approval.md` for the thinking behind an approval SPOF (a single
approver stopping everything) and asynchronous approval via GitHub labels.

## Filled-in examples

- HITL trigger: `examples/harukaze-ec/definitions/hitl/triggers/large-deal.yaml`
- Approver registry: `examples/harukaze-ec/definitions/hitl/approver-registry.yaml`
- Client-specific approval thresholds: `examples/harukaze-ec/definitions/clients/midori-hotel/engagement.yaml`
