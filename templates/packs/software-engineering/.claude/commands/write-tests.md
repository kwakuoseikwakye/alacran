---
name: write-tests
description: Write tests for a specific behavior change — a diff, a just-finished feature, or a bug fix — using this repo's own existing test framework and conventions, never a generic one
---

# /write-tests

The companion to `/code-review`'s "does a real behavior change have a test" finding — this is
where that gap actually gets closed, for a change you or a teammate just made.

## How to proceed

1. Identify what's being tested: a diff (`git diff` / `git diff --staged`), a specific
   function or file the user names, or the most recent feature this session implemented. If
   genuinely ambiguous, ask rather than guessing.
2. Find this repo's actual test conventions before writing anything — never assume a framework:
   - Locate existing test files near the code being tested (same directory, or a parallel
     `tests/`/`__tests__/` tree) and read at least one to match its structure, naming, and
     assertion style.
   - Identify the real test runner and command from the repo's own config (`package.json`
     scripts, or whatever config file the detected framework uses) rather than guessing one.
3. Write tests for the actual behavior change, not the whole file:
   - The new or changed code path itself, exercised with a realistic input.
   - At least one edge case that would plausibly break it (empty input, a boundary value, an
     error path) — a single happy-path test that always passes isn't real coverage.
   - If this is a bug fix, a test that reproduces the original bug and fails without the fix is
     the single most valuable test you can write.
4. Run the suite (or the new tests specifically) and confirm they actually pass against the
   real, fixed code — a test you haven't run yourself is a guess, not a test.
5. Report which behavior each new test covers, in plain language, not just the test names.

## Notes

- Don't retrofit tests for unrelated existing code while you're in there — see
  `.claude/rules/scope-contract.md`. If you notice a real gap elsewhere, name it as a follow-up
  instead of folding it into this commit.
- Prefer testing behavior (what a function returns or does for a given input) over
  implementation detail (which internal helper it happened to call) — the latter breaks on a
  refactor that never actually changed behavior.
