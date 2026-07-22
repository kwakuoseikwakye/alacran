# AI-Native Control Panel — v6 Slice: Skill Edit History/Diff Viewer

## Status
Approved for implementation planning (2026-07-22).

## Problem

v4 shipped git-backed versioning for skill edits — every save is a real
commit — but explicitly deferred surfacing that history in the dashboard
("every edit is already a normal git commit, viewable via plain `git log`/
`git diff`/`git revert` outside the dashboard"). This closes that gap: a
read-only way to see past commits and diffs for a skill file, without
leaving the browser.

This is picked over the other backlog items because it needs no new trust
boundary (pure reads, reusing exactly the containment + membership checks
v4 already built) and no input only the user could supply (unlike the
reusable-template mechanism, which needs to know what the second company
actually is).

## Goals

- A "History" view alongside the existing "Content" (view/edit) view in
  `/skills`' detail Sheet, listing every commit that touched the selected
  file (date, message, short SHA).
- Clicking a commit shows a diff of what changed in it — reusing v4's
  existing `DiffView` component (fetch the file's content at that commit
  and at the previous one via `git show <sha>:<path>`, then diff those two
  strings client-side exactly like v4's editor already does, rather than
  parsing git's own raw diff output format).
- The oldest commit in the list diffs against an empty string (showing the
  whole file as newly added), since there's no earlier revision.
- **Consolidate a duplicated security check while here**: v4's
  `save-skill-content-impl.ts` has an inline "resolve path + confirm it's a
  current `getAllSkills()` member" check. This slice needs the identical
  check twice more (once for listing history, once for fetching a
  revision) — rather than a third and fourth copy, extract it once into a
  shared `resolveKnownSkillPath` and refactor `save-skill-content-impl.ts`
  to use it too, mirroring exactly how v4 itself extracted `path-guard.ts`
  from v1's `get-activity-detail.ts`.

## Non-goals

- No revert/checkout-to-a-past-version action — this is a viewer, not a
  write action. Reverting is already possible via plain `git revert`
  outside the dashboard if ever needed.
- No pagination/limiting of history — for the file sizes and edit
  frequency in play here, a full `git log` for one file is small.
- No changes to `git-commit-file.ts`'s write behavior or `save-skill-
  content-impl.ts`'s save behavior — the refactor in Goals only
  reorganizes where the existing check lives, it must not change what it
  does. `save-skill-content-impl.test.ts` (existing, unmodified) must keep
  passing exactly as-is, proving no behavior change — same discipline v4
  Task 1 applied to `get-activity-detail.test.ts`.
- No general git-log parser — the same lightweight, purpose-built parsing
  philosophy already used for frontmatter (v3) and JSON verify output (v5):
  handle the shapes this app's own commits actually produce, degrade
  gracefully rather than trying to handle arbitrary git history shapes.

## Architecture

```
lib/
├── resolve-known-skill.ts        # NEW: extracted from save-skill-content-impl.ts
├── resolve-known-skill.test.ts   # NEW
├── save-skill-content-impl.ts    # MODIFIED: delegates to resolve-known-skill.ts
├── skill-history-impl.ts         # NEW: getSkillHistoryImpl + getSkillRevisionImpl
├── skill-history-impl.test.ts    # NEW
└── skill-history.ts              # NEW: zero-extra-parameter action wrappers
components/
├── skill-history.tsx             # NEW: commit list + diff-on-click
└── skill-browser.tsx             # MODIFIED: adds a Content/History toggle
```

### `lib/resolve-known-skill.ts`

```
type ResolveKnownSkillResult =
  | { ok: true; realPath: string; agentRootPath: string }
  | { ok: false; reason: "outside-root" | "not-a-known-skill" }

async function resolveKnownSkillPath(filePath: string): Promise<ResolveKnownSkillResult>
```

Combines `path-guard.ts`'s symlink-safe containment check with the
"current `getAllSkills()` member" check, including the realpath
normalization on both sides (needed for the same macOS `/var` →
`/private/var` reason already documented in `save-skill-content-impl.ts`).
Returns which check failed (`reason`) so callers can produce their own
distinct, action-appropriate messages ("Refusing to **write**..." vs.
"Refusing to **read history for**...") without the shared function
dictating wording.

### `lib/skill-history-impl.ts`

```
type SkillCommit = { sha: string; date: string; message: string }
type SkillHistoryResult = { ok: boolean; commits: SkillCommit[]; message: string }
type SkillRevisionResult = { ok: boolean; content: string; message: string }

async function getSkillHistoryImpl(filePath: string, execFn?: ExecFileFn): Promise<SkillHistoryResult>
async function getSkillRevisionImpl(filePath: string, sha: string, execFn?: ExecFileFn): Promise<SkillRevisionResult>
```

Both call `resolveKnownSkillPath` first. `getSkillHistoryImpl` runs
`git -C <repoRoot> log --format=<delimited> -- <relativePath>` using
non-printable field/record separators (`\x1f`/`\x1e`, not `|` or tabs) so
that even an unusual future commit message can't corrupt parsing — a
concrete hardening beyond what v4's commit messages currently need, since
this reads history that could eventually include commits nobody control
led the message format of (e.g. a future user-typed-message feature).
`getSkillRevisionImpl` runs `git -C <repoRoot> show <sha>:<relativePath>`
to fetch the file's exact content at that commit. Reuses `ExecFileFn` from
`lib/git-commit-file.ts` rather than declaring a third duplicate of that
type.

`lib/skill-history.ts` (`"use server"`) exports zero-extra-parameter
`getSkillHistory(filePath)` / `getSkillRevision(filePath, sha)`, delegating
to the impl functions with no `execFn` exposed — same shape as every prior
action/impl split in this codebase.

## UI

`SkillHistory` (client component): on mount, calls `getSkillHistory`,
shows a list of commits (newest first). Clicking one fetches that commit's
content and the next-older commit's content (or `""` if it's the oldest)
via `getSkillRevision`, then renders `DiffView` with those two strings —
reusing v4's diff-rendering component unchanged.

`SkillBrowser`'s Sheet gains a small Content/History toggle above the
existing scroll area; `SkillEditor` (v4, unmodified) renders under
"Content", `SkillHistory` renders under "History". Switching entries
(closing and reopening the Sheet) resets back to "Content".

## Error handling

- Same house style throughout: every failure degrades to `{ok: false, ...}`
  (or the equivalent) with a message, never an unhandled rejection.
- A file with no history yet (e.g. never edited since the repo's initial
  commit swept it in, or — theoretically — one that predates any commit at
  all) returns `{ok: true, commits: []}`, not an error; the UI shows "No
  commit history for this file yet."
- A `git show <sha>:<path>` failure (e.g. a stale/invalid SHA, unlikely
  given SHAs only ever come from this feature's own history list) surfaces
  its message rather than crashing the diff view.

## Testing

- `resolve-known-skill.test.ts`: the same three outcomes already proven
  inline in `save-skill-content-impl.test.ts` (known skill resolves
  correctly with realpath'd values, outside-root, not-a-known-skill), now
  tested at the shared-module level.
- `save-skill-content-impl.test.ts`: run UNCHANGED after the refactor —
  proves the consolidation didn't alter save behavior, exactly like v4
  Task 1's regression check on `get-activity-detail.test.ts`.
- `skill-history-impl.test.ts`: injected fake `execFn` covering — history:
  parses a two-commit log correctly, returns `[]` gracefully with no
  history, outside-root rejection, not-a-known-skill rejection, a failing
  `git log` call; revision: returns content on success, not-a-known-skill
  rejection, a failing `git show` call (e.g. bad SHA).
- Manual verification: use `ai-company-starter-main`'s `stock-note.md` —
  v4's own live-test left it with exactly two real commits (append an
  inert line, then remove it). Confirm the History view shows both commits
  with the right messages, confirm selecting the newer commit shows a
  diff removing that line and selecting the older commit shows a diff
  adding it, and confirm the total net change across both matches what v4
  already proved (empty).

## Open items for v7+ (explicitly deferred, not decided here)

- Reverting to a past revision from the dashboard.
- Spawning real Claude Code sessions for `ai-company-starter-main`'s other
  9 slash-commands.
- Triggering `plh-ops`'s daily-team-log on demand.
- Live log streaming.
- Reusable template mechanism for a second "AI company."
- Higgsfield avatars.
- User-typed commit messages for skill edits.
- The UI/visual design pass (deferred at the user's request).
