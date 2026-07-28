#!/usr/bin/env bash
# ===================================================================
# Git Ops Validator Hook (ai-retreat-starter)
# ===================================================================
# Purpose: git 操作のうち、機械的に判定できる不可逆操作を exit 2 でブロックし（Blocking 層）、
#          さらに正当用途も多い reset --hard は permissionDecision=ask で人間の許可プロンプトに委ねる（Ask 層, Issue #58）。
# Trigger: PreToolUse(Bash) — git 系コマンドが検出されたとき
#
# 高頻度イベントの hook は set -e で全体を落とさない。
#
# Scope: Blocking 層（exit 2）の対象は git push の --force / -f、+refspec（強制）、
#      :refspec・--delete・-d（リモートブランチ削除）、git branch -D（単独短フラグ）、
#      git branch の削除フラグ（-d/-D/--delete）と --force の併用。
#      （--force-with-lease / --force-if-includes は安全側 force として除外する）。
#      Ask 層（permissionDecision=ask）の対象は git reset --hard（Issue #58）。
#      これは .claude/rules/hitl-gate.md §2「不可逆操作」の一部を機械担保するもの。
#  上記以外の不可逆操作（本番データ削除 / DB 破壊的変更等）は
#  引き続き hitl-gate.md の HITL Gate（人間の明示承認）でのみ担保する。
#
#  スレットモデル: この Blocking 層は「うっかり実行」に対する defense-in-depth であり、
#  意図的な回避（sh -c / env-prefix（VAR=x git push …）/ 文字列組み立て 等）を機械的に
#  防ぐセキュリティ境界ではない。意図的な不可逆操作は引き続き hitl-gate.md の人間承認で統治する。
#
#  旧版はここに「git commit のメッセージ衛生」を検査する advisory 層（非ブロッキング）
#  も持っていたが、PreToolUse hook の stderr は exit 0 のとき Claude Code の仕様上
#  モデルに一切渡らないため、advisory が一度もモデルに届いていなかった（Issue #41）。
#  そのため commit-msg-advisor.sh（PostToolUse, additionalContext でモデルに到達）へ
#  移設した。コミットメッセージ衛生は `.claude/hooks/commit-msg-advisor.sh` を参照。
# ===================================================================

set -uo pipefail

main() {
    local raw_input
    raw_input="${1:-$(cat)}"
    local bash_cmd=""

    # Claude Code の PreToolUse hook は JSON を渡してくる。
    # jq があれば jq、無ければ python3、どちらも無ければ生入力をそのまま扱う。
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

    # ---- Blocking 層: 機械的に判定できる不可逆操作を exit 2 でブロック ----
    # コマンド位置（文字列先頭 or シェル区切り &&/||/;/|/$(/バッククォート/改行 の直後）に
    # 現れる git のみを対象とする。クォート内の文字列に紛れた git は誤検知しない
    # （例: echo "git push --force …" >> notes.md は素通り）。なお env-prefix
    # （VAR=x git push …）は anchor に一致しないため防げない — ヘッダのスレットモデル注記の通り許容。
    local anchor='(^|[;&|(`])[[:space:]]*(command[[:space:]]+)?'

    # --force-with-lease / --force-if-includes は安全側の force なので除外してから判定する。
    local scrubbed
    scrubbed=$(echo "$bash_cmd" | sed -E 's/--force-with-lease(=[^[:space:]]*)?//g; s/--force-if-includes//g')

    # git push の強制/削除系: --force / -f（単独ワード）、+refspec（強制）、
    # :refspec・--delete・-d（リモートブランチ削除）。いずれも不可逆。
    # フラグ検査は「anchor された git push から次のシェル区切りまでのセグメント」に
    # 限定する。コマンド全文を走査すると、同一コマンド内の別セグメント
    # （例: commit メッセージ中の "+refspec" への言及）で正当な push が誤ブロックされる。
    local push_segs
    push_segs=$(echo "$scrubbed" | grep -oE "${anchor}git[[:space:]]+push[^;&|\`(]*")
    if [[ -n "$push_segs" ]] \
        && echo "$push_segs" | grep -qE '(--force([[:space:]]|$)|(^|[[:space:]])-f([[:space:]]|$)|[[:space:]]\+[^[:space:]]|[[:space:]]:[^[:space:]]|(^|[[:space:]])(--delete|-d)([[:space:]]|$))'; then
        echo "[BLOCKED][git-ops-validator] HITL Gate: git push の強制/削除系操作（--force/-f/+refspec/:refspec/--delete）は不可逆のため機械的にブロックしました。実行にはリポジトリオーナーの明示承認が必要です（.claude/rules/hitl-gate.md §2）。承認済みの場合は人間が手動で実行するか、承認の旨を伝えて再依頼してください。" >&2
        exit 2
    fi

    # git branch の強制削除: 単独 -D、または 削除フラグ（-d/-D/--delete）と --force の併用。
    # push と同様、検査はセグメント単位に限定する。
    local branch_segs
    branch_segs=$(echo "$bash_cmd" | grep -oE "${anchor}git[[:space:]]+branch[^;&|\`(]*")
    if [[ -n "$branch_segs" ]] \
        && { echo "$branch_segs" | grep -qE '(^|[[:space:]])-D([[:space:]]|$)' \
             || { echo "$branch_segs" | grep -qE '(^|[[:space:]])(--delete|-d|-D)([[:space:]]|$)' \
                  && echo "$branch_segs" | grep -qE '(^|[[:space:]])--force([[:space:]]|$)'; }; }; then
        echo "[BLOCKED][git-ops-validator] HITL Gate: git branch の強制削除（-D、または --delete/-d と --force の併用）は不可逆のため機械的にブロックしました。実行にはリポジトリオーナーの明示承認が必要です（.claude/rules/hitl-gate.md §2）。承認済みの場合は人間が手動で実行するか、承認の旨を伝えて再依頼してください。" >&2
        exit 2
    fi
    # ---- Blocking 層ここまで ----

    # ---- Ask 層: git reset --hard を人間の許可プロンプトに委ねる（Issue #58） ----
    # ask はブロックでも素通りでもない第 3 の HITL 実装 — 正当用途（reset --hard HEAD 等）が
    # 多いため機械ブロックせず人間の許可プロンプトに委ねる（Issue #58）。
    # Blocking 層の後段に置き、benign なコマンドは従来通り stdout 無しで silent exit 0 のまま。
    # push/branch と同様にセグメント単位（anchor された git reset から次のシェル区切りまで）に
    # 限定し、-m メッセージ等の文字列内の "reset --hard" 言及を誤検知しない。
    local reset_segs
    reset_segs=$(echo "$bash_cmd" | grep -oE "${anchor}git[[:space:]]+reset[^;&|\`(]*")
    if [[ -n "$reset_segs" ]] \
        && echo "$reset_segs" | grep -qE '(^|[[:space:]])--hard([[:space:]]|$)'; then
        cat <<'JSON'
{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": "git reset --hard は未コミットの作業を不可逆に破棄します（hitl-gate.md §2 不可逆操作）。実行してよいか確認してください。"}}
JSON
        exit 0
    fi
    # ---- Ask 層ここまで ----

    exit 0
}

main "$@"
