# Asynchronous HITL approval — overcoming the single-approver problem

> The approval gate (HITL Gate) is a safety mechanism, but built naively it becomes a single
> point of failure (SPOF): "there's only one approver, and if they're unavailable the whole
> company stops." Asynchronous approval and degradation rules mitigate this.

For the overall philosophy, see `.claude/rules/hitl-gate.md`; for the approver mapping, see
`definitions/hitl/approver-registry.yaml`.

---

## 1. The approval SPOF problem

At a small company, there's often effectively only one approver (the owner). A naively built
approval gate then means:

- The owner is unavailable for 24 hours -> every task awaiting approval stops -> **the
  entire cycle grinds to a halt**
- Lining up role titles (CEO / CFO...) doesn't help if they all resolve to the same actual
  person — that's just "pretending a different person approves it" (a fiction)

**The starting point is to stop pretending.** If there's only one approver, honestly map
every role to that same person in `approver-registry.yaml`, and write the deputy as
`vacant`. Not hiding the fact is the first step of the mitigation.

---

## 2. Degradation rules (sole-owner mode)

When the approver and the deputy resolve to the same person (i.e. effectively just one),
behavior is switched per severity.

| severity | Behavior on timeout | Auto-approval |
|----------|--------------|---------|
| `critical` | Hold only the item in question (`hold_item_only`) | **Forbidden** |
| `high` | Hold only the item in question | **Forbidden** |
| `medium` | Auto-approve while logging it (`auto_approve_with_log`) | Allowed |

There are 2 key points:

- **Never auto-approve `critical` / `high`, ever.** Skipping approval on an irreversible,
  high-risk item for the sake of speed is forbidden, because the risk is asymmetric (the
  cost of failure is too large).
- **Shrink the scope of the stoppage down to "the item in question only".** Holding one item
  awaiting approval doesn't stop the whole cycle for other tasks that don't need approval
  (`item_isolation.suspend_whole_cycle: false`). This shrinks "no human = company stops"
  down to "no human = that one item stalls".

---

## 3. Asynchronous approval via GitHub labels

Instead of treating approval as "a synchronous process you wait on right there," treat it as
"an asynchronous process followed up on via a label."

```
1. A gate fires -> file a pending-approval Issue, and label it hitl:<trigger>
2. The AI / person in charge holds that one item and moves on to other tasks
3. The approver checks labeled Issues whenever they have time, and comments approve/reject
4. Once approved, the held item proceeds
```

This way, other work doesn't stop just because the approver is on other tasks. In the
trigger yaml, specify `notify: github_label` and write the label name in `notify_label`. Use
`notify: manual` (confirm immediately via chat/verbally) only for situations where urgency or
being face-to-face is natural.

> This template doesn't bring in an external approval SaaS — asynchronous approval is
> achieved with nothing but GitHub Issues + labels and manual confirmation (staying within
> plain Claude Code + GitHub).

---

## 4. Related

- `definitions/hitl/approver-registry.yaml` — the role→approver mapping + degradation rules
- `definitions/hitl/triggers/_schema.md` — trigger notation (notify / on_timeout)
- `.claude/rules/hitl-gate.md` — the HITL Gate's 5 categories and basic procedure
