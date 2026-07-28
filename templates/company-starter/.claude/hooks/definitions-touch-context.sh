#!/usr/bin/env bash
# ===================================================================
# Definitions-Touch Context Hook (ai-retreat-starter)
# ===================================================================
# Purpose: definitions/ 配下を Edit/Write する瞬間に definitions-touch の
#          規律（SSOT 取扱い・PII 隔離）を Claude のコンテキストへ注入する。
# Trigger: PreToolUse(Edit|Write|MultiEdit) — tool_input.file_path が
#          リポジトリルート直下の definitions/ 配下のとき。
#
# なぜ hook が必要か（Issue #38）:
#   `.claude/rules/definitions-touch.md` は `paths:` frontmatter を持つ
#   公式のパススコープ付きルールだが、公式仕様上ルールが発火するのは
#   ファイルの Read 時であり、Edit は直前の Read 経由で間接的にしかカバー
#   されない。新規ファイルの Write（PII を含みうる client/ontology YAML を
#   新規作成する最高リスクの経路）は既知の制限で発火しない
#   （anthropics/claude-code#23478）。本 hook がその write-path の穴を塞ぎ、
#   同じ規律を保証層として届ける belt-and-suspenders。
#
# Policy: 非ブロッキング（permissionDecision=allow）。判定できなければ何も
#   出さず exit 0。JSON は静的ヒアドキュメントで固定文字列を出力する
#   （additionalContext 内に動的補間しないのでエスケープ事故が起きない）。
#
# Session dedupe（Issue #57）:
#   同一セッションで definitions/ を何度も Edit すると同じ additionalContext を
#   毎回注入しトークンを浪費する。stdin JSON 直下の session_id を鍵に、マーカー
#   ${TMPDIR:-/tmp}/.definitions-touch-seen-<session_id> が既にあれば emit 前に
#   silent exit 0、無ければ作成して 1 回だけ emit（マーカーはルールが実際に発火
#   したときのみ作成）。Fallback: session_id が取れない入力（HARNESS-02 smoke 等）
#   は安全側に倒し従来通り毎回 emit する。
# ===================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

main() {
    local raw_input
    raw_input="${1:-$(cat)}"
    local file_path=""
    local session_id=""

    # Claude Code の PreToolUse hook は JSON を stdin で渡してくる。
    # jq → python3 フォールバックで tool_input.file_path と session_id を抽出する。
    # session_id は入力 JSON 直下（top-level）に載る（Issue #57 dedupe の鍵）。
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

    # session_id をファイルシステム安全な文字だけに正規化する（[A-Za-z0-9._-] 以外を除去）。
    [[ "$session_id" == "null" ]] && session_id=""
    session_id="${session_id//[^A-Za-z0-9._-]/}"

    if [[ -z "$file_path" || "$file_path" == "null" ]]; then
        exit 0
    fi

    # リポジトリルートを決める（CLAUDE_PROJECT_DIR 優先、無ければ script dir から導出）
    local repo_root
    repo_root="${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

    # 相対パス（definitions/kpi/x.yaml 等）は repo_root 起点で絶対化する。
    local abs_path
    case "$file_path" in
        /*) abs_path="$file_path" ;;
        *)  abs_path="$repo_root/$file_path" ;;
    esac

    # repo_root 直下の definitions/ 配下のときだけ発火。
    # examples/harukaze-ec/definitions/** はルート直下ではないので一致しない。
    case "$abs_path" in
        "$repo_root"/definitions/*)
            # Session dedupe（Issue #57）: マーカーはルールが一致したここでのみ作成。
            if [[ -n "$session_id" ]]; then
                local marker="${TMPDIR:-/tmp}/.definitions-touch-seen-${session_id}"
                if [[ -e "$marker" ]]; then
                    exit 0
                fi
                touch "$marker" 2>/dev/null || true
            fi
            cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","additionalContext":"[definitions-touch] definitions/ は本テンプレの SSOT（Single Source of Truth）です。触る前の5秒チェック: (1) 変更する entity/attribute が他ファイルから参照されていないか grep で確認。(2) entity/attribute/domain の増減なら schema_version を今日の日付に更新すべきか判断。(3) domain 追加・削除など大きな変更は Decision RFC（docs/decisions/）が必要か判断。顧客の実名・実額・メール等の PII は definitions/ に直接書かず secrets/ へ隔離すること。全文は .claude/rules/definitions-touch.md を Read してください。"}}
JSON
            exit 0
            ;;
    esac

    exit 0
}

main "$@"
