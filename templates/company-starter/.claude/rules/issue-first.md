# The Issue-First principle

> "Everything starts with an Issue. Labels define the state."

All work starts from a GitHub Issue. Labels define the state.
Apply this rule before entering implementation work (Phase 3: Execution).

## 1. Deciding whether an Issue is needed

| Kind of work | Issue requirement |
|-----------|-----------|
| Simple change (1 file, a config change, a typo fix) | Recommended (may be omitted) |
| Normal change (spanning multiple files) | Required |
| Composite task (3 or more steps, or spanning multiple days) | Epic Issue required + break into child Issues |
| Changes involving money, contracts or irreversible operations | Required + also check the triggers in `.claude/rules/hitl-gate.md` |

When in doubt, err towards "required". The cost of a few minutes writing an Issue is lower than the cost of
not being able to trace the reasoning later.

## 2. Check for existing Issues before you start

Before filing a new Issue, check for duplicates.

```bash
gh issue list --search "<keyword>" --state all
gh issue list --label "type:epic" --state open
```

If you find a similar Issue, consider adding a comment or reopening the existing Issue rather than filing a new one.

## 3. Filing when there is no Issue

For a composite task, use the `/create-epic` command to file an Epic Issue and break it into child Issues.
For a one-off piece of work, you may file directly with `gh issue create`:

```bash
gh issue create \
  --title "<concise title>" \
  --label "type:child,phase:planning" \
  --body "<background and completion criteria>"
```

## 4. Branch naming conventions

Always include the Issue number in the branch name.

| Kind | Naming pattern | Example |
|------|-------------|-----|
| Feature | `feat/<Issue number>-<short description>` | `feat/12-add-retro-template` |
| Bug fix | `fix/<Issue number>-<short description>` | `fix/15-verify-py-typo` |

Keep `<short description>` to alphanumerics and hyphens only, around 3-5 words.

## 5. Commit message conventions

The Conventional Commits format plus an Issue number reference is mandatory.

```
<type>(<scope>): <description> (#<Issue number>)
```

| type | Use |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation-only change |
| `refactor` | Code tidying that doesn't change behaviour |
| `chore` | Build, configuration or dependency changes |

Example:

```
fix(verify): improve the parse error message for ontology yaml (#15)
```

After `git commit` runs, the PostToolUse hook `.claude/hooks/commit-msg-advisor.sh` inspects the message
actually committed via `git log -1` and delivers advisory feedback to the agent through additionalContext on
whether it follows the Conventional Commits format and includes an Issue reference (`#N`) (Issue #41).
If it flags something, fix it with `git commit --amend` or similar.

## 6. Requirements for the PR body

A PR must always include a reference to its corresponding Issue.

```markdown
## Summary
<summary of the change>

## Related
Resolves #<Issue number>
```

A PR resolving a child Issue under an Epic should put the **child Issue number** in `Resolves`, not the Epic itself.
An Epic is considered complete automatically once all its child Issues are closed.

## 7. What to do when you've broken this rule

If you started implementing first and only later realised you hadn't filed an Issue:

1. Don't stop the work — file the Issue first (filing after the fact is fine)
2. State plainly in the Issue body that the implementation preceded the Issue (don't hide it)
3. Reference the Issue number in later commits and the PR as usual
4. Leave a line in "Blockers" or "Done today" in `/handoff` about how you departed from Issue-First

The purpose of Issue-First is less "creating it first" in itself than "keeping the reasoning traceable".
Prioritise leaving a record, even after the fact.

## 7.5. Offline fallback (when gh or the network is unavailable)

In environments where the `gh` command or the network is unavailable (offline exercises, network-restricted
environments, etc.), you can't file an Issue on the spot. Don't stop working; take these steps instead.

1. Proceed on the assumption you'll file afterwards (the same thinking as §7)
2. Leave a line in the commit message noting that an Issue is pending (e.g.
   `fix(scope): description (issue pending)`)
3. At the end of the session, state plainly in "Blockers" in `/handoff`'s `HANDOFF.md` that no Issue has been
   filed and what you intend to file
4. As soon as connectivity returns, file the Issue in the next session without fail and add the relevant commit
   hashes to the Issue body as an after-the-fact reference

## 8. Anti-patterns

| Anti-pattern | Why |
|----------------|------|
| Committing a change spanning multiple files with no Issue | The reason for the change becomes untraceable |
| Mixing multiple unrelated changes into one Issue | Review becomes difficult, and reverting takes innocent changes with it |
| Attaching implementation commits directly to the Epic Issue itself | The point of breaking it into child Issues is lost |
| Leaving an Issue sitting with no labels | The state can't be read, making a stock-take impossible |

---

*ai-retreat-starter — the Issue-First principle*
