<!--
=============================================================================
Weekly retrospective template (retro-weekly.md) — a generic per-team format
=============================================================================
This is scripts/cycle/retro-render.py's DEFAULT_TEMPLATE. The renderer reads cycle.jsonl +
kpi.json (produced by cycle-kpi-snapshot.py) and automatically fills in only the "identity
information" and "the common 2 KPIs' dashboard rows" among the {…} placeholders below.
KPT / decisions-pending / next-cycle-action are fields a human fills in during the
retrospective itself, so they are left untouched by automation (they stay as-is).

Generated to: docs/retros/<team-id>/weekly/{YYYY-Www}.md
Design reference: docs/templates/common-retro-pattern.yaml (the shape of KPT + pivot decisions)
=============================================================================
-->

# Weekly retrospective — {TEAM_ID} — {WEEK_LABEL} ({CYCLE_START} → {CYCLE_END})

> **Cycle ID**: {CYCLE_ID}
> **Facilitator**: (fill in: who runs the retrospective)
> **Generated at**: {GENERATED_AT}

---

## 1. KPI dashboard

> The 2 common KPIs are auto-aggregated from cycle.jsonl.
> Your own `definitions/kpi/<team>-kpi.yaml` is authoritative for the target values. The
> verdict here is set against generic default benchmarks (completion rate >= 95% / HITL
> intervention rate <= 35%), so cross-check against your own company's targets and adjust
> your reading accordingly.

| KPI | Description | Actual | Verdict |
|-----|------|------|------|
| cycle_completion_rate | Cycle completion rate (cycle_completed / cycle_started) | {ACTUAL_CCR} | {STATUS_CCR} |
| hitl_intervention_rate | Human-approval intervention rate (hitl_gate_fired / task_executed) | {ACTUAL_HIR} | {STATUS_HIR} |

**This cycle's threshold alerts**: {ALERT_SUMMARY}

> Team-specific KPIs (conversion rate, response time, etc.) are out of scope for automatic
> aggregation since they need an external data source. Aggregate each KPI in
> `definitions/kpi/<team>-kpi.yaml` from its own data_source and add it to the table below.

| Team-specific KPI | Target | Actual | Verdict |
|----------------|------|------|------|
| (fill in) | (fill in) | (fill in) | (fill in) |

---

## 2. KPT (Keep / Problem / Try)

### Keep (what worked this cycle and should continue)

- (fill in)

### Problem (threshold breaches, observed friction/sticking points)

- (fill in)

### Try (improvements to try next cycle: 1-3 items)

- [ ] (fill in)

---

## 3. Decisions pending

> Write out decisions held pending during the cycle (title / date raised / blocker / cycle
> expected to resolve). Once resolved, promote them to a Decision RFC in `docs/decisions/`.

| Title | Date raised | Blocker | Cycle expected to resolve |
|----------|--------|---------|------------------|
| (fill in) | (fill in) | (fill in) | (fill in) |

---

## 4. Next cycle's actions

> Build a TODO list with owner and deadline, from the Try items and the pending decisions'
> resolution deadlines.

- [ ] (fill in: owner / deadline)

---

*company-starter — weekly retrospective template (retro-weekly.md)*
