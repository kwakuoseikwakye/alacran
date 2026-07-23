# AI-Native Control Panel — v9 Slice: Trigger plh-ops's Daily Team Log

## Status
Approved for implementation planning (2026-07-23). Scoped autonomously per
standing delegation, with one explicit user decision: **live verification
for this slice is unit-tests-only — no automated real end-to-end run.**

## Problem

`plh-ops`'s `workflow/daily-team-log/` is a Claude Code skill, already
registered as a local scheduled task (daily 22:00) via
`~/.claude/daily-team-log/config.json` (bootstrapped on this machine:
`person: "Nana"`, `output_repo: "/Users/nanaosei/plh-ops/reports"` — a
symlink to this app's already-configured `plh-ops` agent root). The routine
(documented in `workflow/daily-team-log/Setup.md`'s "Routine prompt
template") reads the operator's own `~/.claude/projects/*.jsonl` session
history via `gather.py`, summarizes it into the repo's fixed report
template, commits, and **pushes to the shared `takeman555/plh-ops` remote**
that Takeshi's analysis agent and teammates also read from.

This is a materially different risk shape than every prior slice:
- v1-v8's writes stay local to one repo, reviewed by a human before commit
  (v4/v7/v8) or are read-only (v1/v3/v5/v6).
- v9's routine reads genuinely private data (the operator's own session
  history — already scoped by the machine's own `projects` allowlist in
  `config.json`, not this app's concern) and pushes to a remote shared with
  other people/agents, autonomously, by design (the routine's own prompt
  says "unattended... do not ask questions").

Given that, the user was asked how to handle live verification and chose:
**implement and unit-test the trigger mechanism with the same rigor as
every prior slice, but do not have an automated run actually push to the
shared repo** — the user will click the real button once, at their own
discretion, after this ships.

## Goals

- A "Run now" button on the `plh-ops` agent card (mirroring
  `TriggerPollButton`'s pattern), gated behind a confirm dialog that
  discloses exactly what it does: reads local session history, writes and
  commits a report, and **pushes to the shared `plh-ops` repo**.
- Reads the machine's existing `~/.claude/daily-team-log/config.json`
  (fixed path, `os.homedir()`-derived — no client-supplied path, no
  injection surface for the read itself) to get `person`/`output_repo`;
  derives `clone` (`path.dirname(output_repo)`), `gather_path`, and
  `skill_md_path` from it.
- Builds the EXACT routine prompt from `Setup.md`'s template, substituting
  only these machine-local values — `<DATE>` stays a literal token, per the
  routine's own design (the spawned agent fills it in per-date as it
  iterates `gather.py pending`'s output).
- Spawns `claude -p "<prompt>"`, scoped with the same discipline v8's
  security fixes established: `--allowedTools` grants `Edit(<output_repo>/**)`
  (never bare `Write`) plus a small set of exact Bash command-prefix
  patterns the routine actually needs (`git -C <clone> pull`, `git -C
  <clone> push`, `git -C <output_repo> add`, `git -C <output_repo> commit`,
  `python3 <gather_path>`) — not a blanket Bash grant, even though this
  routine's own prompt is fully fixed (no field interpolation, unlike v8,
  so there's no user-input-into-prompt injection surface at all here) —
  least-privilege stays the default regardless.
- Async execution with lock-based running/idle status (mirroring v2), and
  a one-line result message read from the tail of the run's log file (the
  routine's own step 5 already prints "which dates you wrote" as its final
  line — no bespoke diff/result-detection needed, unlike v8, since this
  routine legitimately commits AND pushes on its own by design).

## Non-goals

- **No first-time bootstrap/setup flow.** That's `Setup.md`'s own
  multi-question, config-writing, scheduled-task-registering flow — a
  different, bigger, and more sensitive job than "run the already-set-up
  routine now." If `config.json` is missing or `bootstrapped` isn't `true`,
  the button shows a clear message pointing at running the skill's own
  setup, and does nothing else.
- **No automated real end-to-end live test that actually pushes** — per
  the user's explicit choice this slice. Verification is real unit tests
  (injected fakes) proving the exact prompt/args/lock behavior, a real
  build, and nothing more. The plan's final task explicitly does NOT click
  the real button.
- No change to the existing 22:00 scheduled task or its registration.
- No UI for editing `config.json` or choosing which projects are shared —
  that's the bootstrap flow's job, out of scope here.
- No diff-preview/confirm-before-commit the way v4/v7/v8 have — this
  routine's commit-and-push is an inherent, already-accepted part of its
  unattended design (the confirm dialog before *starting* the run is the
  disclosure point, not a per-file review after).

## Architecture

```
lib/
├── file-lock.ts                      # NEW: generic lock, extracted from
│                                        company-commands/run-lock.ts
├── company-commands/run-lock.ts      # MODIFIED: thin wrapper over file-lock.ts,
│                                        regression-proven via its unchanged
│                                        existing test file (same pattern as
│                                        v6's resolveKnownSkillPath extraction)
├── daily-team-log/
│   ├── read-config.ts                # reads ~/.claude/daily-team-log/config.json
│   ├── build-prompt.ts               # Setup.md's routine template, substituted
│   ├── trigger-daily-team-log.ts     # "use server" — zero extra params
│   ├── trigger-daily-team-log-impl.ts  # spawn logic, SpawnFn-injectable
│   ├── daily-team-log-status.ts      # "use server" — poll running/idle
│   └── daily-team-log-result.ts      # "use server" — reads the log's last line
components/
├── daily-team-log-button.tsx         # button + confirm dialog + status/result
└── agent-card.tsx                    # MODIFIED: new conditional slot
app/page.tsx                           # MODIFIED: wire the new prop through
```

### `lib/file-lock.ts` (extraction)

```ts
export async function acquireLock(lockFilePath: string): Promise<boolean>
export async function releaseLock(lockFilePath: string): Promise<void>
export async function checkLockStatus(lockFilePath: string): Promise<{ running: boolean }>
```
Same atomic-exclusive-create (`{flag: "wx"}`) / non-throwing-release /
existence-only-check semantics as `company-commands/run-lock.ts` today —
that file is refactored to delegate to this (`lockPath(dataDir)` computes
the same `.../company-command.lock` path it always has, so its own
existing test file runs UNCHANGED and must still pass, proving the
refactor preserved exact behavior, same regression discipline as v6's
`resolveKnownSkillPath` extraction).

### `lib/daily-team-log/read-config.ts`

```ts
export type DailyTeamLogConfig = {
  person: string
  outputRepo: string
  clone: string
  gatherPath: string
  skillMdPath: string
}
export type ReadConfigResult =
  | { ok: true; config: DailyTeamLogConfig }
  | { ok: false; reason: "not-found" | "not-bootstrapped" | "invalid" }

export async function readDailyTeamLogConfig(
  configPath: string = path.join(os.homedir(), ".claude", "daily-team-log", "config.json")
): Promise<ReadConfigResult>
```
Parses the JSON, requires `bootstrapped === true` and non-empty
`person`/`output_repo`, derives `clone = path.dirname(output_repo)`,
`gatherPath = path.join(clone, "workflow/daily-team-log/gather.py")`,
`skillMdPath = path.join(clone, "workflow/daily-team-log/SKILL.md")`.

### `lib/daily-team-log/build-prompt.ts`

```ts
export function buildDailyTeamLogPrompt(config: DailyTeamLogConfig): string
```
Returns `Setup.md`'s exact "Routine prompt template" text with `<clone>`,
`<person>`, `<output_repo>`, `<gather_path>`, `<skill_md_path>` replaced by
`config`'s fields — `<DATE>` left as the literal string `<DATE>` (the
spawned agent substitutes it itself while iterating `gather.py pending`'s
output, per the routine's own design — this file does not compute dates).

### `lib/daily-team-log/trigger-daily-team-log-impl.ts`

Mirrors `trigger-poll-impl.ts`'s `SpawnFn` DI + `openSync`/`closeSync`
try/finally pattern. On call:
1. `readDailyTeamLogConfig()` — if not `ok`, return `{started: false,
   message: <reason-appropriate text>}` without touching the lock.
2. Acquire the lock (`file-lock.ts`, path
   `.data/daily-team-log/run.lock` inside the CONTROL PANEL's own repo —
   never inside `plh-ops`, same "our bookkeeping stays in our own app"
   rule as v8). If already held, `{started: false, message: "Already
   running"}`.
3. Build the prompt, spawn:
   ```
   claude -p "<prompt>" \
     --allowedTools "Read,Grep,Glob,Edit(<output_repo>/**),Bash(git -C <clone> pull*),Bash(git -C <clone> push*),Bash(git -C <output_repo> add*),Bash(git -C <output_repo> commit*),Bash(python3 <gather_path>*)" \
     --permission-mode default \
     --output-format text
   ```
   No `--disallowedTools` flag — the `--allowedTools` list is already an
   exhaustive allowlist under `--permission-mode default`; anything not
   named in it (including any Bash shape outside the 5 listed prefixes)
   is denied by default, not interactively prompted (headless `-p` mode
   has no one to prompt), matching the non-hanging deny-by-default
   behavior v8's own live test already confirmed for this permission
   mode.
   `cwd: config.clone`, `stdio` to `.data/daily-team-log/run.log` (single
   combined file, same as v8), detached + `unref()`'d, lock released in
   the child's `exit` handler (same as v8's spawn, not v2's coarser
   lock-age-only model — this repo already established the tighter
   pattern in v8, reuse it, don't regress to v2's looser one).
4. Return `{started: true, message: "Started"}`.

### `lib/daily-team-log/daily-team-log-status.ts` / `daily-team-log-result.ts`

Status: thin `"use server"` wrapper over `checkLockStatus` for the fixed
lock path. Result: reads `.data/daily-team-log/run.log`, returns its last
non-empty line (the routine's own step 5 always prints one — either
"no reports to write" or "wrote reports for: <dates>") as the display
message; `{ranAtLeastOnce: false}` if the log doesn't exist yet.

### `components/daily-team-log-button.tsx`

Mirrors `TriggerPollButton`: an `AlertDialog` confirm ("Run the daily
team-log now? This reads your local Claude Code session history, writes
and commits a report, and **pushes it to the shared plh-ops repo**.") →
`triggerDailyTeamLog()` → poll `getDailyTeamLogStatus()` every ~3s while
running → once idle, fetch `getDailyTeamLogResult()` and show its message.
If `readDailyTeamLogConfig()` failed (surfaced via the trigger's own
`message` on first click, since this app never proactively probes
`~/.claude/` on page load), show that message plainly instead of a lock
status — e.g. "Not set up on this machine yet — run the daily-team-log
skill's one-time setup first."

### `components/agent-card.tsx` / `app/page.tsx`

New `showDailyTeamLogButton?: boolean` prop, passed
`agent.id === "plh-ops"` from `page.tsx`, rendering
`<DailyTeamLogButton />` — same shape as `showVerifyButton` today.

## Security summary

- **Config path is fixed and local** (`os.homedir()`-derived) — no
  client-supplied path, no path-guard/membership check needed for the
  read itself (there is no "which file" decision a caller could influence).
- **The prompt has zero field interpolation** — unlike v8's 5 commands,
  there is no user-typed content flowing into the prompt at all, so there
  is no prompt-injection-into-argv surface and no prompt-injection-into-
  judgment surface from user input (the only "input" is the operator's own
  already-locally-scoped session history, already NDA-filtered by their
  own `projects` allowlist in `config.json`, which is that person's own
  responsibility, not this feature's).
- **Bash is not blanket-granted despite being necessary** — scoped to the
  exact 5 command-prefix shapes the routine's own documented steps use,
  applying v8's least-privilege lesson to a case where Bash genuinely
  can't be disallowed entirely (unlike v8's 5 commands, this routine's job
  IS running git/python3).
- **`Edit(<output_repo>/**)` not bare `Write`, `--permission-mode default`
  not `acceptEdits`** — the exact v8-verified mechanism, reused directly
  rather than re-derived, since the underlying CLI behavior doesn't change
  between features.
- **The real push is the accepted, disclosed side effect, not a bug to
  mitigate** — this differs from every prior write-action's "local commit,
  human reviews diff first" pattern specifically because this routine's
  whole point is unattended commit+push; the confirm dialog is where the
  human approves the ACTION happening at all, not a per-content review
  (which isn't possible to build without duplicating gather.py/SKILL.md's
  own summarization logic).

## Error handling

- Config missing/not-bootstrapped/unreadable → typed refusal, no lock
  touched, no spawn attempted.
- Spawn failure → lock released, error message surfaced (same as v2/v8).
- The routine itself failing partway (e.g. push rejected after retry) is
  the routine's own documented problem to handle ("if one date fails,
  skip it and continue") — this feature surfaces whatever the log's last
  line says, it does not interpret or retry on the routine's behalf.

## Testing

- `lib/file-lock.ts`: new unit tests (acquire/release/status, same cases
  `company-commands/run-lock.test.ts` already covers).
- `lib/company-commands/run-lock.test.ts`: **must pass completely
  UNCHANGED** after the refactor — this is the regression proof.
- `lib/daily-team-log/read-config.ts`: unit tests for found/not-found/
  not-bootstrapped/invalid-JSON cases, using real temp-dir fixtures (a
  fake `config.json` written to a temp path, never the real
  `~/.claude/daily-team-log/config.json`).
- `lib/daily-team-log/build-prompt.ts`: unit test asserting every
  placeholder is substituted and `<DATE>` remains literal.
- `lib/daily-team-log/trigger-daily-team-log-impl.ts`: unit tests with
  injected `SpawnFn`, asserting the exact `--allowedTools` string, lock
  acquire/release-on-throw, and the not-bootstrapped short-circuit —
  same rigor as v8's `run-company-command-impl.test.ts`.
- **No live end-to-end test this slice** (see Problem/user decision
  above) — the final task runs the full suite and a production build
  only; it does not open the browser and click the real button.

## Open items for v10+ (explicitly deferred, not decided here)

- A real, user-initiated live click-through, whenever the user chooses to
  do it themselves.
- Live log streaming (already-planned backlog item, applies here too).
- Surfacing `plh-ops` report content anywhere in the dashboard (this
  slice only triggers generation, it doesn't add a viewer for the
  resulting reports — `/skills` already lists `plh-ops`'s scanned
  entries from v3, unchanged).
