# AI-Native Control Panel

Local dashboard for the agents/tools in `~/AI-Native/`
(`email-pipeline-agent`, `ai-company-starter-main`, `plh-ops`). Shows each
agent's most recent activity and a merged activity board, built entirely
from files/state those tools already produce — `email-pipeline-agent` has a
single trigger action (see "v2" below), while `ai-company-starter-main` and
`plh-ops` remain read-only.

## Run it

    npm install
    npm run dev

Open http://localhost:3000 for the agent tree view, or
http://localhost:3000/activity for the merged activity board.

## Test it

    npm test

## Add a new agent

1. Add an entry to `AGENTS` in `lib/config.ts` with a unique `id` and its
   `rootPath`.
2. Write an adapter in `lib/adapters/<id>.ts` implementing the `Adapter`
   type from `lib/adapters/types.ts` — a pure, read-only
   `(agent) => Promise<Activity[]>` function. Follow the existing adapters
   as examples of the error-handling pattern (never throw past your own
   boundary; return `[]` or skip on missing files).
3. Register it in `ADAPTERS` in `lib/config.ts` under the same `id`.
4. Add adapter tests under `lib/adapters/<id>.test.ts` using a temp
   directory (see `lib/adapters/plh-ops.test.ts` for the pattern).

`lib/config.test.ts` will fail if `AGENTS` and `ADAPTERS` ever drift out of
sync, so a missing adapter registration is caught immediately.

## Known v1 limitations

- No way to trigger/assign runs for `ai-company-starter-main` or `plh-ops`
  from this UI (see "v2" below for the one exception: `email-pipeline-agent`).
- No skill-editing/versioning UI yet.
- `ai-company-starter-main`'s `state/cycles/*/*/cycle.jsonl` parsing is
  best-effort/lenient, since that directory ships empty by default and its
  exact schema wasn't verified against real data.
- `plh-ops` activity timestamps come from the report filename, not git log
  (see the adapter's inline note for why).

## v2: triggering email-pipeline-agent

The Email Pipeline Agent card has a "Run now" button that runs `bin/poll.sh`
immediately instead of waiting for the next scheduled 5-minute launchd tick.
It's safe to click at any time — `poll.sh` has its own lock file
(`state/poll.lock`) that makes an overlapping run (whether triggered here or
by the scheduler) a fast no-op rather than a double-run. The button is
disabled and shows "Running…" whenever that lock is held, regardless of what
started the run.

This is still the only write action in the app — `ai-company-starter-main`
and `plh-ops` remain read-only in this dashboard.

## v3: skill/command browser

`/skills` lists every skill and command across all three agents — read-only,
same as v1's status board. It's built from the same YAML frontmatter
(`name`/`description`) every skill/command file already has; nothing new to
maintain in those files. Clicking an entry reuses the same file-detail Server
Action the activity board uses (`lib/get-activity-detail.ts`), since every
skill/command lives inside an agent root that function already trusts.

Still no editing — this is a viewer, not yet an editor. Adding a 4th agent
means writing one adapter under `lib/skills/` matching the pattern of the
existing three, registering it in `SKILL_ADAPTERS` in `lib/config.ts`, same
as adding an activity adapter.

See `docs/superpowers/specs/2026-07-22-control-panel-design.md` for the
full v1 design and `docs/superpowers/plans/2026-07-22-control-panel-v1.md`
for the implementation plan this was built from.
