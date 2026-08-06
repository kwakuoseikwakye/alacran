---
name: verify
description: Run scripts/verify.py, interpret PASS/WARN/FAIL/INFO, and propose fixes (Phase 4: Verification)
---

# /verify

Run `scripts/verify.py`, read the results, and summarise them for the user. **Follow the no-fake-green
principle: do not hide a FAIL, and do not try to make it pass by weakening the verification logic.**

## How to proceed

1. Check that `scripts/verify.py` exists. If it doesn't, say "Phase B-3 setup is not complete.
   `scripts/verify.py` does not exist in this repository yet" and do not speculate further
   (do not guess at the contents of a file that doesn't exist, or at which RQTs are missing).
2. If it exists, run:
   ```bash
   python3 scripts/verify.py
   ```
3. Read the output and summarise it, tallying `PASS` / `WARN` / `FAIL` / `INFO` / `SKIP` per `RQT ID`.
4. If the exit code is non-zero (i.e. at least one FAIL), present the cause and the fix for each failing RQT.

## What each output status means

| Status          | Meaning                              | What to do                                      |
| --------------- | ------------------------------------ | ----------------------------------------------- |
| `PASS`          | Check cleared                        | Nothing to do                                    |
| `WARN`          | Works, but not in a desirable state  | Fix it if you have capacity                      |
| `FAIL`          | The check is not satisfied           | Must be fixed. No fake green — don't dodge it by weakening the check |
| `INFO` / `SKIP` | Target doesn't exist yet, or optional | Room to grow the template. No immediate action needed |

## Common FAIL categories and how to fix them

- **`STRUCTURE-*` FAIL** (`LICENSE.md` / `CLAUDE.md` / `README.md` / `.gitignore` missing, or
  `.gitignore` doesn't block `secrets/` and `.env`)
  → Check whether the file exists at the repo root and restore it if not. `.gitignore` must include
  both `secrets/` and `.env`.
- **`HYGIENE-01` FAIL** (a `TODO(temp)` marker left for 30 days or more)
  → Locate it with Grep and either finish the implementation and remove the `TODO(temp)`, or rewrite it as a permanent TODO.
- **`ONTOLOGY-01` FAIL** (syntax error in `definitions/ontology/*.yaml`)
  → Check the yaml file and line indicated by the error message and fix broken indentation or a missing colon.
- **`HITL-01` FAIL** (`.claude/rules/hitl-gate.md` exists but has no trigger table)
  → Add the trigger table as a Markdown table (`|` separators plus a `---` separator row).
- **`HARNESS-01`/`HARNESS-02` FAIL** (a hook in `.claude/settings.json` doesn't exist, isn't executable,
  has no shebang, or exits non-zero when run against sample input)
  → Check the path of the hook script and either grant execute permission with `chmod +x` or add `#!` on line 1.
  If the smoke test failed, review that hook's stdin JSON input contract (see Issue #26).
- **`META-01`/`META-02` WARN** (the Issue-reference rate or Conventional Commits compliance rate of recent
  commits is below the 80% threshold)
  → `META` is the first meta-KPI measuring adherence to Issue-First (`.claude/rules/issue-first.md` §5),
  and is treated as WARN (non-blocking) rather than FAIL. Past commits can't be rewritten, so recover the
  rate going forward by including a `#<Issue number>` reference in later commits — or leaving
  `issue pending` when offline — and by bringing subject lines into the Conventional Commits
  `type(scope): description` format.
- **`META-03` WARN** (more than 30% of recent commits are "large changes" with a diff size over 500 lines)
  → A meta-KPI measuring adherence to the `Scope Contract` (the diff budget in
  `.claude/rules/scope-contract.md` §3); this is also WARN, not FAIL (non-blocking). Past commits can't be
  rewritten, so recover the ratio going forward by splitting large changes into child Issues / multiple
  commits (scope-contract.md §3 "What to do when you exceed the budget"). If genuine complexity justifies
  keeping it in one commit, you may proceed as long as you state the reason in the commit message (§5 Bypass).
- **How to fix `CONTEXT-01` FAIL** (resident context budget exceeded, or a broken `@` import)
  → Slim down the body of CLAUDE.md and push the details out into `docs/`. Delegate tree diagrams and
  mapping tables to directory-map.md and similar. For a broken import, fix the path.

## Notes

- Rewriting `scripts/verify.py` itself "to make it pass" is forbidden (the no-fake-green principle, `CLAUDE.md` §2.5).
  What you fix is the implementation or configuration being verified.
- If the user wants to add their own RQT, guide them to add a `verify_*()` function to `scripts/verify.py`
  and to also add it to the call list in `main()`.
- Do not speculatively fill in explanations about RQT categories that don't exist or checks that aren't
  implemented, when the user hasn't even asked. If it isn't in the output, say plainly that it isn't there.
