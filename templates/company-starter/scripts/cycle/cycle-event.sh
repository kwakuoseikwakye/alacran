#!/usr/bin/env bash
# cycle-event.sh — Append ONE event to a team's cycle.jsonl.
#
# Canonical schema: docs/templates/cycle-execution-log-schema.yaml
# Writes to: state/cycles/<team-id>/<YYYY-MM-DD>/cycle.jsonl
#   - <team-id>   is the org.team team_id (e.g. ec-team)
#   - <YYYY-MM-DD> is the cycle start date (Monday of the target week)
#
# Auto-fills the 5 common fields: ts (UTC ISO8601 ms), team_id, cycle_id
# (= the YYYY-MM-DD cycle start date), event_type (validated against the
# canonical 6-event enum), and sequence (monotonic per file). Any extra
# fields are merged in via --data (the 5 common fields always win on key
# conflict).
#
# Usage:
#   cycle-event.sh <event_type> --team-id <id> [--data '<json object>']
#                  [--cycle-dir <dir>] [--week-monday YYYY-MM-DD]
#   cycle-event.sh --help
#
# --team-id is REQUIRED (no default). This script is team-agnostic on
# purpose: the caller must name the team it is logging for.
#
# Env overrides (handy for a dry-run without touching real state/):
#   CYCLE_DIR   same as --cycle-dir
#   TEAM_ID     same as --team-id
#
# Exit codes: 0 success, 1 invalid args / validation failure, 2 usage error.

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"

# Canonical 6-event enum (cycle-execution-log-schema.yaml event_types).
VALID_EVENT_TYPES=(
  cycle_started task_executed hitl_gate_fired
  hitl_responded error_occurred cycle_completed
)

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} <event_type> --team-id <id> [options]

Arguments:
  event_type   One of: ${VALID_EVENT_TYPES[*]}

Options:
  --team-id <id>          Team identifier (REQUIRED, e.g. ec-team). Also
                          settable via the TEAM_ID env var.
  --data '<json>'         Extra fields to merge into the event (JSON object).
                          Common fields (ts/team_id/cycle_id/event_type/
                          sequence) always take precedence on key conflict.
  --cycle-dir <dir>       Write to this directory instead of the default
                          state/cycles/<team-id>/<monday>/.
  --week-monday <date>    YYYY-MM-DD Monday date used to build the default
                          cycle-dir / cycle_id (default: Monday of current
                          UTC week).
  -h, --help              Show this help.

Examples:
  ${SCRIPT_NAME} cycle_started --team-id ec-team --data '{"cycle_unit":"weekly","planned_targets":{"tasks":"5-8"}}'
  ${SCRIPT_NAME} hitl_gate_fired --team-id ec-team --data '{"trigger_id":"large-deal","reason":"order over threshold","approver_role":"owner"}'
EOF
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 2
fi

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac

EVENT_TYPE="$1"; shift

DATA_JSON='{}'
CYCLE_DIR="${CYCLE_DIR:-}"
WEEK_MONDAY=""
TEAM_ID="${TEAM_ID:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --team-id)
      TEAM_ID="$2"; shift 2 ;;
    --data)
      DATA_JSON="$2"; shift 2 ;;
    --cycle-dir)
      CYCLE_DIR="$2"; shift 2 ;;
    --week-monday)
      WEEK_MONDAY="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2 ;;
  esac
done

# --- Require --team-id (no default) ---
if [[ -z "$TEAM_ID" ]]; then
  echo "error: --team-id is required (or set the TEAM_ID env var)" >&2
  usage >&2
  exit 2
fi

# --- Validate event_type against the canonical 6-enum ---
valid=0
for t in "${VALID_EVENT_TYPES[@]}"; do
  if [[ "$t" == "$EVENT_TYPE" ]]; then
    valid=1
    break
  fi
done
if [[ "$valid" -ne 1 ]]; then
  echo "error: invalid event_type '${EVENT_TYPE}'. Must be one of: ${VALID_EVENT_TYPES[*]}" >&2
  exit 1
fi

# --- Validate --data is a JSON object ---
if ! echo "$DATA_JSON" | jq -e 'type == "object"' >/dev/null 2>&1; then
  echo "error: --data must be a JSON object, got: ${DATA_JSON}" >&2
  exit 1
fi

# --- Determine week-monday date (default: Monday of current UTC week) ---
if [[ -z "$WEEK_MONDAY" ]]; then
  dow="$(date -u +%u)"                       # 1 (Mon) .. 7 (Sun)
  offset=$(( dow - 1 ))
  WEEK_MONDAY="$(date -u -d "-${offset} days" +%Y-%m-%d)"
fi

if ! [[ "$WEEK_MONDAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "error: --week-monday must be YYYY-MM-DD, got: ${WEEK_MONDAY}" >&2
  exit 1
fi

# cycle_id is the YYYY-MM-DD cycle start date (per canonical schema).
CYCLE_ID="${WEEK_MONDAY}"

if [[ -z "$CYCLE_DIR" ]]; then
  CYCLE_DIR="state/cycles/${TEAM_ID}/${WEEK_MONDAY}"
fi

mkdir -p "$CYCLE_DIR"
CYCLE_FILE="${CYCLE_DIR}/cycle.jsonl"
LOCK_FILE="${CYCLE_DIR}/.cycle.lock"

TS="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"

# --- Atomic sequence assignment + append (monotonic sequence invariant) ---
(
  flock -x 200
  last_seq="$(tail -n 1 "$CYCLE_FILE" 2>/dev/null | jq -r '.sequence // 0' 2>/dev/null || echo 0)"
  case "$last_seq" in
    ''|*[!0-9.]*) last_seq=0 ;;
  esac
  # sequence is numeric (int); truncate any float remnants defensively
  last_seq_int="${last_seq%%.*}"
  seq=$(( last_seq_int + 1 ))

  event_json="$(jq -nc \
    --arg ts "$TS" \
    --arg team_id "$TEAM_ID" \
    --arg cycle_id "$CYCLE_ID" \
    --arg event_type "$EVENT_TYPE" \
    --argjson sequence "$seq" \
    --argjson extra "$DATA_JSON" \
    '$extra + {ts:$ts, team_id:$team_id, cycle_id:$cycle_id, event_type:$event_type, sequence:$sequence}'
  )"

  echo "$event_json" >> "$CYCLE_FILE"
  echo "$event_json"
) 200>"$LOCK_FILE"
