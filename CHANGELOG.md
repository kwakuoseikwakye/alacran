# Changelog

Alacrán was built one small, versioned slice at a time — brainstorm, written
design spec, written plan, implement, verify against the real thing, merge.
This file is the chronological record of every slice that shipped, kept in the
detail it was written in rather than compressed into release notes.

The matching design specs and implementation plans are working documents,
written before the code for each slice and kept locally — this file is
the durable public record of what they led to.

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
investigating what that actually means today found that `email-pipeline-agent`'s
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
would *use* a connected integration yet — `email-pipeline-agent`'s email
pipeline is bespoke to ExampleOrg, not part of the generic template. So
there's no real "connect email for your new company" scenario to build
today; that becomes real once v20 (workflow/plugin install) exists.

Given that, v19 ships what's actually real: a read-only "Integrations"
line on every agent card. `email-pipeline-agent` shows its already-configured
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
(`email-pipeline-agent`'s 6-role email pipeline, `plh-ops`'s
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
is copied verbatim (confirmed zero PLH/Owner-specific content); its
`SKILL.md` and `Setup.md` are regenerated rather than copied, since the
originals hardcode cloning `example-user/plh-ops` and writing into
`reports/{Teammate1,Teammate2,Nana}` — copying them as-is would have pointed a
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
`email-pipeline-agent`'s bespoke email pipeline as a generic feature — the
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
doesn't reference it. Second, and the real finding: `email-pipeline-agent`'s
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

The project pivoted from a personal local tool to a downloadable product,
planned as a 4-day push. Day 1 makes a fresh install a clean product
while the developer's own machine keeps full daily use with zero setup,
split into three slices:

- **v23 — de-PLH the config.** The 3 example agents (`email-pipeline-agent`,
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
  repoint plus the bundled files (scrub-verified free of PLH/ExampleOrg
  data).

- **v25 — first-run onboarding + dependency detection.** An empty agent
  list now renders an `OnboardingWelcome` screen (instead of a bare grid)
  with a `checkDependencies()` server action that detects Claude Code CLI
  + `gog` on `PATH` and shows detect-and-guide install steps for whatever
  is missing, plus the "create your first company" CTA. Matches the
  locked launch decision to target CLI-comfortable early adopters with
  guided (not automated) dependency install.

These are Day 1 of the launch push.

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
the not-connected guidance UI.

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
same way.

## v31: scheduled-runs toggle for the Owner agent

The `email-pipeline-agent` card's launchd status line becomes an interactive
on/off control for the job's recurring schedule
(`com.example.email-pipeline`, `StartInterval` 300s). Before this slice the
dashboard could start a poll (v2's "Run now") and observe it, but
stopping the schedule needed `launchctl unload` in a terminal. New
`lib/scheduled-job/`: `set-scheduled-job-impl.ts` shells `launchctl
load`/`unload` against a hardcoded plist path
(`PIPELINE_LAUNCHD_PLIST_PATH`, never a parameter — the Server Action is
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
independent of the schedule either way. The control renders only when
`email-pipeline-agent` is a present existence-gated built-in AND its plist
file exists, so a fresh install sees nothing. The displayed state always comes from a real
`checkLaunchdJob()` read taken after the attempt, never an optimistic
guess, so a failed unload can never render as "off". Like v2 (Run now),
v9 (daily-team-log trigger) and v19 (integration status), this is
deliberately bespoke to one agent id — the population is one; generalise
if a second scheduled agent ever exists.

Live verification used a disposable `com.alacran.testjob` (running
`/usr/bin/true`), never the real Owner job, per the standing safety
rule: toggled through the real `launchctl` code path, confirmed via
`launchctl list` before and after, then deleted. The real Owner job's
state was confirmed unchanged at three checkpoints during the session;
the toggle's confirm dialog was opened and cancelled against the real
card, never confirmed. The real button is left for the maintainer to
click.

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
`email-pipeline-agent`'s own `install.sh`, which uses a bare `load`: running
it while the toggle is off will appear to succeed and not actually start
the job, since only the toggle's own Start path clears the override.
That repo is out of scope to modify, so this is a documented caveat, not
a fix. Verification repeated the same disposable-job discipline as
above, plus confirming the disable override itself was cleared and
`print-disabled` returned to baseline before cleanup.

## v32 (2026-08-04): read-only triage intake — email and GitHub issues

Two new commands, `triage-email` and `triage-issue`, each take one inbound
item — an allowlisted colleague's email, or a GitHub issue reference — and
write a single analysis file to `notes/company/triage/`: what's being
asked, which repo it likely concerns, where in that repo it probably
lives, how to tackle it, and any risks or injection-attempt concerns.
Neither command touches anything else; both go through the existing
diff-then-commit gate before any write is real.

**Why this needed new machinery, not just a new command.** The headless
session a company command spawns is given `cwd: agent.rootPath` and no
`--add-dir` — it cannot read any repository except the company's own. That
made a triage command that needs to look at *product* repos (to route "the
signup flow is broken" to the right codebase) structurally impossible to
build as a prompt alone. So this slice adds a **prefetch seam**
(`lib/company-commands/prefetch/`) that runs control-panel-side, before any
agent spawns: it reads the target message or issue, reads the candidate
repos' branch/dirty-state/recent-commits, and can **refuse** — aborting the
run with no spawn at all, so a doomed run costs no API call. `handoff`'s
existing v8 git-log gathering was extracted into this same seam unchanged,
byte-identical output, so refactoring it wasn't a second bug surface.

**Config is fail-closed, on purpose.** Each command reads two YAML files
from the company's own repo: `definitions/triage/senders.yaml` (who
`triage-email` will act on) and `definitions/triage/repos.yaml` (which
repos either command may route into, name/path/description each). A
missing or empty file means "accept nothing," never "accept anything" —
the run refuses and names the exact path to create. These files ship as
`.example.yaml` in the template, specifically so a fresh company fails
closed until an operator deliberately renames and fills them in. They are
**not editable from the dashboard**: the skills editor only writes paths
already in the discovered skill/command set
(`lib/resolve-known-skill.ts`), and a `definitions/triage/*.yaml` data file
is neither — so for now, filling them in is a terminal-only step.

**Every `gog` call in this slice carries `--readonly` and
`--gmail-no-send`**, on top of whatever the allowlist already restricts;
fetching the email body additionally passes `--wrap-untrusted`. On top of
that, the control panel emits **its own** fence around every byte of
attacker-influenced text — `--- UNTRUSTED:<nonce> ---` … `--- END
UNTRUSTED:<nonce> ---`, a fresh `crypto.randomUUID()`-derived nonce per run
— and both prompts frame everything inside it as data describing a request,
never as instructions. Two reasons it is the control panel's fence and not
`gog`'s: the framing layer is only *independent* of `gog` (as the spec's
three-layers claim requires) if it doesn't depend on a flag prefetch never
verifies arrived; and the nonce is what stops the wrapped content closing
its own region, since a fixed marker can be forged by a body containing
`</external-untrusted>`. **The fence holds the sender's headers too**, not
just the body: `From`, `Date` and `Subject` are as sender-controlled as the
body. The message id the control panel resolved itself sits outside, and so
does the repo-context block (branch, `git status`, recent commits, file
list) — git-derived rather than attacker-influenced, but worth naming rather
than folding into "everything but the fence." `triage-issue` mirrors this with `gh
issue view` and nothing else — never `create`, `comment`, `edit`, or
`close`. **Filing an issue is deliberately not this slice** — it's deferred
to v33 behind a second, separate confirmation gate on top of the existing
diff-and-commit one, the same reasoning that excluded `create-epic` back in
v8: a public write with no local artifact to review first needs its own
explicit human step, not just the local diff gate.

**A bug caught mid-slice, not by accident:** the sender allowlist was
originally checked only on the auto-search path (no `messageId` supplied);
supplying a specific `messageId` directly skipped it entirely, so any
sender's mail could be fetched and analysed by ID. Fixed by moving the
check to run once, unconditionally, after the `messageId` is resolved —
via a metadata-only `From` fetch, deliberately outside the untrusted body
wrapper, so the trust decision is never made by reading the content it's
meant to gate. **Named for what it is, not what it sounds like:** the
allowlist is a From-header filter, not sender authentication — nothing here
checks SPF, DKIM or DMARC — and a header resolving to more than one address
(`Evil <evil@attacker.com> owner@example.com`) is refused rather than resolved
to whichever address happens to be on the list.

**The numbers behind the design**, measured on 2026-08-04 rather than
assumed: `from:example.com` over the previous 30 days returned 29 messages —
19 from `owner@example.com`, 9 from the operator's own address, 1 from
`teammate@example.com` — about one a day. That volume is exactly what a
manual, one-at-a-time triage command is for; it's also why the allowlist
defaults to nobody rather than guessing.

**The no-`Bash`, scoped-write confinement this relies on is specific to
the Claude Code executor.** `lib/ai-executors.ts`'s `openai-codex` entry
passes only `--sandbox workspace-write` and `aider` passes only
`--yes-always --no-auto-commits` — neither reads `editScopePattern` or
`bashPatterns` at all. Run either of these two commands through a company
configured for Codex or Aider, and the guarantees above do not hold: this
app does not set, and cannot verify, either executor's own sandbox. Stated
plainly in both commands' `.md` files, not just here.

## v34 (2026-08-05): ownership dashboard — what leaves this machine, per company

Every real company (a `command-set` agent) now has a "View ownership"
button on its card, opening a Sheet with five things: where its data lives
(the local root path, copyable), which AI provider runs its commands,
what's connected (the existing integration-status line), whether it's
backed up (the existing GitHub remote check), and a synthesized "external
network access" summary tying the previous three together.

**Named v34, not v33** — v33 is the still-unshipped "file as GitHub issue"
follow-up named in v32's writeup; this slice is unrelated to it and takes
the next free number instead of colliding with that reservation.

**Nothing new was measured or tracked — this slice only surfaces signals
that were already real.** `getCompanyRemoteImpl` (the backup button's own
check), `getIntegrationStatus`, and `getAiExecutorIdForAgent` already
existed and were already tested; the new `lib/ownership/` module composes
them into one `CompanyOwnership` object and adds one pure function,
`summarizeNetworkAccess`, that derives the network-access summary from the
other three rather than tracking anything independently.

**The one place this is deliberately less certain than the rest: Aider.**
Claude Code and OpenAI Codex are both a real call to a cloud API under the
user's own account, so their line says so. Aider's model backend (cloud or
local) is the user's own Aider config, invisible to this app — so its line
says exactly that, rather than guessing. Overclaiming there would make the
dashboard less trustworthy than saying nothing.

Scoped to `command-set` agents only, same as the existing backup button and
AI-executor picker — `email-pipeline-agent` and `plh-ops` don't get the
button, since they aren't company-shaped (no per-company backup remote or
AI-executor choice in the same sense).

This came out of `addition.md`'s "Ownership Dashboard" as the most
immediately buildable piece of that longer-range vision (that file is a
draft vision doc at the repo root, not yet relocated to a permanent
`docs/` home): the marketplace, multi-AI-framework, and cloud-sync threads
in it are unrelated to this slice and each need their own maintainer
decision before any design work starts.

## v35 (2026-08-06): terminal-visible company-command runs, with a pre-run gate

A per-company setting — set in the company-setup wizard, editable
afterward — makes every command for that company run in a real, visible
macOS Terminal window instead of headless, with a gate before anything
happens: the window shows the exact prompt and waits for Enter (or
Ctrl-C to abort) before the agent runs at all. When the run finishes, it
offers `claude -c` to continue that exact conversation interactively.
Aimed at technical users who want to watch — or, if they take the
offered continuation, drive — what's happening, without giving up the
existing diff-then-commit gate for the constrained run itself. macOS
only; the setting simply doesn't appear elsewhere.

**The command's prompt, tool allowlist, and diff-then-commit gate are
byte-identical to a headless run.** Everything before the spawn point —
validation, prefetch, `buildPrompt`, `executor.buildArgs` — is untouched.
Only where the process's stdio goes, and whether a human sees a gate
first, changes.

**The trickiest part of the design is who owns the run-lock's lifetime.**
`open -a Terminal <script>` returns to Node the instant Terminal is told
to open a window — long before the script, let alone the real run inside
it, finishes. So visible mode does **not** attach the existing
`child.on("exit", ...)` handler; the generated wrapper script's own
`trap 'rm -f "$LOCKPATH"' EXIT` owns the lock instead, covering an abort
at the pre-run gate and the window simply being closed. The trap is then
explicitly disarmed (`trap - EXIT`) at the moment the script releases the
lock itself after a normal run — see the final review's findings below.

**Measured, not assumed, twice over, before shipping:**
- **macOS's real `/bin/bash` is 3.2.57** (Apple ships the last GPLv2
  release) — confirmed by direct invocation, not inferred from version
  numbers. An early draft's script used `mapfile -d ''` to read the
  NUL-delimited args file back; `mapfile` requires bash 4+ and doesn't
  exist on the actual target shell (`mapfile: command not found`,
  confirmed). Replaced with a `while IFS= read -r -d ""` loop, verified in
  session to round-trip a NUL-delimited array correctly *including an
  empty-string element* under the real system bash — and re-verified via
  a live run against a disposable `/tmp` company, where the generated
  script executed correctly end-to-end up to the gate.
- **A NUL byte in the prompt would have been a real argv-injection path
  into the spawned `claude` process**, caught in review before merge, not
  after: `spawnArgs.join("\0")` used NUL as the args-file delimiter but
  never checked the payload was NUL-free. A NUL inside the prompt would
  silently split it into extra argv entries when the script's read loop
  parsed it back — e.g. injecting `--dangerously-skip-permissions`. The
  headless path already rejects this (Node's own `spawn()` throws
  `ERR_INVALID_ARG_VALUE` on a NUL in argv, confirmed directly); the
  visible path was silently accepting it instead, on exactly the path
  `triage-email`/`triage-issue`'s unsanitized email/issue body text
  reaches. Fixed with a one-line guard that refuses the run the same way
  the headless path already does, before anything is written to disk.
- **The script's `cd` had no failure guard**, also caught in review: a
  bare `cd "$CWD"` that fails (the company directory renamed, deleted, or
  on an unmounted volume between the click and the window opening) would
  have let the run proceed in whatever directory Terminal happened to
  start in — running the command against the wrong repo. Now
  `cd "$CWD" || exit 1`, with the trap still releasing the lock on the way
  out.
- **The EXIT trap stayed armed after the script's own explicit release**,
  caught in the final whole-branch review. After the constrained run
  finishes the script does `rm -f "$LOCKPATH"` (correctly releasing the
  lock it owns) and then waits at the take-over gate — with the trap still
  live. Only `exec` discards a trap, so the *safe* exit from that gate was
  the one that takes over the window; closing it or pressing Ctrl-C fired
  the trap a second time and deleted whatever lock file was at that path —
  by then plausibly a *later* run's, since the app correctly allows a new
  run the moment the lock is released. `lib/file-lock.ts` has no staleness
  check of any kind (no PID liveness, no TTL, no sweep), so the mirror-image
  failure — a leaked lock — wedges that company's commands until someone
  deletes the file by hand; both directions are now covered by disarming
  with `trap - EXIT` at the exact point ownership ends.

**A live end-to-end check surfaced one more real, if minor, finding:**
the pre-run gate's `cat -v` (rendering control characters visibly instead
of letting the terminal execute them, specifically so injected ANSI
sequences in attacker-influenced prompt text can't hide or rewrite what
the gate displays) also renders ordinary UTF-8 multi-byte characters —
em-dashes, in the actual prompt text checked during live verification —
as ugly-but-harmless escape sequences (`M-^@M-^T`) rather than the real
character. Not a security defect — `cat -v`'s whole job is exactly this
kind of visibility — but a real readability cost on non-ASCII prompt
text, left as a known, disclosed limitation rather than fixed in this
slice.

**Also fixed in passing:** `lib/ai-executors.ts` was passing
`--permission-mode default`, an undocumented legacy alias — confirmed
accepted by the real CLI, but not among the six documented mode values
(`acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan`).
Pinned to the real value, `"manual"`. `lib/daily-team-log/trigger-daily-team-log-impl.ts`
has the identical hardcoded string in a separate spawn path — left
untouched, disclosed not fixed, same shape as other cross-cutting
findings this project records rather than opportunistically patches.

## v36 (2026-08-06): fix the macOS app icon not showing after install

A packaging-only bugfix, not a feature slice — found via a user report
("when i install the app the icon does not show"), diagnosed with
`superpowers:systematic-debugging` rather than the usual brainstorm-spec-
plan flow, and shipped as a patch version (v0.5.1) rather than the minor
bumps used for feature slices.

**Root cause, confirmed by direct inspection, not guessed:**
`scripts/package-macos.sh` never generated a `.icns` file and the
`Info.plist` it writes had no `CFBundleIconFile` key at all — checked
both the shipped `Info.plist` and the whole repo for any `.icns` file
before writing a line of fix. Every single install got macOS's generic
fallback icon, deterministically — this was never intermittent or
environment-specific.

**The fix, and what was measured before writing it:** the brand mark
(`components/alacran-logo.png`) is 600×626, not square, and this
project's own convention is that it must never be squashed into a
square. Before touching the packaging script, `sips -p`'s padding
behavior was tested directly — confirmed (via a raw pixel read, not
assumed) that it pads onto a square canvas with genuine alpha
transparency, not a solid fill. The script now pads the mark once onto
a square, transparent master, generates all ten sizes `iconutil` expects
in a `.iconset`, packs it into `AppIcon.icns`, and adds
`CFBundleIconFile` to `Info.plist`. Verified visually, not just
structurally: a real Quick Look thumbnail of the generated `.icns`
confirmed the correct scorpion mark renders, centered and unsquashed.

## v37 (2026-08-06): fix company-starter's license, program branding, and legal exposure

A licensing/legal-cleanup slice, not a feature — triggered by a direct
request to check `templates/company-starter/` for anything that could
create legal exposure, since it's the real bundled source
`create-company-from-template.ts` copies into every new company.

**Root cause: the bundled template was still, in full, a third party's
proprietary kit.** `templates/company-starter/` turned out to be branded
end-to-end as an "management training" program's own starter
kit — its `LICENSE.md` explicitly prohibited "publication of derivative
works... in a public repository... without prior written consent,"
which is exactly what shipping it inside this MIT-licensed, public repo
does. Fixed:

- **License**: replaced with real MIT (matching this repo's own
  `LICENSE`), plus a clarifying note that it covers only the template
  scaffolding, not a company's own filled-in data.
- **Branding**: removed program-program framing from `README.md`,
  `CLAUDE.md`, and ~20 other docs; renamed `company-starter` to
  `company-starter` everywhere (titles, directory trees, footers).
- **Deleted program-only files** with no place in a software template:
  `exercises/`, `docs/{participant-guide,day-flow,
  feedback-collection,context-gathering-checklist,
  ai-company-beginner-guide-lp.html}`, and 4 program-feedback GitHub
  issue templates.

**Also found and fixed while auditing for legal exposure:**

- **Japanese content translated to English** in `scripts/cycle/`, a CI
  sanitize-gate pattern (a redundant katakana duplicate of an already-
  English brand term), and a stale Japanese heading reference in this
  repo's own `lib/company-commands/registry.ts` (pointed at a heading
  that had already been translated to English in an earlier slice — the
  reference just never got updated). Verified clean against the
  pre-existing `scripts/jp-audit.py`.
- **The `/office` command and its test file removed.** `office.md` and
  `tests/test_office.py` both reference `tools/office/office.py`, a
  third-party "pixel-agents" visualization tool — but `git log --all`
  confirms `tools/office/` has never existed anywhere in this repo's
  history. It was never deleted; it was simply never bundled, even
  though the command doc and 401 lines of tests for it were. Because
  both `.claude/commands` and `tests` are whole-folder entries in the
  copy manifest, every company created through Alacrán inherited a
  `/office` command that always fails and a test file that fails to
  even collect (`ModuleNotFoundError: No module named 'office'`) —
  confirmed as the root cause of a pytest collection failure hit while
  verifying an earlier slice.
- **The `piro`/`piro-run` skills removed.** Both were built specifically
  around Amazon/AWS's real "Kiro" product — generating files in Kiro's
  proprietary spec format, with `piro/SKILL.md` introducing itself as
  "Kiro's little brother, one letter away." Producing interoperable
  files while naming the product you're compatible with is ordinarily
  defensible (nominative fair use), but that framing edges toward
  implying a relationship with AWS that doesn't exist — removed rather
  than defended, since neither skill is load-bearing for most users.

`lib/company-template-manifest.ts` and `lib/company-starter-packs.ts`
updated so newly-created companies stop copying any of the deleted
paths. The one remaining `templates/company-starter` pytest failure
(`PATHREF-01`, dangling references to `examples/harukaze-ec/`) was
confirmed pre-existing and unrelated, via `git stash` against the
pre-edit baseline reproducing the exact same failure.

## v38 (2026-08-06): "Open in Terminal" — the direct answer to "I defined my company, now what?"

Triggered by real user feedback after using a fresh install: after finishing
the company-setup wizard, there was no path to actually building anything —
the Skills page's Run tab can only run/edit commands the app already knows
about (`lib/resolve-known-skill.ts` requires write targets to already be a
discovered skill), so it structurally cannot help someone create a brand-new
skill. The user asked for exactly one thing: a button that opens a real,
interactive AI-executor session in the company's own directory, so they can
just ask it to build what they need — no terminal-typing, no `cd` first.

Reused v35's exact "open a real Terminal window" mechanism
(`spawnFn("open", ["-a", "Terminal", scriptPath], ...)`) but stripped down to
the minimum: no prompt, no `--allowedTools` scoping, no run-lock, no
diff-and-commit gate. `buildInteractiveTerminalScript` (added alongside
`buildVisibleRunScript`, sharing its `shQuote` helper) just `cd`s into the
company root and `exec`s whichever AI executor is configured for it
(`resolveAiExecutorForAgent` — same multi-executor support the Run tab
already uses). This is deliberately not a scoped/automated action; it's the
same thing as the user `cd`-ing there and running the executor by hand, just
without needing to find the path or remember the command. New "Open in
Terminal" button on every `command-set` agent's card, gated to macOS like
v35's visible-run option.

Also investigated a second report from the same feedback — a company named
"PLH Triage" appearing on a freshly-installed second laptop. Traced
`lib/data-dir.ts`: the real per-user registry
(`~/Library/Application Support/Alacrán/companies.json`) is empty by design
on any machine that hasn't registered a company yet — confirmed directly.
The dev-mode registry (`.data/companies.json`, gitignored) is the one that
had "PLH Triage" in it. No code path in `scripts/package-macos.sh` ever
copies `.data/` into a packaged build. Conclusion: not a product bug — it's
what happens when a whole project checkout (not just a downloaded release)
travels between machines, since a raw folder copy doesn't honor
`.gitignore`. No fix shipped; the existing "Remove" button on any registered
company's card already handles it.

## v39 (2026-08-07): the company guide — a plain-language walkthrough of every card action

Closes the loop v38 opened: after finishing the company-setup wizard, a user
still had no idea what any of the buttons on their new card actually did.
Driven by explicit feedback that the app needs to work for both CLI-
comfortable and non-technical users, so the copy bar was set higher than
"label plus icon" — every non-obvious action, especially "Open in Terminal"
(which hands off to a raw terminal window), needed plain-language framing
that doesn't assume any CLI literacy.

Skipped a spotlight-tour library (none installed, none needed for this
audience) for something much smaller: a `Sheet` listing one line per action,
opened once automatically the first time a company's info is filled in
(tracked with a single `localStorage` flag, the same mechanism the landing
site already uses for its theme toggle — no new registry, no Server Action),
and reachable anytime after via a small "?" icon next to the kind badge.

Each button's blurb is exported as a constant from that button's own file
(`OPEN_TERMINAL_BLURB`, `BACKUP_BLURB`, etc.) — the copy lives next to the
component it describes, not in a separate list that could drift. A new pure
`lib/company-guide-steps.ts` (`buildGuideSteps`) takes the exact same show*
flags `AgentCard` already computes and filters them down to the steps that
actually apply, so the guide can never explain a button that isn't really on
the card — confirmed live: the built-in "AI Company Starter" card's guide
correctly omitted "Remove" (not a registered company) while including
everything else. This kept the component itself untested, matching every
other button component in this app (none have `.test.tsx` files — there's no
React Testing Library/jsdom here, and adding one for a single component
wasn't worth it), while the actual filtering logic is fully covered by plain
vitest.

Live-verified with Playwright against a real dev server (throwaway port
4322, no repo state touched): the guide auto-opened on first load with the
correct 7 steps for the real `ai-company-starter-main` built-in, stayed
closed on a reload (flag persisted), and the persistent "?" reopened it
identically on demand.

## v40 (2026-08-08): sidebar nav — replaces the top nav on every page

Swapped the top `Nav` bar (`components/nav.tsx`, deleted) for a collapsible
glassmorphic sidebar (`components/sidebar.tsx`): 72px icon-only rail on
desktop that expands to 228px on hover, a bottom tab strip on mobile
(`<640px`), and three blurred ambient "orb" gradients drifting behind the
content (`prefers-reduced-motion` turns the drift off, sidebar hover-expand
included). Every page (`/`, `/activity`, `/connect`, `/skills`) moved from
its own `<main className="mx-auto max-w-* ...">` wrapper to two shared
layout classes owned by `app/layout.tsx`: `.dash-topbar` for the page
header and `.dash-content` for the body, both new tokens in
`app/globals.css` alongside the sidebar/orb rules — no existing
`components/ui/*` primitive touched, per the standing design-token
convention. All existing tests, `tsc`, and `next build` pass unchanged; no
new dependency.

## v41 (2026-08-08): connect and assign more than one Google account

Real user gap: this app only ever exposed one Google account, machine-wide
(`-a auto`, hardcoded into `check-inbox`'s prompt/bashPatterns and
`triage-email`'s prefetch), documented as a known limitation since v20/v22.
Investigation found the limitation was never in `gog` — the installed
binary (v0.34.1) already supports multiple stored accounts end to end
(`gog auth add`, `gog auth list`, `-a <email|alias|auto>` per call, verified
directly against the real CLI) — the app just never exposed more than the
one "auto" resolves to. No new integration needed.

**Connect page**: `ToolStatus.google` gains `accounts: string[]` (a new
`gog auth list -j` call, `lib/google-accounts.ts`) — every stored account
shown as a chip, plus a typed-email → `gog auth add <email>` copyable
command. Same "show the command, you run it, press Re-check" pattern
already used for every other guidance flow on that page; the app never
spawns interactive OAuth itself.

**Per-company assignment**: `definitions/integrations/google.yaml`
(`accounts: [...]`) in the company's own repo — company-owned data, same
tier as `definitions/ontology/company.yaml`, not an app preference, so a
manual/interactive run (v38's Open Terminal) reads the same source of
truth a dashboard-triggered run does. Written only through a dedicated
`saveGoogleAccountsImpl` (mirrors `save-company-ontology-impl.ts` exactly,
including the single-file-scoped commit), never through the generic
skill-editor gate. New `GoogleAccountsPicker` card control (checkboxes over
`gog auth list`'s accounts) sits next to the existing `AiExecutorPicker`,
gated the same way (`isCommandSet`), and got its own company-guide step.
Missing/empty config resolves to `[]`, and every call site falls back to
`["auto"]` — an unconfigured company is unaffected; the pre-existing
`check-inbox` bashPatterns test (`"gog -a auto gmail search*"`) still
passes unmodified.

**check-inbox** (the agent runs `gog` itself): `CompanyCommand.bashPatterns`
can now be a function of the resolved accounts — only this command uses the
function form, every other command's static array is untouched —
resolving to one `Bash(gog -a <account> ...)` pair per configured account.
`buildPrompt` gained a 4th `accounts` param so the prompt itself loops
per-account instead of a bare `-a auto`.

**triage-email** (prefetch runs `gog` control-panel-side; the agent has no
Bash access at all): the search step now loops the company's configured
accounts in priority order, first allowlisted match wins — documented as a
`ponytail:` simplification rather than a true cross-account recency sort,
since that needs a confirmed `gog --plain` date format that isn't
discoverable without a live query against a real inbox. The metadata/body
fetch reuse whichever account the matching search row came from; an
explicit message-id override (no search) tries each configured account in
turn since a bare id doesn't say which mailbox it lives in.

Both template commands (`check-inbox.md`, `triage-email.md`, a commit in
`ai-company-starter-main` itself, same mechanism as v22) now mention
`definitions/integrations/google.yaml` so a manual/interactive run matches
dashboard-run behavior instead of staying hardcoded to `auto`.

**Same-day fix, caught by automated security review:** account values are
joined with a bare comma into Claude Code's `--allowedTools` string
(`lib/ai-executors.ts`), so an account containing a comma or close-paren
could have spliced in an unintended extra `Bash(...)` allowlist entry —
real allowlist injection, not just bad data, since the picker UI only
constrains normal use and `saveGoogleAccounts` is a public Server Action
while the YAML file is deliberately hand-editable. Fixed at the one
chokepoint every consumer already routes through: `readGoogleAccounts`
now drops anything not shaped like an email (`isSafeAccountEmail`), and
`saveGoogleAccountsImpl` additionally rejects it at write time with a
clear error instead of a silent drop.

Live-verified against a real dev server (throwaway port 4326) with this
machine's real single connected account: the Connect page correctly showed
it as a chip plus the add-another flow, and a command-set company's card
correctly rendered the checkbox picker with that account. Deliberately
did **not** click the checkbox live — doing so commits
`definitions/integrations/google.yaml` into whichever real company repo
rendered it, and the standing safety rule's sanctioned live-test targets
don't cover an arbitrary write into a real company beyond the one
dedicated `stock-note.md` case; every write path is instead covered by
`vitest` against disposable temp directories. Full suite: 522 tests
passing, `tsc` and `next build` clean.

## v42 (2026-08-08): Google Antigravity CLI as a fourth pluggable AI executor

"Choose which AI agent runs a company's commands" already existed since
the multi-model slice that shipped alongside v41 — `lib/ai-executors.ts`'s
`AI_EXECUTORS` registry, `AiExecutorPicker` on the agent card, and the
per-agent `ai-executors.json` assignment already made Claude Code, OpenAI
Codex CLI, and Aider pluggable. This slice added a fourth entry; no new
mechanism was needed.

Verification was the actual work. Every existing entry's flags were
confirmed against the real installed CLI's `--help` output before
shipping (the file's own header comment says so for Codex/Aider); web
search for Antigravity CLI's flags turned up mostly unreliable results —
one fetched page described its command as *"Anthropic's official CLI for
Claude,"* a hallucination lifted from Claude Code's own description, not
real Antigravity documentation. Declined to guess flags for a tool that
spawns real subprocesses with edit/bash access against real company
repos. The user had it installed locally (`agy`, v1.1.11); ran
`agy --help` directly against the real binary instead, matching the
project's existing bar. Did **not** trigger a live prompt/model call, per
the standing rule against letting an automated pass complete a real
headless spawn — flag *shapes* are confirmed real, end-to-end behavior
against a live account is left for the user.

`google-antigravity` uses `-p <prompt> --output-format text --mode
accept-edits --dangerously-skip-permissions` — no per-pattern
Edit()/Bash() allowlist exists on this CLI (unlike Claude Code), so it
falls into the same coarser "auto-approve everything, no human present"
bucket as Aider's `--yes-always`, verified as `--dangerously-skip-permissions`
in the real `--help` output. `--mode accept-edits` is needed for it to
actually write file changes rather than just propose a plan.

Adding a 4th `AiExecutorId` broke `tsc` on the first try: `lib/ownership
/summarize-network-access.ts`'s `Record<AiExecutorId, string>` (v34) is
exhaustive by construction, so the compiler itself caught the missing
case — added "Google (Antigravity CLI) — your own account," the same
"always a real account-bound cloud call" bucket as Claude Code/Codex (not
Aider's honest "depends," since Antigravity's backend isn't
user-configurable the way Aider's is).

New standing rule from this slice's stalled first pass (blocked
mid-investigation on unverifiable flags, then unblocked once the user
supplied a locally-installed binary to test against): every feature now
gets documented — including blocked/in-progress ones, not just shipped
ones — added to this file's "Established conventions" list.

Full suite: 530 tests passing (84 files), `tsc` and `next build` clean.
No live UI/Playwright pass — the change is confined to the executor
registry + one exhaustive label map, both fully covered by the existing
`vitest` pattern (byte-identical assertions on `buildArgs`' output, same
as every other executor).

**Same-day follow-up, from real usage:** the user picked Antigravity in
the per-company executor picker, then went looking for it on the Connect
page and couldn't find any install/connection status for it. Root cause:
`lib/connect/connect-status-impl.ts`'s "AI agent" card was hardcoded to
check only the `claude` binary — a gap that predates this slice entirely
(Codex and Aider were never added to it either when they shipped). Fixed
at the root rather than patching in a 4th special case: `claudeStatus`
now loops `listAiExecutors()` and reports install status (`which
<binaryName>`) for all four, exposed as a new `executors` field on the
existing `claude` `ToolStatus` — the card's own `connected`/`detail`
still mean exactly "is Claude Code, the default, installed" (zero change
to that meaning or its existing test assertions), with the other three
executors' status shown as a badge list underneath, same visual pattern
as the Google card's account chips. No new brand icons needed — text
badges only, sidestepping the fact that Simple Icons has no OpenAI mark
(withdrawn) and no Aider mark at all. Live-verified on a throwaway dev
server (port 3002): with `agy` genuinely installed and `codex`/`aider`
genuinely not, the page correctly showed "Google Antigravity CLI —
installed" in green and the other two as "not found." New test asserts
the full `executors` array; all 10 pre-existing `connect-status-impl`
tests pass unmodified since the default fake `which` handler already
resolved every binary name. Full suite: 531 tests, `tsc`/`next build`
clean.

**Second same-day follow-up — the badge-list shape above was itself bad
design**, called out directly: cramming all 4 executors under a card
still titled "AI agent (Claude Code)" with a `Connected` badge that only
ever meant Claude Code's own state was confusing regardless of how
accurate the badges underneath were. Redesigned properly instead of
patching the badge copy: each registered AI executor now gets its own
full `ToolStatus` card — own title, own real `connected`/`detail`, own
install guidance (reusing `installHint`/`installLink` from
`lib/ai-executors.ts`, unused by any UI until now) — the same shape
`google`/`github` already had, generalized rather than special-cased.
`ConnectStatus.claude` is gone; `ConnectStatus.aiExecutors: ToolStatus[]`
replaces it, produced by looping `listAiExecutors()`. Two more call sites
that read `.claude` directly needed updating:
`components/onboarding-welcome.tsx`'s two-step "Install/Connect" gate
(deliberately still scoped to Claude Code only, the one built-in
default — now looks it up via `aiExecutors.find(id === "claude-code")`
instead of a dedicated field) and `connect-panel.tsx`'s brand-icon map
(`TOOL_BRAND` is now `Partial`, with a generic `Bot` icon fallback for
Codex/Aider, which have no real mark in the Simple Icons dataset — no
icon was hand-drawn). `lib/ownership/get-company-ownership-impl.ts` only
ever read `.google`, so it was unaffected. Rewrote the 4
`connect-status-impl.test.ts` cases that referenced `status.claude`
directly (a real behavior/shape change, not the kind of pure DI
extraction this repo's "keep old tests passing unmodified" convention
governs) plus one replacing the old badge-list assertion with a per-card
one. Live-verified again on the same throwaway port: six independent
cards now render (Claude Code, OpenAI Codex CLI, Aider, Google
Antigravity CLI, Google, GitHub), each with its own accurate
connected/not-connected state and, for the three not installed, real
copyable install commands. Full suite: 531 tests, `tsc`/`next build`
clean (one `.next` cache corruption hit mid-build from the concurrent
dev-server run above — `rm -rf .next` and rebuilding was the fix, not a
real regression).
