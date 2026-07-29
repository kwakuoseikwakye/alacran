# definitions/cycles/ — business cycle plans

Where a team/department declares the cadence of its business cycle (weekly, monthly, daily) and
the activities and approval gates of each phase. KPIs (`kpi/`) and retrospectives (`retro/`) both
run against this cycle.

## How to generate it

Copy `docs/templates/cycle-plan-template.yaml` into this directory and fill it in as
`<team>-cycle-plan.yaml` (e.g. `ec-team-cycle-plan.yaml`).

- Choose `cycle_unit` from `monthly` / `weekly` / `daily` (monthly if month-end closing is the
  essence of the work, weekly if order velocity is fast).
- 3–4 `cycle_phases` is recommended. Give each phase a `day_range` / `activities` / `hitl_gates`.
- Add team-specific metrics on top of the 2 common KPIs.
- Fill in every `<<TODO_*>>`, and make the team explicit via `team_id`.

## Conventions when filling it in

- Make the cycle's anchors (a weekend sale, month-start closing, etc.) explicit in
  `cycle_calendar`.
- Keep approval gates (`hitl_gates`) consistent with the triggers in `definitions/hitl/`.

Filled-in example: `examples/harukaze-ec/definitions/cycles/ec-team-cycle-plan.yaml`
