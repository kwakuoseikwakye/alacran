#!/usr/bin/env python3
"""cycle-verify.py — Validate a team's cycle.jsonl against the canonical schema.

Canonical schema: docs/templates/cycle-execution-log-schema.yaml

Checks (each reported PASS/FAIL with the invariant ID):

  SCHEMA-01   every event's event_type is one of the canonical 6
  SCHEMA-02   every event has the 5 common fields (ts/team_id/cycle_id/
              event_type/sequence)
  INV-01      exactly one cycle_started + one cycle_completed
  INV-02      sequence is strictly monotonic increasing
  INV-03      every hitl_gate_fired has a matching hitl_responded (by
              paired_sequence) OR an error_occurred after it (orphan
              hitl_gate_fired is a FAIL otherwise)
  INV-04      team_id constant across all events (== --team-id)
  GATE-01     every hitl_gate_fired.approver_role is a role registered in
              definitions/hitl/approver-registry.yaml (role_assignments)

MINIMAL-ADAPTATION NOTE (GATE-01): the approver registry maps *roles* to
persons (role_assignments: {owner: person-001, ...}); it does not encode a
per-trigger approver matrix. So GATE-01 validates only that each fired
gate names a *registered role*. Cross-checking that a given trigger_id is
allowed to use that role would require joining definitions/hitl/triggers/
*.yaml; that fuller check is intentionally out of scope here (kept minimal)
and can be layered on later without changing this file's contract.

Exit 0 if all checks PASS, 1 otherwise (with a full PASS/FAIL report on
stdout either way).

Usage:
  cycle-verify.py --cycle-dir <dir> --team-id <id> [--approver-registry <path>]
  cycle-verify.py --help
"""

import argparse
import sys
import json
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None

VALID_EVENT_TYPES = [
    "cycle_started", "task_executed", "hitl_gate_fired",
    "hitl_responded", "error_occurred", "cycle_completed",
]
COMMON_FIELDS = ["ts", "team_id", "cycle_id", "event_type", "sequence"]
DEFAULT_APPROVER_REGISTRY = "definitions/hitl/approver-registry.yaml"


class Report:
    def __init__(self):
        self.checks = []

    def add(self, check_id, status, message):
        self.checks.append((check_id, status, message))

    def all_pass(self):
        return all(status == "PASS" for _, status, _ in self.checks)

    def render(self):
        lines = []
        for check_id, status, message in self.checks:
            lines.append(f"[{status}] {check_id}: {message}")
        passed = sum(1 for _, s, _ in self.checks if s == "PASS")
        lines.append(f"\nTotal: {len(self.checks)}  PASS: {passed}  FAIL: {len(self.checks) - passed}")
        return "\n".join(lines)


def load_events(cycle_file: Path, r: Report):
    events = []
    if not cycle_file.exists():
        r.add("LOAD-01", "FAIL", f"cycle.jsonl not found: {cycle_file}")
        return events
    with cycle_file.open(encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError as exc:
                r.add("LOAD-02", "FAIL", f"line {lineno}: malformed JSON ({exc})")
    if events:
        r.add("LOAD-01", "PASS", f"loaded {len(events)} events from {cycle_file}")
    return events


def by_type(events, event_type):
    return [e for e in events if e.get("event_type") == event_type]


def check_schema(events, r: Report):
    bad_types = [e.get("event_type") for e in events if e.get("event_type") not in VALID_EVENT_TYPES]
    if bad_types:
        r.add("SCHEMA-01", "FAIL", f"unknown event_type(s): {sorted(set(bad_types))}")
    else:
        r.add("SCHEMA-01", "PASS", "all event_type values are in the canonical 6-enum")

    missing = []
    for i, e in enumerate(events):
        for f in COMMON_FIELDS:
            if f not in e:
                missing.append((i, f))
    if missing:
        r.add("SCHEMA-02", "FAIL", f"missing common fields: {missing[:10]}{'...' if len(missing) > 10 else ''}")
    else:
        r.add("SCHEMA-02", "PASS", "all events carry the 5 common fields")


def check_inv_01(events, r: Report):
    started = by_type(events, "cycle_started")
    completed = by_type(events, "cycle_completed")
    if len(started) == 1 and len(completed) == 1:
        r.add("INV-01", "PASS", "exactly one cycle_started + one cycle_completed")
    else:
        r.add("INV-01", "FAIL", f"cycle_started count={len(started)}, cycle_completed count={len(completed)} (expected 1 each)")


def check_inv_02(events, r: Report):
    sequences = [e.get("sequence") for e in events if "sequence" in e]
    ok = all(sequences[i] < sequences[i + 1] for i in range(len(sequences) - 1))
    if ok:
        r.add("INV-02", "PASS", f"sequence strictly monotonic increasing across {len(sequences)} events")
    else:
        r.add("INV-02", "FAIL", f"sequence not strictly monotonic: {sequences}")


def check_inv_03(events, r: Report):
    hitl_fired = by_type(events, "hitl_gate_fired")
    hitl_responded = by_type(events, "hitl_responded")
    error_occurred = by_type(events, "error_occurred")
    paired_seqs = {e.get("paired_sequence") for e in hitl_responded}
    error_seqs = sorted(e.get("sequence", -1) for e in error_occurred)

    orphans = []
    for fired in hitl_fired:
        seq = fired.get("sequence")
        if seq in paired_seqs:
            continue
        # accept an error_occurred after this fire as a valid fallback pairing
        # (e.g. a timeout that escalated the gate).
        if any(e_seq > seq for e_seq in error_seqs):
            continue
        orphans.append(seq)

    if not orphans:
        r.add("INV-03", "PASS", f"all {len(hitl_fired)} hitl_gate_fired events have a hitl_responded or error_occurred pair")
    else:
        r.add("INV-03", "FAIL", f"orphan hitl_gate_fired (no hitl_responded/error_occurred pair) at sequence(s): {orphans}")


def check_inv_04(events, r: Report, expected_team_id):
    bad = [e.get("sequence") for e in events if e.get("team_id") != expected_team_id]
    if not bad:
        r.add("INV-04", "PASS", f"all events team_id == {expected_team_id!r}")
    else:
        r.add("INV-04", "FAIL", f"team_id mismatch (expected {expected_team_id!r}) at sequence(s): {bad}")


def load_registered_roles(registry_path: Path, r: Report):
    if yaml is None:
        r.add("GATE-01", "FAIL", "pyyaml not available, cannot load approver-registry.yaml")
        return None
    if not registry_path.exists():
        r.add("GATE-01", "FAIL", f"approver-registry.yaml not found: {registry_path}")
        return None
    doc = yaml.safe_load(registry_path.read_text(encoding="utf-8")) or {}
    role_assignments = doc.get("role_assignments", {}) or {}
    return set(role_assignments.keys())


def check_gate_01(events, r: Report, registry_path: Path):
    roles = load_registered_roles(registry_path, r)
    if roles is None:
        return  # already reported FAIL above

    hitl_fired = by_type(events, "hitl_gate_fired")
    mismatches = []
    for e in hitl_fired:
        approver_role = e.get("approver_role")
        if approver_role not in roles:
            mismatches.append(
                f"sequence {e.get('sequence')}: approver_role={approver_role!r} "
                f"not a registered role {sorted(roles)}"
            )
    if not mismatches:
        r.add("GATE-01", "PASS", f"all {len(hitl_fired)} hitl_gate_fired events name a registered approver_role")
    else:
        r.add("GATE-01", "FAIL", "; ".join(mismatches))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cycle-dir", required=True, help="Directory containing cycle.jsonl")
    parser.add_argument("--team-id", required=True, help="Expected team_id (INV-04)")
    parser.add_argument("--approver-registry", default=DEFAULT_APPROVER_REGISTRY,
                        help="Path to definitions/hitl/approver-registry.yaml (GATE-01)")
    args = parser.parse_args()

    cycle_dir = Path(args.cycle_dir)
    cycle_file = cycle_dir / "cycle.jsonl"

    r = Report()
    events = load_events(cycle_file, r)
    if events:
        check_schema(events, r)
        check_inv_01(events, r)
        check_inv_02(events, r)
        check_inv_03(events, r)
        check_inv_04(events, r, args.team_id)
        check_gate_01(events, r, Path(args.approver_registry))

    print(r.render())
    return 0 if r.all_pass() else 1


if __name__ == "__main__":
    sys.exit(main())
