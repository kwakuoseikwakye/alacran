#!/usr/bin/env python3
"""session-handoff.py — Append a cross-session digest entry for a team's cycle.

Reads cycle.jsonl (+ optional kpi.json) and writes one JSON line to
state/handoff/<team-id>/{YYYY-Www}.jsonl (append) plus latest.jsonl (the
single most-recent entry), so a future session can pick up where this one
left off.

Canonical schema: docs/templates/cycle-execution-log-schema.yaml

Usage:
  session-handoff.py --cycle-dir <dir> --team-id <id> [--handoff-dir <dir>]
                     [--session-id <id>] [--handoff-note '<text>']
  session-handoff.py --help
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_HANDOFF_DIR_TEMPLATE = "state/handoff/{team_id}"


def load_events(cycle_file: Path):
    events = []
    if not cycle_file.exists():
        return events
    for line in cycle_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


def load_json(path: Path):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def by_type(events, event_type):
    return [e for e in events if e.get("event_type") == event_type]


def week_label(cycle_id):
    base = None
    if cycle_id:
        try:
            base = datetime.strptime(cycle_id, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            base = None
    if base is None:
        base = datetime.now(timezone.utc)
    iso_year, iso_week, _ = base.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def build_digest(events, kpi_json, team_id, cycle_id, session_id, handoff_note):
    cycle_started = next(iter(by_type(events, "cycle_started")), {})
    task_executed = by_type(events, "task_executed")
    hitl_fired = by_type(events, "hitl_gate_fired")
    error_occurred = by_type(events, "error_occurred")
    cycle_completed = next(iter(by_type(events, "cycle_completed")), {})

    tasks_completed = [
        e.get("task_label", "?")
        for e in task_executed if e.get("outcome") in (None, "success", "done", "ok")
    ]
    tasks_other = [
        f"{e.get('task_label', '?')} ({e.get('outcome')})"
        for e in task_executed if e.get("outcome") not in (None, "success", "done", "ok")
    ]

    hitl_gates = [
        {"trigger_id": e.get("trigger_id"), "approver_role": e.get("approver_role"), "reason": e.get("reason")}
        for e in hitl_fired
    ]

    escalations = [
        {"error_class": e.get("error_class"), "severity": e.get("severity"), "recovery_action": e.get("recovery_action")}
        for e in error_occurred if e.get("recovery_action") == "escalate"
    ]

    common = kpi_json.get("common_kpis", {})
    kpi_snapshot = {
        "cycle_completion_rate": (common.get("cycle_completion_rate") or {}).get("rate"),
        "hitl_intervention_rate": (common.get("hitl_intervention_rate") or {}).get("rate"),
        "hitl_escalation_count": kpi_json.get("hitl_escalation_count", len(escalations)),
    }

    return {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "session_id": session_id,
        "team_id": team_id,
        "cycle_id": cycle_id,
        "cycle_unit": cycle_started.get("cycle_unit"),
        "cycle_status": cycle_completed.get("status"),
        "tasks_completed": tasks_completed,
        "tasks_other": tasks_other,
        "hitl_gates": hitl_gates,
        "escalations": escalations,
        "kpi_snapshot": kpi_snapshot,
        "next_session_handoff": handoff_note,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cycle-dir", required=True, help="Directory containing cycle.jsonl (+ optional kpi.json)")
    parser.add_argument("--team-id", required=True, help="Team identifier (for the output path + digest)")
    parser.add_argument("--kpi-json", default=None, help="Path to kpi.json (default: <cycle-dir>/kpi.json)")
    parser.add_argument("--handoff-dir", default=None, help="Output dir (default: state/handoff/<team-id>/)")
    parser.add_argument("--session-id", default=None, help="Session ID (default: $CLAUDE_SESSION_ID or 'unknown-session')")
    parser.add_argument("--handoff-note", default="", help="1-sentence next_session_handoff text")
    args = parser.parse_args()

    cycle_dir = Path(args.cycle_dir)
    cycle_file = cycle_dir / "cycle.jsonl"
    kpi_path = Path(args.kpi_json) if args.kpi_json else cycle_dir / "kpi.json"

    events = load_events(cycle_file)
    kpi_json = load_json(kpi_path)

    cycle_id = kpi_json.get("cycle_id") or next(
        (e.get("cycle_id") for e in events if e.get("event_type") == "cycle_started"), None
    )

    session_id = args.session_id or os.environ.get("CLAUDE_SESSION_ID", "unknown-session")
    digest = build_digest(events, kpi_json, args.team_id, cycle_id, session_id, args.handoff_note)

    handoff_dir = Path(args.handoff_dir) if args.handoff_dir else Path(
        DEFAULT_HANDOFF_DIR_TEMPLATE.format(team_id=args.team_id)
    )
    handoff_dir.mkdir(parents=True, exist_ok=True)

    weekly_file = handoff_dir / f"{week_label(cycle_id)}.jsonl"
    latest_file = handoff_dir / "latest.jsonl"

    line = json.dumps(digest, ensure_ascii=False)
    with weekly_file.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")
    latest_file.write_text(line + "\n", encoding="utf-8")

    print(f"appended digest to {weekly_file}")
    print(f"updated {latest_file}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
