# AI-Native Control Panel — v10 Slice: Live Log Streaming for In-Flight Runs

## Status
Approved for implementation planning (2026-07-23). Scoped autonomously
per standing delegation.

## Problem

Three trigger mechanisms (v2's poll button, v8's company-command runner,
v9's daily-team-log button) all show only a boolean "Running…" label while
their spawned process is in flight, with real output only visible after
the fact (v8/v9) or not shown in the UI at all (v2). Each already writes
its own log file(s) to disk in real time. This slice upgrades all three to
show the log's growing tail content live, polling the same way they
already poll for running/idle status — no websockets, no SSE, just reading
more of a file that's already being written.

## Goals

- One generic, pure-string `tailLines(content, maxLines)` helper, unit
  tested in isolation, reused by three thin per-feature "use server" tail
  actions (each reading its own already-fixed, non-client-supplied log
  path — the same "zero injection surface, fixed internal path" pattern
  v8/v9 already established).
- v2's `TriggerPollButton`, v8's `CompanyCommandRunner`, and v9's
  `DailyTeamLogButton` each gain a scrollable, monospace tail view that
  polls and updates while `running` is true, using the exact same poll
  interval each already uses for status (~3s) — one extra fetch per tick,
  not a second polling loop.

## Non-goals

- No websockets/SSE/true push-based streaming — polling a growing file's
  tail is sufficient for this app's single-operator, localhost use case
  and matches the "match UX ceremony to actual need" convention already
  established (v5 skipped polling entirely because its action was ~1s;
  this slice adds richer polling because these actions take much longer,
  not because streaming infrastructure is inherently better).
- No log rotation/truncation/max-file-size handling — these logs are
  small, single-run artifacts (v8/v9) or already-existing files v2 never
  managed (poll.out.log/poll.err.log); out of scope.
- No persistent scrollback across page reloads — the tail view only shows
  what's accumulated during the CURRENT browser session's poll loop, same
  transience as everything else these components already display.
- v2's two separate log files (`poll.out.log`, `poll.err.log`) are shown
  concatenated (stdout tail, then stderr tail, labeled) rather than
  perfectly interleaved by timestamp — good enough for diagnostic
  visibility, not worth the complexity of real interleaving.

## Architecture

```
lib/
├── log-tail.ts                        # NEW: tailLines(content, maxLines) — pure string logic
├── log-tail.test.ts
├── adapters/get-poll-log-tail.ts       # NEW: "use server" — plh-takeshi-agent's poll.{out,err}.log
├── get-poll-status.ts                 # NEW: "use server" — zero-param wrapper over checkPollLockStatus
├── company-commands/
│   └── company-command-log-tail.ts    # NEW: "use server" — .data/company-runs/<commandId>.log
└── daily-team-log/
    └── daily-team-log-log-tail.ts      # NEW: "use server" — .data/daily-team-log/run.log
components/
├── log-tail-view.tsx                  # NEW: shared <pre> scrollable tail renderer
├── trigger-poll-button.tsx            # MODIFIED: see note below — bigger change than the other two
├── company-command-runner.tsx         # MODIFIED: poll + show tail while running
└── daily-team-log-button.tsx          # MODIFIED: poll + show tail while running
```

**Important asymmetry discovered while scoping this**: v8's and v9's
components already have a genuine client-side poll loop (`pollUntilDone`,
`setTimeout`-recursive, checking a "use server" status action every ~3s).
v2's `TriggerPollButton` does **not** — it only reflects `pollStatus`, a
prop computed once at server-render time in `app/page.tsx`, plus its own
`pending` flag which flips back to `false` as soon as the (fire-and-forget,
near-instant) `triggerPoll()` call returns — long before `poll.sh` itself
actually finishes running in the background. This means v2's button has
never live-tracked the real running state beyond the initial page load, a
latent gap since v2 shipped. Adding tail-viewing to it properly requires
first giving it the same real poll loop v8/v9 already have — this is a bit
more than "one extra fetch on an existing tick," and is a legitimate,
worthwhile fix uncovered by scoping this slice, not scope creep: showing a
live tail while `running` is stuck at a stale snapshot would be
inconsistent and confusing. `get-poll-status.ts` is the new zero-param
action this requires (mirroring `getCompanyCommandStatus`/
`getDailyTeamLogStatus`'s existing shape, wrapping the already-existing
`checkPollLockStatus(rootPath)` with `plh-takeshi-agent`'s configured
`rootPath` resolved internally).

### `lib/log-tail.ts`

```ts
export function tailLines(content: string, maxLines: number): string {
  const lines = content.split("\n")
  return lines.slice(-maxLines).join("\n")
}
```
`maxLines` default `200` at call sites — enough to see recent progress
without unbounded growth in the response payload.

### Per-feature tail actions

Each is a zero-or-one-real-param `"use server"` export reading a FIXED,
non-client-supplied path (or the small set of already-known agent/command
paths), matching every prior slice's "reject/whitelist at the boundary"
discipline:

- `getPollLogTail(): Promise<{ stdout: string; stderr: string }>` — reads
  `plh-takeshi-agent`'s `logs/poll.out.log`/`poll.err.log` (paths derived
  from the already-configured `AGENTS` entry, same as `triggerPollImpl`
  does today), each passed through `tailLines`. Missing file → `""`, not
  an error (a fresh install may not have log files yet).
- `getCompanyCommandLogTail(commandId: string): Promise<{ tail: string }>`
  — validates `commandId` against `getCompanyCommand` (reject unknown,
  same whitelist already used by every other company-command action),
  reads `.data/company-runs/<commandId>.log` via `tailLines`.
- `getDailyTeamLogLogTail(): Promise<{ tail: string }>` — reads the fixed
  `DAILY_TEAM_LOG_LOG_PATH`.

### `components/log-tail-view.tsx`

```tsx
export function LogTailView({ content }: { content: string }) {
  return (
    <pre className="max-h-40 overflow-y-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
      {content || "(no output yet)"}
    </pre>
  )
}
```
Reused, unmodified, by all three call sites.

### UI wiring

**`CompanyCommandRunner` and `DailyTeamLogButton`** (v8/v9): each
component's EXISTING poll loop (`setTimeout`-based, already checking
running/idle via `getCompanyCommandStatus`/`getDailyTeamLogStatus`) gains
one additional fetch per tick while `running` is true: call the feature's
tail action, store the result in a new piece of state, render
`<LogTailView content={tail} />` beneath the existing status text whenever
`running` is true (hidden once idle — the final result/message still
comes from each feature's existing idle-state logic, unchanged).

**`TriggerPollButton`** (v2): needs a NEW `pollUntilDone`-shaped loop added
(mirroring v8/v9's exact pattern), replacing the current
`pollStatus.running || pending` computation with real state:
`running` becomes a `useState`, set `true` on a successful `triggerPoll()`
response and driven to `false` by the new poll loop once
`getPollStatus()` reports not-running — the same shape as the other two,
just newly introduced here rather than extended. The `pollStatus` prop
(still passed from `app/page.tsx`'s server-render) seeds the initial
button state on first paint (so the button still shows "Running…"
correctly if the page loads mid-run) but the new client poll loop takes
over from there. `<LogTailView>` renders the same way as the other two
once this loop exists.

## Error handling

- A missing log file (process hasn't started writing yet, or crashed
  before creating it) returns empty string content, not an error — the
  UI shows "(no output yet)" via `LogTailView`'s own fallback.
- Tail-fetch failures during polling are swallowed at the call site (the
  existing status poll already assumes the network path works; a single
  missed tail fetch just means the view doesn't update that tick, it
  doesn't break the running/idle detection which is unaffected by this
  slice).

## Testing

- `lib/log-tail.ts`: unit tests for `tailLines` — empty content, content
  shorter than `maxLines`, content longer than `maxLines` (confirms only
  the last N lines survive), a single-line file with no newline.
- Per-feature tail actions: unit tests with real temp-dir fixtures
  (missing file → empty string; existing file → correct tail), following
  the same DI/temp-dir conventions as every other `lib/` file in this
  project.
- No live end-to-end test required for `getPollLogTail`/
  `getCompanyCommandLogTail` (they only READ existing log files v2/v8
  already write during their own already-verified live tests — this
  slice adds no new spawn/write surface). `getDailyTeamLogLogTail` must
  never be exercised against the real `~/.claude/daily-team-log/` log
  path or trigger a real run, consistent with v9's standing constraint.
- Manual UI check: load `/`, confirm the tail view element exists in the
  DOM for all three components (via reading rendered markup/component
  structure) without needing to trigger a real run of any of them.

## Open items for v11+ (explicitly deferred, not decided here)

- True push-based streaming (SSE/websockets), if polling ever proves too
  coarse in practice.
- Log rotation/size caps, if any of these logs ever grow unexpectedly
  large.
