# HITL trigger notation guide (the starter's native schema)

How to write 1 trigger = 1 file, placed under `definitions/hitl/triggers/*.yaml`.
For the overall philosophy, see `.claude/rules/hitl-gate.md` (the 5 categories: money, contracts,
irreversible operations, publication, credentials); for the degradation rule for when there's
only one approver, see `definitions/hitl/approver-registry.yaml`.

This guide itself (`_schema.md`) is out of scope for verification/fill-in. Put real triggers at
the same level as `<slug>.yaml` (e.g. `large-deal.yaml`). A filled-in example lives at
`examples/harukaze-ec/definitions/hitl/triggers/`.

> **Division of roles between the md table and the yaml**: the table in
> `.claude/rules/hitl-gate.md` §2 is the **category list** of judgement principles (the
> conceptual overview), while this `triggers/*.yaml` is the **operational SSOT** of individual
> triggers (what machine verification checks). When adding or changing a trigger, **the yaml is
> authoritative** — `scripts/verify.py`'s HITL-02 also verifies the yaml side. It's enough to
> update the md table as needed as a representative example — there's no need to keep it 1:1
> with the yaml (see `definitions/hitl/README.md` for details).

---

## 1. Required keys

| Key | Type | Description |
|------|----|----|
| `id` | string | The trigger identifier (`lowercase + hyphens`. Match the filename. e.g. `large-deal`) |
| `name` | string | A human-readable name (e.g. Large-deal gate) |
| `severity` | enum | One of `critical` / `high` / `medium` (see §3) |
| `fire_when` | list | The fire condition(s). Each element is a "natural-language description" + an optional "condition expression" (§2) |
| `approver_role` | string | The approver's role name (corresponds to a role in `approver-registry.yaml`. Don't write a real name) |
| `notify` | enum | The notification method for the approval request. Only 2 choices: `github_label` or `manual` (§4) |
| `on_timeout` | string | The behavior when approval doesn't arrive in time (§5) |

> `scripts/verify.py`'s HITL-02 verifies, for filled-in triggers, that these 7 keys exist, and
> further cross-checks that `approver_role` is defined in `approver-registry.yaml`'s
> `role_assignments`. An unfilled template that still contains `<<TODO>>` is INFO (verification
> deferred). Filling it in promotes it to a PASS/FAIL verdict.

## 2. Optional keys

| Key | Type | Description |
|------|----|----|
| `description` | string | An explanation of what this gate protects |
| `notify_label` | string | The label name to attach when `notify: github_label` (e.g. `hitl:large-deal`) |
| `examples` | list | Concrete examples of when this fires (human-readable) |
| `auto_proceed` | bool | Whether conditional auto-approval is allowed. **Defaults to false**. Always false for `critical`/`high` (§3) |

## 3. severity and the principles of auto-approval

| severity | When to use | Auto-approval |
|----------|-----------|---------|
| `critical` | Company-survival level (outages, customer impact, data loss, security) | **Forbidden** (human approval always required) |
| `high` | Financial / contractual / SSOT-structure changes (large purchase orders, new contracts, new entity types) | **Forbidden** |
| `medium` | Low-risk, where speed matters (routine CS responses, minor additions to existing items) | Allowed conditionally (`auto_proceed: true` + an explicit condition) |

> Never set `auto_proceed: true` on `critical` / `high`. Skipping approval for speed is limited
> to `medium` only (consistent with the degradation rules in `approver-registry.yaml`).

## 4. notify (only 2 choices for the notification method)

| Value | Meaning | Usage |
|----|------|-------|
| `github_label` | Labels the pending Issue to prompt asynchronous approval | Doesn't block other tasks even while the approver is on other work (`docs/concepts/hitl-async-approval.md`) |
| `manual` | Confirm immediately with the person in charge via chat/verbally | For urgent situations or where face-to-face is natural |

No external approval SaaS or email-card backends are brought in (stays within what runs on plain
Claude Code + GitHub alone).

## 5. on_timeout (behavior on timeout)

Write this in line with the severity-based degradation rules in `approver-registry.yaml`.
Representative values:

| Value | Meaning | Usable severities |
|----|------|----------------|
| `re_notify` | Re-notify via another channel (doesn't auto-proceed) | All |
| `hold_item_only` | Hold only the item in question; other tasks continue | All (recommended) |
| `escalate` | Pass it up to a senior/deputy approver | All |
| `auto_approve_with_log` | Auto-approve while logging it | **`medium` only** |

> Never write `auto_approve_with_log` on `critical` / `high` (same reason as §3).

---

## 6. The minimal shape (skeleton)

```yaml
version: 1
id: <slug>                      # match the filename
name: <human-readable name>
severity: high                  # critical | high | medium
description: |
  What this gate protects.

fire_when:
  - when: "<a natural-language description>"
    condition: "<an optional condition expression (e.g. order.amount_band in [30k_100k, over_100k])>"

approver_role: <role name>          # corresponds to approver-registry.yaml
notify: github_label            # github_label | manual
notify_label: "hitl:<slug>"     # when notify: github_label
on_timeout: hold_item_only

auto_proceed: false             # always false for critical/high
examples:
  - "<a concrete example of when this fires 1>"
```

---

*company-starter — HITL trigger notation guide*
