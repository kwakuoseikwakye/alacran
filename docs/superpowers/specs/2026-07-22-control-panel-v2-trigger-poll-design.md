# AI-Native Control Panel — v2 Slice: Trigger plh-takeshi-agent's Poll

## Status
Approved for implementation planning (2026-07-22).

## Problem

v1 shipped as a strictly read-only status board (see
`2026-07-22-control-panel-design.md`). Its own "Open items for v2" list named
triggering agent runs from the UI as the first deferred capability. Of the
three agents surfaced, `plh-takeshi-agent` is the best first candidate:

- `bin/poll.sh` already has its own lock file (`state/poll.lock`, self-reclaiming
  after 1800s if stale), so it is already safe to invoke concurrently with the
  scheduled launchd run — a second invocation while one is in flight just logs
  "another run holds the lock, exiting" and exits 0. No new concurrency
  control needs to be built.
- `bin/guardrail.sh` (a PreToolUse hook on every Claude session the pipeline
  spawns) already blocks secrets access, force-push, push-to-main,
  `git reset --hard`, branch delete, and network egress commands — regardless
  of whether the run was scheduled or manually triggered. Triggering from the
  dashboard changes *when* this already-safe pipeline runs, not what it is
  allowed to do.

This spec covers only running `poll.sh` on demand. Triggering
`ai-company-starter-main`'s slash-commands or `plh-ops`'s daily-team-log are
explicitly out of scope (see Non-goals) — they involve spawning arbitrary
Claude Code sessions, a materially different and larger mechanism.

## Goals

- A button on the `plh-takeshi-agent` agent-tree-view card that runs
  `bin/poll.sh` immediately instead of waiting for the next 5-minute launchd
  tick.
- Manual and scheduled runs are indistinguishable in the logs (same
  `logs/poll.out.log`/`logs/poll.err.log` files, append mode).
- A visible "Running…" state while a run is in flight, derived from
  `state/poll.lock`'s existence — no new state file invented.
- A confirmation step before triggering, since this is the app's first
  write/mutate action after a fully read-only v1.
- New activity (once the run finishes) surfaces through v1's existing
  adapter/auto-refresh — no changes to `lib/adapters/plh-takeshi-agent.ts`
  or the activity board.

## Non-goals

- Triggering `ai-company-starter-main` slash-commands or `plh-ops`'s
  daily-team-log — separate, larger mechanisms (spawning arbitrary Claude
  Code sessions vs. running one fixed known script).
- Live log streaming (SSE/websockets) — v1's polling-based refresh
  (15s `router.refresh()`) is sufficient; this slice doesn't change that.
- A generalized "run arbitrary command" surface. The new Server Action takes
  **zero parameters** and does exactly one fixed thing: run
  `<plh-takeshi-agent rootPath>/bin/poll.sh`. There is no path, command, or
  agent-id argument for a caller to manipulate.
- Rate-limiting repeated clicks — `poll.sh`'s own lock file already makes
  redundant concurrent runs a safe no-op; adding a second guard would be
  redundant.
- Any change to `poll.sh`, `guardrail.sh`, or the pipeline itself.

## Architecture

Two additions to the existing `control-panel` app:

```
lib/
├── trigger-poll.ts       # Server Action: spawn bin/poll.sh, detached, fire-and-forget
└── adapters/
    └── poll-lock.ts      # checkPollLockStatus(rootPath) — mirrors poll.sh's own lock logic
components/
└── trigger-poll-button.tsx   # client component: confirm dialog + button, shown only on the Takeshi card
```

`trigger-poll.ts` (`"use server"`):
```
export async function triggerPoll(): Promise<{ started: boolean; message: string }>
```
- Looks up the `plh-takeshi-agent` entry in `AGENTS` (from `lib/config.ts`) by
  its fixed id — never accepts a path or id as a parameter.
- Checks `state/poll.lock` first (via `checkPollLockStatus`); if already
  running, returns `{ started: false, message: "Already running" }` without
  spawning anything.
- Otherwise spawns `bash bin/poll.sh` via `child_process.spawn`, with
  `detached: true`, `stdio` redirected by appending to
  `logs/poll.out.log`/`logs/poll.err.log` (opened with the `"a"` flag, matching
  the launchd plist's own append-by-restart behavior), then `child.unref()`
  so the Node process doesn't wait for it. Returns
  `{ started: true, message: "Poll started" }` immediately.
- The pre-spawn lock check is a UX nicety, not the safety boundary — if a
  scheduled run starts in the split second between the check and the spawn,
  `poll.sh`'s own lock (unchanged, untouched by this slice) is still what
  actually prevents overlapping runs. This action can never bypass or race
  that guarantee unsafely, only report a slightly stale "not running" a
  moment before `poll.sh` itself would no-op.

`poll-lock.ts`:
```
export type PollLockStatus = { running: boolean; lockAgeSeconds: number | null }
export async function checkPollLockStatus(rootPath: string): Promise<PollLockStatus>
```
- `running: false, lockAgeSeconds: null` if `state/poll.lock` doesn't exist.
- `running: true, lockAgeSeconds: <age>` if it exists, where age is computed
  from the directory's mtime — mirrors `poll.sh`'s own `stat -f %m` staleness
  check, but this function only *reports* the age; it never removes or
  reclaims the lock (that stays `poll.sh`'s exclusive responsibility, avoiding
  two independent programs racing to delete the same lock directory).

## UI

On the agent tree view (`/`), the `plh-takeshi-agent` `AgentCard` gains a
`TriggerPollButton` (client component):
- Default state: "Run now" button, enabled.
- Clicking opens a shadcn `AlertDialog`: *"This runs the same automated
  pipeline that normally fires every 5 minutes — run it now?"* with
  Cancel/Confirm.
- On confirm: calls `triggerPoll()`. While the call is in flight, button
  shows a spinner/disabled state.
- After the action resolves: shows the returned `message` inline for a few
  seconds (e.g. "Poll started" or "Already running"), then reverts to normal.
- Independently of the action's own return, the card also derives a live
  "Running…" badge from `checkPollLockStatus` (queried alongside the existing
  `checkLaunchdJob` call already made in `app/page.tsx`) — this is what stays
  accurate across the 15s auto-refresh cycle even for runs triggered by the
  *scheduled* launchd job, not just ones triggered from this button. When
  the lock is held, the "Run now" button is disabled and shows "Running…"
  instead, regardless of who/what started the run.

## Error handling

- `triggerPoll()` catches any `spawn` error (e.g. `bin/poll.sh` missing,
  not executable) and returns `{ started: false, message: <error> }` rather
  than throwing — this is a Server Action directly reachable over POST, so
  it must never crash the caller on a misconfigured environment.
- `checkPollLockStatus` catches any `stat`/`readdir` error other than
  "doesn't exist" (e.g. permission denied) and reports `running: false` —
  consistent with v1's existing house style of degrading to a safe default
  rather than throwing on a read-only status check.

## Testing

- `poll-lock.test.ts`: temp-dir tests — no lock dir → not running; lock dir
  present → running with a computed age; lock dir present but unreadable
  (permission-denied simulation, matching the pattern used in Task 3/4/5's
  fix rounds) → degrades to not-running rather than throwing.
- `trigger-poll.test.ts`: inject the spawn function (same dependency-injection
  pattern as `lib/adapters/launchd.ts`'s `ExecFn`) so tests never actually
  spawn a real process. Cases: lock absent → spawn is called with the exact
  expected command/args/cwd, returns `started: true`; lock present → spawn is
  NOT called, returns `started: false, message: "Already running"`; injected
  spawn throws → returns `started: false` with the error message, doesn't
  throw past the function boundary.
- Manual verification: click "Run now" against the real
  `~/AI-Native/plh-takeshi-agent/`, confirm a new line appears in
  `logs/poll.out.log` with a fresh timestamp, confirm the button shows
  "Running…" if clicked again while (rarely, given `poll.sh`'s speed when
  there's nothing to process) a run is still in flight, confirm the
  dashboard's existing activity board reflects any new processed email once
  the run completes.

## Open items for v3 (explicitly deferred, not decided here)

- Triggering `ai-company-starter-main` slash-commands (spawning a real
  Claude Code session from the dashboard).
- Triggering `plh-ops`'s daily-team-log on demand.
- Live log streaming for an in-flight run.
- Skill viewing/editing/versioning UI.
- Reusable template mechanism for a second "AI company."
