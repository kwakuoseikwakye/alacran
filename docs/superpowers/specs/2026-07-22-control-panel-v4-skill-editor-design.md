# AI-Native Control Panel — v4 Slice: Skill/Command Editor with Git-Backed Versioning

## Status
Approved for implementation planning (2026-07-22).

## Problem

v3 shipped a read-only skill/command browser. Editing/versioning skill
content was the second of the user's three original goals (control panel,
skill management, reusable template) and the first item on v3's own
deferred list. This spec covers editing content directly from the
dashboard, with versioning provided by each agent's own pre-existing git
repository rather than a bespoke history system — confirmed all three agent
roots (`ai-company-starter-main`, `plh-takeshi-agent`, `plh-ops`) are
themselves git repo roots.

## Goals

- An "Edit" toggle in `/skills`' existing detail panel that swaps the
  read-only content view for an editable textarea.
- "Save" shows a confirmation dialog with a real line-level diff (added/
  removed lines) between the current and edited content before anything is
  written.
- On confirm: write the file, then `git add`/`git commit` **scoped to only
  that one file** in its owning agent's repo — never a broad `git add -A`,
  since `plh-ops`'s working tree already has unrelated untracked files
  sitting in it that must never be swept into an edit commit.
- Versioning is "free" — every edit is a normal git commit in a repo that
  already exists, viewable/revertable with plain `git log`/`git diff`/
  `git revert` from the terminal. No new history UI in this slice.
- The write path is restricted to files that are **currently members of the
  live `getAllSkills()` result** — not just "any file inside an agent
  root." This is a deliberately tighter boundary than v1/v2's file-read
  precedent: a crafted request must not be able to overwrite e.g.
  `bin/poll.sh` just because it lives inside a configured agent root: only
  an actual skill/command file the UI would legitimately show as editable.

## Non-goals

- No version-history or diff-browsing UI (viewing past commits) — deferred;
  git itself already provides this outside the dashboard.
- No user-typed commit messages — the commit message is auto-generated
  (`Edit <fileName> via AI-Native control panel`). Custom messages are a
  cheap future addition, not needed for this slice.
- No merge-conflict handling, no rebasing, no branch creation — a save is a
  single `add`+`commit` against the current branch as-is. If that fails
  (e.g. genuinely un-committable state), the error surfaces to the user;
  nothing here attempts to resolve it automatically.
- No editing of `ai-company-starter-main`'s non-skill files (`docs/`,
  `definitions/`, etc.) or any other file outside the current skill/command
  set — scope is exactly what v3 already lists, nothing broader.
- No real-time collaborative editing / conflict detection between two
  browser tabs editing the same file — this is a local single-user tool.

## Architecture

```
lib/
├── path-guard.ts              # NEW: extracted from get-activity-detail.ts
├── get-activity-detail.ts     # MODIFIED: delegates to path-guard.ts (behavior unchanged)
├── git-commit-file.ts         # NEW: commitFile(repoRoot, relativePath, message, execFn?)
├── save-skill-content.ts      # NEW: zero-drift "use server" action (filePath, newContent) => result
└── save-skill-content-impl.ts # NEW: injectable impl (execFn for git) the action delegates to
components/
├── ui/textarea.tsx            # NEW: shadcn CLI
├── diff-view.tsx              # NEW: renders a `diff` package Change[] with add/remove styling
└── skill-editor.tsx           # NEW: edit toggle + textarea + confirm-with-diff + save
components/skill-browser.tsx   # MODIFIED: renders SkillEditor instead of a bare <pre> in the Sheet
```

### `lib/path-guard.ts`

Extracts the exact symlink-safe containment logic already proven in v1's
`getActivityDetail` (added after an automated security scan caught a
`path.resolve`-only version) into a shared, reusable function:

```
type PathGuardResult = { realPath: string; agentRootPath: string } | null
async function resolveWithinAgentRoot(requestedPath: string): Promise<PathGuardResult>
```

Returns `null` if the path can't be resolved (`fs.realpath` failure — ENOENT
or otherwise) or doesn't fall under any configured agent's (also
realpath'd) root. Returns which agent root matched, so the caller knows
which repo to commit into. `get-activity-detail.ts` is refactored to call
this and preserve its existing behavior/error message exactly — its
existing tests (in-bounds read, out-of-bounds rejection, symlink-escape
rejection) must all still pass unchanged after the refactor.

### `lib/git-commit-file.ts`

```
type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>
async function commitFile(repoRoot: string, relativePath: string, message: string, execFn?: ExecFileFn): Promise<void>
```

Runs exactly two commands: `git -C <repoRoot> add -- <relativePath>` then
`git -C <repoRoot> commit -m <message> -- <relativePath>`. The `-- <path>`
pathspec on `commit` is a second layer of scoping beyond the `add` — even
if something else were staged in that repo for any reason, the commit only
captures changes to this one file. Throws on any git failure (e.g. nothing
to commit); the caller translates that into a user-facing message. Follows
the same real-default/injectable-fake pattern as `lib/adapters/launchd.ts`'s
`ExecFn`.

### `lib/save-skill-content-impl.ts` / `lib/save-skill-content.ts`

```
async function saveSkillContentImpl(filePath: string, newContent: string, execFn?: ExecFileFn): Promise<{ saved: boolean; message: string }>
```

1. Resolve `filePath` via `path-guard.ts`; reject if not within any agent
   root.
2. **Membership check**: call `getAllSkills(AGENTS, SKILL_ADAPTERS)` (from
   v3) and confirm the resolved real path matches one of the returned
   entries' `path` — reject otherwise, even though it passed step 1. This
   is what prevents writing to a non-skill file that merely happens to live
   inside an agent root.
3. Read the current file content; if it's identical to `newContent`,
   return `{ saved: false, message: "No changes to save" }` without
   touching git (a `git commit` with literally nothing to commit is a
   spurious failure state worth heading off).
4. Write the new content, then call `commitFile` with a message of
   `Edit <fileName> via AI-Native control panel`.
5. Any failure at any step returns `{ saved: false, message: <cause> }`
   rather than throwing past the function boundary — matching this
   project's established house style.

`lib/save-skill-content.ts` (`"use server"`) exports
`saveSkillContent(filePath: string, newContent: string): Promise<{saved, message}>`
— it forwards exactly these two client-supplied values to the impl and
**never exposes `execFn`** on the public action, the same lesson v2 learned
the hard way (there, the injectable seam was an unused *test-only*
parameter on a zero-arg action; here, `filePath`/`newContent` are
genuinely necessary real inputs the client must supply — the security
boundary is enforced by validation in steps 1-2 above, not by having no
parameters at all. These are different but equally sound shapes; a
reviewer should not demand this action take zero parameters, since unlike
v2's `spawnFn` there is no injectable-only value smuggled onto the action
boundary here).

## UI

`SkillEditor` (client component), replacing the bare `<pre>{detail}</pre>`
inside `/skills`' existing Sheet:
- Read mode (default): shows content, an "Edit" button.
- Edit mode: a `Textarea` pre-filled with current content, "Save"
  (disabled if unchanged) and "Cancel" buttons.
- Clicking "Save" opens an `AlertDialog` showing `DiffView` (old vs new,
  computed via the `diff` package's `diffLines`) and a "Confirm & commit" /
  "Cancel" pair.
- On confirm: calls `saveSkillContent`. Success closes edit mode and shows
  the new content as the new baseline; failure shows the message inline
  and keeps the edit open so the user's draft isn't lost.

`DiffView`: renders `diffLines(oldText, newText)`'s `Change[]` — each part
styled by `added`/`removed`, unchanged parts styled plainly.

## Error handling

- `path-guard.ts`'s containment check is unchanged behavior from v1 —
  ENOENT or outside-root both mean "reject."
- The membership check (`getAllSkills` inclusion) has its own explicit
  rejection message, distinct from the path-containment rejection, so a
  developer debugging this later can tell which layer rejected a request.
- `commitFile` failures (e.g. git not installed, permission error, nothing
  to commit reaching that layer some other way) surface as the returned
  `message`, never an unhandled rejection.
- A failed save never loses the user's in-progress edit — the textarea
  retains the draft; only a successful save clears edit mode.

## Testing

- `path-guard.test.ts`: in-bounds resolution, out-of-bounds rejection,
  symlink-escape rejection (mirrors the three cases already proven in v1's
  `get-activity-detail.test.ts`, now at the shared-module level).
- `get-activity-detail.test.ts`: updated to confirm it still behaves
  identically after delegating to `path-guard.ts` — same tests, same
  assertions, proving the refactor didn't change behavior.
- `git-commit-file.test.ts`: injected fake `execFn`, asserts `add` runs
  before `commit`, asserts the exact args (`-C`, `--` pathspec), asserts a
  fake-thrown error propagates.
- `save-skill-content-impl.test.ts`: temp-dir fixtures (a fake agent root
  registered via `vi.doMock("./config", ...)`, matching the pattern already
  used in `get-activity-detail.test.ts`), fake `execFn` (no real git calls
  in tests) covering: happy path, path outside any agent root, path inside
  an agent root but not a real skill entry (the membership-check gap this
  spec specifically closes), unchanged content (no-op), and a
  `commitFile` failure surfacing as `saved: false`.
- Manual verification: edit a real (low-stakes) skill/command file's
  content in the browser, confirm the diff preview shows the actual
  change, confirm after saving that `git log`/`git show` in that agent's
  real repo shows exactly one new commit touching exactly that one file,
  and that any other pre-existing untracked files in that repo (e.g.
  `plh-ops`'s stray reports) were not touched or included.

## Open items for v5+ (explicitly deferred, not decided here)

- Version-history/diff-browsing UI.
- User-typed commit messages.
- Triggering `ai-company-starter-main`'s slash-commands.
- Triggering `plh-ops`'s daily-team-log on demand.
- Live log streaming.
- Reusable template mechanism for a second "AI company."
- Optional Higgsfield-generated agent avatars.
