#!/bin/bash
#
# Format Check Hook
#
# このフックは Edit/Write 操作後に自動的にフォーマットをチェックします。
#
# Policy: コードは自動整形 / md・yaml は check + advisory（Issue #55 —
#         自動整形が Scope Contract と衝突していたため）。非ブロッキング、
#         失敗しても exit 0。
#
# 入力契約: Claude Code の PostToolUse hook は JSON を stdin で渡してくる
# （argv ではない）。git-ops-validator.sh と同じ jq → python3 フォールバックで
# tool_input.file_path を抽出する（Issue #26 — 従来の argv 前提実装は常に
# FILE_PATH が空になり、一度も整形が実行されていなかった）。

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
            # 手で整列した表を PostToolUse で書き換えると Scope Contract に
            # 違反するため（Issue #55）、md/yaml は --write せず --check で
            # 差分の有無だけ調べ、あれば advisory を返す。
            if command -v prettier >/dev/null 2>&1 \
                && ! prettier --check "$file_path" >/dev/null 2>&1
            then
                local ctx="[format-check] ${file_path} に prettier のフォーマット差分があります。整形する場合は機能変更と混ぜず、独立コミットで prettier --write を実行してください（scope-contract §4）。"
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
