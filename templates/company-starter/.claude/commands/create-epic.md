---
name: create-epic
description: File an Epic Issue, break it into 3-6 child Issues, and register them on GitHub (Phase 2: Planning)
---

# /create-epic

Following the Issue-First principle (`.claude/rules/issue-first.md`), file an Epic Issue and child Issues on GitHub.

## First-time setup (preparing labels)

Right after creating a repository with "Use this template", the `type:epic` / `type:child` / `phase:planning`
labels that existed in the source template have not been copied (GitHub's Template feature does not carry
labels over to the destination). Check they exist and create them, once, before filing.

```bash
gh label list
```

Create any label missing from that output:

```bash
gh label create "type:epic" --color 5319E7 --description "Epic Issue (parent)"
gh label create "type:child" --color 1D76DB --description "Child Issue under an Epic"
gh label create "phase:planning" --color 0E8A16 --description "Filed in Phase 2 (Planning)"
```

> **Note**: if you file while a label doesn't exist, the behaviour differs by mechanism.
> The `gh` CLI fails with an error and the filing itself fails, but via the GitHub API or via MCP a
> non-existent label is **silently auto-created with no colour or description**. With either mechanism,
> confirm the labels exist with `gh label list` before filing.

## How to proceed

1. Ask the user the following (in order, not all at once):
   - **What is the goal of the Epic?** (in 1-2 sentences: what will be different when it's done)
   - **What subtasks does it break into naturally?** (aim for 3-6. If there are too many, suggest breaking it down further)
2. Check whether a related Issue already exists:
   ```bash
   gh issue list --search "<keyword>" --state all
   ```
   If there is a similar Issue, avoid filing a duplicate and check with the user.
3. Create the Epic Issue:
   ```bash
   gh issue create \
     --title "Epic: <goal>" \
     --label "type:epic,phase:planning" \
     --body "$(cat <<'EOF'
   ## Goal
   <the user's answer>

   ## Child Issues
   - [ ] #<child issue number 1> <title>
   - [ ] #<child issue number 2> <title>
   ...

   ## Completion criteria
   Close the Epic once all child Issues are closed.
   EOF
   )"
   ```
4. Create the child Issues one at a time, referencing the Epic number in the body:
   ```bash
   gh issue create \
     --title "<child task name>" \
     --label "type:child,phase:planning" \
     --body "Epic: #<Epic number>"
   ```
   Note down each child Issue number from the end of the command's output (the Issue URL) as you go.
5. Using the child Issue numbers you noted, update the Epic Issue body to a checklist (with the real Issue numbers):
   ```bash
   gh issue edit <Epic number> --body "..."
   ```
6. Present the list of created Issues (the numbers and titles of the Epic and its children) to the user.

## Label conventions

| Label | Purpose |
|--------|------|
| `type:epic` | Applied to an Epic Issue |
| `type:child` | Applied to a child Issue |
| `phase:planning` | Indicates the Issue was filed in Phase 2 (Planning) |

## Environments where the gh CLI is unavailable

In environments where the `gh` CLI is unavailable, such as Claude Code on the web, you may file the equivalent
Epic Issue / child Issues using GitHub MCP tools or the GitHub web UI. The note under "First-time setup
(preparing labels)" above still applies — filing via MCP silently auto-creates non-existent labels, so confirm
the labels exist beforehand via the label list (Issues > Labels in the web UI, or an MCP label-fetching tool).

## Issue-First reminders

- Minor work such as a simple typo or config change doesn't need Epic decomposition. If a single normal Issue
  is enough, don't turn it into an Epic — tell the user so.
- Always include the corresponding child Issue number in the Epic's branches, commits and PRs
  (`fix/12-description` / `fix(scope): description (#12)` / `Resolves #12` in the PR).
- Confirm an Issue exists before starting work. If there isn't one, file it with this command first.
