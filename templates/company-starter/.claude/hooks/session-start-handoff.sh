#!/usr/bin/env bash
# ===================================================================
# Session Start Handoff Hook (ai-retreat-starter)
# ===================================================================
# Purpose: セッション開始時に HANDOFF.md の最新セクションを additionalContext で
#          文脈へ決定論的に注入し、CLAUDE.md §5 開始手順 1 を機械化する。
# Trigger: SessionStart — 全セッション開始時（matcher なし）
# Policy: 非ブロッキング。exit は常に 0。stdout は valid JSON か空のみ。
#   WHY: CLAUDE.md §5「開始時」手順 1 は「HANDOFF.md を読む」をモデルの遵守に
#   依存していた。本 hook が最新セクションを機械的に注入することで、開始手順の
#   決定論化を図る（全文・過去の経緯は従来どおり HANDOFF.md を Read する）（Issue #47）。
#   SessionStart は有用な stdin を持たないため入力は解釈せず捨てる。
# ===================================================================

set -uo pipefail

main() {
    # 1. stdin を読み捨てる（HARNESS スモークテストの Bash 形式 JSON 含め、何が来ても block しない）
    cat >/dev/null 2>&1 || true

    # 2. PROJECT_ROOT の決定
    local project_root="${CLAUDE_PROJECT_DIR:-}"
    if [[ -z "$project_root" ]]; then
        local script_dir
        script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        project_root="$(cd "$script_dir/../.." && pwd)"
    fi

    local handoff="$project_root/HANDOFF.md"
    # 3. HANDOFF.md が無い/読めない → 無言で exit 0
    [[ -r "$handoff" ]] || exit 0

    # 4. 最後の `## ` 見出しから末尾までを抽出（無ければ無言で exit 0）
    local last_h
    last_h=$(grep -n '^## ' "$handoff" 2>/dev/null | tail -n1 | cut -d: -f1) || exit 0
    [[ -n "$last_h" ]] || exit 0
    local section
    section=$(tail -n "+${last_h}" "$handoff")
    # 末尾の `---` 区切り行を除去
    section=$(printf '%s\n' "$section" | sed -e '${/^---[[:space:]]*$/d}')

    # 5. コンテキスト予算のためキャップ（3000 バイト）。切り詰めたら注記を付す
    local cap=3000 truncated=""
    if [[ ${#section} -gt $cap ]]; then
        section=$(printf '%s' "$section" | head -c "$cap")
        truncated=$'\n（… 以下省略。全文は HANDOFF.md を Read すること）'
    fi

    local context_text
    context_text="[session-start] HANDOFF.md 最新セクション（全文と過去の経緯は HANDOFF.md を Read すること）:"$'\n'"${section}${truncated}"

    # 6. JSON を安全に組み立てる（jq 優先、python3 フォールバック。どちらも無ければ何も出さない）
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
