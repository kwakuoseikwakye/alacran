#!/bin/bash
#
# Format Check Hook
#
# This hook automatically checks formatting after an Edit/Write operation.
#
# Policy: code is auto-formatted / md and yaml get a check + advisory only
#         (Issue #55 — auto-formatting was colliding with the Scope Contract).
#         Non-blocking, exits 0 even on failure.
#
# Input contract: Claude Code's PostToolUse hook passes JSON on stdin (not
# argv). Extracts tool_input.file_path with the same jq -> python3 fallback
# as git-ops-validator.sh (Issue #26 — the previous argv-assuming
# implementation always got an empty FILE_PATH, so formatting had never
# actually run once).

set -uo pipefail

# Configuration - Dynamic path resolution
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

main() {
    local raw_input
    raw_input="${1:-$(cat)}"
    local file_path=""

    if command -v jq >/dev/null 2>&1 \
        && echo "$raw_input" | jq -e '.tool_input.file_path' >/dev/null 2>&1
    then
        file_path=$(echo "$raw_input" | jq -r '.tool_input.file_path' 2>/dev/null) || file_path=""
    elif command -v python3 >/dev/null 2>&1 \
        && echo "$raw_input" | python3 -c "import sys,json; json.load(sys.stdin)" >/dev/null 2>&1
    then
        file_path=$(echo "$raw_input" | python3 -c \
            "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" \
            2>/dev/null) || file_path=""
    fi

    if [ -z "$file_path" ]; then
        exit 0
    fi

    if [ ! -f "$file_path" ]; then
        exit 0
    fi

    cd "$PROJECT_ROOT" || exit 0

    case "$file_path" in
        *.ts | *.tsx | *.js | *.jsx)
            if command -v prettier >/dev/null 2>&1; then
                prettier --write "$file_path" 2>/dev/null || true
            fi
            ;;
        *.md | *.yaml | *.yml)
            # Rewriting a hand-aligned table in PostToolUse would violate the
            # Scope Contract (Issue #55), so md/yaml are never --write'd —
            # only --check'd for whether a diff exists, and an advisory is
            # returned if so.
            if command -v prettier >/dev/null 2>&1 \
                && ! prettier --check "$file_path" >/dev/null 2>&1
            then
                local ctx="[format-check] ${file_path} has a prettier formatting diff. If you format it, don't mix it with a functional change — run prettier --write in its own independent commit (scope-contract §4)."
                if command -v jq >/dev/null 2>&1; then
                    jq -n --arg primary "$ctx" \
                        '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $primary}}'
                elif command -v python3 >/dev/null 2>&1; then
                    CONTEXT_TEXT="$ctx" python3 -c \
                        "import os, json; print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PostToolUse', 'additionalContext': os.environ['CONTEXT_TEXT']}}))"
                fi
            fi
            ;;
        *.py)
            if command -v black >/dev/null 2>&1; then
                black --quiet "$file_path" 2>/dev/null || true
            fi
            ;;
    esac

    exit 0
}

main "$@"
