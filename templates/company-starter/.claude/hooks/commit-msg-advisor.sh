#!/usr/bin/env bash
# ===================================================================
# Commit Message Advisor Hook (ai-retreat-starter)
# ===================================================================
# Purpose: checks the hygiene of the most recent git commit message
#          (Conventional Commits format / Issue reference / personal email
#          domain / --no-verify) and delivers it to the model.
# Trigger: PostToolUse(Bash) — after running a command that includes git commit
# Policy: non-blocking advisory. Always exits 0.
#   A PreToolUse hook's stderr is never passed to the model at all when it
#   exits 0, per Claude Code's own spec — so the old git-ops-validator.sh's
#   advisory layer (commit message hygiene) was never actually reaching the
#   model (Issue #41). On top of that, the old implementation relied on
#   sed-extracting `-m "..."` and missed the heredoc form entirely (part of
#   Issue #26). This hook instead uses PostToolUse's
#   hookSpecificOutput.additionalContext and reads what was actually
#   committed post-execution via `git log -1`, so the quoting/heredoc problem
#   above can't structurally happen here.
# ===================================================================

set -uo pipefail

main() {
    local raw_input
    raw_input="${1:-$(cat)}"
    local bash_cmd=""

    if command -v jq >/dev/null 2>&1 \
        && echo "$raw_input" | jq -e '.tool_input.command' >/dev/null 2>&1
    then
        bash_cmd=$(echo "$raw_input" | jq -r '.tool_input.command' 2>/dev/null) || bash_cmd=""
    elif command -v python3 >/dev/null 2>&1 \
        && echo "$raw_input" | python3 -c "import sys,json; json.load(sys.stdin)" >/dev/null 2>&1
    then
        bash_cmd=$(echo "$raw_input" | python3 -c \
            "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" \
            2>/dev/null) || bash_cmd=""
    else
        bash_cmd="$raw_input"
    fi

    if [[ -z "$bash_cmd" ]]; then
        exit 0
    fi

    # a command that doesn't include git commit is out of scope (a false negative is acceptable for an advisory)
    if ! echo "$bash_cmd" | grep -qE 'git[[:space:]]+commit'; then
        exit 0
    fi

    local project_root="${CLAUDE_PROJECT_DIR:-}"
    if [[ -z "$project_root" ]]; then
        local script_dir
        script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        project_root="$(cd "$script_dir/../.." && pwd)"
    fi

    local subject body author_email
    subject=$(git -C "$project_root" log -1 --format=%s 2>/dev/null) || exit 0
    body=$(git -C "$project_root" log -1 --format=%b 2>/dev/null) || exit 0
    author_email=$(git -C "$project_root" log -1 --format=%ae 2>/dev/null) || exit 0
    [[ -z "$subject" ]] && exit 0

    local findings=()

    if ! echo "$subject" | grep -qE '^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\([a-z0-9-]+\))?:[[:space:]].+'; then
        findings+=("The commit message is not in Conventional Commits format (e.g. feat(scope): subject) — fixable with git commit --amend")
    fi

    if ! echo "${subject}"$'\n'"${body}" | grep -qE '#[0-9]+' \
        && ! echo "$subject" | grep -q 'issue pending'; then
        findings+=("No Issue reference (#N) found (issue-first §5. Leave \"issue pending\" if offline)")
    fi

    if echo "${subject}"$'\n'"${body}"$'\n'"${author_email}" | grep -qiE '@(gmail|yahoo|icloud|outlook|hotmail)\.[a-z.]+'; then
        findings+=("The commit message or author looks like it contains a personal email domain")
    fi

    if echo "$bash_cmd" | grep -q -- "--no-verify"; then
        findings+=("--no-verify was used, skipping the pre-commit hook")
    fi

    if [[ ${#findings[@]} -eq 0 ]]; then
        exit 0
    fi

    local joined
    joined=$(printf '%s / ' "${findings[@]}")
    joined="${joined% / }"
    local context_text="[commit-msg-advisor] ${joined} — subject: ${subject}"

    if command -v jq >/dev/null 2>&1; then
        jq -n --arg ctx "$context_text" \
            '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
    elif command -v python3 >/dev/null 2>&1; then
        CONTEXT_TEXT="$context_text" python3 -c \
            "import os, json; print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PostToolUse', 'additionalContext': os.environ['CONTEXT_TEXT']}}))"
    fi

    exit 0
}

main "$@"
