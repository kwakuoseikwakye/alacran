#!/usr/bin/env bash
# ===================================================================
# Git Ops Validator Hook (company-starter)
# ===================================================================
# Purpose: of git operations, mechanically blocks the irreversible ones with
#          exit 2 (the Blocking layer), and separately defers reset --hard
#          (which has plenty of legitimate uses) to a human permission
#          prompt via permissionDecision=ask (the Ask layer, Issue #58).
# Trigger: PreToolUse(Bash) — when a git-family command is detected
#
# A high-frequency-event hook should not bring the whole thing down with set -e.
#
# Scope: the Blocking layer (exit 2) covers git push's --force / -f,
#      +refspec (force), :refspec / --delete / -d (deleting a remote
#      branch), git branch -D (a standalone short flag), and git branch's
#      delete flags (-d/-D/--delete) combined with --force.
#      (--force-with-lease / --force-if-includes are excluded as the safer
#      form of force.)
#      The Ask layer (permissionDecision=ask) covers git reset --hard
#      (Issue #58).
#      This mechanically backs part of the "irreversible operations" in
#      .claude/rules/hitl-gate.md §2.
#  Irreversible operations other than the above (deleting production data,
#  destructive DB changes, etc.) continue to be backed only by hitl-gate.md's
#  HITL Gate (explicit human approval).
#
#  Threat model: this Blocking layer is defense-in-depth against "accidental
#  execution" — it is not a mechanical security boundary against deliberate
#  evasion (sh -c / an env-prefix like VAR=x git push …/ assembling the
#  string, etc.). A deliberate irreversible operation continues to be
#  governed by human approval in hitl-gate.md.
#
#  The old version also had an advisory layer (non-blocking) here checking
#  "git commit message hygiene", but a PreToolUse hook's stderr is never
#  passed to the model at all when it exits 0, per Claude Code's own spec —
#  so that advisory had never actually reached the model (Issue #41).
#  It was therefore moved to commit-msg-advisor.sh (PostToolUse, which
#  reaches the model via additionalContext). See
#  `.claude/hooks/commit-msg-advisor.sh` for commit message hygiene.
# ===================================================================

set -uo pipefail

main() {
    local raw_input
    raw_input="${1:-$(cat)}"
    local bash_cmd=""

    # Claude Code's PreToolUse hook passes JSON.
    # Use jq if it's available, python3 if not, and the raw input as-is if neither is.
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

    # ---- Blocking layer: mechanically block irreversible operations with exit 2 ----
    # In scope only when git appears in command position (at the start of the
    # string, or right after a shell separator &&/||/;/|/$(/backtick/newline).
    # A "git" buried inside a quoted string is not a false positive (e.g.
    # echo "git push --force …" >> notes.md passes through). Note that an
    # env-prefix (VAR=x git push …) doesn't match the anchor and so isn't
    # caught — accepted, per the threat-model note in the header.
    local anchor='(^|[;&|(`])[[:space:]]*(command[[:space:]]+)?'

    # --force-with-lease / --force-if-includes are the safer form of force, so exclude them before judging.
    local scrubbed
    scrubbed=$(echo "$bash_cmd" | sed -E 's/--force-with-lease(=[^[:space:]]*)?//g; s/--force-if-includes//g')

    # git push's force/delete forms: --force / -f (a standalone word),
    # +refspec (force), :refspec / --delete / -d (deleting a remote branch).
    # All irreversible. The flag check is scoped to "the segment from an
    # anchored git push to the next shell separator" only. Scanning the whole
    # command would wrongly block a legitimate push over an unrelated segment
    # in the same command (e.g. a mention of "+refspec" inside a commit message).
    local push_segs
    push_segs=$(echo "$scrubbed" | grep -oE "${anchor}git[[:space:]]+push[^;&|\`(]*")
    if [[ -n "$push_segs" ]] \
        && echo "$push_segs" | grep -qE '(--force([[:space:]]|$)|(^|[[:space:]])-f([[:space:]]|$)|[[:space:]]\+[^[:space:]]|[[:space:]]:[^[:space:]]|(^|[[:space:]])(--delete|-d)([[:space:]]|$))'; then
        echo "[BLOCKED][git-ops-validator] HITL Gate: a git push force/delete operation (--force/-f/+refspec/:refspec/--delete) was mechanically blocked because it is irreversible. Executing it requires the repository owner's explicit approval (.claude/rules/hitl-gate.md §2). If it has already been approved, either have a human run it manually, or state that it was approved and ask again." >&2
        exit 2
    fi

    # git branch's forced deletion: a standalone -D, or a delete flag
    # (-d/-D/--delete) combined with --force. As with push, the check is
    # scoped to a single segment.
    local branch_segs
    branch_segs=$(echo "$bash_cmd" | grep -oE "${anchor}git[[:space:]]+branch[^;&|\`(]*")
    if [[ -n "$branch_segs" ]] \
        && { echo "$branch_segs" | grep -qE '(^|[[:space:]])-D([[:space:]]|$)' \
             || { echo "$branch_segs" | grep -qE '(^|[[:space:]])(--delete|-d|-D)([[:space:]]|$)' \
                  && echo "$branch_segs" | grep -qE '(^|[[:space:]])--force([[:space:]]|$)'; }; }; then
        echo "[BLOCKED][git-ops-validator] HITL Gate: a git branch forced deletion (-D, or --delete/-d combined with --force) was mechanically blocked because it is irreversible. Executing it requires the repository owner's explicit approval (.claude/rules/hitl-gate.md §2). If it has already been approved, either have a human run it manually, or state that it was approved and ask again." >&2
        exit 2
    fi
    # ---- End of the Blocking layer ----

    # ---- Ask layer: defer git reset --hard to a human permission prompt (Issue #58) ----
    # "ask" is a third HITL implementation, neither block nor pass-through —
    # since reset --hard HEAD etc. has plenty of legitimate uses, it isn't
    # mechanically blocked but instead deferred to a human permission prompt
    # (Issue #58). Placed after the Blocking layer, so a benign command still
    # falls through to a silent exit 0 with no stdout, as before. Scoped to a
    # single segment (from an anchored git reset to the next shell
    # separator) just like push/branch, so a "reset --hard" mention inside a
    # -m message etc. isn't a false positive.
    local reset_segs
    reset_segs=$(echo "$bash_cmd" | grep -oE "${anchor}git[[:space:]]+reset[^;&|\`(]*")
    if [[ -n "$reset_segs" ]] \
        && echo "$reset_segs" | grep -qE '(^|[[:space:]])--hard([[:space:]]|$)'; then
        cat <<'JSON'
{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": "git reset --hard irreversibly discards uncommitted work (hitl-gate.md §2, irreversible operations). Please confirm whether it's OK to run."}}
JSON
        exit 0
    fi
    # ---- End of the Ask layer ----

    exit 0
}

main "$@"
