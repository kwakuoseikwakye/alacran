# Scope Contract Rule

A pre-work contract rule that prevents scope inflation (the accident where a small task balloons).
The minimum discipline needed to structurally prevent "I meant to make a small fix and somehow ended up rebuilding half of it".

## 0. Principle

> "The diff you didn't write is safer than the diff you did."

- Five seconds of self-questioning before you start prevents most scope inflation
- Commit = 1 concern. The moment two concerns are mixed in, the contract is broken
- The urge to "fix this while I'm here" must **always** be isolated into a separate commit / separate Issue
- Keep cosmetic appeal (a tidy refactor, collapsing something into a one-liner) independent of scope judgement

## 1. Scope Statement before starting (mandatory)

Before calling the Edit / Write tools, state the following two things explicitly:

| Item | Content |
|---|---|
| **CHANGE** | What you will change (filename:line range / function name / what you're adding) |
| **NOT CHANGE** | What you will not touch (other functions in the same file / surrounding refactors / formatting / type changes) |

Drafting the commit message **before you start** achieves this naturally.
Do not include in the commit anything you didn't write down.

### Example (a good scope statement)

```
CHANGE: inside the HYGIENE-01 check function in scripts/verify.py,
        add logic to detect TODO(temp) markers older than 30 days via git blame
NOT CHANGE: the other RQT check functions
            the internal implementation of the Report class
            the structure of CLI argument parsing
DIFF BUDGET: within 60 lines
```

### Example (a bad scope statement)

```
Improve verify.py
```
-> The verb "improve" has no upper bound. No NOT CHANGE is written. No budget.

## 2. Discovery-first: estimate using standard tools

Before writing the scope statement, run the following and then estimate:

| Step | Tool | Purpose | How to use the result |
|---|---|---|---|
| 1 | `Grep "<keyword>"` | Find where the concept is already used | Match the existing pattern |
| 2 | `Glob "**/<name>*"` | Locate related files | Settle the list of files to touch |
| 3 | `Read <target file>` | Understand the whole context of the target file | Grasp the blast radius and dependencies |
| 4 | `Grep -r "<symbol>" .` | Enumerate callers of the symbol (quick impact analysis) | Check where the change propagates |

Skipping these 4 steps and going straight to Edit makes scope inflation likely.
In particular, when changing a function or variable referenced from other files, check the callers with the
Step 4 grep before starting.

## 3. Diff Size Budget

Target diffs and rough thresholds by category:

| Category | Target | Warning | Consider splitting | Notes |
|---|---|---|---|---|
| Security / adding a hook | <= 30 lines | 50 lines | 100 lines | The strictest |
| Bug fix | <= 50 lines | 100 lines | 200 lines | Count added tests as a separate category |
| Feature (single concern) | <= 150 lines | 300 lines | 500 lines | One function or one component |
| Refactor | Independent commit | — | — | Don't mix with other categories |
| Doc / rule addition | <= 300 lines | 500 lines | 1000 lines | Body text may be large |

### What to do when you exceed the budget

1. **Stop for a moment** and check `git diff --stat`
2. Break the line count down:
   - How many lines are genuinely necessary?
   - How many lines crept in "while I was there"?
3. Decide:
   - **Signs of scope inflation** -> revert part of it and rebuild a minimal version
   - **Legitimate complexity** -> break the Issue into multiple child Issues / multiple commits
   - **There is a reasonable case for keeping it in one commit** -> state that reason in the commit message and proceed

## 4. Prohibited (scope contract violations)

| Prohibited | Why | Instead |
|---|---|---|
| Mixing an unrelated refactor into a bugfix commit | Regressions get hidden and the reviewer can't tell them apart | Separate commit / separate Issue |
| Mixing formatting compression with a feature addition | The whole diff becomes hard to review | Formatting changes as an independent commit |
| Tidying up existing code "while you're there" | Changes not in the scope statement slip in | Note what bothered you in a comment or an Issue and deal with it in a separate session |
| Cramming 3 or more concerns into one commit | Atomicity is lost and reverting becomes difficult | Maintain the 1 commit = 1 concern principle |
| Firing off Edits without writing CHANGE / NOT CHANGE | You end up touching unrelated files without noticing | Always run the 5-second check (§6) before starting |

## 5. Bypass (handling exceptions)

If there is a legitimate reason to exceed the budget, you may proceed as long as you state the reason in the
commit message. Bypassing silently is treated as a scope contract violation.

```
feat(verify): add HYGIENE-01 git-blame based stale TODO detection

Exceeded the 60-line budget (95 lines measured). Reason: parsing git blame's
porcelain output was more involved than expected. The logic is closed over a
single concern.
```

## 6. Quick Reference (the 5-second check before you start)

Before calling Edit / Write, check that you can answer these 5 questions immediately:

1. ✅ **What are you changing?** (can you say it in one line?)
2. ✅ **What are you not touching?** (do you have a NOT CHANGE list?)
3. ✅ **Have you checked existing patterns with Grep / Glob?**
4. ✅ **Have you checked the impact on callers?** (if you're editing a symbol)
5. ✅ **Which category is the expected diff size in?**

Do not call Edit while you cannot answer all 5 immediately.

---

*company-starter — Scope Contract Rule*
