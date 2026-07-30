---
name: code-review
description: Independently review a diff or PR against this codebase's own conventions before it merges — correctness, security, and scope, not just "does it run" (adapted from a proven six-role review discipline, scaled to one session)
---

# /code-review

Review a change **as an independent reviewer would**, not as the person who wrote it. If you
wrote the change earlier in this same session, deliberately re-read it as if you hadn't — the
whole point of a review step is catching what the author's own reasoning already talked itself
past.

## How to proceed

1. Identify what's being reviewed: a `git diff`, a specific commit range, or a PR the user
   points you at. If nothing is specified, review the working tree's uncommitted changes
   (`git diff` / `git diff --staged`).
2. Read the **Scope Contract** the change should have declared (`.claude/rules/scope-contract.md`).
   If the diff touches files or concerns outside what the commit message or PR description
   claims, that's a finding on its own — flag it before anything else.
3. Review for, in this order:
   - **Correctness**: does the logic do what it claims to? Walk through at least one concrete
     input by hand rather than skimming.
   - **Security**: injection, auth bypass, secrets committed, unsafe dependency use.
   - **Test coverage**: does a real behavior change have a test that would fail without it?
     A diff that only adds code with no accompanying test for the new behavior is a finding.
   - **Convention fit**: does it match this repo's own established patterns (naming, error
     handling, the project's own `CLAUDE.md`/rules), not just "would this pass in a vacuum."
4. For each finding, write: what's wrong, exactly where (`file:line`), and a concrete input or
   scenario that shows the failure — a finding you can't demonstrate failing isn't a finding,
   it's a guess.
5. Give one overall verdict: **Approve**, or **Request changes** with the findings listed,
   most-severe first. Don't soften a real finding into a "nit" to avoid conflict, and don't
   invent a finding to seem thorough — say "no issues found" if that's genuinely true.

## Iron rules

- **Never rewrite the code yourself as part of a review.** A review's job is to find and
  report issues; fixing them is a separate step the author (or a follow-up session) does
  afterward, so the fix itself can be checked too.
- Money, contracts, or production-data-affecting changes still go through
  `.claude/rules/hitl-gate.md` regardless of what this review concludes — an Approve here is
  not a substitute for that gate.
- If you genuinely can't find the diff being asked about, say so — don't review a guess at
  what you think the change probably was.
