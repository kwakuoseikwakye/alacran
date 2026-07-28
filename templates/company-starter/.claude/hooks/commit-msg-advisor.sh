#!/usr/bin/env bash
# ===================================================================
# Commit Message Advisor Hook (ai-retreat-starter)
# ===================================================================
# Purpose: 直前の git commit のメッセージ衛生（Conventional Commits 形式 /
#          Issue 参照 / 私用メールドメイン / --no-verify）を検査しモデルに届ける。
# Trigger: PostToolUse(Bash) — git commit を含むコマンド実行後
# Policy: 非ブロッキング advisory。exit は常に 0。
#   PreToolUse hook の stderr は exit 0 のとき Claude Code の仕様上モデルに
#   一切渡らないため、旧 git-ops-validator.sh の advisory 層（コミット
#   メッセージ衛生）は一度も届いていなかった（Issue #41）。加えて旧実装は
#   `-m "..."` の sed 抽出依存で heredoc 形式を取りこぼしていた（Issue #26 系）。
#   本 hook は PostToolUse の hookSpecificOutput.additionalContext を使い、
#   実際にコミットされた結果を `git log -1` で post-execution に読むため、
#   上記のクォート/heredoc 問題は構造的に発生しない。
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

    # git commit を含まないコマンドは対象外（false negative は advisory として許容）
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
        findings+=("コミットメッセージが Conventional Commits 形式（例: feat(scope): subject）ではありません（git commit --amend で修正可能）")
    fi

    if ! echo "${subject}"$'\n'"${body}" | grep -qE '#[0-9]+' \
        && ! echo "$subject" | grep -q 'issue化予定'; then
        findings+=("Issue 参照（#N）がありません（issue-first §5。オフライン時は「issue化予定」を残す）")
    fi

    if echo "${subject}"$'\n'"${body}"$'\n'"${author_email}" | grep -qiE '@(gmail|yahoo|icloud|outlook|hotmail)\.[a-z.]+'; then
        findings+=("コミットメッセージまたは author に私用メールドメインらしき文字列が含まれています")
    fi

    if echo "$bash_cmd" | grep -q -- "--no-verify"; then
        findings+=("--no-verify で pre-commit フックがスキップされています")
    fi

    if [[ ${#findings[@]} -eq 0 ]]; then
        exit 0
    fi

    local joined
    joined=$(printf '%s / ' "${findings[@]}")
    joined="${joined% / }"
    local context_text="[commit-msg-advisor] ${joined} — 対象: ${subject}"

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
