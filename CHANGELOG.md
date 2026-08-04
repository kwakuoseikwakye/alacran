# Changelog

Alacrán was built one small, versioned slice at a time — brainstorm, written
design spec, written plan, implement, verify against the real thing, merge.
This file is the chronological record of every slice that shipped, kept in the
detail it was written in rather than compressed into release notes.

The matching design specs and implementation plans live in
[`docs/superpowers/`](docs/superpowers/), one per slice.

Versions here are internal slice numbers, not semantic-version releases; see
[the releases page](https://github.com/kwakuoseikwakye/alacran-releases/releases)
for downloadable builds.

## v1: read-only status board

The first slice: an agent tree view (`/`) plus a three-column activity board
(`/activity`), with one adapter per agent reading state those tools already
produced on disk. Introduced the symlink-safe file-detail Server Action
(`lib/get-activity-detail.ts`) that every later read path reuses.

Known limitations at the time, all since resolved: no way to trigger runs from
the UI (v2 added the first), no skill-editing or versioning UI (v4/v6/v7), and
best-effort parsing of a cycle-log format that shipped empty by default.

## v2: triggering plh-takeshi-agent

The Takeshi Email Agent card has a "Run now" button that runs `bin/poll.sh`
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
`plh-takeshi-agent` trigger (v2) or skill editing (v4), this needs no
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
this app, this one **pushes to a remote shared with Takeshi's analysis
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

The Takeshi-agent poll button, every company-command's "Run" tab, and the
plh-ops daily-team-log button all now show the growing tail of their log
file while running, instead of only a static "Running…" label — polled
the same ~3s interval each already used for its running/idle status, not
a separate mechanism. No websockets or SSE; it's the same file each
feature already writes, just read a little more of it on every tick. The
Takeshi-agent button also gained a real client-side poll loop for the
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

## v14: design system, nav, and Agents page (piece 1 of 3)

The first of 3 slices for a full visual pass, brainstormed with real
screenshots of the app as it looked before this work (not assumed from
memory) and a browser-based mockup comparison. Dark, Linear/Vercel-
inspired palette (one indigo accent, three semantic status colors),
replacing the plain grayscale shadcn defaults — dark-only, not a
light/dark toggle, since this is a personal, single-operator tool kept
open for hours, not a multi-tenant product. A missing `Input` primitive
(this project only ever added `Textarea`) replaces every single-line
field that was awkwardly using a multi-line textarea. The "Add a
company" form — previously always-open with the same visual weight as a
real agent card — is now a collapsed disclosure. Nav gained an
active-route indicator and icons. No functional changes anywhere; every
existing action (register/remove a company, save/remove an avatar, edit
a skill, revert to a past revision) works exactly as before, just
restyled.

Two more slices follow: v15 restructures the Activity page (currently a
single 12,000+px column with no grouping), and v16 covers the Skills
page, remaining dialogs, and a full responsive audit at phone/tablet/
desktop widths.

## v15: Activity page restructure (piece 2 of 3)

Second of 3 slices for the visual/UX pass (v14 shipped the design system,
nav, and Agents page). The `/activity` page previously rendered a fixed
3-column status board where each column listed every matching activity
with no grouping or limit — a real screenshot before this work measured
the page at 12,000+px tall. Replaced with two sections: a "Needs
Attention" list pinned at the top (always expanded, so nothing that needs
action is ever buried in scroll), and a day-grouped history feed below it
— today's activities expanded by default, every earlier day collapsed
into a one-line, click-to-expand header. No data-fetching or adapter
changes; this is a client-side grouping and rendering change only, using
a new pure `groupActivitiesByDay` helper (unit tested for the
midnight-straddling edge case) and a new `ActivityDayGroup` component.

One more slice follows: v16 covers the Skills page, remaining dialogs,
and a full responsive audit at phone/tablet/desktop widths.

## v16: Skills page, remaining dialogs, and responsive audit (piece 3 of 3)

The third and final slice of the visual/UX pass (v14: design system, nav,
Agents page; v15: Activity page restructure). Unlike v14/v15, this
slice's scope came from a direct audit — reading every remaining
dialog-bearing component and taking real Playwright screenshots at
375/768/1280px — rather than a mockup, and fixed exactly what that audit
found: detail Sheets (Activity, Skills, and the verify-results dialog)
were cramped and overlapping the page below the 640px breakpoint, because
each consumer's `sm:max-w-xl` only overrides the desktop width, leaving
the Sheet primitive's own mobile-width default (`w-3/4`) in place; the
diff view's added/removed text colors relied on a `dark:` Tailwind
variant that never activates in this dark-only app, so it's now using
this project's own `--success`/`--destructive` design tokens instead;
the company-command runner's single-line fields still used a `rows={1}`
`Textarea` (the one place v14's `Input`-primitive sweep missed); and the
Skills page's kind badges ("skill"/"command") had no color coding, unlike
the Agents page. Every other page and component, at every tested width,
was already correct — this slice touches only what the audit confirmed
needed it.

This completes the 3-slice visual/UX pass.

## v17: create a company from the template

"Add a company" (v11) could only register a directory that already had
`.git` and `.claude` — there was no way to create one. This slice adds
that: when the typed path doesn't exist yet (but its parent directory
does), the form now offers to scaffold it from `ai-company-starter-main`'s
generic parts before registering it, instead of immediately erroring.

`ai-company-starter-main` is simultaneously this template's origin *and*
a real, working company (real ontology data, real session history, real
decisions) — so this isn't a blind directory copy. An explicit manifest
(`lib/company-template-manifest.ts`) lists exactly which ~40 paths are
genuinely generic (`.claude/*`, `docs/templates`, `scripts/verify.py`,
empty `definitions/`/`notes/` structure, etc.) and copies only those;
everything else (the real ontology, real decisions, the teaching
`examples/` demo, an unrelated leftover project's `.kiro/specs/`, the
optional `tools/office/` visualization plugin) is never touched. A fresh
`HANDOFF.md` is generated rather than copying the real 172-line session
history. The new directory gets its own `git init` and initial commit,
then registers through the existing, unmodified `registerCompanyImpl`.

This is piece 1 of a larger roadmap toward a Fleece.ai-style onboarding
experience built on `ai-company-starter-main` as the core: guided
company-context setup (v18), integrations setup (v19), and guided
command/workflow discovery (v20) are named but not yet designed.

## v18: guided company-context setup

`/define-company` (the Claude Code command that fills in a new company's
`definitions/ontology/company.yaml`) is fully conversational — it assumes
the user is comfortable chatting with an AI agent in a terminal. This
dashboard's audience is non-technical people setting up their AI
company, so v18 adds a plain step-by-step wizard instead: business
domain, stakeholders, value flow, and biggest bottleneck, one screen at a
time, with a plain-language review before saving — no YAML, no terminal.

`/define-company` does two different things: asking those four
structured questions, and using the AI agent's own reasoning to *invent*
industry-specific `customer`/`org`/`product` domain entities. This slice
only does the first — the entity sections are copied unmodified from the
company's own `docs/templates/ontology-starter.yaml` (the same skeleton
v17 already scaffolds into every new company). Real AI-assisted entity
generation is deferred until v19 (connect an agent) exists, so it can use
an already-connected agent instead of this dashboard building its own
AI-calling infrastructure just for this.

The "Set up your company" button appears on any `command-set`-kind
agent's card that doesn't have a `company.yaml` yet — which in practice
today means a company just created via v17, since `ai-company-starter-main`
already has one. This is the first slice to add a real npm dependency
(`yaml`, for correct escaping of free-text answers into generated YAML)
rather than reusing what was already installed.

This is piece 2 of the roadmap toward a Fleece.ai-style onboarding
experience (v17: create a company; v19: connect an agent/integrations;
v20: guided command/workflow discovery — still just named, not designed).

## v19: integrations status

The roadmap named v19 "integrations setup (email, calendar, etc.)" —
investigating what that actually means today found that `plh-takeshi-agent`'s
email connection isn't something this dashboard could meaningfully
"set up": it's the `gog` CLI tool, authenticated once at the OS level
outside any repo, with only a plain, non-secret `account` field in
`config.json` visible in-repo. New connections already have a
purpose-built, carefully security-conscious process
(`ai-company-starter-main`'s `api-connect` Claude Code skill — never lets
a secret touch chat, hands off via `.env`-paste only, the AI never logs
in or clicks "agree"/"create" buttons). Reimplementing any part of that
inside this web app — OAuth flows, credential storage — would duplicate
an already-solved mechanism and turn the dashboard into a
credential-holding system in its own right.

It also turned out a freshly-scaffolded company (v17) has nothing that
would *use* a connected integration yet — `plh-takeshi-agent`'s email
pipeline is bespoke to Kirirom, not part of the generic template. So
there's no real "connect email for your new company" scenario to build
today; that becomes real once v20 (workflow/plugin install) exists.

Given that, v19 ships what's actually real: a read-only "Integrations"
line on every agent card. `plh-takeshi-agent` shows its already-configured
email account; every other agent honestly shows "none configured yet."
No OAuth, no credential storage, no new dependency — one file read, one
hardcoded check for the one real example that exists.

This is piece 3 of the roadmap. v20 (guided command/workflow discovery,
possibly formalizing a "plugin" concept) is next, still just named, not
designed.

## v20: install the daily-team-log workflow

The roadmap named v20 "guided command/workflow discovery, possibly
formalizing the plugin concept." Investigating what's real found that
command/workflow discovery has been fully solved since v11 (the Skills
page already scans any registered company's `.claude/skills/` and
`.claude/commands/`) — nothing needed there. "Formalize the plugin
concept" as a general, reusable packaging format has no existing
mechanism to build on anywhere in this ecosystem — every real workflow
(`plh-takeshi-agent`'s 6-role email pipeline, `plh-ops`'s
`skill-installer`) is bespoke to its own repo. Designing a real
plugin-packaging format from scratch would be a bigger effort than
v17-v19 combined, for a population of examples this project deliberately
keeps at one.

So v20 hand-builds a one-off installer for exactly one workflow instead:
`plh-ops`'s `daily-team-log` skill, chosen because it's the one workflow
in this whole ecosystem that was already designed to be portable — its
own `config.example.json` and self-bootstrapping `Setup.md` already
auto-detect who's using it and which projects to include, entirely
locally (no OAuth, no external API). Its extractor script, `gather.py`,
is copied verbatim (confirmed zero PLH/Takeshi-specific content); its
`SKILL.md` and `Setup.md` are regenerated rather than copied, since the
originals hardcode cloning `takeman555/plh-ops` and writing into
`reports/{Eito,Lucce,Nana}` — copying them as-is would have pointed a
new company's daily reports at PLH's shared repo instead of its own. The
"Install daily-team-log" button appears on any `command-set`-kind
agent's card that doesn't have it yet; the actual bootstrap (who you
are, which projects, scheduling) still happens inside Claude Code
afterward, the same division of labor v19 established for `api-connect`.

**Known, disclosed limitation:** `gather.py`'s config lives at a fixed,
global, per-machine path (`~/.claude/daily-team-log/config.json`), not
scoped per-installation — documented in the installed `SKILL.md` itself.
Only one company's `daily-team-log` can be actively bootstrapped per
machine at a time in this version; fixing that would mean redesigning
`gather.py`'s config storage, exactly the "generalize the format" work
this slice deliberately didn't do.

This is piece 4 of the roadmap.

## v21: AI-generated ontology entities via generalized define-company

After v20, two roadmap threads remained unscoped: a fresh company having
a real integration to connect, and AI-generated `customer`/`org`/
`product` ontology entities via a connected agent (deferred since v18).
Investigating the first found no small next step — a fresh company
already has `api-connect` available as a skill, but no generic workflow
in `ai-company-starter-main`'s template consumes an external
integration, and building one would mean designing something like
`plh-takeshi-agent`'s bespoke email pipeline as a generic feature — the
same scale of "no format to build on" problem v20 declined to solve.

The second turned out to already be mostly built. v8 (long before v18's
wizard existed) already shipped a fully-specified `define-company`
command in `lib/company-commands/registry.ts` that spawns a headless
`claude -p` session and uses the AI's own reasoning to write
`definitions/ontology/company.yaml`'s customer/org/product domains —
exactly the entity-generation half of `/define-company` that v18
explicitly deferred as needing "a connected agent." It just didn't work
for any company besides `ai-company-starter-main`, hardcoded in four
places. v21 generalized all three backend files
(`run-company-command-impl.ts` and the status/log-tail/result/commit
wrappers) to accept a target `agentId`, resolved via
`getEffectiveAgents()` — the same security boundary
(`resolveWithinAgentRoot`) already worked against any registered
company, it just wasn't being asked to. Along the way, found and fixed
a real, previously-invisible bug: the run-lock/run-result/log files were
keyed only by command id in one shared directory, so a second company
running `define-company` would have silently overwritten a first
company's unconfirmed result. `COMPANY_COMMANDS_DATA_DIR` is now scoped
per agent (`.data/company-runs/<agentId>/`).

Scope stayed narrow on purpose: only `define-company` is generalized —
`digest`/`decision`/`retro`/`handoff` still only run through the
existing Skills-page "Run" tab, unchanged and still
`ai-company-starter-main`-only. The one new entry point is a step added
to v18's wizard: after the same 4 questions, "Save now" keeps v18's
exact generic-entity behavior, and a new "Let AI draft tailored
entities" option spawns `define-company` headlessly using the same
answers (reformatted from the wizard's structured shape into the plain
free-text fields `define-company` expects), polls, and shows the AI's
diff for confirmation before committing — nothing is written until the
user explicitly confirms, same as every other write path in this
project.

Per the user's explicit choice, live verification for this slice is
unit-tests-only for the real spawn path (same precedent as v9) — every
prior slice's live test was a near-instant, zero-cost local operation,
and actually triggering `define-company` means a real, paid `claude -p`
session with genuine reasoning time. The generalized plumbing and the
wizard's new step are verified with fake spawn/exec functions and a
live UI walkthrough up to confirming the run reports "Started"; the
real button ships working, and a real end-to-end AI-generated diff is
left for the user to trigger themselves whenever ready.

This is piece 5 of the roadmap.

## v22: check-inbox — a real, generic integration-consuming command

After v21, one roadmap thread remained: a fresh company having a real
integration worth connecting. Investigating turned up two things prior
slices had missed. First, `harness-engineering` — named as "core"
alongside `ai-company-starter-main` since v17 but never examined — is a
clone of a third-party public repo (a methodology thesis on writing
agent-facing docs), not functional infrastructure; `ai-company-starter-main`
doesn't reference it. Second, and the real finding: `plh-takeshi-agent`'s
"email connection," long assumed bespoke, is actually a call into `gog`
(gogcli) — a real, already-installed, general-purpose Google API CLI
(Gmail, Calendar, Drive, and more) with its own OAuth account store. And
`api-connect` (already scaffolded into every company) is a fully generic
"connect anything" skill that already handles OAuth for exactly this kind
of tool.

So "connect an integration" was never the missing piece — it's already
solved and already generic. The actual gap was narrower: no command in
the template *does* anything with a connected integration. v22 adds
exactly one: `check-inbox`, a strictly read-only "summarize my unread
mail" command that runs `gog -a auto gmail search`/`get` and writes a
metadata-only summary to `notes/company/email-checks/`. It never sends,
labels, archives, or reads message bodies.

Two pieces of machinery made this fit the existing system. The headless
command-runner (v8, generalized in v21) spawned every command with
`--disallowedTools "Bash"`; `check-inbox` is the first that needs a real
CLI, so `CompanyCommand` gained an optional `bashPatterns` field — a
command that declares patterns gets narrowly-scoped `Bash(gog ...)`
access (exactly the two read-only gog calls, nothing else) instead of a
blanket disallow, reusing the same scoped-Bash approach v9's
`daily-team-log` trigger already used. The 5 existing commands omit the
field and spawn byte-identically to before. And the Skills-page "Run"
tab, gated to `ai-company-starter-main` only since v21, now opens to any
`command-set` company — a natural completion of v21's generalization,
running each command against the selected company's own repo. The
`check-inbox.md` command file was added to the `ai-company-starter-main`
template, so every new company inherits it through v17's existing
whole-folder copy.

**Known, disclosed limitation:** `gog`'s auth store is global
per-machine and `check-inbox` uses `-a auto`, so only one company can
meaningfully have its own connected Google account active for this
command at a time — the same shape as v20's `daily-team-log`
config-collision limitation, documented rather than fixed.

This is piece 6 of the roadmap.

## v23–v25: productize (Day 1 of the 4-day launch push)

The project pivoted from a personal local tool to a downloadable product
(see `LAUNCH.md` for the launch runbook). Day 1 makes a fresh install a
clean product while the developer's own machine keeps full daily use
with zero setup, split into three slices:

- **v23 — de-PLH the config.** The 3 example agents (`plh-takeshi-agent`,
  `ai-company-starter-main`, `plh-ops`) were hardcoded in `lib/config.ts`
  at `~/AI-Native/*` paths. They now load via a testable
  `buildBuiltins(exists)` (`lib/builtin-agents.ts`) **only if their
  directories exist on disk**. On a developer machine they exist → all
  three load with their full bespoke features (v2/v5/v9/v19/v20),
  unchanged, zero setup. On a fresh install none exist → `AGENTS`/
  `ADAPTERS`/`SKILL_ADAPTERS` are empty → the app starts clean. Their
  bespoke features already gate on `agent.id`, so they simply go dormant
  when absent — no deletion. Also: the install-daily-team-log button now
  hides when its `plh-ops` source is absent (no broken action on a fresh
  install), and the two cosmetic "ai-company-starter-main template"
  strings are genericized to "company starter template".

- **v24 — bundle the template.** Creating a company copied from
  `~/AI-Native/ai-company-starter-main`, which doesn't exist on a user's
  machine. The cleaned template (exactly v17's audited `TEMPLATE_MANIFEST`
  allowlist) is now a committed in-repo snapshot at
  `templates/company-starter/`, and the create action sources from there —
  deterministic, offline, no `~/AI-Native` dependency. The impl was
  already parameterized on the source path, so this was a one-line
  repoint plus the bundled files (scrub-verified free of PLH/Kirirom
  data).

- **v25 — first-run onboarding + dependency detection.** An empty agent
  list now renders an `OnboardingWelcome` screen (instead of a bare grid)
  with a `checkDependencies()` server action that detects Claude Code CLI
  + `gog` on `PATH` and shows detect-and-guide install steps for whatever
  is missing, plus the "create your first company" CTA. Matches the
  locked launch decision to target CLI-comfortable early adopters with
  guided (not automated) dependency install.

These are Day 1 of the launch; see `LAUNCH.md` for the full plan.

## v28: Connect page — detect/guide/re-check for your tools

Onboarding *promised* "connect your AI agent / Gmail," but connecting still
required dropping to a terminal blind — the one genuine in-app break on the
buy→launch→create-company→**connect Google**→run-`check-inbox` golden path.
Investigation confirmed connecting is inherently an interactive CLI/OAuth
flow (`gog auth setup` opens a browser for consent; Claude login happens in
the `claude` CLI), so the app can't own it — but it *can* honestly detect
state. `gog auth status -j` returns clean JSON (`account.email`,
`credentials_exists`, **no tokens**), and `which claude` detects the agent.

v28 ships a dedicated, machine-global **`/connect`** page (both `gog` auth and
Claude login are per-machine, not per-company) using the same
**detect → guide → re-check** pattern as v25's dependency check:

- **`lib/connect/connect-status-impl.ts`** — `getConnectStatusImpl(execFn?)`
  (injectable `ExecFileFn`) probes both tools and returns a typed
  `ConnectStatus` with per-tool `connected` + `detail` + copy-able connect
  `command` + install link. Each probe is independently try/caught; the JSON
  parse is guarded. **Read-only** (`which`, `gog auth status -j`) — no writes,
  no OAuth, no credential storage, and **no `claude` spawn** (honors the
  standing no-auto-spawn safety rule; login is proven by running a command,
  not detected).
- **`lib/connect/connect-actions.ts`** — zero-extra-param `"use server"`
  `getConnectStatus()` (seam stays in the impl), same shape as
  `checkDependencies`.
- **`app/connect/page.tsx`** (`force-dynamic`) fetches initial status
  server-side (no loading flash) and renders **`components/connect-panel.tsx`**
  (client): two tool cards with a Connected/Not-connected badge, guidance
  steps, a code block + Copy button for the connect command, and a global
  **Re-check** button that re-invokes the action. Nav gains a **Connect**
  link; onboarding links to it.

5 new unit tests (both-connected / claude-missing / gog-missing / no-account /
malformed-JSON) with a fake `ExecFileFn`; 277 tests green; `tsc`/`build`
clean; live-verified both the connected path (real account email shown) and
the not-connected guidance UI. See
`docs/superpowers/specs/2026-07-28-control-panel-v28-connect-tools-design.md`.

## v29 (2026-07-28): one design language — Alacrán across app + landing

The landing site and the dashboard had drifted into two different products:
the site was the Alacrán brand (warm near-black, red scorpion, Geist, glass
nav, light-by-default), the app was the generic indigo `#5865f2` shadcn dark
theme from v14. Asked which way to unify, the user chose **brand wins** — the
app moves onto the Alacrán palette and the two share one language.

**Design tokens.** `app/globals.css` keeps every v14 token *name* and changes
only the values (venom-night surfaces `#0c0708`/`#16100f`, bone text, one red
accent `#ff2e43`, warm `#241a19` borders) — so per the standing rule **no
`components/ui/*` primitive was edited**; the whole re-skin cascades. Two
judgement calls: `--destructive` became a flatter `#ff4d4d` so an error never
reads as a call to action next to a red brand accent, and `AgentCard`'s kind
badges moved off blue/violet/teal onto warm ember/amber/teal.

**Type.** Nunito (display) + Nunito Sans (body) replace Geist on both halves.
The app loads them through `next/font/google`, which downloads and self-hosts
at build time — **verified: 10 `.woff2` in `.next/static/media`, no
`fonts.gstatic.com` reference in the server output**, so the packaged `.app`
still renders correctly with no network. Nunito is rounder and optically wider
than Geist, so headings went to weight 800 with `-0.02em` tracking instead of
700/`-0.035em`.

**Real product marks.** `scripts/generate-brand-icons.mjs` extracts official
path data from the Simple Icons dataset (CC0) into two committed artefacts —
`lib/brand-icons.ts` (React `<BrandIcon>`) and `landing/brands.js` (an SVG
`<symbol>` sprite). `simple-icons` is `--no-save`, build-time only: the shipped
app has no runtime dependency and works offline. Marks are monochrome by
default and take the vendor's colour only when it means something (a live
connection, a hover, the hero orbit), so a wall of logos doesn't fight the
single-accent palette. Each has an `onDark` variant because GitHub, Notion,
Anthropic and Apple ship pure-black marks that would be invisible.
**Slack and OpenAI are deliberately absent** — both vendors had their marks
withdrawn from Simple Icons, and a redrawn trademark is worse than none; they
are named in prose instead.

**Interactive onboarding.** `OnboardingWelcome` went from a static checklist to
a three-step flow (Install → Connect → Create) with a clickable step rail,
per-step live detection, animated status chips, copy-able install/auth
commands, "Skip for now" escapes, and a **`focus`/`visibilitychange`
re-probe** so leaving to run `gog auth setup` in a terminal and coming back
updates the flow without a manual click. It composes the existing
`checkDependencies()` (installed?) and `getConnectStatus()` (signed in?)
actions — no new server surface. `AddCompanyForm` gained an optional
`prominent` prop so the final step gets a real CTA while the dashboard keeps
its quiet ghost button.

**Motion.** A small vocabulary in `globals.css` (`a-rise`, `a-pop`, `a-live`,
`a-sweep`, `a-glow`, `a-float`, `a-glass`) driven by a `--d` custom property
for staggered entrances, all disabled under `prefers-reduced-motion`.

**Landing.** Now **dark by default** (the app has no light mode, so a
light-by-default site was the single biggest mismatch); the toggle survives as
an opt-in and now persists to `localStorage`, applied by a head-level script so
there's no flash. New sections: a counter-rotating **orbit** of real product
marks around the scorpion (marks counter-spin to stay upright), and an
**"Inside the app"** panel built from the same tokens as the real dashboard —
same glass nav pill, same card shapes, same kind-badge colours. The emoji
favicon was replaced with the real mark (`landing/favicon.svg` + `app/icon.svg`,
which also fixes a 404 the app was serving for `/favicon.ico`).

**Four real bugs found and fixed during live verification, not review:**
1. `.nav` used `position:fixed; left:50%; transform:translateX(-50%)` — a fixed
   element at `left:50%` only gets **half the viewport** as available width, so
   shrink-to-fit wrapped the CTA to two lines and, at `border-radius:999px`,
   turned the whole bar into a lozenge. Fixed with `left:0; right:0;
   margin-inline:auto; width:fit-content`.
2. The orbit's satellite radius was a hard-coded `196px` while its container
   shrank to `min(460px,84vw)` — on a 375px phone the marks sat at `-37..412`
   and pushed the document to a 462px scroll width. Radii are now derived from
   a `--size` custom property.
3. The app nav's scrolling link row lacked `min-w-0`: a flex child defaults to
   `min-width:auto` and refused to shrink, pushing "Connect" off-screen and
   making the whole page scroll horizontally at 364px.
4. `CardTitle` is a **grid** item inside `CardHeader`, so its automatic minimum
   size meant `truncate` never engaged and the title overflowed its own card.
   Fixed on the two consumers (`connect-panel`, `agent-card`), primitive
   untouched.

Verified: `tsc` clean, **277 tests green**, `eslint` 0 errors (2 pre-existing
warnings in untouched test files), `npm run build` clean. Live-checked with
real screenshots at 1280px and 375px across the dashboard, the Connect page
(both the real connected account and, via a `HOME`-pointed-at-an-empty-dir dev
server, the not-connected path), all three onboarding steps, and the landing
site — plus a scripted overflow audit confirming **no horizontal scroll and
zero escaping elements** at 364px on both halves.

### v29a: the supplied scorpion artwork becomes the logo

The user supplied `landing/scorpion.png` and asked for it as the logo, in red.
Two things had to be solved before it could sit on a dark surface.

**It isn't what its name says.** Despite the `.png` extension the file is a
**JPEG, 840x916, RGB with no alpha** — the "transparency" is a checkerboard
pattern flattened into the image. So the artwork had to be keyed out.

**A luminance threshold would have punched holes in it**, because interior
white highlights are exactly as bright as the background. Instead
`scripts/generate-logo.py` labels every light region as a connected component
and classifies it by the *checkerboard signature*: the background alternates
239/255, so ~50% of its pixels are "dim" (<247), while an interior highlight is
uniformly white. Measured on the real file the separation is clean — outer
background 54% dim, the two regions enclosed by the pincer loops 55% and 50%,
every genuine highlight between 4% and 11%. That gap is what the threshold
splits, and it is why the enclosed loops come out transparent while the
highlights survive. Edges are then feathered by luminance, since JPEG blurs
background into outline over a pixel or two.

Colour is a gradient map of luminance onto the brand's scorpion gradient. The
darkest stop was lifted from `#8c0f1c` to `#a61426` after comparing renders at
22/40/84px: the original floor made outlines vanish against the near-black
surface and the 20px nav mark read as a blob. Lifting further (`#c01a2e`)
flattened the segmentation detail at large sizes.

Outputs are committed, so neither the build nor CI needs PIL: `landing/logo.png`
and `components/alacran-logo.png` (600px, quantised to a 128-colour palette —
192 KB → 33 KB) plus 128px favicons at `landing/favicon.png` and `app/icon.png`.

Wiring: `AlacranMark` now renders the raster through `next/image` with a
**static import** — the file lands in `.next/static/media`, which
`scripts/package-macos.sh` already copies — and with **`unoptimized`**, because
the packaged desktop build ships no `sharp` and running a 33 KB bundled PNG
through the Image Optimization API would buy nothing. Verified: the rendered
markup carries `data-nimg` with **zero `/_next/image` URLs**. All 7 landing
pages dropped the inline `#alacran` SVG symbol for `<img src="logo.png">`
(0 leftover references), and every mark is sized by width with `height:auto` —
the art is 600x626, so the old fixed squares would have squashed it ~4%
(measured after: rendered ratios 1.038/1.042 against a native 1.043).

The Three.js hero emblem was replaced by the artwork, and the now-unreferenced
`landing/vendor/three.min.js` (656 KB) and `landing/logo3d.js` were deleted —
both recoverable from git history if you want the 3D version back.

## v30: starter template expansion — 7 categorized packs + real landing copy

Expanded the starter-pack system from 4 packs to 7, organized into
categories (General / Engineering / Sales / Marketing / Support / HR &
People / Leadership) modeled on fleeceai.app/templates' category set.
`marketing-sales` was split into separate **Sales** (`/follow-up-lead`) and
**Marketing** (`/draft-campaign`) packs — their ontology and commands moved
over unchanged, just partitioned by domain (`customer` → Sales, `product` →
Marketing). Two new packs were built fresh: **Customer support**
(`customer.ticket` ontology, `/triage-ticket` + `/draft-response`) and **HR &
People** (`org.candidate` ontology, `/screen-candidate` + `/draft-offer` —
`/draft-offer` explicitly routes through `.claude/rules/hitl-gate.md` since
compensation/contract terms are named triggers there). `lib/company-starter-packs.ts`
gained a `category` field; the "Add a company" picker
(`components/add-company-form.tsx`) now groups its radio-card grid under
category headings instead of one flat list — no new page or filter UI, per
the deliberate choice to keep this app's plain-dashboard aesthetic rather
than build Fleece's full tabbed gallery. `landing/templates/index.html`,
previously stale (it said "more starters soon" while packs already
shipped), now names all 7 real packs with real descriptions, grouped the
same way. See
`docs/superpowers/specs/2026-07-30-control-panel-starter-template-expansion-design.md`.

## v31: scheduled-runs toggle for the Takeshi agent

The `plh-takeshi-agent` card's launchd status line becomes an interactive
on/off control for the job's recurring schedule
(`com.plh.takeshi-agent`, `StartInterval` 300s). Before this slice the
dashboard could start a poll (v2's "Run now") and observe it, but
stopping the schedule needed `launchctl unload` in a terminal. New
`lib/scheduled-job/`: `set-scheduled-job-impl.ts` shells `launchctl
load`/`unload` against a hardcoded plist path
(`TAKESHI_LAUNCHD_PLIST_PATH`, never a parameter — the Server Action is
browser-reachable, and a caller-supplied path would let it unload
arbitrary launchd jobs), then decides success by reading the job's
actual state back via the existing `checkLaunchdJob()` and comparing it
to what was requested, rather than trusting the command's exit code.

That resulting-state check turned out to be necessary, not merely
defensive. Live verification found one exit-code anomaly on macOS
(observed on 26.2): a redundant `unload` on an already-unloaded plist
prints a failure to stderr but exits 0, so `promisify(execFile)` —
which only rejects on a non-zero exit — never throws. No case of
`launchctl` exiting non-zero was ever observed; the impl still catches
a thrown error as a defensive fallback for failure modes that weren't
triggered in this test (a missing plist, a permissions error), not
because any of them is known to exit non-zero. Reading the state back
via `checkLaunchdJob()` is the one check that covers both without
needing to know in advance which exit code a given failure produces.

Unload also stops a run already in progress, not only future scheduled
runs — measured directly (a disposable long-running LaunchAgent's PID
was gone immediately after `launchctl unload`, confirmed again ~2s
later), not assumed. The confirm dialog (required in both directions)
discloses this before turning the schedule off. "Run now" (v2) stays
independent of the schedule either way. The control renders only when `plh-takeshi-agent` is a present
existence-gated built-in AND its plist file exists, so a fresh install
sees nothing. The displayed state always comes from a real
`checkLaunchdJob()` read taken after the attempt, never an optimistic
guess, so a failed unload can never render as "off". Like v2 (Run now),
v9 (daily-team-log trigger) and v19 (integration status), this is
deliberately bespoke to one agent id — the population is one; generalise
if a second scheduled agent ever exists.

Live verification used a disposable `com.alacran.testjob` (running
`/usr/bin/true`), never the real Takeshi job, per the standing safety
rule: toggled through the real `launchctl` code path, confirmed via
`launchctl list` before and after, then deleted. The real Takeshi job's
state was confirmed unchanged at three checkpoints during the session;
the toggle's confirm dialog was opened and cancelled against the real
card, never confirmed. The real button is left for the maintainer to
click. See
`docs/superpowers/specs/2026-08-04-control-panel-v31-scheduled-job-toggle-design.md`.

### Follow-up: make "off" persistent (same day)

The bare `unload`/`load` above turned out to have a gap: a bare `unload`
writes no persistent disable override at all (measured, macOS 26.2 —
the label stays absent from `launchctl print-disabled gui/$UID`), so
"off" had nothing backing it across a logout or reboot. The maintainer
decided Stop and Start now use `-w` in both directions: `unload -w`
writes a `=> disabled` entry, and `load -w` clears it. That second half
was the risk — only `launchctl enable` was previously proven to clear
an override, not `load -w` — so it was measured before being written
down: a disposable `com.alacran.wtest` job (macOS 26.2, build 25C56) was
taken through `unload -w` → `load -w` twice, and both round-trips
reliably cleared the override (`=> enabled`) and reloaded the job. A
second, independent exit-code lie was found along the way and is now
documented in the impl's doc comment: a bare `load` while the override
is set silently no-ops (job never loads) while still exiting 0, stderr
reporting `Load failed: 5: Input/output error` — the same
exit-code-lies pattern the resulting-state check already existed to
handle, on the opposite verb. This is a real trap for
`plh-takeshi-agent`'s own `install.sh`, which uses a bare `load`: running
it while the toggle is off will appear to succeed and not actually start
the job, since only the toggle's own Start path clears the override.
That repo is out of scope to modify, so this is a documented caveat, not
a fix. Verification repeated the same disposable-job discipline as
above, plus confirming the disable override itself was cleared and
`print-disabled` returned to baseline before cleanup.
