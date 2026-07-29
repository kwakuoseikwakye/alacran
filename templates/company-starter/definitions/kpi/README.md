# definitions/kpi/ — KPI measurement specifications

Where each team/department declares "what to measure, how, and at what threshold to warn."
Not tied to any specific concept — any team's KPIs can be described here.

## How to generate it

Copy `docs/templates/kpi-measurement-template.yaml` into this directory and fill it in as
`<team>-kpi.yaml` (e.g. `ec-team-kpi.yaml`).

- Replace every `<<TODO_*>>` placeholder with your own real values.
- The 2 common KPIs (`cycle_completion_rate` / `hitl_intervention_rate`) are mandatory.
- Add 2 or more team-specific KPIs (e.g. conversion rate, repeat rate, inventory turnover,
  inquiry response time).
- For the notification method, specify whatever your company can actually operate — `github_label`
  / `manual` etc.

## Conventions when filling it in

- Make clear which team's KPIs these are via `team_id` (a placeholder generalized from the
  template in `docs/templates/`).
- Put in real recorded values, not invented ones (see examples/ if you want a worked example).

Filled-in example: `examples/harukaze-ec/definitions/kpi/ec-team-kpi.yaml`
