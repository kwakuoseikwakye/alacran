# AI-Native Control Panel — v1 Design

## Status
Approved for implementation planning (2026-07-22).

## Problem

`~/AI-Native/` holds several independently-running pieces of agent tooling
(`plh-takeshi-agent`, `ai-company-starter-main`, `plh-ops`, plus reference
material in `harness-engineering/`), but there is no unified place to see
what any of them are doing. Checking status today means separately reading
log files, `state/processed.json`, git history, and `launchctl list` output
across four different directories.

The long-term goal is a unified UI to assign tasks to agents, manage/improve
their skills, and reuse the whole thing as a template for a second "AI
company" with a different concept. That is too much for one build. This spec
covers only **v1: a read-only status/activity board** — visibility first,
control later.

## Goals (v1)
- One local dashboard showing every registered agent and its recent activity.
- Built entirely from state these tools *already* produce — no new
  instrumentation required in `plh-takeshi-agent`, `ai-company-starter-main`,
  or `plh-ops`.
- Structured so that adding a second "AI company" later means adding a config
  entry, not rewriting the app.

## Non-goals (v1)
- Triggering, assigning, or launching agent runs from the UI.
- Editing or versioning agent skills/instructions.
- Higgsfield-generated avatars or any visual/media generation.
- Real-time push (websockets/SSE) — polling is sufficient at this scale.
- Multi-user auth — this is a single-user, localhost-only tool.
- A database — v1 reads source files/git live on each request.

## Architecture

A local Next.js (App Router) app at `AI-Native/control-panel/`, run via
`next dev` / `next start` on localhost only. Uses shadcn/ui components,
consistent with the user's existing Vercel/Next.js tooling.

```
control-panel/
├── agents.config.ts        # registry: which agents exist, which adapter reads each
├── lib/
│   └── adapters/
│       ├── types.ts        # Agent, Activity shared types
│       ├── plh-takeshi-agent.ts
│       ├── ai-company-starter-main.ts
│       └── plh-ops.ts
├── app/
│   ├── page.tsx            # Agent tree view
│   └── activity/page.tsx   # Activity/task board
└── docs/superpowers/specs/ # this file
```

Each adapter is a pure function:
`(agentRootPath: string) => Promise<Activity[]>`

Adapters never write anything — read-only by construction. A broken or
missing file in one adapter must not crash the other adapters or the page;
each adapter's errors are caught at the call site and surfaced as a
degraded-but-visible "source unavailable" state for that agent card, not a
500.

## Data model

```ts
type Agent = {
  id: string            // e.g. "plh-takeshi-agent"
  name: string           // display name
  rootPath: string        // absolute path under AI-Native/
  kind: "pipeline" | "command-set" | "report-log"
}

type Activity = {
  id: string             // stable id (e.g. hash or filename)
  agentId: string
  type: string           // e.g. "email-processed", "decision", "daily-report"
  timestamp: number      // epoch seconds
  title: string          // short human-readable summary
  status: "done" | "needs-attention" | "unknown"
  detailPath: string      // absolute path to the source file, for drill-down
}
```

`status` mapping is adapter-specific (see below); anything an adapter can't
confidently classify is `"unknown"`, never guessed as `"done"`.

## Per-agent adapters (v1 data sources — all confirmed to exist today)

### `plh-takeshi-agent`
- Source: `state/processed.json` (`processed.<id>.status`, `.attempts`,
  `.ts`) joined with matching `reports/<ts>-<id>.md` file if present.
- `status`: `"done"` if `processed.<id>.status == "done"` **and** the report
  either has no `## Needs human attention` heading, or the text directly
  under that heading is empty or matches `/^none\.?$/i`; otherwise
  `"needs-attention"`.
- Health indicator (agent tree view only, not an Activity): whether
  `launchctl list com.plh.takeshi-agent` reports the job loaded, and its
  `LastExitStatus`.

### `ai-company-starter-main`
- Sources: `docs/decisions/*.md`, `docs/handoffs/*.md`,
  `docs/retros/**/*.md`, `state/cycles/*/*/cycle.jsonl`.
- One `Activity` per file (decisions/handoffs/retros) or per JSONL line
  (cycle events). `status` is always `"done"` for these — they are records
  of completed actions, not pending work; this adapter never reports
  `"needs-attention"` in v1.

### `plh-ops`
- Source: `reports/<person>/<date>.md`, cross-referenced with
  `git log --since=<lastCheck>` in that repo for commit timestamps.
- One `Activity` per report file. `status` is always `"done"`.

## Screens

### Agent tree view (`/`)
One card per `Agent` from `agents.config.ts`: name, kind, most recent
`Activity`, and (for `plh-takeshi-agent` only) the launchd health indicator.
Mirrors AnimaWorks' org-tree-at-a-glance view, scoped to your three agents
instead of a simulated office.

### Activity board (`/activity`)
All `Activity` records across all agents, merged and sorted by timestamp,
grouped into three columns: **Done**, **Needs Attention**, **Unknown**.
Mirrors Fleece AI's Queue/Running/Awaiting-Approval/Done board, collapsed to
three columns since v1 has no in-flight/queued state (everything read is
already finished by the time a file exists on disk).
Clicking an activity opens its `detailPath` file content in a side panel.

## Reusability mechanism

`agents.config.ts` exports the array of `Agent` entries and which adapter
function to use per agent. Standing up a second "AI company" with a
different concept later means: copy the `control-panel/` app, write new
adapters for the new concept's tools (or reuse the generic file/git-log
patterns above), and point `agents.config.ts` at the new root paths. The
Next.js app itself does not change.

## Error handling
- Adapter throws (e.g. malformed JSON, missing directory) → caught per-agent,
  rendered as a "source unavailable" card state with the error message,
  never a page-level crash.
- Missing `launchctl` binary or job not found → health indicator shows
  "unknown", not a crash.

## Testing
- Unit tests per adapter against fixture files (copies of real
  `processed.json`/report/decision files) covering: normal case, missing
  file, malformed JSON, empty directory.
- Manual verification: run `next dev`, confirm both screens render against
  the real `AI-Native/` directories, confirm a card degrades gracefully if a
  source path is temporarily renamed during testing.

## Open items for v2 (explicitly deferred, not decided here)
- Triggering agent runs from the UI.
- Skill viewing/editing/versioning UI.
- Optional Higgsfield-generated agent avatars.
- Real second "AI company" instance beyond the config mechanism above.
