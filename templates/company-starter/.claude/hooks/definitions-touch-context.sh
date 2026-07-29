#!/usr/bin/env bash
# ===================================================================
# Definitions-Touch Context Hook (ai-retreat-starter)
# ===================================================================
# Purpose: the moment definitions/ is Edited/Written, inject the
#          definitions-touch discipline (SSOT handling, PII isolation) into
#          Claude's context.
# Trigger: PreToolUse(Edit|Write|MultiEdit) — when tool_input.file_path is
#          under definitions/ directly beneath the repository root.
#
# Why this hook exists (Issue #38):
#   `.claude/rules/definitions-touch.md` is an official rule scoped with
#   `paths:` frontmatter, but per the official spec a rule fires on Read, and
#   Edit is only covered indirectly via the Read that precedes it. Writing a
#   brand-new file (the highest-risk path — creating a new client/ontology
#   YAML that may contain PII) does not fire it, a known limitation
#   (anthropics/claude-code#23478). This hook closes that write-path gap,
#   delivering the same discipline as a belt-and-suspenders guarantee layer.
#
# Policy: non-blocking (permissionDecision=allow). If it can't tell, it
#   outputs nothing and exits 0. The JSON is a fixed string from a static
#   heredoc (nothing is dynamically interpolated into additionalContext, so
#   there's no escaping accident to worry about).
#
# Session dedupe (Issue #57):
#   Editing definitions/ repeatedly in the same session would inject the same
#   additionalContext every time, wasting tokens. Keyed on the session_id at
#   the top level of the stdin JSON: if the marker
#   ${TMPDIR:-/tmp}/.definitions-touch-seen-<session_id> already exists,
#   exit 0 silently before emitting; otherwise create it and emit once (the
#   marker is only ever created when the rule actually matched). Fallback:
#   for input with no retrievable session_id (e.g. the HARNESS-02 smoke
#   test), fail safe and emit every time as before.
# ===================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

main() {
    local raw_input
    raw_input="${1:-$(cat)}"
    local file_path=""
    local session_id=""

    # Claude Code's PreToolUse hook passes JSON on stdin.
    # Extract tool_input.file_path and session_id with the jq -> python3 fallback.
    # session_id sits at the top level of the input JSON (the key for the Issue #57 dedupe).
    if command -v jq >/dev/null 2>&1 \
        && echo "$raw_input" | jq -e '.tool_input.file_path' >/dev/null 2>&1
    then
        file_path=$(echo "$raw_input" | jq -r '.tool_input.file_path' 2>/dev/null) || file_path=""
        session_id=$(echo "$raw_input" | jq -r '.session_id // ""' 2>/dev/null) || session_id=""
    elif command -v python3 >/dev/null 2>&1 \
        && echo "$raw_input" | python3 -c "import sys,json; json.load(sys.stdin)" >/dev/null 2>&1
    then
        file_path=$(echo "$raw_input" | python3 -c \
            "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" \
            2>/dev/null) || file_path=""
        session_id=$(echo "$raw_input" | python3 -c \
            "import sys,json; print(json.load(sys.stdin).get('session_id','') or '')" \
            2>/dev/null) || session_id=""
    fi

    # normalise session_id to filesystem-safe characters only (strip anything outside [A-Za-z0-9._-]).
    [[ "$session_id" == "null" ]] && session_id=""
    session_id="${session_id//[^A-Za-z0-9._-]/}"

    if [[ -z "$file_path" || "$file_path" == "null" ]]; then
        exit 0
    fi

    # determine the repository root (CLAUDE_PROJECT_DIR preferred, otherwise derived from the script dir)
    local repo_root
    repo_root="${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

    # make a relative path (e.g. definitions/kpi/x.yaml) absolute, anchored at repo_root.
    local abs_path
    case "$file_path" in
        /*) abs_path="$file_path" ;;
        *)  abs_path="$repo_root/$file_path" ;;
    esac

    # fire only when it's under definitions/ directly beneath repo_root.
    # examples/harukaze-ec/definitions/** doesn't match, since it isn't directly at the root.
    case "$abs_path" in
        "$repo_root"/definitions/*)
            # Session dedupe (Issue #57): the marker is only ever created here, once the rule matches.
            if [[ -n "$session_id" ]]; then
                local marker="${TMPDIR:-/tmp}/.definitions-touch-seen-${session_id}"
                if [[ -e "$marker" ]]; then
                    exit 0
                fi
                touch "$marker" 2>/dev/null || true
            fi
            cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","additionalContext":"[definitions-touch] definitions/ is this template's SSOT (Single Source of Truth). The 5-second check before you touch it: (1) confirm with grep whether the entity/attribute you're changing is referenced from other files. (2) if you're adding or removing an entity/attribute/domain, judge whether schema_version should be bumped to today's date. (3) for a big change like adding or removing a domain, judge whether a Decision RFC (docs/decisions/) is needed. Never write a customer's real name, real amount, email, or other PII directly into definitions/ \u2014 isolate it in secrets/ instead. Read .claude/rules/definitions-touch.md for the full text."}}
JSON
            exit 0
            ;;
    esac

    exit 0
}

main "$@"
