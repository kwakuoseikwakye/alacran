#!/usr/bin/env bash
# ===================================================================
# Session Start Handoff Hook (company-starter)
# ===================================================================
# Purpose: at session start, deterministically inject HANDOFF.md's most
#          recent section into context via additionalContext, mechanising
#          step 1 of CLAUDE.md §5's start-of-session procedure.
# Trigger: SessionStart — every session start (no matcher)
# Policy: non-blocking. Always exits 0. stdout is either valid JSON or empty.
#   WHY: step 1 of CLAUDE.md §5's "at the start" procedure relied on the
#   model actually complying with "read HANDOFF.md". This hook mechanically
#   injects the most recent section so the start-of-session step is
#   deterministic (the full text and past history are still read from
#   HANDOFF.md as before) (Issue #47).
#   SessionStart carries no useful stdin, so any input is discarded unread.
# ===================================================================

set -uo pipefail

main() {
    # 1. discard stdin unread (never blocks regardless of what arrives, including HARNESS's Bash-shaped smoke-test JSON)
    cat >/dev/null 2>&1 || true

    # 2. determine PROJECT_ROOT
    local project_root="${CLAUDE_PROJECT_DIR:-}"
    if [[ -z "$project_root" ]]; then
        local script_dir
        script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        project_root="$(cd "$script_dir/../.." && pwd)"
    fi

    local handoff="$project_root/HANDOFF.md"
    # 3. HANDOFF.md missing/unreadable -> exit 0 silently
    [[ -r "$handoff" ]] || exit 0

    # 4. extract from the last `## ` heading to the end (exit 0 silently if there is none)
    local last_h
    last_h=$(grep -n '^## ' "$handoff" 2>/dev/null | tail -n1 | cut -d: -f1) || exit 0
    [[ -n "$last_h" ]] || exit 0
    local section
    section=$(tail -n "+${last_h}" "$handoff")
    # strip a trailing `---` separator line
    section=$(printf '%s\n' "$section" | sed -e '${/^---[[:space:]]*$/d}')

    # 5. cap it for the context budget (3000 bytes). Note it if truncated
    local cap=3000 truncated=""
    if [[ ${#section} -gt $cap ]]; then
        section=$(printf '%s' "$section" | head -c "$cap")
        truncated=$'\n(... truncated. Read HANDOFF.md for the full text)'
    fi

    local context_text
    context_text="[session-start] HANDOFF.md's most recent section (Read HANDOFF.md for the full text and past history):"$'\n'"${section}${truncated}"

    # 6. safely build the JSON (jq preferred, python3 fallback. Output nothing if neither exists)
    if command -v jq >/dev/null 2>&1; then
        jq -n --arg ctx "$context_text" \
            '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
    elif command -v python3 >/dev/null 2>&1; then
        CONTEXT_TEXT="$context_text" python3 -c \
            "import os, json; print(json.dumps({'hookSpecificOutput': {'hookEventName': 'SessionStart', 'additionalContext': os.environ['CONTEXT_TEXT']}}))"
    fi

    exit 0
}

main "$@"
