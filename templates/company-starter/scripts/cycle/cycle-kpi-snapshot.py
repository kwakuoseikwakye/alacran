#!/usr/bin/env python3
"""cycle-kpi-snapshot.py — Render kpi.json from a team's cycle.jsonl.

Reads a canonical-schema cycle.jsonl (see
docs/templates/cycle-execution-log-schema.yaml) and produces `kpi.json` in
the same directory with the two common KPIs plus supporting counts:

  common_kpis
    cycle_completion_rate   = count(cycle_completed) / count(cycle_started)
    hitl_intervention_rate  = count(hitl_gate_fired) / count(task_executed)

  event_counts              — per-event-type tally (dashboard support)
  cycle_status              — status field of the (last) cycle_completed event
  hitl_escalation_count     — error_occurred events with recovery_action=escalate

Team-specific KPIs (e.g. conversion_rate, first_response_hours) are declared
in definitions/kpi/<team>-kpi.yaml but are NOT computable from cycle.jsonl
alone — they need external data sources (order exports, inquiry logs). They
are reported here as not-computable with an explicit reason rather than
fabricated.

Usage:
  cycle-kpi-snapshot.py --cycle-dir <dir> [--out <path>]
  cycle-kpi-snapshot.py --help
"""

import argparse
import json
import sys
from pathlib import Path

# Canonical 6-event enum (cycle-execution-log-schema.yaml event_types).
EVENT_TYPES = [
    "cycle_started", "task_executed", "hitl_gate_fired",
    "hitl_responded", "error_occurred", "cycle_completed",
]


def load_events(cycle_file: Path):
    events = []
    if not cycle_file.exists():
        return events
    with cycle_file.open(encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError as exc:
                print(f"warning: {cycle_file}:{lineno}: skipping malformed line ({exc})", file=sys.stderr)
    return events


def by_type(events, event_type):
    return [e for e in events if e.get("event_type") == event_type]


def safe_div(numerator, denominator):
    if not denominator:
        return None
    return numerator / denominator


def compute_common_kpis(events):
    started = len(by_type(events, "cycle_started"))
    completed = len(by_type(events, "cycle_completed"))
    task_executed = len(by_type(events, "task_executed"))
    hitl_fired = len(by_type(events, "hitl_gate_fired"))

    return {
        "cycle_completion_rate": {
            "rate": safe_div(completed, started),
            "completed": completed,
            "total": started,
            "formula": "count(cycle_completed) / count(cycle_started)",
        },
        "hitl_intervention_rate": {
            "rate": safe_div(hitl_fired, task_executed),
            "invoked": hitl_fired,
            "total": task_executed,
            "formula": "count(hitl_gate_fired) / count(task_executed)",
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cycle-dir", required=True, help="Directory containing cycle.jsonl")
    parser.add_argument("--out", default=None, help="Output path for kpi.json (default: <cycle-dir>/kpi.json)")
    args = parser.parse_args()

    cycle_dir = Path(args.cycle_dir)
    cycle_file = cycle_dir / "cycle.jsonl"
    out_path = Path(args.out) if args.out else cycle_dir / "kpi.json"

    events = load_events(cycle_file)
    if not events:
        print(f"warning: no events found in {cycle_file}", file=sys.stderr)

    cycle_id = None
    team_id = None
    for e in events:
        cycle_id = cycle_id or e.get("cycle_id")
        team_id = team_id or e.get("team_id")

    completed = by_type(events, "cycle_completed")
    cycle_status = completed[-1].get("status") if completed else None
    hitl_escalation_count = len(
        [e for e in by_type(events, "error_occurred") if e.get("recovery_action") == "escalate"]
    )

    snapshot = {
        "schema": "cycle-kpi-snapshot-v1",
        "team_id": team_id,
        "cycle_id": cycle_id,
        "event_count": len(events),
        "event_counts": {t: len(by_type(events, t)) for t in EVENT_TYPES},
        "common_kpis": compute_common_kpis(events),
        "cycle_status": cycle_status,
        "hitl_escalation_count": hitl_escalation_count,
        "team_specific_kpis": {
            "computable": False,
            "reason": (
                "team-specific KPIs (definitions/kpi/<team>-kpi.yaml) require external "
                "data sources (order exports, inquiry logs) not present in cycle.jsonl; "
                "compute them during the weekly digest from their own data_source."
            ),
        },
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
