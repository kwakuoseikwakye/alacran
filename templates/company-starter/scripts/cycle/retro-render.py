#!/usr/bin/env python3
"""retro-render.py — Fill the common-KPI dashboard into the weekly retro template.

Reads cycle.jsonl + kpi.json (as produced by cycle-kpi-snapshot.py) and fills
the identity placeholders (TEAM_ID / WEEK_LABEL / CYCLE_ID / cycle dates /
GENERATED_AT) plus the two common-KPI dashboard rows
({ACTUAL_CCR}/{STATUS_CCR}, {ACTUAL_HIR}/{STATUS_HIR}, {ALERT_SUMMARY}) in
docs/templates/retro-weekly.md, writing the result to
docs/retros/<team-id>/weekly/{YYYY-Www}.md.

KPT / Decision-Pending / Next-cycle-action sections are intentionally LEFT
UNTOUCHED for the human owner to fill in during the retro session.

Default status thresholds are generic placeholders; the authoritative targets
live in definitions/kpi/<team>-kpi.yaml. The rendered file says so.

Usage:
  retro-render.py --cycle-dir <dir> --team-id <id> [--template <path>] [--out <path>]
  retro-render.py --help
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_TEMPLATE = "docs/templates/retro-weekly.md"
DEFAULT_OUT_DIR_TEMPLATE = "docs/retros/{team_id}/weekly"

# Generic default targets (authoritative targets live in definitions/kpi/).
CCR_TARGET = 0.95          # cycle_completion_rate: OK when >= this
HIR_ESCALATION = 0.35      # hitl_intervention_rate: OK when <= this


def load_json(path: Path):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


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


def fmt_rate(raw):
    if raw is None:
        return "N/A"
    return f"{raw * 100:.0f}%"


def status_ccr(raw):
    if raw is None:
        return "N/A", None
    if raw >= CCR_TARGET:
        return "OK", None
    return "WATCH", f"cycle_completion_rate {fmt_rate(raw)} < {CCR_TARGET*100:.0f}% (default target)"


def status_hir(raw):
    if raw is None:
        return "N/A", None
    if raw <= HIR_ESCALATION:
        return "OK", None
    return "WATCH", f"hitl_intervention_rate {fmt_rate(raw)} > {HIR_ESCALATION*100:.0f}% (default escalation)"


def to_date(ts):
    if not ts:
        return "YYYY-MM-DD"
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).strftime("%Y-%m-%d")
    except ValueError:
        return ts


def week_label_from(cycle_id, events):
    """Derive an ISO YYYY-Www label from cycle_id (a YYYY-MM-DD date) or now()."""
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


def render(template_text, kpi_json, events, team_id):
    common = kpi_json.get("common_kpis", {})
    ccr = (common.get("cycle_completion_rate") or {}).get("rate")
    hir = (common.get("hitl_intervention_rate") or {}).get("rate")

    cycle_started = next((e for e in events if e.get("event_type") == "cycle_started"), None)
    cycle_completed = next((e for e in events if e.get("event_type") == "cycle_completed"), None)

    cycle_id = kpi_json.get("cycle_id") or (cycle_started or {}).get("cycle_id", "cycle-unknown")
    start_ts = (cycle_started or {}).get("ts")
    end_ts = (cycle_completed or {}).get("ts")

    ccr_status, ccr_alert = status_ccr(ccr)
    hir_status, hir_alert = status_hir(hir)
    alerts = [a for a in (ccr_alert, hir_alert) if a]
    alert_summary = "None" if not alerts else f"{len(alerts)}: " + "; ".join(alerts)

    replacements = {
        "{TEAM_ID}": team_id,
        "{WEEK_LABEL}": week_label_from(cycle_id, events),
        "{CYCLE_ID}": cycle_id,
        "{CYCLE_START}": to_date(start_ts),
        "{CYCLE_END}": to_date(end_ts),
        "{GENERATED_AT}": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "{ACTUAL_CCR}": fmt_rate(ccr),
        "{STATUS_CCR}": ccr_status,
        "{ACTUAL_HIR}": fmt_rate(hir),
        "{STATUS_HIR}": hir_status,
        "{ALERT_SUMMARY}": alert_summary,
    }

    text = template_text
    for key, value in replacements.items():
        text = text.replace(key, str(value))
    return text


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cycle-dir", required=True, help="Directory containing cycle.jsonl + kpi.json")
    parser.add_argument("--team-id", required=True, help="Team identifier (for the output path + fallback)")
    parser.add_argument("--kpi-json", default=None, help="Path to kpi.json (default: <cycle-dir>/kpi.json)")
    parser.add_argument("--template", default=DEFAULT_TEMPLATE, help="Path to retro-weekly.md template")
    parser.add_argument("--out", default=None, help="Output path (default: docs/retros/<team-id>/weekly/{YYYY-Www}.md)")
    args = parser.parse_args()

    cycle_dir = Path(args.cycle_dir)
    cycle_file = cycle_dir / "cycle.jsonl"
    kpi_path = Path(args.kpi_json) if args.kpi_json else cycle_dir / "kpi.json"
    template_path = Path(args.template)

    if not template_path.exists():
        print(f"error: template not found: {template_path}", file=sys.stderr)
        return 1

    events = load_events(cycle_file)
    kpi_json = load_json(kpi_path)
    if not kpi_json:
        print(f"warning: kpi.json not found/empty at {kpi_path}, rendering with N/A values", file=sys.stderr)

    rendered = render(template_path.read_text(encoding="utf-8"), kpi_json, events, args.team_id)

    if args.out:
        out_path = Path(args.out)
    else:
        cycle_id = kpi_json.get("cycle_id") or next(
            (e.get("cycle_id") for e in events if e.get("event_type") == "cycle_started"), None
        )
        label = week_label_from(cycle_id, events)
        out_path = Path(DEFAULT_OUT_DIR_TEMPLATE.format(team_id=args.team_id)) / f"{label}.md"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(rendered, encoding="utf-8")
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
