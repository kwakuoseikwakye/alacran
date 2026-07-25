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

## v4: skill/command editor

Any entry in `/skills` can now be edited in place. Clicking "Edit" swaps
the read-only view for a textarea; "Save" shows a real diff of what will
change before anything is written. Confirming writes the file and creates
a git commit scoped to exactly that one file in its own agent's repo — no
custom version history to maintain, `git log`/`git diff`/`git revert`
already work on every edit. Writes are restricted to files that are
current, real skill/command entries — not just anything living inside an
agent's directory.

See `docs/superpowers/specs/2026-07-22-control-panel-design.md` for the
full v1 design and `docs/superpowers/plans/2026-07-22-control-panel-v1.md`
for the implementation plan this was built from.

## v5: triggering ai-company-starter-main's /verify

The "AI Company Starter" card has a "Run verify" button that runs
`scripts/verify.py --json` directly and shows the PASS/WARN/FAIL/INFO
results, with a details view for the full row list. Unlike the
`email-pipeline-agent` trigger (v2) or skill editing (v4), this needs no
confirmation dialog — `verify.py` only reads files, per its own docstring,
so there's nothing to confirm before running it.

The other 9 slash-commands under `ai-company-starter-main/.claude/commands/`
(`/decision`, `/retro`, `/define-company`, etc.) are NOT triggerable from
this dashboard yet — they're interactive, multi-turn dialogues that need a
real Claude Code session, a separate and larger mechanism than running one
existing script.

## v6: skill edit history

Every skill/command's detail panel in `/skills` now has a "History" toggle
alongside "Content". It lists every commit that has touched that file and
shows a diff for whichever one you click — reusing the same `DiffView`
v4's editor uses, just fed two revisions of the file pulled via `git show`
instead of a live draft. Nothing here writes anything; it's a viewer on
top of the git history v4's edits were already creating.

## v7: revert to a past skill revision

The History view's per-commit diff now has a "Revert to this version"
button. It reuses the exact same save action v4's editor uses — reverting
is just "write this historical content as the new current content, then
commit" — so there's no new write surface to reason about, only a new way
to supply what gets saved. The confirmation dialog diffs the file's
current content against the version you're reverting to (not the
in-commit diff shown above it, since edits since that commit could make
the two differ). Switching between Content and History always reflects
the latest saved/reverted content now, fixing a staleness gap that existed
since v6 added a second view to switch to.

## v8: run ai-company-starter-main commands

Five of `ai-company-starter-main`'s ten slash-commands (`digest`, `decision`,
`retro`, `define-company`, `handoff`) can now be run directly from the
`/skills` detail panel's new "Run" tab, instead of only from an interactive
`claude` session. Filling in the command's fields and clicking Run spawns a
real, headless `claude -p` session — but with Bash entirely disallowed and
its file-editing access scoped, via a path-scoped `Edit(<pattern>)` permission
rule (not a bare `Write` grant, which Claude Code silently never enforces by
path — only `Edit` rules are path-matched), to only that command's expected
output location, under `--permission-mode default` (not `acceptEdits`, which
would auto-approve edits anywhere in the working directory regardless of that
scoping). This exact mechanism was corrected mid-implementation after a real
live test showed an earlier `--add-dir`-based design didn't actually confine
writes at all. The spawned agent can read/grep/glob the repository and write
to that one place; it cannot run shell commands, cannot `git commit`, and
cannot call `gh`. Once the run finishes, the dashboard diffs what changed and
shows the same confirm-with-diff dialog used everywhere else in this app
before committing anything, through the same single-file-scoped commit path
v4 already established — the agent never commits on its own, and the commit
wrapper independently re-validates (via realpath'd path comparison, not the
raw path) that the file being committed is actually within the requesting
command's declared output location.

Three commands were deliberately left out: `create-epic` (files real GitHub
issues with no further confirmation gate once started — a different design
problem than this slice solves), and `ingest-context` / `office` (hard
interactive gates and a persistent background server, respectively, neither
of which fits "run once, produce a file, exit").

## v9: trigger plh-ops's daily-team-log on demand

The `plh-ops` card now has a "Run now" button that triggers the exact same
routine already registered as a nightly (22:00) scheduled task on this
machine — reading `~/.claude/daily-team-log/config.json`, summarizing the
operator's own local Claude Code session history, and committing the
result to the shared `plh-ops` repo. Unlike every other write action in
this app, this one **pushes to a remote shared with Owner's analysis
agent and teammates** — the confirm dialog discloses this plainly before
the run starts, since there's no local diff to preview beforehand (the
routine's job is to summarize and commit autonomously, same as its
existing nightly schedule). The spawned session still follows this
project's least-privilege discipline: no bare `Write` grant (only
`Edit(<output_repo>/**)`), `--permission-mode default` (not `acceptEdits`),
and Bash scoped to the exact five command shapes the routine needs — never
a blanket grant, even though this routine's prompt has no user-field
interpolation at all (there's nothing here for a user to inject into).

If the machine hasn't run the daily-team-log skill's one-time setup yet,
the button reports that plainly instead of attempting a run.

This slice was deliberately verified with unit tests only, never a real
end-to-end run — the routine reads real private session history and
pushes to a real shared repo, so the real "Run now" button is left for
the user to click themselves, at their own discretion, whenever they're
ready.

## v10: live log streaming for in-flight runs

The Owner-agent poll button, every company-command's "Run" tab, and the
plh-ops daily-team-log button all now show the growing tail of their log
file while running, instead of only a static "Running…" label — polled
the same ~3s interval each already used for its running/idle status, not
a separate mechanism. No websockets or SSE; it's the same file each
feature already writes, just read a little more of it on every tick. The
Owner-agent button also gained a real client-side poll loop for the
first time (`getPollStatus`), including a mount-time resume so loading the
dashboard while the automated 5-minute cron job happens to be running
doesn't leave the button stuck — previously it only reflected the page's
initial server-render snapshot plus its own button-press state, which
meant it never actually tracked `poll.sh`'s real running state after the
button was clicked or across a page reload.

## v13: user-typed commit messages for skill edits

Both the skill editor's save dialog and the history view's revert dialog
now have an optional "Commit message" field. Left blank, the exact same
auto-generated message (`Edit <fileName> via AI-Native control panel`)
v4 always used is still what gets committed — nothing changes unless you
type something. Typed, that text becomes the commit message instead,
trimmed of surrounding whitespace and capped at 500 characters (rejected
outright above that, not truncated, matching every other length-validated
field in this app).

## v11: register a second AI company

The dashboard's home page now has an "Add a company" form: point it at
an existing local directory (one you've already created or cloned
yourself, e.g. via GitHub's "Use this template" on `ai-company-starter-main`
+ `gh repo clone`) that has both a `.git` and a `.claude` directory, and
it becomes a fully managed agent — showing up in the agent tree, the
activity board (via a generic recent-commits feed), and the skills
browser with full editing/history/revert, with zero per-company code.
"Remove" only un-registers it; the actual directory and its git history
are never touched.

Deliberately NOT generalized to registered companies: `ai-company-starter-main`'s
"Run verify" button (v5) and its 5 runnable slash-commands (v8) — both
are hand-authored for this one company's actual script and actual
commands, and a genuinely different second company (different concept,
per the original idea behind this whole project) wouldn't have the same
`scripts/verify.py` or the same commands. Building a truly dynamic
version of either is a bigger, separate effort, not attempted here. Also
not attempted: creating a new company FROM the template automatically —
`ai-company-starter-main`'s local clone has no git remote configured, so
there's no way to discover which GitHub template to clone from the
filesystem alone; you create the new company's directory yourself, the
dashboard only registers it.

## v12: agent avatars (display-only)

Every agent card (the 3 built-in agents and any v11-registered company)
now has an inline "Save avatar" field: paste an image URL
(`https://`/`http://`/`data:image/...`) and it's shown as a small round
image on the card. This slice is deliberately display-only — it does not
call Higgsfield's image-generation MCP, because that tool isn't reachable
in any session yet (added to local config via `claude mcp add`, but a
running session has to be started after that to see it). The registry
this slice ships (`agentId -> imageUrl`, a simple key-value set,
upserting on a second save) is exactly what a future "Generate with
Higgsfield" button would feed into — no changes needed here once that
tool is reachable, just a new button that calls it and passes the result
to the same `setAvatar` action.
