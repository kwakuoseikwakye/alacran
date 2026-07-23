# AI-Native Control Panel — v8 Slice: Run `ai-company-starter-main` Commands

## Status
Approved for implementation planning (2026-07-23). Written and scoped
autonomously per standing delegation ("choose the next one, write a spec,
let subagents implement").

## Problem

v5 shipped a "Run verify" button because `/verify` turned out to be a thin
wrapper around a read-only script (`scripts/verify.py`). The other 9
commands in `ai-company-starter-main/.claude/commands/` were deferred on
the assumption they were "genuinely interactive multi-turn dialogues."
Research for this slice (reading all 9 command specs plus checking the
`claude` CLI's headless flags and `plh-takeshi-agent`'s existing
`bin/process.sh` invocation pattern, the only real precedent in this
codebase for triggering a headless Claude Code session) shows that
assumption is only partly true — and, more importantly, the commands
split into three risk tiers that need three different treatments:

1. **Safely single-shot, local-file-only** (`decision`, `retro`, `digest`,
   `define-company`, `handoff`) — each writes to one predictable location,
   none call `gh` to mutate GitHub, and two (`define-company`, `handoff`)
   already say in their own spec "ask the user before committing" — which
   in a headless run with nobody to ask simply means "don't commit,"
   self-limiting exactly the way this slice needs. **These 5 are this
   slice's scope.**
2. **Real external side effects with no re-confirmation gate**
   (`create-epic`) — files real GitHub issues via `gh issue create`
   directly once the two upfront questions are answered, with no further
   "are you sure" step before hitting the GitHub API. Filing public issues
   unattended, one click, no per-issue review, is the kind of
   shared-state-affecting action this project always gates behind an
   explicit confirmation — and there's no way to preview "which issues
   will be created" before an LLM decides at runtime. **Excluded**, not
   because it's technically incapable of running headless, but because a
   one-click dispatcher for real GitHub writes needs a design this slice
   doesn't attempt yet.
3. **Hard interactive gates or different lifecycle** (`ingest-context`,
   `office`) — `ingest-context` hard-stops on secret detection and shelf
   ambiguity, neither answerable in advance; `office` starts a persistent
   background HTTP server and installs a Node hook, a start/stop/status
   lifecycle unlike "run once, produce a file, exit." **Excluded**,
   deferred to a future slice if ever needed.

## Goals

- A "Run" action, reachable from `/skills`' existing detail panel, for
  exactly the 5 in-scope commands: `decision`, `retro`, `digest`,
  `define-company`, `handoff`.
- A small per-command field form (the exact questions each command's own
  spec says to ask the user), submitted together instead of turn-by-turn
  — matching how `/verify` and `/run poll` are already single-click, not
  conversational.
- Spawns a real, headless `claude -p` session in `ai-company-starter-main`,
  scoped as tightly as the CLI allows: **no Bash tool at all**, file-editing
  confined via a path-scoped `Edit(<pattern>)` permission rule (never a bare
  `Write` grant — see the Spawning section below for why) to only that
  command's expected output location. The agent can read/grep/glob anywhere
  in the repo (already true of every existing read path in this app) and
  write to one place; it cannot run shell commands, cannot `git add`/`git
  commit`, cannot call `gh`, cannot touch any other repo.
- After the run, the control panel — not the spawned agent — detects
  what changed (new file in the command's output directory, or a content
  change to a known fixed file) and shows the SAME confirm-with-diff
  dialog pattern already used everywhere else in this app (`DiffView`),
  before committing anything via the existing single-file-scoped
  `git-commit-file.ts` helper. If nothing changed, say so plainly.
- Async execution with a simple running/not-running poll (mirroring v2's
  lock-file pattern), since these can take tens of seconds to a couple of
  minutes — not a synchronous await like v5's `/verify`.

## Non-goals

- `create-epic`, `ingest-context`, `office` are not built this slice (see
  Problem section for why each is excluded).
- No live streaming of the agent's in-progress output — the UI shows
  "Running…" while the lock is held and the final result once it releases,
  exactly like v2. Real live log tailing is backlog item v10's job and
  should be layered on top of this slice's lock/log-file mechanism, not
  duplicated here.
- No automatic commit. The spawned agent cannot commit (no Bash); the
  control panel does not auto-commit either — the user always sees a
  diff and confirms, same discipline as v4/v7.
- No concurrent runs. A single global lock serializes all 5 commands (and
  is independent of `plh-takeshi-agent`'s unrelated `poll.lock`) — running
  two commands whose file-change detection windows overlap would make the
  before/after diff ambiguous, and nothing today needs true concurrency.
- No changes to the command `.md` files themselves — the prompts sent to
  `claude -p` are built by this slice's own templates (mirroring the
  wording of each command's spec), not by feeding the command file to the
  agent as a slash-command invocation. (Slash-commands only resolve
  inside an interactive Claude Code session's own command-completion
  system; a `-p` one-shot prompt is just a string, so the prompt template
  restates each command's essential instructions directly.)

## Architecture

```
lib/company-commands/
├── types.ts               # CompanyCommand, CompanyCommandField types
├── registry.ts            # the 5 command definitions (see below)
├── run-lock.ts            # single global lock, mirrors adapters/poll-lock.ts
├── run-company-command.ts       # "use server" — zero extra params
├── run-company-command-impl.ts  # spawn logic, SpawnFn-injectable
├── company-command-status.ts    # "use server" — poll running/idle
└── company-command-result.ts    # "use server" — diff detection after a run
components/
├── company-command-runner.tsx   # form + confirm-with-diff, new "Run" tab
```

### Registry (`lib/company-commands/registry.ts`)

Each entry:
```ts
type CompanyCommandField = {
  key: string
  label: string
  required: boolean
  multiline: boolean
}

type CompanyCommand = {
  id: string                    // "decision" | "retro" | "digest" | "define-company" | "handoff"
  commandFileName: string       // "decision.md" etc — used to match the SkillEntry
  label: string                 // "Record a decision (RFC)"
  fields: CompanyCommandField[]
  outputKind: "new-file-in-dir" | "known-file"
  outputPath: string            // relative to repo root: "docs/decisions" or "HANDOFF.md"
  buildPrompt: (fieldValues: Record<string, string>, today: string, prefetch: string) => string
  needsPrefetch: boolean        // only true for "handoff"
}
```

Field lists (the exact questions each command's spec already asks, so the
generated content matches what a human answering interactively would
produce):

| id | fields | outputKind / outputPath |
|---|---|---|
| `digest` | `period` (optional, single-line, "e.g. last 7 days") | new-file-in-dir / `notes/company/digests` |
| `decision` | `context`, `decision`, `rationale`, `alternatives`, `consequences` (all required, multiline) | new-file-in-dir / `docs/decisions` |
| `retro` | `keep`, `problem`, `try` (all required, multiline) | new-file-in-dir / `docs/retros` |
| `define-company` | `domain`, `stakeholders`, `valueFlow`, `bottleneck` (all required, multiline) | known-file / `definitions/ontology/company.yaml` |
| `handoff` | `blockers` (optional, multiline, "leave blank if none") | known-file / `HANDOFF.md` |

Every `buildPrompt` starts with a fixed instruction sentence before any
interpolated field value (e.g. `"Run the /decision company command. Write
docs/decisions/<date>-<slug>.md exactly as described below.\n\nContext:
{{context}}\n..."`) — the prompt argv token passed to `claude -p` never
begins with raw user input, so even a field value that happens to start
with `-` is just prose deep inside a larger string, never a standalone
argv token (the actual lesson from v6's argv-injection bug: that bug was
about a bare identifier being the WHOLE token, not about a substring
inside a longer one).

**`handoff`'s prefetch**: before spawning, the control panel itself runs
(via the existing `ExecFileFn` DI pattern, cwd = `ai-company-starter-main`
root): `git log --since='24 hours ago' --oneline` and, if `gh` succeeds,
`gh issue list --state open --limit 10` (swallow failure — the command's
own spec already has a documented fallback for "gh unavailable"). Their
output is embedded directly into the prompt as pre-fetched context ("Here
is the git log for the last 24 hours: ...", "Here is the open issue list:
..."), and the prompt tells the agent to use only this pre-fetched
information — it has no Bash tool to re-run these itself. This is why
`handoff` needs zero Bash access despite its spec describing shell
commands: the shell commands are the CONTROL PANEL's job (already-trusted
`execFn`, read-only), not the spawned agent's.

### Spawning (`lib/company-commands/run-company-command-impl.ts`)

Mirrors `trigger-poll-impl.ts`'s `SpawnFn` DI pattern exactly (same
minimal return shape, `{ unref: () => void }`) and its `openSync`/
`closeSync` try/finally around the log file descriptors — that pattern
exists specifically because an earlier fd leak on the error path was
fixed that way; reuse it rather than re-deriving it.

Validates `commandId` against the registry (whitelist — reject anything
else, same discipline as `resolveKnownSkillPath`'s membership check, just
applied to command ids instead of file paths) and every submitted field
key against that command's declared `fields` (reject unknown keys, reject
missing required keys, cap each value's length). Builds the prompt, then:

```
claude -p "<built prompt>" \
  --allowedTools "Read,Grep,Glob,Edit(<edit-scope-pattern>)" \
  --disallowedTools "Bash" \
  --permission-mode default \
  --output-format text
```
where `<edit-scope-pattern>` is `<command.outputPath>/**` for
`new-file-in-dir` commands or the bare `<command.outputPath>` for
`known-file` commands.

**This exact flag set was corrected mid-implementation after a live-tested
security finding, and the previous design must not be reintroduced:** an
earlier draft of this spec used `--add-dir <output dir>` plus a bare
`--allowedTools "...,Write"` plus `--permission-mode acceptEdits`, believing
`--add-dir` narrowed the agent's writable surface to that one directory. A
real headless `claude -p` test (disposable temp repo, never against a real
`~/AI-Native` project) proved this false: `--add-dir` only *adds* directories
on top of an already-fully-writable `cwd` — it never narrows anything — and
`acceptEdits` auto-approves edits anywhere in `cwd` regardless of any
allow-list scoping. The test agent successfully wrote to a directory
explicitly meant to be off-limits under that configuration. The fix,
confirmed by a second live test that blocked the same write: `Write(path)`
rules are accepted but silently never matched (per Claude Code's own
permission-check docs — only `Edit(path)`/`Read(path)` rules are actually
enforced, and `Edit` rules apply to every built-in tool that edits files,
including `Write`), so the allow-list must grant `Edit(<pattern>)` — never a
bare `Write` — and `--permission-mode` must be `default` (which still runs
fully non-interactively under `-p`/print mode, confirmed by the same live
test completing headless with a clean `permission_denials: []`/populated
`permission_denials: [...]` result rather than hanging), not `acceptEdits`.
`--add-dir` is dropped entirely — every command's `outputPath` is already
inside the repo root that `cwd` covers, so it added nothing real and only
invited the false confidence above.

Run detached, `stdio` redirected to a log file under this app's OWN data
directory (`.data/company-runs/<commandId>.log` in the control-panel
repo, gitignored — NOT inside the target repo, so `ai-company-starter-main`
never gets polluted with control-panel bookkeeping files), `unref()`'d,
exactly like `triggerPollImpl`.

Before spawning, snapshot the "before" state and persist it to a small
run-record file (`.data/company-runs/<commandId>.run.json`) alongside the
lock:
- `new-file-in-dir`: sorted list of filenames currently in `outputPath`.
- `known-file`: the file's current content (or `null` if it doesn't
  exist yet).

The global lock (`lib/company-commands/run-lock.ts`) lives at
`.data/company-runs/company-command.lock` in the control-panel repo.
Unlike `adapters/poll-lock.ts` (which only reads a lock an *external*
script owns), this lock's full lifecycle belongs to this code: acquire
(create the file before spawning, fail fast if it already exists —
returning "Already running" like `triggerPollImpl` does today), and
release (delete the file in the child process's `exit` handler, so it's
freed whether the run succeeds, fails, or crashes). Status-checking
(`company-command-status.ts`) just checks file existence, same read-only
shape as `checkPollLockStatus`.

### Result detection (`lib/company-commands/company-command-result.ts`)

Once the lock is released, compares the current state against the
persisted "before" snapshot from the run-record:
- `new-file-in-dir`: any filename present now that wasn't in the snapshot
  → read its content, that's the diff's "new" side (old side is empty).
  More than one new file → still show the first as primary, list the
  rest by name (agents write exactly one file per their own spec, so this
  is a defensive fallback, not an expected path).
- `known-file`: read current content, diff against the snapshot's "before"
  content (or `""` if the file didn't exist before).
- No change detected → `{ changed: false, message: "No changes produced." }`.

Returns enough for the UI to render `DiffView oldText={...} newText={...}`
exactly like `SkillHistory`'s revert-confirmation dialog already does.

### Committing

Confirming the dialog calls the existing, unmodified
`saveSkillContent`-style commit path — but since these files aren't
"known skills" in `getAllSkills()`'s sense, this slice adds one new thin
wrapper, `lib/company-commands/commit-company-command-result.ts`
(`"use server"`, zero extra params, delegates to `-impl.ts`), that:
validates the target path is within `ai-company-starter-main`'s root
(reusing `lib/path-guard.ts`) AND matches the exact `outputPath` the
commandId's registry entry declares (a narrower, purpose-built
membership check than `resolveKnownSkillPath`'s "any known skill," since
these output files aren't skills/commands themselves), then calls
`lib/git-commit-file.ts`'s existing single-file-scoped commit helper
unchanged, with message `Run /<commandId> via AI-Native control panel`.

### UI (`components/company-command-runner.tsx`)

`SkillBrowser`'s detail Sheet gains a third tab, "Run," shown only when
the selected `SkillEntry.kind === "command"` AND its `path` basename
matches one of the registry's `commandFileName`s. The tab renders:
- The field form (per registry, ordered, multiline textarea vs. single-line
  input per field, required fields marked).
- A "Run" button, disabled while the lock shows running, showing
  "Running…" during that time (poll every ~3s via `company-command-status`
  while running — no live log content, just the boolean, matching v2).
- Once idle after a run this session, fetch `company-command-result` and
  either render the confirm-with-diff dialog (matching `SkillHistory`'s
  revert dialog: `DiffView` inside the dialog, "Confirm & commit" button)
  or a plain "No changes produced" message with a link to view the run
  log's tail for diagnostics.

## Security summary (read before implementation)

This is the highest-risk feature built so far — it spawns an LLM agent
that writes real files based on its own judgment, not a deterministic
function. The mitigations, stacked:

1. **No Bash, ever**, for any of the 5 commands — the CLI's own
   `--disallowedTools "Bash"` flag is the enforcement point, not a prompt
   instruction. This is the single biggest risk reduction: even if a
   field value or the agent's own reasoning goes somewhere unintended,
   it cannot run `git commit`, cannot call `gh`, cannot touch anything
   outside the file system tools it's given.
2. **`--allowedTools "...,Edit(<pattern>)"` (never a bare `Write`) scopes
   file-editing to exactly the command's output location**, enforced via
   `--permission-mode default` (never `acceptEdits`, which bypasses this
   scoping for anything already inside `cwd`) — the agent cannot write
   outside `docs/decisions/`, `docs/retros/`, etc., regardless of what it
   decides to do. This exact mechanism was verified with a real live test
   before implementation (see the Spawning section above) after an earlier
   `--add-dir`-based design was live-tested and found NOT to confine
   writes at all.
3. **The control panel commits, not the agent** — post-run diff detection
   plus the existing confirm-dialog-then-single-file-git-commit pattern
   means a human always reviews real content before it becomes a commit,
   same discipline as every prior write-capable slice.
4. **Prompt-injection-into-argv is structurally prevented** (fixed prefix
   text always precedes interpolated values, so a field value can never
   be the bare, standalone argv token the way v6's unvalidated `sha`
   was).
5. **Prompt-injection-into-agent-judgment is an accepted, contained
   residual risk**, not an eliminated one: a user could type adversarial
   text into a field and the agent might "believe" strange instructions
   embedded there. This is acceptable specifically because mitigations
   1–3 cap the blast radius to "write one file in one known location,
   reviewed before commit" no matter what the agent is convinced to do —
   the field's author is the dashboard's own operator, not an untrusted
   third party (unlike `plh-takeshi-agent`'s email pipeline, which reads
   genuinely untrusted external text).
6. **`create-epic` is excluded specifically because none of the above
   mitigations apply to a `gh issue create` call** — there's no local
   file to diff-and-confirm before the side effect happens; the side
   effect (a public GitHub issue existing) IS the write, and it happens
   inside the agent's own Bash execution, which this design otherwise
   disallows entirely. Building this safely is a different, harder
   design problem than this slice solves.

## Error handling

- Registry validation failures (unknown commandId, unknown/missing field
  keys) return a typed error before any spawn attempt — same "reject at
  the boundary" discipline as every other Server Action in this app.
- Spawn failure (e.g. `claude` binary not found) releases the lock
  immediately and surfaces the error message, same as `triggerPollImpl`'s
  catch path.
- If the process exits non-zero, that alone isn't treated as failure (an
  agent run can exit non-zero for reasons unrelated to whether it wrote
  useful content) — the file-diff detection is the actual signal, exactly
  like v5 already distinguishes `verify.py`'s exit 0 vs exit 1 from a
  "did it even run" question.
- A crashed/killed run leaves the lock held; this slice does not add
  stale-lock reclaim (unlike `poll.lock`'s 1800s staleness window) since
  these runs are expected to be much shorter — a future slice can add
  reclaim if this proves annoying in practice. Deferred, not forgotten.

## Testing

- Unit tests for: registry validation (`run-company-command-impl.ts`),
  lock behavior (`run-lock.ts`, mirroring `poll-lock.test.ts`'s shape),
  and result-detection logic (`company-command-result.ts`) for both
  `outputKind`s, using real temp-dir fixtures (this project's established
  convention — never checked-in fixture files).
- Manual live-test (real, required): run `digest` for real against
  `ai-company-starter-main` (safe — it's the most mechanical, no fields
  required, and produces a genuinely new dated file each time, so no
  net-zero restoration is needed the way `stock-note.md`'s edit tests
  require — a real digest file is legitimate, wanted output, not test
  pollution). Confirm: the agent could not run any Bash command (check
  the log for permission-denial messages if it tried), the diff dialog
  shows the real generated content, confirming commits it via the
  existing single-file commit path, and `git log` in that repo shows one
  new commit with the expected message.
- Do NOT live-test `decision`/`retro`/`define-company`/`handoff` against
  real content meant to be kept — if a live test of these is wanted
  beyond the unit tests, use obviously-fake placeholder field values
  (e.g. "TEST: this is a test decision, safe to delete") so the resulting
  file is clearly identifiable as a test artifact, and remove it (`git
  revert` or delete + commit) afterward, leaving `ai-company-starter-main`
  net-zero — same net-zero discipline already established for
  `stock-note.md`'s tests, extended here since these commands' output
  directories aren't otherwise disposable.

## Open items for v9+ (explicitly deferred, not decided here)

- Live log streaming while a command runs (backlog item, now v10).
- A safe design for `create-epic` (real GitHub issue creation) — would
  need per-issue preview/approval before each `gh issue create` call,
  which requires either a different execution model (agent proposes,
  control panel executes each `gh` call itself after review) or pausing
  the agent mid-run for approval — neither is a small addition.
- Stale-lock reclaim if crashed runs prove to be a real annoyance.
- `ingest-context` and `office` remain fully out of scope.
