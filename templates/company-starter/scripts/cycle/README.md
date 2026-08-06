# scripts/cycle/ — business cycle operation scripts (advanced)

> **Outside the core scope.** The core 5-Phase workflow (Phase 1–5) runs to completion using
> nothing but plain Claude Code + `scripts/verify.py`. This is an advanced tool group for teams
> that run daily/weekly business cycles, used **once you've adopted this at your own company**.

## What each script does

| Script | Role | SSOT it assumes |
|-----------|------|----------------|
| `cycle-event.sh` | Appends a cycle event to `state/cycles/<team-id>/cycle.jsonl` | `definitions/cycles/<team>-cycle-plan.yaml` |
| `cycle-verify.py` | Checks for missing required cycle events or schema mismatches | same |
| `cycle-kpi-snapshot.py` | Aggregates `cycle.jsonl` into `kpi.json` (the 2 common KPIs: cycle_completion_rate, etc.) | same + `definitions/kpi/<team>-kpi.yaml` |
| `retro-render.py` | Fills KPIs into `docs/templates/retro-weekly.md` to generate the retro md | same |
| `session-handoff.py` | Auto-updates the relevant section of `HANDOFF.md` at a cycle boundary | `HANDOFF.md`'s heading convention |

## Relation to the core workflow

CLAUDE.md §1's 5-Phase lightweight workflow (Define -> Plan -> Execute -> Verify -> Record) is
designed to complete one full cycle without ever calling the Python scripts in this directory.

This directory becomes useful once any of the following applies to you:

- You've started running business cycles for multiple teams daily or weekly (and now want
  automated KPI aggregation)
- `HANDOFF.md` updates have become frequent enough that you want to mechanize them
- You've started tracking the 2 common KPIs — cycle completion rate, HITL intervention rate

## Where to start

- Overall design: `docs/concepts/context-funnel.md` (the context-funnel design)
- Schema: `docs/templates/cycle-execution-log-schema.yaml`
- Output locations: `state/cycles/<team-id>/cycle.jsonl` and `docs/retros/<team-id>/`

## You don't need to edit this to get started

The scripts in this directory belong to "post-adoption operations," so you don't need to read
or modify them while you're still getting oriented. If you're curious, start with
`retro-render.py` — reading it in order shows how it connects to the `retro-weekly.md` template.

---

*company-starter — scripts/cycle/ (advanced tools, outside the day-to-day scope)*
