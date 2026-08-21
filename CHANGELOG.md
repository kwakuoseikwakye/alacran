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
this app, this one **pushes to a remote shared with the analysis
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

The email-pipeline poll button, every company-command's "Run" tab, and the
plh-ops daily-team-log button all now show the growing tail of their log
file while running, instead of only a static "Running…" label — polled
the same ~3s interval each already used for its running/idle status, not
a separate mechanism. No websockets or SSE; it's the same file each
feature already writes, just read a little more of it on every tick. The
email-pipeline button also gained a real client-side poll loop for the
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
pipeline is bespoke to one organization, not part of the generic template. So
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
is copied verbatim (confirmed zero org- or person-specific content); its
`SKILL.md` and `Setup.md` are regenerated rather than copied, since the
originals hardcode both the upstream owner/repo to clone and a fixed set
of per-teammate report folders — copying them as-is would have pointed a
new company's daily reports at the upstream shared repo instead of its
own. The
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
  repoint plus the bundled files (scrub-verified free of
  organization-specific data).

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

## v31: scheduled-runs toggle for the email-pipeline agent

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
`/usr/bin/true`), never the real scheduled job, per the standing safety
rule: toggled through the real `launchctl` code path, confirmed via
`launchctl list` before and after, then deleted. The real scheduled job's
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

**The design is sized for low volume**, on the order of a message a day
from a handful of known senders. That is exactly what a manual,
one-at-a-time triage command is for; it's also why the allowlist defaults
to nobody rather than guessing.

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

## v37 (2026-08-06): relicense and de-brand the bundled company-starter template

A licensing cleanup slice, not a feature — triggered by a direct request
to check `templates/company-starter/` for anything that could create
legal exposure, since it's the real bundled source
`create-company-from-template.ts` copies into every new company.

**Root cause: the bundled template still carried an external license and
the branding of the program it came from**, and had never been re-papered
for redistribution inside a public, MIT-licensed repo. Fixed:

- **License**: replaced with real MIT (matching this repo's own
  `LICENSE`), plus a clarifying note that it covers only the template
  scaffolding, not a company's own filled-in data.
- **Branding**: removed the originating program's framing from
  `README.md`, `CLAUDE.md`, and ~20 other docs; renamed the template to
  `company-starter` everywhere (titles, directory trees, footers).
- **Deleted program-specific files** with no place in a software
  template: `exercises/`, five docs that were pure event logistics
  (participant guide, day flow, feedback collection, context-gathering
  checklist, a beginner-guide landing page), and 4 feedback GitHub issue
  templates.

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

## v43 (2026-08-09): the Network tab — a graphical map of what every company is plugged into

Direct user request: "a graphical representation... where users can see
how their companies are connected or not connected. like how obsidian
does it but this design must be different." Shipped a new `/network`
page, reachable from a new sidebar item, rather than folding it into an
existing page — it's a distinct view (all companies at once, cross-
company), not a per-company detail like the Ownership Sheet.

**Design decision: bipartite graph, not a force graph.** Obsidian's
graph view is a physics simulation because the link structure is
genuinely unknown ahead of time. Here it isn't — every edge (which AI
executor a company runs on, whether it's backed up to GitHub, whether
Google or Notion is connected) is already known, deterministic data.
So instead of nodes bouncing around a canvas, companies sit in a fixed
left column, services (AI executors in use, Google, GitHub, Notion) sit
in a fixed right column, and curved SVG "cable" edges connect them —
closer to a subway map or a Sankey diagram than Obsidian's graph, and
inherently more responsive-friendly (a force-graph canvas has no good
small-screen story; a two-column list does).

**`lib/build-network-map.ts`** composes the per-company edge data from
primitives that already existed for the Ownership Sheet and Connect
page — `getConnectStatusImpl`, `getCompanyRemoteImpl`,
`getAiExecutorIdForAgent`, `readGoogleAccounts`, and
`connectStatus.notion.companies` — no new detection logic anywhere, only
a different output shape (structured `{service, connected, detail}[]`
per company instead of a formatted sentence) so the UI can pick an icon
and a connected/not-connected state per service. Deliberately mirrors
this app's existing "don't overclaim" discipline: edges are only ever
produced for a service a company's *kind* actually supports elsewhere in
the real UI (`AgentCard`'s show* flags) — a `pipeline` agent
(`email-pipeline-agent`) gets only a Google/email edge (its one real
integration), a `report-log` agent (`plh-ops`) gets none at all and
renders as a genuinely isolated node, and only `command-set` companies
get the full github/google/notion trio. Nothing here invents a
capability the rest of the app doesn't have.

**Rendering has no client-side layout pass.** Every node (company card
or service node) is a fixed-height, flex-centered slot; row Y-positions
are plain `index * PITCH + PITCH / 2` arithmetic computed at render
time, and the connecting SVG's `viewBox` uses those same pixel units —
no `ResizeObserver`, no `getBoundingClientRect`. `components/
network-graph.tsx` is a small client component only for the hover-
highlight interaction (dims unrelated companies/wires/services on
hover); the diagram itself is otherwise plain server-rendered markup.
Chip rows scroll horizontally instead of wrapping, which is what keeps
the "every slot is a fixed height" assumption safe against long company
names or many edges.

**Color follows the app's own semantic palette, not per-vendor brand
colors** — deliberately, to match `BrandIcon`'s existing documented house
rule that vendor color is reserved for icons "at the moments that earn
it," not a wash across the whole UI. Wires: ember for "runs on" (the AI-
executor relationship, always true once a company exists, not a binary
connect/disconnect state), success-green for a real, live connection,
dashed muted-gray for "not connected yet." `TOOL_BRAND` (which AI
executor gets which real product mark, with a generic `Bot` fallback for
Codex/Aider, which have no mark in the Simple Icons dataset) was
exported from `connect-panel.tsx` rather than redefined, so both pages
agree.

**Responsive by CSS breakpoint, not JS.** Below ~880px the wires and the
services column disappear entirely; each company's own chip row — which
renders on desktop too, as redundant non-color-dependent detail, each
chip carrying a native `title` tooltip with the full status sentence —
is the only thing left, and already carries the complete picture on a
phone-width screen without a canvas diagram fighting the viewport.

Zero new dependencies (plain SVG + CSS; no graph/diagram library added),
zero write paths (the whole page is read-only composition of data the
app already tracks), and zero edits to any existing page's own logic
other than exporting one existing constant. New test:
`lib/build-network-map.test.ts` (pipeline/report-log/command-set edge
shapes, both disconnected-by-default and fully-connected). Live-verified
on a throwaway dev server against the real registered companies on this
machine — hover-dimming, the mobile stacked layout, and the desktop
cable view all confirmed by screenshot; `/connect` and `/` (Agents)
re-checked unaffected by the `TOOL_BRAND` export. Full suite: 561 tests,
`tsc`/`next build` clean.

## v44 (2026-08-09): Google Antigravity's real product mark on the Connect page

The "Google Antigravity CLI" card on `/connect` (and anywhere else
`TOOL_BRAND` feeds `BrandIcon`, including v43's Network tab) was showing
Google's plain "G" as a stand-in — Simple Icons, this app's one sanctioned
source of vendor marks, doesn't carry Antigravity (confirmed against the
installed `simple-icons@16.28.0`, the latest published version: no
`siAntigravity` or `siGoogleantigravity` export exists). Per this repo's
"never hand-draw or approximate a vendor logo" rule, the fix wasn't to
sketch one.

Instead: fetched Antigravity's own real mark directly from
`antigravity.google`'s own hosted assets (`/assets/image/antigravity-
logo.png` and `/favicon.ico`, both confirmed identical) — a gradient arch
silhouette — and traced it with `potrace` (installed via `brew`, a one-off
local tool, same "build-time-only, never a runtime dependency" treatment
already established for `simple-icons` itself) into a flat path on the same
24×24 grid every other mark in `lib/brand-icons.ts` uses. The affine math to
un-transform potrace's raw decipixel output back into that grid had a real
bug caught before shipping: relative cubic-curve control points in SVG path
data are each independently offset from the segment's start point, not
chained to one another — an initial chained interpretation doubled the
traced shape's bounding box, silently, with no error, only visible by
rendering the result and comparing it against the source PNG.

Because the real mark is a blue→green→orange gradient and `BrandIcon` only
ever renders a flat single-color fill (deliberately, per its own house
rule), `hex` is the dominant color sampled from the mark itself
(area-weighted average across the opaque pixels) rather than an invented
value — it lands on the same Google Blue (`#4285f4`) already used for every
other Google mark in the file, keeping the family visually consistent
rather than introducing an off-palette one-off.

Shipped as a `MANUAL_MARKS` array in `scripts/generate-brand-icons.mjs`,
alongside (not replacing) the existing Simple-Icons-derived `SPEC` list, so
it's regenerated and won't be hand-edited out of sync, and documented
inline with its provenance (source URL, fetch date) for the next person who
wonders where a non-Simple-Icons path came from. `TOOL_BRAND` in
`connect-panel.tsx` now maps `google-antigravity` to its own id instead of
borrowing `google`. Live-verified by screenshot on `/connect`; full suite
(561 tests), `tsc`, and `next build` all clean.

## v45 (2026-08-09): macOS update installs but doesn't replace the running app

Real user report: on a second Mac, the in-app update banner appeared, the
new `.dmg` was downloaded and dragged over the old `.app` in
`/Applications`, but the running app kept showing the old version instead
of picking up the new build.

Root cause, in `scripts/package-macos.sh`'s launcher template: before
starting, it kills whatever's already bound to the app's port (so a prior
un-quit instance doesn't linger and get silently reused) — but the actual
implementation was one `kill` plus a fixed `sleep 0.5`, with no check that
the port was actually free afterward. If the prior instance takes longer
than 0.5s to release the port (measured live: a plain `SIGTERM` to a
process that delays its exit — the same shape as a Node server finishing
an in-flight request/keep-alive from a browser tab that's actively showing
the update banner, exactly the moment a user is mid-update) — this run's
own `node server.js &` loses the `EADDRINUSE` race in the background with
no visible error, and the readiness check that follows happily gets a 200
from the OLD server that never actually died. The user sees "installed the
update" and a running app that's still the old one.

This is the same bug class already root-caused and fixed once in this same
file — the self-test step's post-run cleanup (`kill` + confirm-via-`lsof`
+ escalate to `-9`) — just never applied to the pre-launch clear that real
users' installs actually depend on. Fixed by reusing that exact pattern
here too, rather than inventing a new one.

Verified live, not just read: reproduced the failure with a bare Python
socket server that delays 1.5s after `SIGTERM` before exiting (simulating
the slow-shutdown case) — the old fixed-`sleep 0.5` logic left the port
occupied every time; the new confirm-and-escalate loop cleared it within
two 0.25s iterations. Confirmed the fix is what actually ships by
inspecting the real generated launcher inside a fresh build (`bash -n`
clean, the escaped `\$` template variables came through as literal
runtime references, not expanded at package time). Shipped as a patch
version (v0.7.14), diagnosed via `superpowers:systematic-debugging`
rather than the usual brainstorm-spec-plan flow, same as v36's icon fix —
a packaging-script fix with no application-code change.

## v46 (2026-08-10): "Get Started" — a real answer to "I built this, now what?"

Real user question, grounded in a concrete case: a user creates a company,
writes custom skills for it, defines the company — then doesn't know how
to actually use any of it. Investigation found the gap was real, not just
a missing affordance: the Skills page's Run tab only recognizes the 9
fixed built-in commands (`digest`/`decision`/`retro`/`handoff`/
`define-company`/`check-inbox`/`check-notion`/`triage-email`/
`triage-issue`) by exact filename match (`skill-browser.tsx`) — a custom
skill the user writes has **no run affordance in the dashboard at all**.
The only real path was already v38's "Open in Terminal" (a real
interactive AI session, `cd`'d into the company's own files, full
unscoped access) — but it opens completely blank, so a user who doesn't
already know what to ask has nowhere to start.

Closed that specific gap rather than rebuilding the mechanism: a new "Get
Started" button reuses v38's exact interactive-terminal machinery (same
executor, same directory, same unscoped access), just seeds the session's
first message instead of opening blank — "read this company's skills and
ontology, then introduce yourself and tell me what you can help me do."

The seeding mechanism is per-executor, verified against each CLI's real
`--help` (not assumed, same bar as v42's Antigravity flags) — installed
Codex and ran `uvx --from aider-chat aider --help` specifically to check,
rather than guessing from memory:

- **Claude Code** and **OpenAI Codex**: a bare positional prompt starts
  the interactive session with that as the first turn (`claude --help`:
  "starts an interactive session by default"; `codex --help`: "[PROMPT]
  Optional user prompt to start the session").
- **Google Antigravity CLI**: needs its own explicit flag, `-i` /
  `--prompt-interactive` — "Run an initial prompt interactively and
  continue the session." A bare positional isn't documented to do this.
- **Aider**: genuinely has no equivalent. Its only message flag,
  `--message`/`-m`, is documented to "process reply then exit (disables
  chat mode)" — the opposite of staying open. `AiExecutor.
  buildInteractiveIntroArgs` is deliberately `undefined` for aider rather
  than shipping a guessed flag; `openInteractiveTerminalImpl` detects the
  missing capability and falls back to the exact same blank session
  "Open in Terminal" already gives, with a message that says so
  ("...can't be seeded with an intro — ask it directly") instead of
  silently pretending the intro happened.

Machinery: `buildInteractiveTerminalScript` gained an optional
`introArgs` param (empty/absent reproduces its exact prior output, byte
for byte — the existing test asserting `exec "$BINARY"` needed zero
changes); `openInteractiveTerminalImpl` gained a trailing optional
`introPrompt` param, so every existing call site and test keeps working
unchanged. A new `openInteractiveTerminalWithHelp` server action and
`GetStartedButton` component mirror the existing `openInteractiveTerminal`
/ `OpenTerminalButton` pair exactly. Same gating as "Open in Terminal"
(`command-set` kind only), its own guide step in
`lib/company-guide-steps.ts` right above "Open in Terminal", and its own
script filename (`<agent>.get-started.sh` vs. `<agent>.open-terminal.sh`)
so the two buttons can never race each other's script file.

**Not live-tested end to end, deliberately.** Unlike a blank terminal
session, a seeded prompt is documented to submit and get a real reply the
instant the process starts — the same real-API-call risk this project's
standing safety rule already treats headless `-p` spawns as off-limits
for in an unattended pass, just via a different flag shape. Verified
instead down to the exact spawned argv: 8 new unit tests assert the
literal generated shell-script content (including the exact seeded
prompt string, safely quoted) for each executor and the aider fallback
path, and a live screenshot confirmed the button renders — gated
correctly, right label, right position — without ever clicking it. Full
suite: 569 tests, `tsc`/`next build` clean.

## v47 (2026-08-10): "Get Started" stops re-reading everything it already knows

Direct follow-up to v46, from the user watching it work: every click re-read
every skill file and the ontology from scratch to re-derive the same
introduction it gave last time, even when nothing had changed — real,
wasted tokens on every repeat click.

Fixed with a cache the app decides is stale **without any AI call**, not by
asking the agent to judge freshness itself (asking it to "check if this
looks current" still costs tokens re-deriving the answer on every click,
defeating the point). `lib/company-summary.ts`: a plain `git log -1
--format=%H -- <watched paths>` comparison against a `source_commit:`
field stored in a new file, `docs/company-summary.md`'s own frontmatter —
watched paths are `.claude/skills`, `.claude/commands`, and
`definitions/ontology/company.yaml`, the same three things the seeded
intro already asks the agent to read. Match → the seeded prompt just says
"read `docs/company-summary.md` and introduce yourself, don't re-read the
underlying files." Mismatch, or no summary yet, or git can't answer at
all (no repo, no commits touching those paths yet — treated as "can't
prove this is fresh," not as fresh) → the original full read-everything
prompt, with one addition: write `docs/company-summary.md` back with
today's date and the real current commit SHA, preserving its existing
`created:` date on update rather than resetting it (same "if it exists,
update in place" shape as `HANDOFF.md`'s own command). Portable core, not
a `.claude/*` executor artifact, alongside `docs/decisions/` and
`HANDOFF.md` — matches this project's own stated principle that `.claude/*`
is one adapter on top of the real data, not the data itself.

Lazy, not a watcher: the check only happens the next time someone clicks
Get Started, matching every other piece of automation in this app — no
daemon, nothing runs unless a button is clicked.

`openInteractiveTerminalWithHelp` is now a real impl (`open-interactive-
terminal-with-help-impl.ts`, previously just a hardcoded-constant pass-
through) that looks up the agent a second time before calling the
existing `openInteractiveTerminalImpl` — needed because the freshness
check requires `agent.rootPath` before that call can even happen. A small,
deliberate duplication rather than reshaping the already-tested inner
function's contract. `lib/help-intro-prompt.ts` (v46's single fixed
prompt) is retired; both prompt variants now live in `company-summary.ts`
next to the logic that picks between them.

Verified three ways: unit tests with mocked git/fs for both the freshness
module and its new caller (11 new tests); a real, disposable `/tmp` git
repo (this project's own sanctioned live-test pattern) exercising the
actual module against real `git log` and real file writes through all
three transitions — no summary → stale with the real SHA embedded; a
matching summary written → fresh; a new commit → stale again with the new
SHA — deleted after; and, same discipline as v46, no real AI spawn
triggered (a seeded prompt still fires a real, costed reply the instant
the process starts). Full suite: 580 tests, `tsc`/`next build` clean.

## v48 (2026-08-10): the `gog` install link 404'd — real cause, real fix

User report. `https://github.com/gogcli/gog` (the Connect page's Google
guidance link, `lib/connect/connect-status-impl.ts`, and README's own
prerequisites table) 404s — confirmed directly (`curl -sI`), not just
taken on the report. Root cause, found by checking how `gog` is actually
installed on a real machine rather than guessing a fixed URL: the project
moved. `brew info gogcli` on this machine shows it was installed from
`openclaw/tap` (`https://github.com/openclaw/homebrew-tap`, homepage
`https://github.com/openclaw/gogcli`) — and, further, `gogcli` has since
been accepted into `homebrew-core` itself (`brew info homebrew/core/
gogcli`), with its own canonical site, `https://gogcli.sh` (verified live,
200). That homepage is what the app now links to and what README points
at — more official than either GitHub URL, and it simplifies the install
command too: `brew install gogcli`, no tap needed anymore, replacing the
stale `brew install gogcli/tap/gog` (which was never a valid tap path in
the first place — `gogcli/tap` was never real; the actual tap was always
`openclaw/tap`). Same fix in both places that had the stale link:
`lib/connect/connect-status-impl.ts` (and its test's exact-match
assertion) and `README.md`'s prerequisites table. Full suite: 580 tests,
`tsc`/`next build` clean.

## v49 (2026-08-10): move the skill Edit button out of the scroll

User report: the Skills page's side drawer put "Edit" at the bottom of the
full file dump in the Content tab — on a long skill file, that meant
scrolling past the entire content just to find it. Moved it up into the
tab row itself, alongside Content/History/Run, so it's always visible
without scrolling: **Content | Edit | History | Run**.

`SkillEditor`'s `editing` boolean was previously self-managed internal
state with its own "Edit" button rendered at the bottom of the read-only
view. Lifted to a controlled prop (`editing` + `onEditingChange`) driven
by `SkillBrowser`'s existing `view` state, which just gained an `"edit"`
value alongside `"content"`/`"history"`/`"run"` — no new state variable,
reuses the tab machinery already there. Clicking "Edit" sets `view` to
`"edit"`; Cancel or a successful Save call `onEditingChange(false)`,
which sends `view` back to `"content"`.

No component-level tests exist in this codebase for `.tsx` files (this
project's test suite is `lib/*.ts` DI-seam logic only), so verified live
instead — and hit a real tooling quirk doing it: the Playwright
screenshot tool kept rendering a stale, pre-click frame even after
clicking "Edit," while the accessibility snapshot correctly showed
`button "Edit" [active]` and a live `textbox`. Didn't trust either
alone — confirmed with a direct `document.querySelector` check in the
real browser: the `Edit` button carries the active class and a real
`<textarea>` with the file's actual content exists in the DOM. The
screenshot tool's stale paint was the artifact, not the app. Full suite:
580 tests (unchanged — this is a pure UI change), `tsc`/`next build`
clean.

## v50 (2026-08-10): drag-and-drop reorderable agent cards

User request: let users rearrange the Agents-page cards by hand. Two
decisions checked with the user before building — both took the
recommended, simpler option: all cards are reorderable together (the 3
gated built-ins mixed in with registered companies, not pinned separately),
and the saved order lives in `localStorage` (per-browser, same mechanism
v39's company-guide flag already uses), not written to `companies.json` —
no server change, and it naturally covers the built-ins too since they
aren't registry entries.

New `components/reorderable-grid.tsx` — a client component wrapping the
`.bento-grid` — replaces the bare array map in `app/page.tsx`. Each card
becomes a plain `draggable` `div` using the native HTML5 drag-and-drop
API (no library); dropping one onto another moves it in a local `order`
array and writes the new id order to `localStorage`
(`alacran-card-order`). On mount, a `useEffect` reconciles that saved
order against the current agent list — known ids sort first in their
saved positions, any id missing from the saved list (a newly registered
company) falls in afterward in its original position — so a stale or
empty saved order never drops a card. Server-rendered order (registration
order) is the first paint; the saved order applies once the effect runs
client-side, same one-render-later tradeoff v39's flag already accepted.

Live-verified on a throwaway dev server: dragged the third card in front
of the first, watched the DOM reorder immediately, confirmed the new
order landed in `localStorage`, and confirmed it survived a full reload.
Full suite: 580 tests (no server-side logic changed), `tsc`/`next build`
clean.

## v51 (2026-08-10): a Settings page — light/dark mode, update checks, resets

User request: a Settings page with a manual light/dark switch, a manual
update check, and "any other settings you recommend." New `/settings`
route (`app/settings/page.tsx` → `components/settings-panel.tsx`), added
to the sidebar nav.

**Light/dark toggle.** The app's palette (`app/globals.css`) had been
dark-only since v14/v29 — no light tokens existed at all. The marketing
site (`landing/styles.css`) already shipped its own verified light
"desert day" theme as an opt-in toggle, so rather than inventing new
colors this ports those exact values into a `:root[data-theme="light"]`
override block, keeping the existing bare `:root` as the (unchanged)
dark default — one brand, mirrored, per the standing convention. Every
`components/ui/*` primitive and every page-level class already consumed
CSS custom properties with zero hardcoded colors (confirmed by grep
before writing a line of CSS), so the override cascades everywhere with
no primitive edits — live-verified by screenshotting Settings, Agents,
and Connect in both themes. One non-token exception ported too: the
ambient background orbs use `mix-blend-mode: screen`, tuned for a
near-black backdrop, so a `:root[data-theme="light"] .surreal-orb`
override swaps to `multiply` like the landing site already does for
its own orbs, or they'd wash out to invisible on a light background.

**Known, disclosed limitation carried over, not fixed:** `BrandIcon`'s
`tone="brand"` colors (`lib/brand-icons.ts`'s `onDark` field, used in ~6
spots — the Gmail-connected badge, Connect page tool cards, Network tab
wires) are fixed hex values documented as "the vendor colour to use for a
mark on a dark surface." They're generated by `scripts/generate-brand-
icons.mjs` from the Simple Icons dataset and were left untouched rather
than invasively adding a second light-tuned tint per icon and
regenerating; live screenshots show them still legible on the light
palette, just not repainted for it.

A no-flash theme switch needs the classic pattern: a blocking inline
`<script>` in `<head>` that sets `data-theme` from `localStorage` before
first paint, plus `suppressHydrationWarning` on `<html>` since React
would otherwise flag the attribute it doesn't itself render. Building
this surfaced a real, reproducible React Server Components bug and, while
chasing a second symptom that looked identical, a red herring that wasn't
one at all — both worth recording:

- **Real bug, confirmed by direct test:** a *Server* Component that
  imports a plain (non-component) value — a string, a function — from a
  `"use client"` file gets back `undefined` at render time, silently
  (`localStorage.getItem(undefined)` shipped in real SSR output before
  this was caught). Reproduced deterministically with a throwaway export
  and `console.log` in `app/layout.tsx`. Fixed by moving `THEME_STORAGE_KEY`
  into a plain module, `lib/theme.ts`, that both the server layout and the
  client `ThemeToggle` import from — exactly the pattern this codebase's
  own `lib/company-guide-steps.ts` already used (unknowingly) for its
  blurb constants, now understood rather than just copied.
- **Looked like the same bug, wasn't:** a *client* component
  (`settings-panel.tsx`) importing a plain function from *another client*
  component's file (`update-banner.tsx`) crashed with `__webpack_modules__
  is not a function`. Before writing that down as the same root cause, it
  was tested in isolation — a scratch client-to-client plain-value import
  worked fine on a clean dev server. The real cause was dev-server
  webpack/HMR cache corruption from several rapid edits in a row
  (including one mid-edit syntax error); a full `rm -rf .next` + restart
  made it disappear. `waitForServerThenReload` was still moved to
  `lib/updates/wait-for-server-then-reload.ts` — not because the old
  location was broken, but because two client components now share it —
  and the comment says exactly that instead of the disproven claim.

**Update checks.** New `lib/updates/check-for-updates-now-impl.ts`
(DI-seamed, tested) backs a `checkForUpdatesNow()` server action: unlike
`updateStatusImpl` (the passive banner — throttled to once/24h, silent
about a version the user already dismissed, so it doesn't nag),
a button the user pressed on purpose always hits the network and always
reports the truth, dismissed or not, while still preserving an existing
dismissal in storage so the banner's own behavior is unaffected. Gated
the same way as the banner (`NODE_ENV === "production"`) — a friendly
"only runs in a packaged build" message in dev rather than pretending to
check. Found available, the Settings page reuses the existing
`performLinuxUpdate`/`restartApp` actions directly for its own
"Update & Restart" (Linux only, same Gatekeeper-quarantine reasoning as
the banner), with a "Download it" link everywhere else.

**Other settings recommended and added, kept small:** a "Local
preferences" card resetting the two other one-time `localStorage` flags
this app already writes with no other UI path to clear them —
`alacran-card-order` (v50) and `alacran-guide-seen` (v39) — and an
"About" card (version, MIT license note, GitHub/Changelog links). Left
out deliberately: anything implying telemetry, an account, or a license
gate, all explicitly false for this project; a system/auto theme option,
since the marketing site's own toggle this mirrors is deliberately
binary.

Full suite: 588 tests (8 new, `check-for-updates-now-impl.test.ts`),
`tsc`/`next build` clean. Live-verified on a throwaway dev server:
manual check's disabled-in-dev message, both reset buttons' confirmation
text, and the theme toggle across Settings, Agents, and Connect, dark
and light, with no console errors or hydration warnings.

**Real incident found while committing this slice's own work, disclosed
rather than quietly fixed:** the previous session's v0.7.19 "Release"
commit only staged `package.json`/`package-lock.json` — v50's actual
code (`app/page.tsx`'s edits, `components/reorderable-grid.tsx`) was
left as uncommitted working-tree changes and never made it into that
commit at all. The local macOS rebuild didn't catch this (it builds
from the working tree, which had the real files), but the Linux CI
build does a clean checkout of the pushed tag — so the **published
`v0.7.19` `Alacran.deb` shipped without the reorderable-cards feature
entirely**, while the macOS `.dmg` uploaded alongside it had it. Fixed
forward rather than rewriting the already-public `v0.7.19` tag: v50's
missing files were committed on their own (accurately labeled) commit,
folded into this slice's v0.7.20 release so both platforms carry the
same code from here on.

## v52 (2026-08-10): backup self-heals a stale GitHub remote instead of erroring

User report: GitHub showed "Connected" and the backup button ran, but
failed with git's raw "Please make sure you have the correct access
rights and the repository exists." Root cause: `backupCompanyImpl`
treated any configured `origin` as proof a real, reachable GitHub repo
was behind it, and went straight to `git push`. A company whose `.git`
came with an `origin` already set (by hand, or from wherever the
directory was registered from) but whose GitHub repo was never actually
created hits exactly that git error every time.

Fixed at the root: a push failure matching that exact wording (or the
HTTPS "not found" form) now clears the stale `origin` and falls through
to the same `gh repo create --private --source --push` path a first-ever
backup already took — one shared code path for "no remote" and "remote
points nowhere," instead of a second special case. A push failure with
any *other* message (network, expired auth) still surfaces as-is rather
than silently spawning a redundant second repo. Two new tests; full
suite: 590 tests, `tsc`/`next build` clean.

## v53 (2026-08-10): real Claude Code false positive, PATH-restart copy, a Connect help guide

Two user reports plus a requested feature, all from the same non-technical
setup session.

**Claude Code showed "Connected" with only the Claude desktop app
installed.** Root cause: `aiExecutorStatus` (and `checkDependenciesImpl`'s
onboarding gate) trusted a bare `which claude` as proof — but something
already on that machine's PATH named `claude` (almost certainly a
Homebrew Cask launcher shim for the desktop app) satisfied `which`
without being the real CLI at all. Fixed with a real behavior check,
`lib/is-claude-code-cli.ts`: only trust `which claude` as a first-pass
filter, then confirm by actually running `claude --version` and checking
for the real CLI's own signature ("X.Y.Z (Claude Code)", confirmed live
against a real install). Used in both places that were checking Claude
Code specifically. 4 new tests for the shared check, plus one regression
test proving `getConnectStatusImpl` itself no longer reports connected
for a same-named non-CLI binary.

**"Reopen this app" was ambiguous, and that was the second report.** A
user installed Claude Code and the app still couldn't find it. Real
mechanism, not a guess: `scripts/package-macos.sh`'s launcher captures
PATH once, at app startup (v0.7.5's shell-login-PATH fix); "Re-check"
re-runs the same probe against the same already-running process's already-
fixed `process.env.PATH`, so it can never see a CLI installed after that
launch. The guidance text said "Reopen this app or press Re-check" — read
naturally as "refresh the page," which does nothing for this. Reworded to
be unambiguous: "Fully quit and reopen the Alacrán app itself (not just
this browser tab), then press Re-check."

**New: a step-by-step Connect help guide**, requested directly — a non-
technical user found the existing per-card guidance (which already
assumes terminal comfort) hard to get through alone. `components/
connect-help.tsx` mirrors v39's `CompanyGuide` Sheet pattern exactly (a
"?" button, auto-opens once per browser via a `localStorage` flag) but
gated on "is anything actually not connected yet" instead of v39's
`hasOntology`. Content is deliberately generic — what a terminal is, how
to open one per OS, how to copy/paste a command into it, and the PATH-
restart gotcha above — rather than re-describing what each tool does
(already on its own card, and would drift out of sync here if a new
executor's ever added). Live-verified: auto-opens on a fresh browser
when something's unconnected, stays closed after being dismissed, the
"?" reopens it manually, and it renders correctly alongside the real
card data on this machine (Claude Code correctly still shows Connected
with the real CLI installed).

Full suite: 596 tests, `tsc`/`next build` clean.

## v54 (2026-08-10): backup pushes over HTTPS with gh's own credential helper

User report: the GitHub repo gets created fine, but the push right after
it fails with git's raw "make sure you have the correct access rights" —
despite the user having real push/pull access, and despite `gh` being
confirmed signed in (this button doesn't even show until `githubStatus()`
verifies that).

Root cause, confirmed on a real machine: `gh auth status` shows a
per-account "Git operations protocol" (`ssh` here) that's independent of
`gh`'s global `git_protocol` config default and isn't something `gh repo
create` lets a caller override per-call. So `gh repo create --remote
=origin` wires up an **SSH** remote regardless — and pushing over SSH
needs a working, unlocked SSH key, which is a completely separate
credential from whatever made `gh auth login` succeed. A user can have
real GitHub access and a perfectly working `gh` CLI and still have no
SSH key at all.

Fixed by no longer trusting whatever protocol `gh` picked: `gh repo
create` now runs without `--push`; `git@github.com:owner/repo.git`
remotes get rewritten to the HTTPS form (`ensurePushableRemote` in
`lib/github/backup-company-impl.ts`), `gh auth setup-git` wires git's
HTTPS credential helper to `gh`'s own already-verified token (confirmed
live — idempotent, writes a real `credential.https://github.com.helper`
git-config entry), and only then does the push happen, as its own
explicit step. Applied uniformly to both the first-backup (create) path
and every subsequent-backup (existing remote) path, not just the one the
report named — the same SSH-without-a-key problem would have recurred on
every push after the first. Existing tests updated for the new call
shape (create no longer implies push); one restructured into a stateful
mock proving the self-heal path's retry succeeds against the *rewritten*
remote. Full suite: 596 tests, `tsc`/`next build` clean.

## v55 (2026-08-10): backup no longer blocked by the template's own CI workflow

User report, with the exact error attached: repo created fine, but
`git push` was rejected — `refusing to allow an OAuth App to create or
update workflow .github/workflows/verify.yml without workflow scope`.
v54 already fixed the SSH-protocol cause of a similar-looking failure;
this was a real, different second cause, confirmed by checking what the
company's own repo actually contains.

**Root cause:** `templates/company-starter/.github/workflows/verify.yml`
— a GitHub Actions CI wrapper around `scripts/verify.py` — was in
`TEMPLATE_MANIFEST` and so got copied into *every* company created
through this app's "Add a company" flow. Pushing any commit that
contains a `.github/workflows/*` file needs the `workflow` OAuth scope,
which `gh auth login`'s default scopes don't request (confirmed on a
real `gh auth status`: `gist, read:org, repo` — no `workflow`). So the
very first backup of *any* newly-created company was broken by its own
starter content, for anyone whose `gh` token has the ordinary default
scopes.

**Fixed two ways, for two different companies:**
1. New companies never get the file at all — `TEMPLATE_MANIFEST` now
   copies only `.github/ISSUE_TEMPLATE/config.yml` from `.github`, not
   the workflows folder. Nothing real is lost: `/verify` (the slash
   command) and a human both already run `scripts/verify.py` directly;
   the GitHub Actions wrapper only mattered for a collaborative,
   PR-reviewed project, which isn't this app's audience. One new guard
   test (`company-template-manifest.test.ts`) asserts no
   `.github/workflows` entry can sneak back into the manifest.
2. Companies created *before* this fix still have the file committed,
   so their push would keep failing regardless of point 1.
   `pushSelfHealingWorkflowScope` in `lib/github/backup-company-impl.ts`
   catches this exact rejection, untracks `.github/workflows` (`git rm
   -r --cached` + a commit), and retries once — same self-heal shape as
   v52's stale-remote fix, applied to both the first-backup and
   subsequent-backup push paths. A push that fails for a genuinely
   different reason (including "nothing to untrack") still surfaces
   as-is.

3 new tests; full suite: 599 tests, `tsc`/`next build` clean. Not
live-tested end to end (would mean creating a real GitHub repo as a side
effect, outside this project's sanctioned live-test list) — verified via
mocked exec calls the same way v52/v54's backup fixes were.

## v56: security + robustness review fixes

Not a feature slice — three defects found by a whole-repo security and
correctness review, fixed together. No new user-facing capability.

**1. Permission scoping only ever existed for Claude Code.** Since v42 a
company can be assigned any of four AI executors, but only Claude Code's
`buildArgs` consumes `editScopePattern` and `bashPatterns` — Codex, Aider and
Antigravity ignore both and substitute one coarse auto-approve flag
(`--sandbox workspace-write` / `--yes-always` /
`--dangerously-skip-permissions`). That's fine for a command whose prompt is
only what the user typed. It is not fine for `triage-email`, `triage-issue`,
`check-inbox` and `check-notion`, which splice attacker-authored text (an
email body, an issue, a Notion page) straight into the prompt: the tool
allowlist is precisely the layer that's supposed to hold when a
prompt-injection payload gets past v32's nonced fence, and for three of the
four executors there was no allowlist at all. The picker offered all four with
no warning.

No flag was invented to fake the missing sandbox — those CLIs genuinely have
no per-path/per-command allowlist, so the honest fix is to refuse the pairing.
New `AiExecutor.enforcesToolScope` (true only for `claude-code`) and
`CompanyCommand.untrustedInput` (set on those four commands);
`runCompanyCommandImpl` refuses the combination **before** taking the run lock
and **before** any prefetch, so a doomed run never touches the user's real
mailbox or issue tracker either. Everything else (`digest`, `decision`,
`retro`, `handoff`, `define-company`) still runs on any executor, unchanged.
Two guards against drift: `ai-executors.test.ts` derives `enforcesToolScope`
from what `buildArgs` really emits rather than restating a list of ids, and
`registry.test.ts` fails if a command that can reach outside content (a scoped
Bash allowlist, or any prefetch other than `repo-status`) forgets the flag.

**2. A missing executor binary crashed the whole server and permanently
wedged the company.** `spawn` was called with no `'error'` listener at five
sites. Measured directly on node v24.12.0: for a binary that isn't on PATH,
`'error'` fires and `'exit'` never does — so the unhandled event is an
uncaught exception that kills the Next.js process, *and* the `'exit'` handler
that releases the run lock never runs. `lib/file-lock.ts` has no PID liveness,
TTL or sweep, so the lock survived the restart and every later run for that
company reported "Already running" until someone deleted the file by hand.
Trivially reachable: the executor picker offers all four with no
installed-check anywhere. Fixed at all five sites
(`run-company-command-impl.ts` on both the headless and visible paths,
`trigger-poll-impl.ts`, `open-interactive-terminal-impl.ts`,
`restart-app-impl.ts`); where a lock is held the handler releases it and
appends a plain-language note to the log the Run tab already tails. The
visible path needs it too: if the terminal launcher never starts, the wrapper
script's own `trap` never fires and nothing else would free the lock. Only
`trigger-daily-team-log-impl.ts` already had it.

**3. v55's workflow-scope self-heal could not have worked.** It untracked
`.github/workflows` at the tip and retried the push — but GitHub's check is on
what the push *introduces*, not what the final tree contains, and the case it
was written for is a pre-v55 company's first-ever backup, where the push
carries the whole history including the commit that added the file. The retry
would be rejected identically, leaving the user with a junk commit and the
original error. Three further problems came free with it: a bare `git commit`
that could sweep up unrelated staged work (against this repo's own rule and
`lib/git-commit-file.ts`'s pattern), a `git rm` failure that masked the real
push error behind `fatal: pathspec ... did not match any files`, and a heal
that wasn't durable anyway (`--cached` leaves the file on disk untracked, so
any later `git add -A` re-adds it).

All four go away by deleting the untrack-and-retry rather than patching each.
`pushWithWorkflowScopeCheck` now refuses *before* pushing when the repo's
history contains a workflow (`git log --all -- .github/workflows`, which still
finds it when the tip no longer has it) and gh's token lacks the scope
(`gh auth status`), with the one instruction that actually resolves it:
`gh auth refresh -s workflow`. The same guidance is the backstop if a push is
still rejected for the scope. Nothing is committed or rewritten on the user's
behalf. This deliberately reverses v55's "rather than making the user
re-authenticate" call — re-authenticating is the only fix short of rewriting
their history.

Both probes were verified against real output rather than mocks: `gh auth
status` on a real machine (`Token scopes: 'gist', 'read:org', 'repo'` — no
`workflow`, i.e. the affected case) parsed correctly by the shipped regex, and
the history probe checked in a disposable `/tmp` repo through all three states
— never had a workflow, has one at the tip, and had one that was later removed
(the exact case the old tip-level fix got wrong). The end-to-end push is still
not live-tested, since that means creating a real GitHub repo as a side
effect — but unlike v55's fix, this one is correct regardless of whether
GitHub evaluates the push per-commit or on the resulting tree.

**4. The template's own docs described a CI file new companies don't get.**
`README.md`, `docs/directory-map.md` and `docs/starter-manual.md` are all in
`TEMPLATE_MANIFEST`, so they're copied into every new company — and all three
still listed `.github/workflows/verify.yml` in their directory tours after v55
stopped shipping it. The worst of them was README's Security Operations
section, which claimed the template "ships a **gitleaks (free) scan** in its
CI" as the answer for private repos without GitHub Advanced Security, plus a
whole bullet on registering a `GITLEAKS_LICENSE` for org-owned repos. Neither
is true: no CI ships at all, and `scripts/verify.py` only checks that
`.gitignore` *effectively* blocks `secrets/` and `.env` — it never scans
history for committed credentials. That section now says exactly that, and
points at running a scanner yourself rather than implying one is already
running. `directory-map.md`'s entry was doubly stale: it also described "the
feedback-* templates", which v37 deleted.

**5. `.github` left the manifest entirely.** v55 kept
`.github/ISSUE_TEMPLATE/config.yml` as the one harmless survivor, but its
whole content is `blank_issues_enabled: true` — GitHub's own default — and
v37 had already deleted every issue template it could configure. A new company
now gets no `.github` directory at all. `templates/company-starter/.github/`
was deleted too: nothing copied or read it, and an uncopied file sitting in a
template directory is a trap for whoever edits the manifest next.
(`scripts/verify.py`'s `:(exclude).github/workflows/verify.yml` pathspec and
its matching test stay — the test writes its own fixture, and the exclusion
still protects a user who later adds CI of their own.)

The manifest guard test broadened from "no `.github/workflows` entry" to "no
`.github` entry", and a new test scaffolds a company from the **real** bundled
template into a disposable `/tmp` dir and asserts both halves at once: no
`.github` directory, and no shipped doc mentioning a `.github/` path. Every
other test in that file uses a synthetic source dir, so none of them could
have caught this. Confirmed to have teeth by running it against the pre-fix
tree, where it fails.

Full suite: 608 tests, `tsc`/`next build` clean. `templates/company-starter`'s
own pytest suite is unchanged at 117 passed / 1 failed — the same pre-existing
PATHREF-01 failure (dangling `examples/harukaze-ec/` references) recorded in
v37, verified identical against a `git stash`'d baseline.

## v57: macOS in-app updates

macOS gets the "Update & Restart" button Linux has had since the update
checker shipped. Before this, a macOS user had to open the releases page,
download the `.dmg`, drag it to Applications, and run `xattr -cr` by hand —
every single update.

**The reason this was previously refused turned out to be false.**
`perform-linux-update-impl.ts` documented macOS as impossible: ad-hoc signed,
unnotarized builds are Gatekeeper-quarantined, so an auto-installed update
"would silently produce a build that looks updated but refuses to launch."
Measured on macOS 26.2 rather than reasoned about: `com.apple.quarantine` is
attached by the **downloading application** — browsers opt in via
`LSFileQuarantineEnabled`, `curl` and Node's `fetch` do not. The real
published `Alacran.dmg`, fetched with Node and mounted, carried only
`com.apple.provenance` on every file including the `.app` inside — **zero
quarantine attributes**. The blocker is real for a Safari download and absent
on the path this slice builds. `xattr -cr` is still run on the staged bundle,
now as insurance rather than a prerequisite.

**The second unknown was real and had to be probed.** macOS 13+ TCC "App
Management" gates one app modifying another's bundle, and its self-update
exemption is defined in terms of signing identity — which an ad-hoc build
(`TeamIdentifier=not set`) hasn't got, so whether this app may replace itself
was genuinely unanswerable from docs. Probed with a purpose-built bundle of
this app's exact shape (ad-hoc signed, installed in `/Applications`, started
by LaunchServices, bash launcher running `node` from inside its own bundle):
the self-replace **succeeded, no prompt, no EPERM**. A shell-run version of
the same test also passed but wasn't trusted — a shell can hold TCC rights an
app doesn't.

**What shipped:**

- `scripts/package-macos.sh` now also builds `dist/Alacran.zip`
  (`ditto -c -k --sequesterRsrc --keepParent`). Chosen over reusing the
  `.dmg` because it drops `hdiutil attach`/`detach` entirely — a failed
  detach leaves a mounted volume behind for no benefit — and because `ditto`
  round-trips the bundle with `codesign --verify --deep` still passing and
  the launcher's exec bit intact, which `zip -r` does not guarantee. It's
  also 19 MB against the `.dmg`'s 30 MB. The `.dmg` stays: it's the human
  install gesture.
- `lib/updates/resolve-app-bundle.ts` finds the running bundle from
  `process.cwd()` (the launcher cd's to `<bundle>/Contents/Resources/app`),
  never a hardcoded `/Applications` — a copy on an external disk or a second
  test install updates *itself*. Returns null outside a `.app`, which is what
  keeps the updater away from a developer's working tree.
- `lib/updates/perform-mac-update-impl.ts` downloads the zip, extracts to a
  staging dir **on the same volume as the install** (`rename()` can't cross
  volumes, and staging beside the bundle keeps that true on an external
  disk), sanity-checks the payload before touching anything live, then swaps
  with rollback: move the live bundle aside, move the new one in, and if that
  second step fails move the original straight back. Replacing a running
  bundle is safe — the live process holds the old inodes open. Failing to
  delete the old copy afterwards is treated as litter, not a failed update.
- `restartAppImpl` gained a darwin branch: `open -a <resolved bundle>`, so
  LaunchServices starts it the way a double-click would.
- `performLinuxUpdate` became `performUpdate`, dispatching on platform, so
  the banner and the Settings card each keep one code path. `canAutoUpdate`
  now covers darwin.

**Verified live, against the real installed app.** `/Applications/Alacrán.app`
(v0.7.24, installed from the published DMG) was swapped by the real
`performMacUpdateImpl` — real `ditto`, real `xattr`, real `rename`, only the
network stubbed to serve a locally built zip — and came out at **0.8.0** with
`codesign --verify --deep` passing, the launcher executable, and no
quarantine attribute. Then launched it and confirmed the swapped bundle
serves HTTP 200 reporting 0.8.0, with the listening process's cwd traced to
`/Applications/Alacrán.app/Contents/Resources/app` and its parent to that
bundle's own launcher — checked specifically because a `next dev` server on
the same machine would have reported the same version number and looked
identical.

**Sequencing, which is easy to get wrong:** the updater fetches the *latest*
release's `Alacran.zip`. v0.8.0's release must include that asset or every
macOS update attempt 404s. Anyone on ≤ v0.7.24 has no macOS updater at all,
so they take one last manual update to v0.8.0; auto-update works from there.

Still out of scope: signing and notarization. A first install downloaded in a
browser still shows the Gatekeeper warning and still needs one `xattr -cr`.
This slice only removes the manual steps for people who already have the app.

15 new tests; full suite: 622 tests, `tsc`/`next build` clean.

## v58: solid sidebar, plural nav labels

UI-only, no behaviour change.

**The sidebar is opaque now.** `.app-sidebar` was
`color-mix(in srgb, var(--card) 55%, transparent)` — 45% transparent on a
fixed, full-height element, so page content scrolled visibly behind the
navigation and the two competed for the same pixels. Reported directly by the
user as the background "interrupting the content". A blur was never going to
fix that: `backdrop-filter` softens what shows through, it doesn't stop it
showing through. Now `background: var(--card)`, solid in both themes
(`#16100f` / `#fdf8f4`), with `backdrop-filter` removed alongside it — once
the surface is opaque the blur composites a layer nobody can see, on the
tallest element on the page. The border and shadow carry the edge instead.
`.app-bottom-nav` (the same sidebar at the mobile breakpoint, previously 80%
opaque) got the same treatment. The `--glass*` tokens are untouched: the
floating nav pill and the Sheet still use them, and those are overlays where
the frosting does real work.

**Nav labels went plural:** Network → Networks, Activity → Activities,
Connect → Connectors. One `NAV` array in `components/sidebar.tsx` drives both
the desktop rail and the mobile strip, so it's a single edit for both.

Verified live in both themes at desktop and mobile widths: computed
backgrounds are fully opaque with no alpha channel and `backdrop-filter: none`,
and no nav label clips inside the 228px expanded rail (the longest,
"Connectors", ends at 124px).

**Two things deliberately left alone, both disclosed rather than fixed:**

1. `/network` and `/activity` still head their pages `Network` and `Activity`
   (singular), which now disagrees with their nav labels. `/connect` doesn't
   have this problem because its heading is a sentence ("Connect your
   tools"). Scoped out — the request was for the sidebar.
2. **The mobile bottom nav overflows on every phone width, and these renames
   made it worse.** Two destinations are unreachable on a phone with no
   visible scroll affordance. Pre-existing — it arrived when v40 put six
   items in that strip, confirmed by swapping the labels back and
   re-measuring — so the renames changed the magnitude, not whether it's
   broken. Wants its own fix; not attempted in this slice.
   **Fixed in v59** (see below). The figures originally published here —
   "548px of intrinsic width, up from 509px" — were wrong: they
   double-counted the strip's own 32px of horizontal padding. The measured
   requirement is 532px total with fonts loaded. The overflow was real and the
   before/after direction was right; only the absolute numbers were inflated.

Full suite: 622 tests, `tsc`/`next build` clean.

## v59: the mobile bottom nav fits again

Fixes the overflow v58 disclosed and made worse. Below **560px** the six tabs
drop their text labels and the icons carry the bar; above it nothing changes.

Sizes, measured with fonts loaded, as the total the strip requires — the six
item boxes plus its own 32px of horizontal padding:

| state | required |
|---|---|
| labelled, Nunito Sans loaded | 532px |
| labelled, fallback face (during font swap) | 551px |
| icons only | 296px |

Against 320–430px on real handsets, the labelled bar pushed its last two
destinations off-screen with no scroll affordance — Connectors and Settings
were simply unreachable on a phone. Icon-only needs 296px, so it clears the
narrowest handset with room to spare.

**Why icons rather than shorter words or a "More" menu:** `.app-sidebar` on
desktop is already an icon-only rail that reveals its labels when it expands.
This is that existing pattern at a smaller size, not a new one invented for
the occasion.

**The labels are hidden visually only, never `display: none`.** The `<span>`
is each link's accessible name, so removing it would leave a screen reader
with six unlabelled destinations. Standard `clip-path` visually-hidden
recipe; verified the accessibility tree still exposes all six names with
`aria-current="page"` intact on the active tab.

The 560px breakpoint has slack in both font states (28px loaded, 9px
mid-swap) and was verified empirically at 561px — labels visible, zero
overflow, nothing clipped, 18px spare. Item padding also became a uniform
`11px`, giving every tab a 44px touch target (the platform minimum) instead
of a box that varied with label length. That made the strip 65px tall rather
than 74px, which `.app-shell-main`'s `padding-bottom: 72px` still clears —
checked, with the last content ending at 596px against a nav top of 635px.

Measured at 320 / 360 / 390 / 414 / 430 / 561 / 575px: zero overflow at every
one, and every tab inside the strip's own box.

**A correction this slice also lands:** the comment in `app/globals.css` and
v58's changelog entry both quoted 548px/509px for the labelled requirement.
Both double-counted the 32px padding, because `scrollWidth` already includes
it. Caught in review, and worth fixing rather than leaving: taken at face
value those numbers imply the 560px breakpoint is ~20px too low and that
561–579px viewports still overflow, which they measurably do not. The
comment now carries the real figures and an explicit note not to move the
breakpoint on the strength of them.

Full suite: 622 tests, `tsc`/`next build` clean.

## v60: page headings match their nav labels

Loose end from v58. Renaming the nav items to plural left `/network` and
`/activity` heading their own pages `Network` and `Activity` — singular, and
contradicting the label you just clicked. Now `Networks` and `Activities`.

`/skills` ("Skills & Commands") and `/connect` ("Connect your tools") were
already fine and are untouched: the first is a superset of its label, the
second a sentence, so neither reads as a contradiction the way a bare
singular noun does.

Checked all six pages against all six nav labels rather than only the two
reported, so this can't be half-done.

## v61: per-company MCP connectors

Second door onto external tools. Everything Alacrán could connect before this
went through a CLI — `gog` for Google, `gh` for GitHub, a `NOTION_TOKEN` in
`.env` placed by the `api-connect` skill. That's a terminal-shaped path, and
v39 and v53 both exist because real users of this app aren't CLI-literate. A
company can now be pointed at Canva, Figma, Lovable, Docusign, Vercel or a
Google MCP server with nothing installed and no key pasted.

The slice is small because a live probe, run before any code was written,
collapsed it to one file write. A hand-written `.mcp.json` at the company's
root is picked up by the real CLI and reported as `Scope: Project config
(shared via .mcp.json)`, status "⏸ Pending approval (run `claude` to
approve)". That last clause is the finding that mattered: **approval happens
by running `claude`, which is exactly what v38's already-shipped "Open in
Terminal" button does.** So this slice ships no OAuth code, no token storage
and no login button — Claude Code handles discovery, approval, the browser
flow and the token store itself, and the Sheet ends with an instruction
instead. `SECURITY.md`'s promises about what leaves the machine stay true
because nothing new leaves it: the credential lands in the user's own CLI.

Verified against the real installed CLIs, not docs (v42's rule):

- `claude mcp add -s project` writes `.mcp.json`; scopes are `local`/`user`/`project`.
- `claude mcp login <name>` / `logout <name>` do the OAuth, with `--no-browser` for headless.
- `codex mcp add` has **no** scope or project flag — machine-global
  `~/.codex/config.toml` only. A fourth instance of the recurring
  per-machine-global-config shape, after `gog` and `daily-team-log`.
- `agy --help` (Antigravity v1.1.11) has no `mcp` subcommand at all; it has `plugin`.
- Aider has no MCP. Not installed on the dev machine, so stated as unknown
  rather than asserted.

So the button is gated on the company's assigned executor being Claude Code —
free to check, since `app/page.tsx` already resolved `aiExecutorId` two lines
above. `lib/company-guide-steps.ts` gets the same flag, so v39's guide can
never explain a button a company hasn't got.

The eight preset URLs came from `claude mcp list` on a real machine, where the
CLI itself health-checked each one. Notion and GitHub are deliberately absent:
their endpoints couldn't be verified that way, and Notion already has a
working per-company path. `mcp-presets.test.ts` runs every preset through the
same validators a user-typed value faces, so a typo'd addition fails the suite
instead of being silently dropped at runtime.

Where MCP tools are reachable is a security decision, not a convenience one.
They work in **Open in Terminal** (v38) and **Get Started** (v46), which have
no tool allowlist — so this needed zero changes to the command sandbox. The
nine headless commands keep their fixed `--allowedTools` and never see an
`mcp__*` tool. That's deliberate: an MCP tool sits outside the
`Edit(...)`/`Bash(...)` model entirely, so putting one in scope for a command
that splices attacker-authored text into its prompt (`triage-email`,
`triage-issue`, `check-inbox`, `check-notion`) would hand an email author a
write API to the user's design files — exactly the hole v56 exists to close.
`run-company-command-impl.ts` and `ai-executors.ts` were named as untouchable
in the plan's constraints and were not touched.

Deliberate cuts, each with the condition that would reverse it: stdio/local
command servers (all eight presets are HTTP, and a local server is the one
input needing real command validation — `claude mcp add` still covers it);
`mcp__*` in headless commands (no command needs one yet, and guarding it
properly is its own slice); Codex/Aider/Antigravity; `enableAllProjectMcpServers`
in the company template, since the approval prompt is free and auto-approving
would mean a `.mcp.json` arriving via `git pull` connects silently; and MCP
nodes on the Network tab, which `build-network-map.ts` can compose cheaply
later.

Two things a review of the plan caught before they shipped. `McpServer` must be
a **type-only** import in the `"use client"` Sheet — `mcp-servers-config.ts`
imports `node:fs/promises`, and a value import would drag it into the client
bundle and fail the build (confirmed by a clean `next build`). And a failed
commit must not fail the save, unlike `saveGoogleAccountsImpl`: `commitFile`
throws when `git add` refuses, and `.mcp.json` is commonly gitignored in real
repos, so a company registered from an existing directory (v11's flow) would
have turned every save into a 500. The file write is the point; the commit is
convenience. Scoped to this impl, not to `commitFile`, whose skill-edit
callers want a failed commit to stay loud.

Live-verified end to end against a disposable `/tmp` company and a disposable
`ALACRAN_DATA_DIR`, so the real registry was never touched: added Canva
through the UI, confirmed the written file *and* that the real `claude mcp get
canva` reports it as project-scoped, confirmed it survived a reload, confirmed
it appears in the Ownership Sheet's network-access list, removed it, and
confirmed the real CLI no longer sees it — both writes committed in the
company's own repo. Also confirmed the button and its guide entry disappear
when that company is switched to Codex and come back when switched back. No
`claude mcp login` was run and no model was spawned; the OAuth flow is the
user's own action against their own accounts. Disposable dirs deleted;
`email-pipeline-agent` and `plh-ops` confirmed untouched.

One real UX finding from that pass, fixed in the same slice: the Address
field's placeholder was a bare realistic URL, indistinguishable from an
already-filled value at a glance — it fooled this slice's own review of its
own screenshot. Both placeholders now read `e.g. …`.

647 tests, `tsc` and `next build` clean.

**Follow-up, measured right after the release:** the one question left open by
the design — whether `claude mcp login <name>` works on a still-pending project
server, which would have justified a one-click "Sign in" button — was settled,
and the answer retires the idea rather than scheduling it. `claude mcp login`
refuses outright, with "is from .mcp.json and awaiting approval. Run `claude`
in this directory to review it first." It bails before any network call and
writes nothing to the credential store. Probed against a disposable
`/tmp` repo using `--no-browser` with stdin closed, so no authorization URL was
ever fetched or visited and no real OAuth began. The consequence: login needs
approval first, approval is only reachable by running `claude` interactively in
the company's directory, and that is precisely what Open in Terminal already
does — so a "Sign in" button could only open a terminal and repeat the
instruction the Sheet already gives. It is not deferred; it is not worth
building.

## v61.1 (2026-08-11): approval isn't missable

Copy-only follow-up to v61, from a real gap in its own shipped wording. The
Sheet's first sentence said these tools "are available in Open in Terminal and
Get Started sessions" — true only *after* the server is approved, which the
section below the form explained but which a user reading only the top would
miss. That mattered more than usual because approval turned out to have no
bypass at all (see v61's follow-up: `mcp login` refuses a pending server,
`enableAllProjectMcpServers` doesn't clear it), so a missed approval is a tool
that silently never works.

Three changes, no logic:

- The blurb (shared with v39's company guide) now says adding a tool is "step
  one of two" and that it doesn't work until approved and signed in.
- Adding a tool raises a warning-toned banner naming that tool — "Added
  <name> — one more step before it works" — stated at the moment the user
  acts rather than only in a paragraph further down.
- The instruction section became "Making a tool actually work" with two
  numbered steps, the first flagged as "the step people miss."

One thing the live pass caught: a bare "Saved" was still rendering under the
Add button beside the new banner, which reads as *finished* — the exact wrong
impression. It's suppressed while the banner is up.

Also re-confirmed a documented trap rather than chasing it: a React Client
Manifest 500 appeared mid-edit and was dev-server cache corruption from rapid
edits (v51 documented this same symptom), gone after a clean restart with
`.next` removed.

Verified on a disposable `/tmp` company and disposable `ALACRAN_DATA_DIR`: all
six copy assertions pass against the real DOM. 647 tests, `tsc` and
`next build` clean.

## v62 (2026-08-11): new type — Sora + Inter replace Nunito

Asked to pick a better typeface and decide rather than present options. Nunito
had two real problems for this product: its rounded terminals read soft and
consumer-friendly, which pulls against a brand built on a scorpion, a warm
near-black shell and one venom red — and rounded shapes lose crispness at the
11–13px this dashboard uses almost everywhere (`text-xs` is the most common
size in the app).

**Sora for display, Inter for body**, mirrored in `app/globals.css` and
`landing/styles.css` per the one-brand rule. Sora is geometric and precise,
which suits a control panel that is mostly dense status text and file paths,
and it draws a real 800 weight — so every heading already asking for 800 keeps
a genuine drawn weight instead of a synthesized one, and not a single
`font-weight` in the landing markup had to change. Inter is the strongest
available face for small dark-UI text and deliberately neutral, leaving Sora to
carry the personality. Headings went from `-0.02em` to `-0.03em`, since Sora is
optically narrower than Nunito.

**Deliberately not a return to Geist**, which v29 replaced on purpose — the
landing CSS still carried a comment comparing Nunito to "the old Geist," which
is how the previous decision was found before repeating it in reverse.

The two properties that had to survive, both verified rather than assumed:

- **Self-hosting.** The app still loads type via `next/font/google`, so the
  packaged `.app` renders with no network: 9 `.woff2` in
  `.next/static/media`, zero `fonts.gstatic.com`/`fonts.googleapis.com`
  references in the server output. A CDN `@import` in the app would be a
  phone-home, which this project forbids; the landing site keeps its CDN
  import, which is fine for a website.
- **The mobile bottom nav.** v59/v60 shipped a 560px breakpoint with the
  labelled six-tab strip needing 532px with Nunito Sans — the one layout in
  this app a font swap can silently break. Re-measured on the real production
  build with fonts loaded: **Inter needs 541px**, 9px wider, leaving 20px slack
  at 561px instead of 29px, and 551px mid-swap in the fallback face leaving
  10px. Both fit; nothing clipped; verified empirically at 561px. The note in
  `app/globals.css` now carries the new numbers and says explicitly that this
  is the measurement to re-check on any future type change.

Token names stopped naming the font: `--font-nunito`/`--font-nunito-sans`
became `--font-display-face`/`--font-body-face`. The type has now changed twice,
and a variable named after a font is a comment that becomes a lie on the next
change. `CLAUDE.md`'s standing one-brand rule was updated with the new families,
the self-hosting requirement, and the nav-measurement obligation.

Verified live in both themes on the app and the landing site (light and dark),
plus the app's real registered companies. 647 tests, `tsc`/`next build`/lint
clean.

## v63 (2026-08-12): tall drawers and dialogs scroll

A user-reported bug: pasting a lot of text into the company-details drawer made
it "get stuck" — the bottom of the form, including the Next/Save buttons, was
unreachable. Diagnosed as a defect in two primitives rather than in any drawer.

`SheetContent` is a `fixed`, `h-full`, `flex flex-col` panel with **no scroll
container anywhere** — any child taller than the viewport was simply clipped,
with nothing to scroll. Two of the ten consumers had each hand-patched their own
inner `flex-1 overflow-y-auto` (`add-company-form.tsx`,
`mcp-servers-sheet.tsx`); the four that hadn't were all broken by definition:
the company-setup wizard (the one reported), the company guide, the ownership
sheet, and the connect help. The remaining consumers use a fixed-height
`ScrollArea` and were never affected.

`AlertDialogContent` had the same class of bug from the opposite direction: no
`max-height` at all, while centred with `translate-y-[-50%]`. A confirm dialog
taller than the viewport therefore overflows *both* ends with no way to reach
either — which the skill-editor, skill-history and command-runner dialogs can
each do, since they already contain a `max-h-[60vh]` diff preview plus a header
and a footer.

Fixed once in each primitive instead of per-consumer, since every caller routes
through them and a per-drawer patch leaves the next drawer broken too:

- `SheetContent` now wraps `children` in a
  `flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain` div. It
  wraps `children` rather than putting `overflow-y-auto` on `SheetContent`
  itself (the actual one-liner) so the close button — `absolute`, and therefore
  a scrolling descendant of any scroll container it sits inside — stays pinned.
  The wrapper keeps `flex flex-col` so the two consumers already relying on
  flex semantics for their own inner scroll behave exactly as before.
- `AlertDialogContent` gained `max-h-[calc(100dvh-2rem)] overflow-y-auto
  overscroll-contain`.

**This deliberately edits `components/ui/*`, which `CLAUDE.md` forbids** — that
rule is about styling issues, where the fix belongs in a token or a consumer's
className. This is a structurally missing scroll container shared by every
caller, so the rule's own logic (one fix where everything routes through, rather
than N) points at the primitive. Confirmed with the maintainer before shipping.

Measured live at 1000×560 rather than eyeballed. The pre-fix shape was proved
genuinely stuck first (`canScroll: false`, `scrollTop` pinned at 0 with the
wrapper's overflow forced back to `visible`). After: 1293px of content in the
560px drawer scrolls its full 733px with Back/Next reachable and the close X
still at `top: 16`; a 1450px alert dialog clamps to 528px inside the 560px
viewport and scrolls 924px. Both were dismissed at their gates — nothing saved,
nothing installed. 647 tests, `tsc`/`next build` clean.

## v64 (2026-08-12): the two Google connect paths that could never work

Two user-reported bugs, same shape: the app offered a Google connection whose
advertised next step connected nothing. Both root causes were measured against
the live tools rather than inferred, and both turned out to be *this app
describing someone else's system wrongly*, not a defect in gog or Claude Code.

**1. The Gmail / Calendar / Drive MCP presets could never authenticate.**
v61 shipped eight `MCP_PRESETS`, three of them Google
(`gmailmcp.googleapis.com`, `calendarmcp.googleapis.com`,
`drivemcp.googleapis.com`). Every attempt to sign in errored. Probing the real
endpoints found two independent reasons, either one fatal:

- Their OAuth protected-resource metadata names `https://accounts.google.com/`
  as the authorization server, and that server advertises **no
  `registration_endpoint`** in either `.well-known` document. Claude Code holds
  no pre-registered client for an arbitrary MCP server, so Dynamic Client
  Registration (RFC 7591) is its only route to a `client_id` — without it,
  sign-in cannot succeed by any path the user could take. Every other preset
  (Canva, Figma, Lovable, Vercel) does advertise one, which is exactly why only
  the Google three failed.
- They also answer unauthenticated `initialize` **and** `tools/list` with `200`
  and a full tool list, and never a `401` with `WWW-Authenticate`. So the client
  sees a healthy server, no OAuth flow is ever triggered, and the failure
  surfaces only per tool call as `isError: true` "Request is missing required
  authentication credential." That is why it read as "always throwing errors"
  rather than as a login prompt.

Removed, not repaired — making them work needs a Google Cloud OAuth client the
user creates, which a preset URL in a dropdown cannot supply. Google's working
path in this app has always been `gog` (v22/v41). `mcp-presets.ts` now carries
the two-curl DCR check to run before adding any preset, a test fails on any
re-added `*.googleapis.com` entry, and the Sheet says so on screen — anyone who
already added one still has a dead entry only they can remove.

**2. The Connect page's Google card offered `gog auth setup`, which is a guide,
not an action.** Run bare it prints `status: guided`, `project_created: false`,
`apis_enabled: false`, `credentials_saved: false` and five next_steps, then
exits — having done nothing. The card wrapped it in "Run the command below in
your terminal and complete the Google sign-in. Come back and press Re-check,"
so users ran it, nothing connected, and the card showed no further step. Every
not-connected Google state returned that same one command.

The fix splits the three real gates and shows only the one the user is behind,
using `credentials_exists` — a boolean `googleStatus` already parsed and threw
away. It is file-backed (`credentials_path` under gog's own home) and flips
independently of `email`, which reads back from the OS keyring; measured
against a disposable `gog --home` where `credentials_exists` went false while
`email` still resolved. That is what makes it the reliable discriminator
between "no OAuth client yet" and "client stored, just needs authorizing" —
two states the old code could not tell apart.

- `install` — gog missing. Unchanged: `brew install gogcli` + link.
- `client` — no OAuth client. Google's rules set the shape and no UI removes
  it: an OAuth client can only be created by a human in the Cloud console,
  there being no API for it, which is why gog's own quickstart says to download
  the JSON by hand. So the card links all six console pages directly, says what
  to click on each, and hands over one command that stores the download **and**
  runs the browser sign-in: `gog auth setup <email> --credentials
  ~/Downloads/client_secret_*.json --login --services gmail,calendar`.
- `account` — client stored, no account. Just `gog auth add <email> --services
  gmail,calendar`.

`--open-console` was evaluated as the shortcut and rejected on measurement: it
refuses without gcloud ("--open-console requires --gcloud-project or an active
gcloud project"), and a non-technical user has no gcloud. The gcloud-assisted
path (`--create-project --enable-apis`) was rejected for the same audience on
step count — it adds a ~500MB SDK install and a second browser sign-in
(`gcloud auth login`) to save console clicks, making four browser trips where
the manual path needs two.

Scopes narrowed from gog's six-service default to `gmail,calendar` — what
`check-inbox` and `triage-email` actually call, and what the card has always
been named for. Verified by dry-run that this drops the APIs the user must
click Enable on from six to exactly the two the card links, so the console
steps and the command agree. `GOOGLE_SURFACE` lost its Drive and Chat marks to
match: showing a mark for a scope never requested is a promise the connection
doesn't keep. Every command on screen was dry-run verified against the real
installed gog (v0.34.1) before shipping, and the "Publish app" step is called
out as not-skippable because Testing-mode refresh tokens expire after 7 days —
the one that would otherwise return later as "it stopped working."

Live-verified on a throwaway port with a disposable `GOG_HOME`, which makes the
app see a fresh machine without touching the real auth store: the `client`
stage rendered all six console links with no stray command, and typing an
address produced the exact dry-run-verified command. The `account` stage is
unit-tested only — reproducing it live would need the real keyring cleared,
which is not a sanctioned test target. Onboarding's Google row reads the same
`guidance` and now correctly shows no command where it used to show the
inert one; its existing "Open the full Connect page →" link is the real route.
654 tests, `tsc`/`next build` clean.

## v65 (2026-08-12): importing a repo that isn't shaped like a company

Registering an existing directory required both `.git` and `.claude`. The
second check was doing no work: it was a proxy for "is this an Alacrán
company", and it never actually tested that. `.claude` is a Claude-Code
adapter artifact, not the portable core (v17's own principle), so a repo can
be a perfectly good company without one — `email-pipeline-agent` is exactly that
shape, a real working agent with a git repo and no `.claude` — while any
unrelated repo that happens to have one sailed through. It rejected the real
case and admitted the fake one.

Removed, leaving `.git` as the only structural requirement. Nothing downstream
needed it: `genericCommandSetSkillAdapter` returns an empty list when the
directory is absent, and Open in Terminal / Get Started just run the
configured executor in the company root. One check deleted at the shared
chokepoint fixes all four callers of `registerCompanyImpl`, rather than the
UI path alone.

`restoreCompanyImpl` leaned on the same check to reject "a clone that produced
something that isn't a company," and its doc comment claimed to enforce
membership. Both corrected to the honest behaviour: a clone that reports
success but leaves no git repository is still rejected (that guard is real and
now has its own test), while a cloned repo without `.claude` restores instead
of failing. The weak heuristic was not replaced with a flag to keep it alive
for one caller — it was wrong for every caller.

Context: this came from importing the three companies under `~/AI-Native/`.
Two findings that needed no code. Feature availability is decided by
`kind === "command-set"`, which every registered company gets
unconditionally — so registering an existing directory already grants the
full set (Get Started, Open in Terminal, Connect tools, Back up, Ownership,
guide), and there is no app-created privilege; v17's create flow ends by
calling the same `registerCompanyImpl`. And a company registered in `next dev`
is invisible to the installed app on purpose: dev writes the repo's own
`.data/`, production writes `~/Library/Application Support/Alacrán/`
(`data-dir.ts`, so an update replacing the bundle can't destroy the registry).
Registering PLH Triage in the installed app gave it all nine card actions
immediately, with no change to the repo itself.

Moving `email-pipeline-agent`/`plh-ops` out of `~/AI-Native/` was considered and
rejected as a non-solution: their card features are gated by the hardcoded
`kind` in `builtin-agents.ts`, not by location, so relocating changes nothing
visible — while breaking the live launchd job (which writes to absolute
`.../email-pipeline-agent/logs/poll.{out,err}.log`) and un-loading both built-ins,
which are existence-gated on that exact path. Registering them alongside their
built-in cards gets the company features with no move and no write to either
protected repo. 655 tests, `tsc`/`next build` clean.

## v66 (2026-08-12): external folders — add anything, get one button

Adds a fourth `AgentKind`, `external`: a folder the user already works in that
follows none of this app's conventions. A checkbox on "Add a company" — *"This
is an existing project or workflow, not an Alacrán company"* — registers it,
and it gets exactly one action, **Open in Terminal**. No setup wizard, no
backup, no ownership, no MCP, no Get Started, no skills, and nothing is ever
written into the folder.

Until now the only two outcomes were "a full command-set company" or "not
registered at all". v65 had already removed the `.claude` requirement, so any
git repo could be added — but registration hands out `kind: "command-set"`
unconditionally, meaning an unrelated project got the whole company surface,
including a "Set up your company" button that writes
`definitions/ontology/company.yaml` into it. Offering that for someone else's
repo is the wrong default; this kind is the honest third answer.

Shape of the change, in the direction that keeps future features safe: every
other flag in `app/page.tsx` stays keyed to `isCommandSet`, and only
`showOpenTerminalButton` ORs in `isExternal`. A new company feature is
therefore off for external folders by default rather than needing to be
excluded one at a time.

- `RegisteredCompany.kind?: "external"` — optional, so every entry written
  before this release keeps working with no migration; absent means
  command-set.
- `.git` is skipped **only** for external. The point of the kind is folders
  that follow no convention, and demanding a repo would exclude most of them.
  Companies still require it: backup, the activity feed and commit-on-save are
  all git operations. `genericGitLogActivityAdapter` already returns `[]` when
  `git log` fails, so a non-repo folder needed no special-casing there.
- The create-from-template branch is skipped when the box is ticked —
  scaffolding a company into someone's unrelated project is the opposite of
  what the option means — so a missing path simply fails registration.
- **Get Started deliberately did not follow.** It delegates *through*
  `openInteractiveTerminalImpl`, so relaxing that shared guard could have
  leaked it; `open-interactive-terminal-with-help-impl` keeps its own
  `command-set` check, and a test now pins that. Its intro prompt reads skills
  and an ontology an external folder has no reason to own.
- `build-network-map`'s final branch is a **fall-through**, not an exhaustive
  map, so `tsc` could not catch that an external folder would silently acquire
  github/google/notion/executor edges. Found by reading it. It now returns an
  isolated node alongside `report-log`, matching v43's rule that an edge is
  only ever drawn for a service a kind actually supports elsewhere in the app.
  `KIND_BADGE_CLASS` is a real `Record<AgentKind, string>` and did fail at
  `tsc`, which is the difference worth noting between the two.

Live-verified against a throwaway `/tmp` folder with no `.git` and no
`.claude` — the case both pre-v65 rules rejected outright. It registered as
`kind: "external"`, the card showed the `external` badge with Open in Terminal
and Remove only, and the folder was byte-for-byte untouched afterwards.
660 tests, `tsc`/`next build` clean.

**Incident during this slice's own live verification, worth recording.**
Filling the form via `document.querySelector('input[type="checkbox"]')` hit the
*first* checkbox on the page — the Google-accounts picker on a company card
behind the open Sheet — not the new one. That picker auto-saves, so it wrote
and committed `definitions/integrations/google.yaml` into the real
`plh-triage` repo. Caught immediately, scoped (one commit, one file, not
pushed), reported, and undone with `git reset --hard HEAD~1` after asking. The
lesson is narrow and mechanical: **scope every automated selector to the
dialog under test**, because a page-wide selector in this app can reach live
controls that write to real repos on change. The same ambiguity on the
"Update & Restart" button had errored loudly instead, which is what a
strict-mode locator does and what an unscoped `querySelector` never will.

### v0.11.1 — same-day fix: v0.11.0's tag failed CI and published nothing

v66's own new test, `opens a terminal for an external folder`, passed locally
and failed on CI with `ENOENT ... .data/acme.open-terminal.sh`. It was the only
test in that file to run *past* the kind guard to the launcher-script write, and
it never passed a `dataDir` — so it used the default `process.cwd()/.data`,
which exists on this dev machine (it holds the dev company registry) and does
not exist in a clean CI checkout. Every other test there that reaches the write
already used `mkdtemp`; this one now does too.

A test that depends on untracked local state is the failure mode worth naming:
`npx vitest run` was green here and red on a clean tree, so the suite could not
have caught it. Verified this time by temporarily moving `.data` aside and
re-running the whole suite — 660 passed with it absent, which is the state CI
actually builds in.

No user impact: `package-linux.yml` runs tests before publishing, so v0.11.0
produced no release at all and `latest` stayed v0.10.3 throughout. Fixed forward
as v0.11.1 rather than re-pointing the public v0.11.0 tag — the same call this
repo made for v0.7.19.

## v67 (2026-08-12): replace the bundled company template with own-authored scaffolding

Not a feature — a provenance fix, and the one v37 should have been.

**v37 treated a licensing problem as a branding problem.** It replaced the
bundled template's restrictive third-party license with MIT, stripped the
originating program's name out of ~25 files, and deleted the pure
event-logistics docs. What it did not do is stop shipping the material. Of the
96 files in `templates/company-starter/` before this slice, **91 descended
from the kit bundled at `b2692db`** — 12 byte-identical to it, the other 79
differing mostly because of the July 29 pass that *translated* them, which
produces a derivative work rather than an original one. The template was still
someone else's, now under this repo's own copyright line.

Measured, not assumed: `git ls-tree` at `b2692db` versus `HEAD`, comparing
blob SHAs file by file, is what produced those three numbers.

**What replaced it.** The template is now 33 files, written for this repo:

- `README.md`, `CLAUDE.md` — a scaffold's worth of orientation, not a manual.
- `.claude/commands/` — exactly the commands the app's own registry runs
  (`define-company`, `digest`, `decision`, `retro`, `handoff`, `verify`,
  plus the four read-only connectors), each written against the real
  `outputPath` in `lib/company-commands/registry.ts` so a command file can't
  promise a path the commit gate won't accept.
- `docs/templates/ontology-starter.yaml` — rewritten from scratch, because it
  is a hard dependency of `lib/save-company-ontology-impl.ts` and
  `registry.ts`'s `define-company` prompt, not an optional doc.
- `scripts/verify.py` — rewritten. Three checks that are cheap to get wrong
  and expensive to find late: `secrets/`/`.env` really are git-ignored (via
  `git check-ignore`, with a text fallback outside a repo), the ontology
  exists with no `<<TODO>>` left, and every decision file has a
  Why/Reasoning section. It does **not** claim to scan for already-committed
  secrets; the docstring says so, since the previous script's docs implied a
  scan it never performed.
- Folder skeletons with a README each explaining what belongs there.

**Kept, because it was provably this project's own work:**
`check-inbox.md` (v22), `check-notion.md`, `triage-email.md`,
`triage-issue.md` (v32), the two `definitions/triage/*.example.yaml`, and all
28 files of `templates/packs/` — zero of which existed at `b2692db`.

**Dropped rather than rewritten**, because rewriting them would have meant
inventing features to fill a shape: `.claude/rules/` and `.claude/hooks/`
(5 each), `.claude/skills/` (11 files, including an "AI readiness diagnostic"
that was pure program material), `docs/concepts/`, four narrative docs,
`definitions/hitl|kpi|cycles|retro`, `scripts/cycle/`, the template's own
pytest suite, and the `create-epic`/`ingest-context`/`stock-note` commands —
none of which the app ever ran. `TEMPLATE_MANIFEST` shrank from 34 entries to
19 to match.

**Two stale cross-references this surfaced**, both of which would have shipped
into every new company as a doc that lies: `FRESH_HANDOFF_CONTENT` cited
`CLAUDE.md` "§2.6" and "§5" — section numbers the new `CLAUDE.md` doesn't
have — and the two kept connector commands pointed at an `api-connect` skill
that no longer ships in the template. Both fixed.

**Verified** with `tsc`, 660/660 vitest (including the v56 test that scaffolds
from the REAL bundled template, whose pinned doc list needed updating for the
deleted files), and a real scaffold into a disposable `/tmp` git repo where
`verify.py` was exercised through all three of its states — fresh company,
decision missing its reasoning, and fully clean — then deleted.

## v68 (2026-08-12): remove the email-polling daemon surface

The app no longer knows about the email-polling agent. Requested directly:
that built-in existed to watch one specific mailbox, and the app was the
thing surfacing and triggering it.

**Deleted outright** — every file that existed only to serve it:
`lib/adapters/email-pipeline-agent.ts`, `get-poll-log-tail.ts`, `poll-lock.ts`,
`launchd.ts`, `lib/get-poll-status.ts`, `lib/trigger-poll{,-impl}.ts`, all of
`lib/scheduled-job/` (v31's on/off control), and the two client components
`trigger-poll-button.tsx` / `scheduled-job-toggle.tsx`. The built-in
descriptor and `PIPELINE_LAUNCHD_LABEL` went with them, so the app now
loads 2 existence-gated built-ins instead of 3. 32 tests and 6 test files
went too — they tested the removed features, and keeping them would have
meant keeping the code.

**Two places printed a real mailbox on screen, not one.** The obvious one was
`getIntegrationStatus`, which read a hardcoded agent id's `config.json` and
rendered `Email connected (<address>)` on its card. The second was
`buildNetworkMap`'s `readPipelineEmail`, which did the same thing again for
the Network tab's Google edge — found only by grepping for the *symbol*
rather than the feature, which is the lesson worth keeping: the same data can
surface through two unrelated pages, and fixing the one you were told about
leaves the other live. Both are gone; a new test asserts an address is never
surfaced even when a `config.json` beside the company holds one.

**A real bug this introduced and caught before commit.** Removing the
`pipeline` early-return in `buildNetworkMap` made that kind fall through to
the company branch, which draws github/google/notion/executor edges — the
exact trap CLAUDE.md's v66 note warns about, since the last branch is a
fall-through and not an exhaustive `Record`, so `tsc` says nothing. Fixed by
listing `pipeline` alongside `report-log`/`external` in the isolated-node
guard. The `pipeline` AgentKind itself was **kept**: it's used as an arbitrary
fixture kind in ~15 unrelated test files, so deleting it would have churned
all of them to remove one now-unreachable branch.

**Guards that named people were reshaped, not deleted.** Three tests proved a
regenerated `SKILL.md`/`Setup.md` carries none of the upstream team's
identity — by spelling out a GitHub owner and three first names, putting the
identifiers into the repo that the guard exists to keep out of a generated
file. They now assert shape: no `github.com/<owner>/<repo>`, no
`reports/<Capitalized>`. Verified they still fail on a regression.

`tsc` clean, vitest 628/628, `next build` clean across all 8 routes.

## v69 (2026-08-12): freee as an MCP connector

Added freee — Japanese accounting, HR, invoicing, payroll and e-signature
software — to the per-company MCP connector presets (v61). One entry in
`MCP_PRESETS`; no new mechanism, no new file, no new dependency. `.mcp.json`
writing, approval, OAuth and credential storage are Claude Code's, exactly as
they were for the five presets already there.

**The gate this had to pass first.** `lib/mcp-presets.ts` carries a standing
rule written by v64: a preset must be Dynamic-Client-Registration-checked
against the live endpoint before it's added, because v64 shipped three Google
presets that could never authenticate and had to delete them. freee was
checked the same way, before any code changed:

- `POST /mcp` unauthenticated answers **`401`** with
  `WWW-Authenticate: Bearer error="invalid_token"` and a `resource_metadata`
  pointer. This is precisely what the Google presets never did — they
  answered `200` with a full tool list, so no client ever started an OAuth
  flow and the failure only showed up per tool call.
- `/.well-known/oauth-protected-resource/mcp` names its authorization server
  as its own origin (`https://mcp.freee.co.jp/`), whose metadata advertises
  **`registration_endpoint: https://mcp.freee.co.jp/register`**. DCR is the
  only way Claude Code can obtain a `client_id` for an arbitrary MCP server,
  so this is the check that separates a preset that works from one that
  can't.

**freee's local server was deliberately not used.** freee ships both a hosted
server and a local stdio one (`npx freee-mcp configure`, OAuth PKCE against a
user-created freee app, callback on `127.0.0.1:54321`). The stdio shape is
explicitly out of scope for this UI — `isSafeServerUrl` is https-only by
design, since a local server means a user-supplied command line, the one
input that would need real command validation. `claude mcp add` still covers
that for power users. The hosted endpoint is the same shape as every other
entry, which is why this slice is one line.

**No new tests.** `mcp-presets.test.ts`'s existing assertions already cover
any addition: every preset must pass the same `isSafeServerName` /
`isSafeServerUrl` validation a user-typed value passes, names must be unique,
and no `*.googleapis.com` host may reappear. That was the point of writing
them as loops over `MCP_PRESETS` rather than per-entry cases.

**A stale doc line fixed in passing.** README still advertised "Canva, Figma,
Lovable, Docusign, Vercel or a Google MCP server" — the Google half was
deleted in v64 and the sentence was never updated. Corrected in the same line
that gained freee.

`tsc` clean, vitest 628/628, `next build` clean across all 8 routes. Live-
verified on a throwaway dev server (port 3117): the freee preset renders in
the Connect tools Sheet and fills the form with `freee` /
`https://mcp.freee.co.jp/mcp`. **"Add" was deliberately not clicked** — it
writes and commits a real `.mcp.json` into a real repo, which the standing
safety rule forbids for a test. Selectors were taken from scoped snapshot
refs inside the open Sheet, per v66's note about page-wide selectors reaching
live auto-saving controls on the cards behind it.

### Release note (v0.13.1): the Linux half nearly didn't ship

The tag push fired `package-linux.yml` as designed and it **failed** — not
from anything in this slice. Its publish step reads `GH_TOKEN` from a repo
secret `RELEASES_REPO_TOKEN`, and that secret does not exist (`gh secret
list` on the repo is empty), so `gh` exited 4 with "To use GitHub CLI in a
GitHub Actions workflow, set the GH_TOKEN environment variable". The `.deb`
had already built fine; the workflow has no `upload-artifact` step, so the
build was simply lost with it.

**Why this couldn't be worked around by publishing the macOS half alone.**
`DEB_ASSET_URL`, `MAC_ASSET_URL` and both landing-page download buttons all
point at `releases/latest/download/<name>`. A v0.13.1 release carrying only
the mac assets would immediately become `latest` and 404 every Linux user's
in-app update — surfacing as `performLinuxUpdateImpl`'s "Couldn't download
the update. Check your connection and try again", which would be a lie. That
is the same failure shape v57 recorded for the then-missing `Alacran.zip`,
pointed at the other platform.

**So the `.deb` was built locally in Docker instead**, disproving this
project's own standing claim that Linux packaging can only happen in CI
because the dev machine has no `dpkg-deb`: a `node:24-bookworm` container
has one. `npm install` (not `npm ci`, per the lockfile drift CI already
documents), then `scripts/package-linux.sh` unmodified — including its own
headless self-test, so the artifact was boot-tested on real Debian, and
`dpkg-deb -x` confirmed `mcp.freee.co.jp` in the extracted payload and
`Version: 0.13.1` in the control file. One transient failure worth knowing
about: `next/font/google` fetches at build time, and a flaky fetch kills the
whole build with an opaque webpack error — re-running fixed it.

All three assets were then published in a single `gh release create`, so
`latest` was never observed missing one. Verified after the fact by
downloading all three public URLs in full (200, real byte counts) rather
than trusting the upload's own output.

**Still open, needs the maintainer:** create a PAT with write access to
`alacran-releases` and add it as the `RELEASES_REPO_TOKEN` secret on the
`alacran` repo, or Linux packaging stays a manual Docker step. Adding an
`upload-artifact` step would also stop a failed publish from throwing away a
good build. *(The secret was added on 2026-08-18 and answers 401 — see v87,
which added the artifact step and made the workflow say so; the PAT half is
still open.)*

## v89 (2026-08-21): skills grouped by department, and one primary action per card

Two user reports, one shape: nothing on either surface said which of many
things mattered.

**The Skills page grouped by department.** Adding the Software engineering
pack to a company that already had others put 30-odd files into one
alphabetical list — `analytics` next to `api-designer` — because
`mergeAndSortSkills` sorts every entry by name and the tree grouped only by
kind. New `lib/skills/departments.ts` derives `basename -> department` from
`templates/packs/` and a pack's own `category` field, which already existed
and already said "Engineering", "Marketing", "HR & People". **Derived, not
stored, for v86's reason:** a `departments.json` a user could edit is a second
answer to "which pack does this belong to", and two answers drift. **Keyed by
path, never by `SkillEntry.name`** — that comes from frontmatter, which a user
may change, and a renamed skill would silently leave its department. Kind is
no longer a tree level; it is the row icon and the badge on the open file,
which keeps the tree three deep instead of four in a 17rem rail.
`GENERAL_DEPARTMENT`/`DEPARTMENT_ORDER` live in `lib/company-starter-packs.ts`,
not beside the derivation, because that module imports `node:fs` and the tree
is a client component — defining them twice is the drift this codebase avoids
everywhere else.

**Filing is per browser, and deletes rather than stores a no-op.** Moving a
skill to another department writes `lib/skills/department-overrides.ts` to
localStorage, the same call `components/reorderable-grid.tsx` already makes for
card order and for the same reason: this is how someone likes their sidebar
arranged, not a fact about the business. **It touches no file**, so filing a
v81 app-managed vendored skill needs no write to something the next update
overwrites. An override equal to the derived department is deleted rather than
kept — a stored value that merely agreed with today's default would pin that
skill forever, and a later pack recategorisation would read as a bug years
later. The control is a native `<select>` in the open file's header rather
than dragging tree rows: keyboard- and touch-reachable for free, and the only
version that announces the feature exists at all.

**The agent card given three tiers instead of one stack.** A `command-set`
company rendered up to thirteen identical `size="sm" variant="outline"
w-full` buttons in a single `space-y-2` column, so "Get Started" looked exactly
like "Avatar". Now: the primary action first and solid (the setup wizard while
a company has no ontology, Get Started once it does — never two, since the
wizard's button disappears the moment `showSetupCompanyButton` goes false),
conditional offers as a wrapped chip row, and the standing configuration behind
a native `<details>`. **The disclosure is deliberately uncounted** — `AdvancedOnly`
decides on the client whether two of its children render at all, so any number
rendered server-side is wrong in simple mode. The card also shows its own
`~`-shortened root path, which is what a machine with three
similarly-named companies was missing.

**Two layout rules found by looking, not by reasoning.** (a) `.bento-grid > * >
.bento-card { height: 100% }` — the grid item is `ReorderableGrid`'s own
draggable wrapper, which stretches, but the card inside kept its content height
and a row of two was visibly ragged. (b) Bottom-pinned actions (`mt-auto`) were
tried and reverted: they align only when cards hold similar amounts, and one
card with its More open left a void through the middle of every other card —
the same complaint the original `justify-end` body earned. Top-flow, with the
slack falling at the bottom where it reads as empty rather than broken.
`components/ui/*` untouched throughout; the two `variant` changes are in
consumers.

`components/company-guide.tsx` now says where the quieter actions went — per
this repo's own rule, a change that makes a shipped doc wrong isn't finished,
and v39's guide is a walk-through of exactly this card.

## v88 (2026-08-19): the Linux buttons that reported success and did nothing

Reported from a real Debian install: Open in Terminal doesn't open a terminal,
and Set up Google for me does nothing. Both are the same defect, and it is not
in either feature — it is in how all four launch sites read the result of
spawning a terminal.

Each one spawned the emulator, attached `child.on("error", () => {})` so an
unhandled event couldn't take the server down, and then returned
`started: true` with "Opened Terminal". That `error` event covers exactly one
failure: the binary not being startable at all. It covers none of the failures
Linux actually produces — no reachable display, no D-Bus session to hand a
window to, an `-e` the resolved emulator rejects, a snap-confined
gnome-terminal that can't see a script under the app's data dir. Every one of
those **spawns fine and then exits non-zero**, having written the reason to
stderr, which `stdio: ["ignore", "ignore", "ignore"]` threw on the floor. So
the app said it had opened a terminal, no window existed, and nothing anywhere
recorded why. macOS could never show it: `open -a Terminal` hands off to
LaunchServices and exits 0 whatever happens afterwards.

`launchTerminalScript` in `lib/terminal-launch-command.ts` now watches the
launch instead of assuming it, and all four callers
(`open-interactive-terminal-impl`, `setup-google-impl`, `sign-in-claude-impl`,
`run-company-command-impl`) go through it — the chokepoint, not the two buttons
that got reported. What makes the check cheap is that a terminal which opened
does not exit, since it lives as long as its window; the one exception is
gnome-terminal, which forks to its D-Bus server and exits 0 immediately. So a
non-zero exit inside a short settle window is a launch failure and anything
else is a launch, with no display probing involved, and the emulator's own
stderr becomes the message the user reads. The settle window is a knob (800ms)
rather than an inlined constant: a parse failure returns in well under 100ms,
while a terminal that stays open costs the whole window before the caller hears
"opened".

**The visible-run path needed care, not the same treatment.** Its lock is
released by the generated script's own `trap ... EXIT`, and its test asserted
"no exit handler is registered in visible mode" to protect that. An exit
listener now does get registered, so the test was re-pointed at the property
the mechanism existed to defend — the launcher exits 0 immediately and the lock
is still held — rather than at the absence of a listener. A launch that dies on
arrival is the one case where the script never runs at all, so there the lock
IS released and the failure is written to the run log, which is what the old
`error`-only handler was already for.

**A second silent no-op in the same slice.** `isChromeInstalled` accepts either
`google-chrome` or `google-chrome-stable`, because distros disagree about which
exists — but `openChromeAccountCheckImpl` hardcoded the first name and swallowed
the ENOENT in a `.catch(() => {})`, still returning `opened: true`. A machine
carrying only `google-chrome-stable` therefore passed the installed check and
then did nothing when asked to open Chrome. Both now read one list.

Nothing here was reproduced locally — this is a macOS dev machine, and the
failure is only visible where it was reported. That is the reason the fix is
"stop reporting success you didn't verify, and surface the emulator's own
words" rather than a guess at which of the four Linux causes it is: a confident
patch aimed at the wrong one would have looked exactly as finished.

### Release note (v0.27.0): the token was replaced and still couldn't publish

The secret was rotated to a fine-grained PAT and the publish step failed
again — this time with `HTTP 403: Resource not accessible by personal access
token` on `/releases`. Worth recording because the obvious pre-check lies:
`gh api /repos/kwakuoseikwakye/alacran-releases` returns
`permissions: {admin: true, push: true, ...}` **for that token**, which reads
as "this token can write here" and does not mean that at all — the block
reports the authenticated ACCOUNT's access to the repo, not the grants on the
token being used. A fine-grained token needs `Contents: Read and write` on the
target repo before releases are reachable; repo read is not enough. So v88's
`gh auth status` guard was not sufficient either: the token authenticates
perfectly and fails one call later. The guard now hits
`/repos/.../releases?per_page=1`, the capability actually required, and says
which permission is missing.

Everything else went the way v88 intended. The `upload-artifact` step held the
built `.deb` through the failure, so the release was assembled from that
artifact rather than from a second Docker build — `Version: 0.27.0` read out of
its control member first, since `dist/` still held the previous version's
`Alacran.deb` under the same name.

**And the pre-check itself was wrong twice, which is the real lesson.** v88
guarded with `gh auth status`; a fine-grained token authenticates perfectly with
no Contents access, so it passed and the publish 403'd one call later. v0.27.0's
fix guarded with a GET on `/releases`; `Contents: read` answers that happily, so
it passed too and only the POST was refused — the token was declared working on
the strength of a read. There is no harmless write to probe a release with, so
the guard is gone entirely: the workflow attempts the real publish and explains
the failure, naming `Contents: Read and write` specifically. Same shape as the
Linux display error being read off stderr instead of guessed from `DISPLAY` —
a pre-check that can be satisfied by something weaker than the operation is not
a check, it is a second thing to be wrong about. Both v0.27.0 and v0.27.1 were
assembled from the `upload-artifact` build for this reason, which is the whole
point of that step.

**Follow-up shipped in v0.27.1.** The real Debian install returned exactly the
error v88 was built to surface — `Invalid MIT-MAGIC-COOKIE-1 key` followed by
`Failed to parse arguments: Cannot open display:` with nothing after the colon.
Both halves say one thing: the server had no usable display credentials, which
is what running it outside the desktop session does (SSH, a bare TTY, a service,
or sudo, which strips DISPLAY and XAUTHORITY). Nothing in the app can reach a
screen from there, so the fix is only the wording — X's phrasing is unactionable
for this audience, and the message now names the cause and what to do, keeping
the emulator's raw text in parentheses so the next report stays diagnosable.
Matched on that stderr rather than pre-checked from `DISPLAY`/`WAYLAND_DISPLAY`:
libwayland falls back to `wayland-0` when WAYLAND_DISPLAY is unset, so a
pre-check would refuse launches that do work, and reading the failure after the
fact cannot produce that false negative.

**Published as a draft, deliberately.** v0.13.1 recorded why a release must
never become `latest` carrying only one platform's assets: `DEB_ASSET_URL`,
`MAC_ASSET_URL` and both landing-page buttons all read
`releases/latest/download/<name>`, so a partial release 404s the other
platform's in-app updater and surfaces as "Couldn't download the update. Check
your connection" — a lie. A draft is not `latest`, and `gh release view <tag>`
resolves a draft by its `tag_name`, so the workflow uploads into it rather than
creating a rival release. The mac `.dmg`/`.zip` went into the draft first, the
`.deb` joined them, and only then was it published. Verified afterwards by
fetching all three `latest/download` URLs and matching `content-length`
against the local files, rather than trusting the upload's own output.

## v87 (2026-08-19): adopt a folder you already work in, and a tree that starts closed

**A folder that already exists can become a company, in place.** Registering
one used to mean either scaffolding a new directory or ticking `external` and
getting a single Open in Terminal button — so a real folder full of working
automation had no route in. The default path suggestion made it worse: it
tracks the name until the path field is edited, and that field is hidden
outside advanced mode (v72), so typing a name and pressing the button
scaffolded an empty `~/Alacran/<slug>` and never touched the folder the user
meant. `lib/adopt-folder-impl.ts` adds the manifest's files to the folder
where it already sits, ensures a repo, and calls the same `registerCompanyImpl`
the create flow ends with — no `kind`, so v65's finding applies unchanged and
it lands as a full company, not a downgraded one.

**A symlinked wrapper under `~/Alacran/` was designed first and rejected**,
which is worth recording because it is the obvious shape. It fails twice.
`resolveWithinAgentRoot` (`lib/path-guard.ts`) realpaths both sides and
requires containment, so every guarded read or write through the link resolves
outside the company root and is denied — the containment check would have had
to be loosened, in the one file whose whole job is not being loose. And `git
add -A` stores a symlink as a symlink, so Backup, the activity feed and
commit-on-save would each cover an empty wrapper while reporting success: v64's
exact failure shape, an advertised step that does nothing. Location was never
the thing granting features in the first place.

Additive throughout, and the never-overwrite loop was **not** written a second
time — `copyNew` moved out of `add-company-pack.ts` into `lib/copy-new.ts` and
is now shared by both flows that add app files to a directory someone already
works in. Two copies of that rule drifting is how a user's own edited command
gets clobbered by the flow that didn't get the fix. Copying is per-child rather
than per-manifest-entry for the same reason a whole-directory skip is wrong: a
folder with its own `.claude/commands` would otherwise be registered as a
company holding not one command the app can run. Git is conditional — an
existing repo gets a pathspec-scoped commit of exactly what was added, so
uncommitted work of theirs can't be swept in; a folder with no repo gets `git
init` and a first commit, because Backup and the activity feed have nothing to
read otherwise.

**The path field is replaced by a folder picker, not supplemented by one.**
`lib/list-home-folders.ts` lists directories under `$HOME` with one level of
drill-down, and the user clicks the folder instead of typing its path — the
last technical value in this flow, and the reason it was unreachable for the
audience v71–v75 exist for. Confined to the home subtree deliberately: it is a
browser-reachable Server Action, and an unchecked `dir` would list any
directory on the machine. There is no native dialog to reuse — this ships as a
local web app, and `<input webkitdirectory>` yields relative names a Server
Action can do nothing with. Entering or leaving the mode clears the path both
ways, since either direction otherwise leaves a stale one behind (the
name-derived suggestion going in, the picked folder coming out).

**The Skills tree starts closed.** v73's file explorer expanded every company
by default, which on a machine with several of them is a wall of file rows to
scroll past before reaching the one you want; the folder row and its count
already say what a company has. The state now keys on what is *open*, so the
empty default is "all closed" rather than a lookup that has to remember to
invert, and searching force-opens — a filter whose matches sit behind a closed
chevron is a search that finds something and shows nothing. `aria-expanded`
came with it: closed-by-default makes the state something a screen reader has
to be told rather than infer from a glyph.

**`package-linux.yml` stops throwing away a good build.** Every tag since
v0.25.0 built the `.deb` on the one platform that can build it and then lost
it, because the publish step's 401 failed the job with the artifact still
sitting in `dist/` — which is why v0.25.0 and v0.26.0 were both assembled by
hand. An `upload-artifact` step now runs before publishing, exactly as v0.13.1's
open note proposed, so a dead token costs one click instead of a Docker
session. The 401 is also now diagnosed rather than guessed at: `gh release
view` exits non-zero on an auth failure exactly as it does on a missing
release, so a bad token fell straight through to `gh release create`, 401'd
again, and reported itself as "error checking for existing release" followed by
gh's stock "Try authenticating with: gh auth login" — advice for a laptop,
meaningless in a runner, and pointing at the wrong thing. A `gh auth status`
precheck now names the secret and says what to do about it.

**What this does not fix, and cannot from here:** writing to another repo needs
a credential for that repo. No rearrangement of this workflow conjures one, so
Linux publishing stays manual until `RELEASES_REPO_TOKEN` is replaced with a
working PAT. Publishing the `.deb` to *this* repo's own releases with the
built-in `GITHUB_TOKEN` was considered and dropped: it would land the asset at
a URL nothing points at, since `DEB_ASSET_URL` and both landing-page buttons
read `alacran-releases/releases/latest/download/`, and a second download
location that has to be remembered and undone is a worse trade than one click.

### Release note (v0.27.2): the first real adopted folder couldn't finish setup

Adopt a folder, open the setup wizard, press Save — "Saving…" forever, nothing
written to the screen, no company saved. Two defects stacked, and the adoption
above is what made the first one likely rather than exotic.

`saveCompanyOntologyImpl` awaited `commitFile` unguarded, so a non-zero `git
add`/`git commit` rejected the whole Server Action **after** company.yaml had
already been written. An adopted folder keeps its OWN `.gitignore` — deliberately,
per this slice — so a repo that ignores `definitions/` or `*.yaml` makes `git
add` refuse; and a folder this app ran `git init` on has no `user.email` until
someone sets one, which fails every commit on a fresh machine. The rule was
already written down twice in this codebase ("a failed commit must not fail the
update — the files are already correct on disk"); this call site, plus
`portable-agent-file`, `install-daily-team-log` and `save-google-accounts`, never
got it. All four fixed. **Deliberately not moved into `commitFile` itself**,
which would have been the smaller diff: `save-skill-content-impl` reports commit
failures to the user on purpose, and swallowing at the chokepoint would make it
claim "Saved and committed" when it hadn't been. A chokepoint fix is only
correct when every caller wants the same answer.

The wizard then converted that rejection into a permanent spinner:
`setPending(false)` sat after a bare `await` with no `try/finally`, so a
rejection skipped it and the thrown message went nowhere — which is why the
failure was silent rather than visible. Both of its handlers now clear state in
`finally` and put the error on screen. **Fifteen other components share that
exact shape** (`setPending(true)` … `await` … no `finally`); only the reported
one is fixed, and the sweep is outstanding.

Known consequence, worth stating plainly: if the commit is what's failing, the
save now succeeds and `company.yaml` is simply not in git. Everything in the app
reads from disk, so nothing is broken on the machine — but Backup won't carry
it, and there is no warning channel on the success path to say so yet.

## v86 (2026-08-19): one working agreement every agent reads, and packs a company can add

Four things, one thread: a company's context should reach whichever agent runs
it, and a company should be able to grow past the one shape it was scaffolded
from.

**`AGENTS.md` replaces `CLAUDE.md` as the working agreement.** The template's
own §1 already said `.claude/` is one adapter for one tool and the core must
never depend on the adapter — but the standing context itself lived under a
vendor's filename, so of the four selectable executors only Claude Code ever
auto-loaded it. Codex, Aider and Antigravity spawned fine and started with no
idea what the business was, which made "bring your own agent" half-true from
v42 onward. The file is now `AGENTS.md`, read by all four, and `CLAUDE.md` is a
two-line pointer using Claude Code's own `@AGENTS.md` import with a plain-English
fallback. `TEMPLATE_MANIFEST` ships both — an allowlist, so the new name had to
be named there or it would never be copied.

**Existing companies get a button, not a migration.** `addPortableAgentFileImpl`
moves the company's own `CLAUDE.md` — user edits and all — to `AGENTS.md` and
writes the pointer, in one pathspec-scoped commit. A rename, never a copy: two
files both claiming to be the working agreement is precisely the drift §1
forbids. It refuses on an existing `AGENTS.md`, on a company with no working
agreement, and on an `external` folder. Write order is deliberate — `AGENTS.md`
first, so a crash between the two writes leaves the agreement under both names
rather than under neither. **The test that matters** asserts `CLAUDE_POINTER` is
byte-identical to the real bundled template: two paths now produce that prose
and the drift would be invisible, since both files read fine alone.

**A company can hold more than one pack.** "We're a marketing company and now we
build websites too" had no answer but hand-copying files. `addCompanyPackImpl`
copies a second pack's commands and skills, skips anything already present
(adding a pack is additive or it is nothing), and never touches
`definitions/ontology/company.yaml` — a pack ships an example one only because a
brand-new company has nothing there yet. Stamp-last on a complete install only,
the same rule v77 established.

**The bug that made multi-pack impossible, and would have shipped silently:** a
company had ONE `.claude/skills/UPSTREAM.md`, so a second pack's tag had nothing
of its own to be compared against — each pack in turn looked stale against the
other's tag and the update button flip-flopped between them forever, restamping
on every press. Stamps are now per-pack (`UPSTREAM-<pack>.md`). The legacy
shared name is still read and never written or deleted, so it remains the stamp
of the pack the company was scaffolded from — no migration runs, and a company
whose files were copied in by hand heals itself on its first update.
`isAppManagedSkillPath` had the same first-match-wins shape and was the worse
half: it `return`ed on the first matching pack, so a second pack's skills came
back "yours to edit" and would be overwritten by the next update anyway. Both
loops now consider every matching pack.

**Two detectors for "which packs does this company hold" became one.**
`VENDORED_SKILL_PACKS[].markerCommand` (hand-maintained) and `listPackState`'s
derived check were two answers to one question, and when they disagree the
symptom is a skill judged app-owned by one caller and user-owned by the other.
`isPackInstalled` derives it from the pack's own command files, memoized since
both callers sit on the `force-dynamic` Agents render. **The invariant moved
with it, and got stronger:** the old test pinned marker uniqueness across
vendored packs; the new one pins that no command filename is shared between any
two packs, or with the base template every company already has — which is what
the derived check actually needs, and covers the two packs that vendor no skills.

**A silent, permanent wedge, fixed at the one function both callers route
through.** `lib/file-lock.ts` wrote `process.pid` into every lock and nothing
ever read it, so one hard quit or crash mid-run left the file behind forever:
every later run for that company reported "Already running" — including every
schedule it had, unattended, with no way out but finding and deleting a file
inside the app's data directory. `acquireLock` now collects a lock whose writer
is gone, and `checkLockStatus` reports it as free. **The recorded pid is the
SERVER's, not the spawned agent's, which is exactly the right proxy:** while the
server lives only its own exit handlers touch the lock, and once it dies the lock
is garbage by definition. It errs toward "still held" on anything ambiguous — an
unreadable file, or EPERM from another user's pid — because a wrongly-held lock
wedges one company until restart while a wrongly-released one starts a second
agent CLI on top of a live run. Known ceilings, commented rather than built: pid
reuse still reads as held (same outcome as the bug, far rarer), and a visible run
whose bash wrapper owns the lock records the server's pid too, so restarting the
server mid-run makes that lock collectable.

**The tooling trap from v83 bit again, and is worth restating:** this shell's
`grep` wraps `ugrep --ignore-files` and silently skips `*.test.ts`, so a
repo-wide "unused export" sweep run during this slice reported ~35 dead exports.
Re-run under `/usr/bin/grep`, several were live in tests only. Every dead-code
claim needs the absolute path — including the ones that look obviously right.

## v85 (2026-08-19): the Connect page as a list, not six competing cards

**Six setup flows were all on screen at once.** The Connect page rendered a
two-up grid of cards, each card carrying its tool's entire setup — console
links, service pickers, install buttons, copyable commands — expanded and
visible whether or not you had come to connect that tool. A user connecting
one thing read past five other tools' instructions to find it.

Rebuilt as grouped list rows: one bordered container per group (*Your AI*,
*Accounts*, *Per company*), one row per tool, dividers between them. A row
states the tool, one line of real state (which address is signed in, which
accounts are connected), and either a `Connected` dot or a `Connect` chip. The
setup unfolds only for the row you click.

**`<details>`, not a state-managed accordion** — the toggle, keyboard
support, and keeping closed content out of the tab order are all native, and
nothing has to track which row is open. `ConnectRow` and `ConnectGroup` are
both presentational; every body is the existing JSX moved verbatim, so the
Google service picker, the install/repair buttons, the Keychain explainer and
Notion's per-company list all behave exactly as they did.

Layout is capped at `max-w-4xl` and centred. A list of names has no reason to
stretch to the full width of a 1600px window, which the card grid did.

**Two defects the live pass found, both invisible in the card layout:**

1. A **connected GitHub row opened onto an empty panel** — its card body was
   entirely `!live` content plus a hint excluded for `github`, so once
   connected there was nothing left to render. It now says the one true thing
   it has to say ("Back up a company to a private repo from that company's
   card"), the same shape as the executor rows' line above it.
2. Below `sm` the status label was hidden to fit the row, leaving **colour as
   the only carrier of connected state**. Now `sr-only sm:not-sr-only`: the
   dot is always visible, the words return at `sm`, and the label is in the
   accessibility tree at every width.

`tsc`, `eslint` and 759/759 tests clean. Live-verified at 1440px and 420px,
rows both open and closed, against the real connected state of this machine —
`/connect` only reads, so no repo was touched (no checkbox was clicked either;
v66's note about page-wide selectors reaching live auto-saving controls applies
to this page's neighbours).

## v84 (2026-08-18): jobs that run overnight, with the same approval gate

**Alacrán could only work while you were watching it.** Every job started with
a click, so a weekly digest or an inbox check happened when you remembered to
ask for one — the app was a place you went to *do* something, never a place you
came back to and found something already done. Competing tools close that gap by
letting agents commit on their own; this slice closes it without giving up the
thing that makes this app what it is.

**Any command whose fields are all optional can now be set to run once a day at
a time you pick** — `orientation`, `digest`, `handoff`, `check-inbox`,
`check-notion`, `triage-email`. A command with a required field
(`decision`, `retro`, `define-company`, `triage-issue`) is refused by
`isSchedulableCommand`, because a schedule with nothing to answer with would
fail every night forever.

**The scheduler calls `runCompanyCommandImpl` with no arguments and nothing
else.** That is the whole security argument: the tool allowlist, the
`untrustedInput` refusal on executors that can't enforce scope (v56), the
per-company run lock, and the before-snapshot all come along byte-identically,
because none of them know a timer is involved. `commitCompanyCommandResultImpl`
remains the only thing in the app that ever commits.

**Auto-commit exists, and is opt-in per schedule.** A checkbox next to the time
("commit the result for me, without asking") makes that one schedule run end to
end unattended. It is off unless ticked, ticked per schedule rather than
globally, and **refused in code for any command carrying `untrustedInput`** —
`check-inbox`, `check-notion`, `triage-email` always wait for a human. That
refusal is the considered line: the tool allowlist confines *where* an
injected prompt can write, and cannot make what it wrote true, so those are
exactly the results where "nobody looked at it" is the entire risk. Note what
auto-commit does *not* delegate: the agent still never commits. Alacrán diffs
the result itself and calls the same `commitCompanyCommandResultImpl` the
approve button calls, with the same realpath containment gate, the same
output-location gate and the same single-file-scoped commit. The only thing
removed is a person reading the diff first.

**The completion watcher, because the spawn is detached.** `runCompanyCommandImpl`
returns "Started" long before the agent finishes, so auto-commit needed
something to come back later: each tick sweeps *before* firing anything new,
and for any schedule whose last run is marked `pendingCommit`, checks that the
run lock has dropped, reads the diff, and commits. Sweeping first is what makes
a run that finished while the app was closed still get committed — firing
today's run first would retake the before-snapshot and bury last night's
result, the exact trap `run-company-command-impl.ts` already documents for
refusals. `pendingCommit` is also what separates "the ticker started this run"
from "the user did", so a diff you deliberately left unapproved is never swept
up by a schedule that happens to have auto-commit on.

**What actually had to be built was the *waiting*, not the running.** A run
record already survived its run; what didn't exist was any way to find one
again. `CompanyCommandRunner` only ever showed a result it had polled for
itself, so an overnight diff was invisible until you clicked Run again — which
takes a fresh `before` snapshot and destroys it, the exact failure the comment
in `run-company-command-impl.ts` already warned about for refusals. Three
changes make an unattended result reviewable: the runner loads an existing
changed result on mount, `listPendingReviews` finds every unapproved result
across every company, and the Skills tree plus the sidebar carry a dot.

**The bug that had to be fixed for "pending" to mean anything:** committing a
result left its `.run.json` behind, so a committed run still looked changed
forever. `commitCompanyCommandResultImpl` now deletes the record after a
successful commit — best-effort, since a commit that really happened must not
be reported as failed over a bookkeeping file. Known and marked: for a command
that wrote several new files, this clears the review for all of them; the
extras are still named in the UI and still uncommitted in the repo.

**Design decisions worth not re-deriving:**

- **The timer lives in `instrumentation.ts`**, not in a page or a client
  effect. Next's `register()` runs once per server process, and that process
  is the only thing in this app that outlives a browser tab — which is what
  makes "closed the tab, went to bed" work and "quit the app" honestly not.
- **The trap in that file, which `next build` will not catch for you:** Next
  compiles `instrumentation.ts` for the **edge** runtime as well, so the
  Node-only import has to sit *inside* a positive
  `if (process.env.NEXT_RUNTIME === "nodejs")` block, where the edge build's
  substituted `"edge"` makes it dead code webpack drops. The early-return
  shape (`if (... !== "nodejs") return`, import after it) leaves the import
  outside the dead branch: `next dev` fails to build `/instrumentation` and
  **every page 500s**, while `next build` passes clean because minification
  removes the unreachable code before webpack ever complains. Shipped
  wrong first, found only by curling a real dev server — `tsc`, `vitest`,
  `eslint` and `next build` were all green over the broken version.
- **No cron parser, no dependency.** A `"HH:MM"` string compared against
  `localStamp(now)`, polled every 60 seconds. Zero-padded fixed-width strings
  make clock comparison a string comparison, so no date arithmetic happens
  anywhere in the file — and therefore no DST arithmetic either. `07:00` means
  the user's 07:00 on both sides of a clock change.
- **Two files, one writer each.** `schedules.json` is written only by the
  browser, `schedules-last-run.json` only by the ticker. That removes the race
  a shared file would have needed a lock for, which is less code, not more.
- **`skipDate` exists because of one specific wrong behaviour:** saving "07:00"
  at 15:00 would otherwise be due the instant you clicked Save. It records the
  day a schedule was saved *only* when its time had already passed, so a
  schedule saved at 15:00 for 23:00 still runs that same night.
- **The stamp is written whether or not the run started.** Stamping only
  successes turns a permanent refusal — wrong executor, unknown company — into
  a retry every minute until midnight. The refusal message is kept alongside
  the date and shown in the UI, so a schedule that can't run says so instead of
  disappearing.
- **The control is behind Advanced mode**, per the standing rule that a new
  user-facing feature opts in rather than out. The *pending-review* surfaces
  are not gated: they also fix a plain manual run, whose diff previously
  vanished the moment you navigated away.
- **A refusal writes nothing.** `setScheduleImpl` validates after filtering the
  old entry out of its in-memory copy but before writing, so trying to tick
  auto-commit on `check-inbox` leaves any schedule already saved for it exactly
  as it was, rather than clearing it on the way to saying no.

**Verified against a real server, without spawning an agent, and without
committing anything.** The standing
rule forbids triggering a real headless run unattended, so the live probe
pointed `ALACRAN_DATA_DIR` at a throwaway directory and scheduled a company
that doesn't exist: `next dev` started, the tick fired within 4 seconds, and
`schedules-last-run.json` came back stamped `Unknown company
"not-a-real-company"` — which is returned before the `mkdir`, before the lock
and before any spawn, so the whole path was exercised end to end with no API
call. The auto-commit sweep was probed the same way: a pre-seeded
`pendingCommit` record against the same non-existent company made the sweep run
on a real server, clear the flag and commit nothing. 759 tests (17 new), `tsc`,
`eslint` and `next build` all clean.

## v83 (2026-08-18): the packaging break that silently half-built every new company

**Creating a company was broken in v0.19.0-v0.22.0 and reported success.** A new
company got its pack overlay (skills, pack commands, a git repo) and none of the
base skeleton — no `CLAUDE.md`, `README.md`, `.gitignore`, `.claude/commands`,
`.claude/settings.json`, `scripts/verify.py`, and no
`docs/templates/ontology-starter.yaml`, which `save-company-ontology-impl.ts`
hard-depends on. Found by a repo-wide audit, not by a user.

**Cause, in one line:** v77 added a literal
`path.join(process.cwd(), "templates", "packs")` to `app/page.tsx`, Next's file
tracing resolves that and copies `templates/packs` into `.next/standalone`, so
`$PAYLOAD/templates` already existed when both packaging scripts ran
`cp -R templates "$PAYLOAD/templates"` — and `cp -R src dst` NESTS when dst
exists. The real tree landed at `templates/templates/`, hiding
`templates/company-starter` from the path the app reads. v0.18.0 is the last
good build; the comment claiming "standalone doesn't include these" had been
false since v77.

**Why it was silent, which is the more important half:** `copyManifestEntry`
skips a manifest entry whose source is missing. That is right per-file (the
manifest lists optional paths) and catastrophic for the whole directory — every
entry was missing, so the loop copied nothing and reported success.
`createCompanyFromTemplateImpl` now refuses up front when the template root
itself is absent, with a message naming the path. A test pins it.

**Three changes, in the order they matter:**

1. `cp -R templates/. "$PAYLOAD/templates/"` in both scripts — copying the
   CONTENTS merges whether or not tracing already made the directory.
2. Both scripts now assert `$PAYLOAD/templates/company-starter` exists and
   `$PAYLOAD/templates/templates` does not, and fail the build otherwise. Note
   the guard is written as `if ... fi`, not `[ -d x ] && { exit 1; }`: under
   `set -euo pipefail` the `&&` form aborts the build on the HAPPY path, since
   the compound returns non-zero when the directory is correctly absent.
3. The app-side refusal above, so a future packaging slip is loud rather than
   silently shipping empty companies.

Also folded in two cuts from the same audit, both on code this project added
itself: `StatusDot` lost the prop it stopped reading when v78 narrowed
`ActivityStatus` to `"done"` (3 call sites), and `ResolveWritableSkillResult`
now extends `ResolveKnownSkillResult` instead of restating it.

**Audit-integrity note worth keeping:** `grep` in this project's shell is a
wrapper around `ugrep --ignore-files` and silently skips `*.test.ts`. Every
"unused export" verdict produced with it — including v78's — was blind to
test-only usage, which is how `GOOGLE_SETUP_SERVICES` got called dead when its
own test asserts on it twice. Use `/usr/bin/grep` for any dead-code claim here.

742 tests, `tsc`, `eslint` and `next build` clean.

## v82 (2026-08-18): a customer-support skill, vendored from the licensed original

The Customer support pack now ships the `customer-support` skill — conversational
AI, ticket automation, sentiment analysis, omnichannel CX.

**The requested source could not be used, and the content still could.** The link
given was `eduard22222222/claude-skill-stack`, an aggregator of ~5,700 scraped
skills with **no license at all** — no root LICENSE, none in that skill's folder
(only ~25 unrelated folders carry one), and nothing in the README. No licence
means all rights reserved, and this repo is public MIT that also redistributes
its templates inside every `.dmg`/`.zip`/`.deb`; vendoring it is the exact
mistake v37 and v67 exist to undo. That copy also had no tag or release to pin
to, its own frontmatter says `source: community` and `risk: unknown`, and it
points at a `resources/implementation-playbook.md` that does not exist in the
repo.

A GitHub code search for its first line found 599 copies and one origin:
**`wshobson/agents`** (MIT, 38.8k stars), at
`plugins/customer-sales-automation/agents/customer-support.md`. That is what is
vendored — same content, real licence, real attribution, and the aggregator's
broken reference and invented frontmatter dropped along the way.

**Two mechanism changes, both small, both forced by that upstream:**

1. **Pins may now be a commit SHA, not just a tag.** `wshobson/agents` publishes
   no tags, so this pack pins `d6837ae…` and the archive URL switches from
   `archive/refs/tags/<tag>.tar.gz` to `archive/<sha>.tar.gz`. Nothing else
   cares — the staleness check only ever compares two strings for equality. The
   pack test's `v1.2.3` assertion was widened to accept either form, and the
   update dialog shortens a SHA to 7 characters so a non-technical reader is not
   shown 40 hex digits.
2. **A pack may point at loose `.md` files instead of `skills/<id>/SKILL.md`.**
   This upstream ships agent files, so the pack config gained `SRC` (path prefix
   inside the tarball) and `SRC_FILES`, which copies `<id>.md` to
   `<id>/SKILL.md`. The three existing packs keep the defaults and regenerate
   byte-identical — verified by resyncing all four and confirming only the new
   directory appeared, with `v2.10.0`, `v1.4.0` and `v0.4.16` untouched.

No app code changed beyond one `VENDORED_SKILL_PACKS` entry: the update button,
the read-only rule (v81) and the safety rules all applied to the new pack on
their own, and the tests picked it up through `describe.each` (738 → 741). A
real scaffold shows the skill, reads as already current, and comes back
app-managed. `tsc`, `eslint` and `next build` clean.

## v81 (2026-08-18): vendored skills are app-managed, so updates always land clean

Decision from the maintainer, reversing part of v77's shape: a skill the app
installs is **not editable in the app**. v77 protected the user by skipping
files it could not prove it owned; v81 removes the ambiguity at the source —
the app owns the vendored tree, replaces it wholesale on every update, and no
longer offers to accept an edit it would later destroy.

**The gate is on the write path, not the UI.** `resolveKnownSkillPath` is the
membership check every skill read and write already routes through, so the new
rule lives in a `resolveWritableSkillPath` wrapper beside it. Only one caller is
a writer (`saveSkillContentImpl`) — both `skill-history-impl` functions are
reads — so **reading the content and the history of an app-managed skill still
works**, which matters: users should be able to see what they have. A future
writer reaching for the more specific name gets the rule for free; a test pins
the read paths so they cannot be broken by tightening the write one.

**`isAppManagedSkillPath` reuses v77's ownership rule rather than inventing a
second one.** A file is app-managed when it sits under `.claude/skills/<name>/`,
the company carries a stamp, and the pack matched by its marker command ships a
skill of that `<name>`. The stamp requirement is what keeps this honest for
companies scaffolded before v76: they have no stamp, so nothing in their skills
directory is claimed, and a same-named file there stays theirs to edit — exactly
the population v77's skip logic exists for.

**The UI removes the affordance rather than failing after the fact**: the Skills
page computes the managed set server-side and `SkillBrowser` hides the Edit tab
for those entries, showing "Kept up to date by Alacrán… copy it to a new name if
you want your own version." Nobody types into a box whose save is going to be
rejected. Live-verified side by side in one company: `copywriting` (vendored)
showed Content + History and the notice, `my-own-skill` in the same directory
kept its Edit tab and no notice.

**v77's skip-on-collision logic stays.** The app is no longer a way to edit a
vendored skill, but Open in Terminal (v38) still gives full file access, so a
hand-written collision remains possible and must still never be overwritten.
738 tests, `tsc`, `next build` and `eslint` clean.

## v80 (2026-08-18): engineering skills, and the pack mechanism at three

The Software engineering pack now ships 10 vendored skills from
[Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) (MIT) at
tag `v0.4.16`, one per stage of that pack's own commands: `spec-miner`,
`architecture-designer`, `api-designer`, `feature-forge`, `test-master`,
`debugging-wizard`, `code-reviewer`, `security-reviewer`, `code-documenter`,
`devops-engineer`.

**The curation is the whole decision here.** Upstream's other ~57 skills are
language, framework and vendor specialists — `rust-engineer`,
`laravel-specialist`, `shopify-expert`, `wordpress-pro`. Each is useful to
exactly one company, so shipping them by default would put 50 irrelevant skills
in every engineering company; the vendored set is deliberately stack-agnostic
and maps onto `/plan-feature`, `/write-tests`, `/debug-issue`, `/code-review`
and `/prep-release`. A company that wants its own stack adds an id to the
script's list.

**What adding a third pack actually cost:** one case block in
`scripts/sync-vendored-skills.sh` and one entry in `VENDORED_SKILL_PACKS`. No
new code paths, no new tests written — v79's `describe.each` over the pack list
picked the new pack up on its own (24 → 28 assertions), including the
marker-uniqueness pin. `plan-feature.md` was checked against both the other
packs and the base template before being used as the marker: a name the base
skeleton ships would match every company on the machine.

**Marketing and HR tags did not move** (`v2.10.0`, `v1.4.0`), so no existing
company of either pack is told it is stale — the same discipline v79 established.

Verified end to end against a real scaffold into a disposable directory: 10
skills and 15 commands visible to the app's own scanner, and
`getVendoredSkillsUpdate` returns null for the fresh company, which is the check
that a newly created company is never offered an update it already has. 731
tests, `tsc`, `next build` and `eslint` clean.

## v79 (2026-08-17): HR skills, and one sync script for every pack

The HR & People pack now ships 12 vendored skills from
[tuanductran/hr-skills](https://github.com/tuanductran/hr-skills) (MIT) at tag
`v1.4.0`, covering the employee lifecycle a small company actually repeats:
`hr-recruiting`, `hr-job-description`, `hr-interviewing`, `hr-offer-management`,
`hr-onboarding`, `hr-offboarding`, `hr-performance-management`,
`hr-compensation-benefits`, `hr-employee-relations`, `hr-policy-management`,
`hr-compliance`, `hr-employee-engagement`.

**No new mechanism was needed, which was the point of v77.** Existing HR
companies — including any created before today — get the "Add ready-made
skills" button, the same stamp-based staleness check, the same refusal to
overwrite a skill the user wrote, and the same stamp-last write. Wiring HR up
was one entry in `VENDORED_SKILL_PACKS` and one case block in the sync script.

**`scripts/sync-marketing-skills.sh` became `scripts/sync-vendored-skills.sh`**,
a table of packs rather than a script per pack:
`bash scripts/sync-vendored-skills.sh` syncs everything,
`… sync-vendored-skills.sh hr-people` syncs one. A third pack is a case block
plus a list entry — the button, the staleness check and every safety rule are
already pack-agnostic. Two bash-3.2 traps fixed while writing it: `"${@:-$LIST}"`
collapses the default into a single word (use `[ $# -eq 0 ] && set -- $LIST`),
and a per-function `trap ... RETURN` was replaced by one `EXIT` trap over a
shared temp root.

**The rewrite deliberately did not move any marketing tag.** Regenerating that
pack changed only two lines of its `UPSTREAM.md` — the title and the script
name — leaving `Tag: v2.10.0` byte-identical, because the tag is what the update
check compares: touching it would have told every existing marketing company it
was stale and offered an update that changes nothing.

**Curated 12 of upstream's 147.** Upstream also ships 16 skills for maintaining
its own repo (biome, bun, turbo, typescript) under `.agents/skills/`; only
`skills/` is vendored, so that tooling never comes along. Unlike the marketing
set, these skills are self-contained — no shared context document to create
first — and every name is `hr-`-prefixed, which makes a collision with a skill
the user wrote far less likely than marketing's generic `social`/`emails`.

**Tests now run over every pack in `VENDORED_SKILL_PACKS`** rather than
marketing by name, so listing a pack is what earns it coverage. Two new
invariants are pinned: each pack really ships the marker command the update
check identifies it by, and **no two packs share a marker** — a shared one would
hand one pack's skills to another pack's companies. Verified end to end against
a real scaffold into a disposable directory: 12 skills and 14 commands visible
to the app's own scanner. 728 tests, `tsc`, `next build` and `eslint` clean.

## v78 (2026-08-17): a repo-wide cut for over-engineering

A whole-tree audit for complexity, applied. **Net -479 lines and one dependency**,
with no feature removed and no behaviour changed: 722 tests, `tsc`, `next build`
and — for the first time — `eslint` all clean, the last of those because this
slice also cleared 5 pre-existing warnings rather than walking past them.

**The big cuts, in order:**

- **-169 lines of dead CSS in `landing/styles.css`** (648 → 479), orphaned by
  the cinematic homepage rewrite: the `board-*`, `appcard`/`appgrid`/`appnav`,
  `hero-mockup*`, `halo` and `flow-line` families. Done in two passes, because
  the first was too timid — a rule was only cut when *every* class in its
  selector was dead, which left `.appcard .ln`-style rules behind. The sound
  rule is stronger: a descendant or compound part can only match if **every**
  class in it appears in the markup, so one dead ancestor kills the rule.
  Verified by rule-count-per-class against the baseline (`.card` 4 → 4,
  `.nav` 8 → 8, `.navlinks` 10 → 10) and then in a browser on two pages, where
  every probed computed style came back identical.
- **-88 `landing/pricing/index.html`** — no page linked to it, for a product
  with no paid tier.
- **-70 `scripts/jp-audit.py`** — the translation migration it checked finished
  in v67; only CLAUDE.md and CHANGELOG mention it, both as history.
- **-58 `components/ui/scroll-area.tsx`** — a Radix wrapper whose two consumers
  both wanted nothing but `h-[80vh]` plus padding. Now `overflow-y-auto`. This
  is the sanctioned kind of `components/ui/` edit: deleting an over-spec'd
  primitive nothing needs, not restyling one (v16/v29/v63 still stand).
- **-42 net from six byte-identical copies** of a 7-line `pathExists`/`exists`
  helper → one `lib/path-exists.ts`.
- **-26 the `needs-attention` branch** in the activity board, plus narrowing
  `ActivityStatus` to `"done"`: all four adapters hardcode it, and
  `getEffectiveAgents` maps every registered company to the generic git-log
  adapter, so no other value can reach the UI. **`StatusDot` was kept** — it has
  three consumers, and an earlier draft of this cut proposed deleting it after
  grepping for the string `"needs-attention"` rather than for the component.
- Smaller: `clsx` (its only consumer was `cn()`, and no caller uses its object
  syntax, so `twMerge` alone does it — one dependency gone), four dead exports
  in `lib/branding.ts`, `brandColor` and `BrandIcon`'s never-passed `title`,
  `NetworkAccessEntry = { label: string }` → `string[]`, and the `loadBuiltins`
  wrapper → a default parameter on `buildBuiltins`, which is what the house DI
  convention asks for anyway.

**Three findings were rejected, and why matters more than the cuts:**

1. **`checkDependencies` is not duplicated work.** The claim was that
   `ConnectStatus` already knows whether `claude` and `gog` are installed. It
   does not: `ToolStatus` has no `installed` field, and `googleStatus` computes
   gog presence internally and throws it away. Removing those ~70 lines would
   have meant *adding* a field to a documented type, on the Google onboarding
   gate.
2. **The nine `AgentCard` `show*` props stay.** Collapsing them to
   `isCommandSet`/`hasOntology` saves 24 lines and deletes v66's actual safety
   property: a new company feature is off for an `external` folder by default
   instead of needing to be excluded one at a time.
3. **The `"use server"` + `-impl.ts` pairing stays.** It looks like 32 files of
   delegation; **32 of 32 impls have their own test file**, and the injectable
   seam is why.

**Two process notes worth keeping.** A verifier agent left a stray
`lib/zz-collision-probe.test.ts` in the repo during v77's review — it was
counted in that slice's "723 tests" (really 722, corrected above), so **check
`git status` for agent leftovers before trusting a test count**. And the audit's
own line estimates ran high: 125 claimed for the CSS, 169 actually delivered
after a second pass, but 70 claimed for `checkDependencies` and 0 delivered.

## v77 (2026-08-17): template updates reach companies that already exist

v76 shipped ten vendored skills and closed with the honest limitation that the
template only runs at scaffold time, so every company created before it got
nothing. With real users already on the marketing pack, that limitation was the
feature. An "Update skills" button now appears on a company's card when the app
ships newer vendored skills than that company has, and applies them in place.

**The design decision that made this a slice instead of a project:** sync only
what the app owns. Vendored skills are stamped (`UPSTREAM.md`, `Tag: vX.Y.Z`),
marked do-not-hand-edit, and replaced wholesale — so updating is a *copy*, and
no merge policy has to exist. Everything a user actually edits — their
ontology, notes, `HANDOFF.md`, skills they wrote themselves — is never touched
by any of this. **Standing rule for every future template change:** content you
want existing users to receive ships inside a stamped, app-owned folder;
content meant to be edited never syncs. Changing a file a user may have
customized (`CLAUDE.md`, a command) is a different feature — diff-and-approve —
and must not be smuggled into this one.

**Detection has to work for companies that predate the skills**, which is the
entire point, and those have no `UPSTREAM.md` to compare. Nothing in a company
records which pack it came from, so `lib/vendored-skills.ts` matches it by a
command file only that pack ships (`draft-campaign.md` for marketing) and then
compares tags, treating "no stamp" as "behind". The button reads
"Add ready-made skills" in that case and "Update skills" otherwise. Three small
file reads per company and no subprocess, which is what makes it safe on a
`force-dynamic` page (v70).

**It replaces the vendored entries one by one and never the skills directory
itself** — the user's own skills live in there, and so does `daily-team-log`
(v20). The consequence, deliberate: a skill upstream has dropped stays in the
company rather than being deleted, because this code cannot tell an abandoned
vendored skill from one the user has come to depend on.

**Two defects an adversarial review caught before this shipped**, both of which
the first round of tests passed straight through:

1. **A same-named hand-written skill was silently `rm -rf`'d.** The loop
   replaced every bundled entry name without asking whether what was on disk had
   come from this app — and for the exact population this feature exists for
   (unstamped companies), *nothing* in `.claude/skills` did. The bundled names
   are precisely what a marketing company's user calls their own work:
   `copywriting`, `social`, `emails`, `cro`. The first test suite only used a
   non-colliding `my-own-skill`, so it was green. Now: an entry that already
   exists is only replaced when the company has a stamp proving this app put the
   set there; otherwise it is skipped and named back to the user in the card
   ("Kept your own social — nothing was overwritten"). **And a run with any skip
   writes no stamp at all** — stamping a partial install would both hide the
   button while the company lacks skills and mark the skipped name app-owned,
   so the *next* update would delete the user's work.
2. **The stamp was written first, stranding a half-updated company.**
   `readdir` returns `UPSTREAM.md` before any skill (measured on the real pack),
   so a throw partway through left the company claiming the new tag with old
   skill bodies — and since the button compares nothing but the tag, it
   vanished, with no way to retry until upstream cut another tag. The stamp now
   goes last, which makes a failed run simply retryable.

**The rule both share:** the stamp is a claim about what is installed, so it may
only be written when that claim is completely true. Write it early, or write it
over a partial result, and the app lies to itself on the next run.

`commitFile` now accepts `string | string[]` (existing callers unaffected), so
the commit is pathspec-scoped to exactly the entries written — a skill the user
is midway through writing in the same directory can never be swept in. A failed
commit does **not** fail the update: the files are already correct on disk and
`.claude/` is gitignored in some real repos, the same call v61 made.

**Live-verified against three disposable companies** on a throwaway port, not
just unit tests: one with no stamp (got all ten skills, `my-own-skill`
untouched, one commit of 45 files, clean tree), one stamped `v2.9.0` with a stub
`copywriting` skill (replaced with the real one, tag bumped), and — after the
review — one with a hand-written `social` skill (kept verbatim, nine skills
added around it, no stamp written, `social` absent from the commit, and the card
saying which skill it kept). The first two buttons disappeared on refresh once
the tags matched; the third's stayed, correctly. **Checked before clicking
anything:** no repo under `~/AI-Native/` has the marker command, so the button
cannot appear on a real company's card — which is the v66 trap (a page-wide
selector reaching a live control that writes to a real repo) closed by
construction rather than by careful aim. `plh-triage` was confirmed untouched
afterward. 722 tests, `tsc` and `next build` clean.

**Known limitations, disclosed not fixed:** only the marketing pack vendors
skills today (add an entry to `VENDORED_SKILL_PACKS` when a second one does);
a user who hand-edited a vendored skill loses that edit, which `UPSTREAM.md`
warns against and their own git history recovers; and a company still has to be
`command-set` — an `external` folder is refused, per v66.

## v76 (2026-08-17): real marketing skills in the marketing starter pack

The marketing pack shipped three commands and an ontology; a new marketing
company had no actual marketing expertise in it. It now also ships ten skills
vendored from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)
(MIT) at tag `v2.10.0`: `product-marketing`, `marketing-plan`, `copywriting`,
`content-strategy`, `seo-audit`, `analytics`, `emails`, `social`, `launch`,
`cro`.

**No application code changed.** A pack overlay is copied with a recursive
`cp` (not through `TEMPLATE_MANIFEST`'s allowlist), and
`genericCommandSetSkillAdapter` has scanned `<company>/.claude/skills/*/SKILL.md`
since v11 — so the whole feature is files in `templates/packs/marketing/`. The
edits outside that tree are a test, the pack's own description (which would
otherwise undercount what a user gets), and the "what a pack ships" comment at
the top of `lib/company-starter-packs.ts`.

**Updating is one pinned script, not a submodule:**
`scripts/sync-marketing-skills.sh` holds `TAG` and the curated id list, fetches
that tag's tarball, and wipes-and-rewrites the vendored tree — so a skill
renamed or dropped upstream disappears here too, and the diff is reviewed like
any other commit. Nothing fetches at runtime or at install time; a scaffolded
company gets exactly what was committed. The script fails loudly if a curated
id has no `SKILL.md` at the pinned tag, which is what an upstream rename looks
like (upstream renamed 17 skills in its own v1→v2).

**Curated at ten of upstream's 49**, because a pack is an overlay on the base
skeleton, not a second tree — the pack went 16K → 580K as it is. Upstream's
`evals/` fixtures are stripped: they test upstream's skills, and shipping them
into a user's repo is dead weight. `product-marketing` is load-bearing rather
than merely first — it writes `.agents/product-marketing.md`, the context file
every other skill reads, which is why the pack description now says to start
with it. **Deliberately not wired to `definitions/ontology/company.yaml`**,
which holds overlapping information: the skill's own job is to create that
file, by interviewing the user or drafting from the repo, so a translation
layer would be code standing between two things that already work.

**Known limitation, disclosed not fixed:** the template runs at scaffold time
only, so companies created before this slice get nothing. Re-syncing an
existing company is a separate feature and isn't built.

Verified against a real scaffold into a disposable `/tmp` directory (the
sanctioned target), not just the vendored tree on disk: the app's own skill
scanner reported all ten skills plus the pack's 13 commands, confirming
`UPSTREAM.md` (provenance + upstream's MIT license, alongside the skills) is
correctly not mistaken for a skill. Full suite 702 tests, `tsc` clean.

## v75 (2026-08-16): four review findings in v0.17.0's own Google flow

A review pass over v74 found four real defects, all shipped in the published
v0.17.0. They share one shape — the safety argument v74 was built on
("re-authorizing with a narrower `--services` list revokes scopes, so always
send the union") holds only when the app actually knows what an account
carries, and four separate paths could reach the picker without knowing.

**The `gog auth status` fallback claimed connected without saying what was
granted.** That branch runs when `gog auth list -j` fails but `auth status`
still names an account — so scopes are genuinely unknowable there. It returned
`accounts: [email]` and no `accountServices`, and `ConnectGoogleApps` read the
missing entry as "new address": it offered `gog auth add` with only the
defaults, which is precisely the narrowing this feature exists to prevent, and
pointed the agent at the full first-time console walkthrough on a machine that
already has an OAuth client. Fixed by making the absence *mean* unknown rather
than none — the field is deliberately left out, not set to `{}` or `{[email]:
[]}`, and the card now refuses to build any command for a stored address whose
grants it can't read, saying so and pointing at Re-check.

**The account read bypassed the v70 memo — in the fix whose own subject was
Keychain popups.** `listGoogleAccounts(execFn)` passed this module's raw
execFile, while the memo lives on `listGoogleAccounts`' own default parameter,
so every "Set up Google for me" click added an unmemoized keyring read: a macOS
Keychain prompt, the exact thing v70 exists to suppress, and the exact
complaint that prompted the session. It could not be fixed by memoizing the
shared `defaultExecFile` either — `openChromeAccountCheckImpl` uses the same
one, and memoizing *that* turns a second "Open Chrome and check" click into a
silent no-op. So the account read got its own DI seam defaulting to the
memoized reader. **A test now pins it**: execFn must never see a `gog` call.

**`serviceListArg` substitutes the defaults for an empty list**, so an account
whose scopes map to no catalog service compared equal to `"gmail,calendar"` on
both sides of the "nothing new" check — the card told someone with nothing
connected that everything was already on, and hid both the command and the
button. `nothingNew` is now a set comparison on ids, never on the formatted
string. The picker's initial state had the same shape of bug: `?? DEFAULT`
doesn't fire for `[]`, so it started empty.

**The client matched addresses case-sensitively while the server used
`.toLowerCase()`.** A case-different rendering of a stored address lost its
grants client-side — first-time copy on screen, expand job on the server, and a
manual command narrower than the account's real scopes. One `grantsFor` helper
now does the lookup case-insensitively, and the account chips highlight the
same way.

**Two test-hygiene faults surfaced while fixing this, both worse than the bugs.**
Giving the account read a real default made an existing test read the *developer's
own* gog store: it passed on CI and failed on this machine, and raised a Keychain
prompt to do it. Every `setupGoogleImpl` test now injects an explicit reader, with
a named `noAccounts` helper and a comment saying why the production default must
never be exercised in a test.

Also here, from the same session: the install-repair agent is bounded with
`--max-budget-usd` (verified real on the installed CLI; `--max-turns` does not
exist), after a report of a gogcli repair grinding for about an hour. Safe to
cut mid-run because success is re-probed from the OS and never read out of the
transcript. And `KeychainNote` — the `gog auth keyring file` escape hatch — now
renders at *every* not-connected Google stage including `install`, instead of
only on cards a user reaches after connecting. The popup storm starts the moment
gog lands on the machine, so it was hidden from the only person who needs it.

**Still open, not fixed here:** a spend cap is not a wall-clock cap, and
`defaultExecFile` already sets a 15-minute `timeout`, so a one-hour run should
not have been possible at all. The likely cause is `promisify(execFile)` never
settling because a grandchild holds the stdio pipes open past SIGTERM — which
no cost ceiling touches, since a stalled run burns no tokens. Needs its own
slice.

## v74 (2026-08-16): let an already-connected Google account add the rest of the apps

User-reported, and a direct consequence of v72: someone who connected Google
*before* the service picker existed has gmail and calendar authorized and no
way to reach Drive, Docs or Sheets. v72 built the picker into the paths that
run **when Google is not connected yet** — the `client` and `account` stages
and `gog auth add` for a *new* email. The connected card showed the marks it
had and offered exactly one action: "Connect another email." Wrong door.
Nothing on screen could widen an existing token, and redoing the whole
console setup is not something this audience will do twice.

**The connected card now has the same door the unconnected one does.**
`ConnectGoogleApps` replaces `AddGoogleAccount` and serves both jobs, because
`gog auth add <email> --services …` is *literally the same command* for both:
on a stored account it re-authorizes with a wider list, on a new address it is
the first authorization. Stored accounts appear as chips you click to fill the
address; the picker preselects what that address really carries, and the
agent button sits above the command as the one-click route.

**The shorter agent job is derived from the machine, not passed in from the
client.** `setupGoogleImpl` calls `listGoogleAccounts` (already memoized per
v70, so usually free) and asks: does this exact address have a stored token,
and what scopes does it carry. Non-empty → `buildGoogleExpandPrompt`, which
drops the project/consent-screen/client/publish steps entirely (they are
one-time and already done), lists an Enable page **only** for the services
being added, and finishes on `gog auth add`. First-time setup is unchanged,
byte for byte, and every existing test passes untouched.

**The one real hazard, guarded in three places.** gog stores what
`--services` asks for, so re-authorizing with a narrower list is how you would
silently drop Gmail from an account that had it. So: the command is built from
the **union** of granted and newly-ticked, the prompt spells out that the list
is deliberately everything the account should end up with (an agent "helpfully"
trimming it to the new services is the failure mode), and already-granted
checkboxes render checked **and disabled** — nothing here can revoke a scope,
so offering to untick one is offering a mistake.

**A flaw in the first version of this change, caught by reading the real
rendered card rather than the diff:** `grantedServices` is a union *across*
accounts, which is right for the "available to your companies" marks and wrong
for a picker that authorizes one address — a second account would show the
first account's apps as already-on and unselectable, blocking the exact thing
this slice exists to unblock. `ToolStatus.accountServices` now carries the
per-account map alongside the union, and switching accounts resets the
selection to that account's real grants. Verified against this machine's two
stored accounts.

**Also: the Google card is titled "Google", not "Google (Gmail & Calendar)".**
Those are only the *defaults*. The card shows a mark per service the token
really carries, so on a machine with seven of them the title contradicted the
card directly underneath it.

One wart removed in passing: the `client` stage rendered an address field
inside `GoogleAutoSetup` *and* another at the bottom for the manual command,
so the same address had to be typed twice. `GoogleAutoSetup` is now controlled
by whichever card owns it.

## v73 (2026-08-14): the Skills page as a file explorer, and a dead palette repaired

Reported as "messy". Two causes, and the second one was not a layout problem
at all.

**Layout.** The page was a grid of description cards, one per skill. A company
with 17 of them was several screens of prose with no hierarchy and nothing to
scan by, and opening a file used a Sheet that covered the very list you were
browsing. It is now a two-pane explorer: companies and their files on the
left, the selected file on the right. Kinds (Skills / Commands) are
sub-groups, companies collapse, and a search box filters across names and
descriptions — a company with no match disappears entirely rather than leaving
an empty folder behind. Descriptions moved off the tree to sit beside the
content, where they are actually read. The detail pane is inline rather than a
Sheet, so reading one file no longer hides the rest.

Everything functional is reused unchanged — `SkillEditor`, `SkillHistory`,
`CompanyCommandRunner`, and the Content/Edit/History/Run tabs (v49). Only the
shell around them changed.

**The palette.** The page was painted with five design tokens that stopped
existing when the palette changed: `bg-shell`, `bg-shell-2`, `border-line`,
`text-bone`, `text-dune`. None of them resolve, so those classes produced
nothing — transparent panels, and a bare `border` falling back to
`currentColor`, which is why the company header rendered with a text-coloured
outline. That is why the page read as broken rather than merely dense.

**The finding to reuse:** grepping for the dead *tokens* rather than fixing the
page that was reported surfaced the same palette in `activity-board.tsx` and
`activity-day-group.tsx`. Fixing only Skills would have left Activity live with
the identical defect — the same shape as v68, where a symbol grep found a
second call site the report never mentioned. `glass-edge` is a real token (13
definitions in `globals.css`) and was left alone.

Below `md` the panes stack, and selecting a file scrolls the detail pane into
view: otherwise the file just tapped opens off-screen under a tree that can be
17 rows long. Desktop is unaffected — `scrollIntoView` on an already-visible
element is a no-op.

Verified by screenshot at 1440px and 420px and by opening a real skill.

## v72 (2026-08-14): pick which Google apps to connect, and stop hiding what's in use

Two things, both from real use of v0.14.0 within hours of it shipping.

**Multiple Google services, chosen by the user.** `gogcli` can authorize
gmail, calendar, drive, docs, sheets, slides, tasks, contacts and more, but
this app hardcoded `"gmail,calendar"` in two string constants and the marks
shown on the card in a third array — adding a service meant editing three
places, and nothing noticed when they drifted.

`lib/google-services.ts` is now the only place a service is declared, with
three readers: the checkbox picker on the Connect card, the `gog auth add
--services …` command it builds, and the Cloud Console pages the browser
agent clicks Enable on. That last one is not cosmetic — **consent fails for a
service whose API was never enabled**, so the agent's checklist has to be the
same list the user picked. `buildGoogleSetupPrompt` now generates one Enable
step per chosen service instead of the fixed Gmail/Calendar pair, keeping the
non-API steps (project, consent screen, client, publish) unchanged.

**The marks are derived, not declared.** v64's rule was "keep the marks in
sync with the scopes or the card lies." Two lists kept in sync eventually
drift, so the card now renders whatever `gog auth list -j` really reports the
stored accounts carry. Adding a service to the catalog needs no second edit,
and the card cannot claim a service the token was never granted. Scope names
are not service ids — measured on a real store rather than assumed: Docs is
granted as `.../auth/documents` and Sheets as `.../auth/spreadsheets`, so
matching on the id would have silently under-reported both. Live-verified
against two real accounts (one carrying seven services the app had never
surfaced, one carrying the narrow pair).

Defaults stay Gmail + Calendar, for v64's original reason: each extra service
is one more Enable page before consent succeeds. Extra reach is opt-in, not
the price of connecting. Services with no real product mark in Simple Icons
(Drive, Docs, Sheets…) are named in text rather than given an invented logo.

**Simple mode must never hide something already in use.** Reported directly
after updating: MCP connectors, Antigravity, Aider and Notion "disappeared."
They were hidden, not removed — v71's advanced mode is off by default — but
the default was wrong in one specific way. Hiding a thing you have not started
using is help. Hiding a thing you already depend on is concealment, and worse,
it removes the only control that could change it back: a company assigned to
Aider had no visible Aider card, and no way to see or fix that without finding
a Settings toggle nobody had mentioned.

The rule is now **hidden until real, then always shown**: an AI executor card
appears once a company is actually assigned to it (new `ToolStatus.inUse`),
the Notion card appears once any company really has Notion configured, and a
company's MCP button appears once that company has servers configured. Open in
Terminal and the Network tab stay purely advanced — neither is state a user can
be mid-way through relying on.

## v71 (2026-08-14): the non-technical path — the app covers the technical part

The audience changed, and with it the shape of the product. This app is for
the maintainer's AI-native bootcamp members, who are **not technically
comfortable** — so "read/manage dashboard for tools you already set up via the
terminal" (the framing this file's own header carried since v1) is the wrong
shape. v71 starts leaving it: the app now installs and drives the tools
itself.

Walking a clean machine through the old flow found five gates before the first
win, each of which silently drops people: install Node by hand or the launcher
quits; install Claude Code by hand and then "fully quit and reopen the app";
sign in via a terminal; six Google Cloud Console pages plus a downloaded JSON
for anything email-shaped; and type an absolute filesystem path to create a
company. Then the two buttons that answer "what now?" — Open in Terminal (v38)
and Get Started (v46) — put the user in a terminal, which is the one place
this audience cannot operate.

**Node is bundled** (`scripts/package-macos.sh`). Pinned v24.19.0, downloaded
per-arch at package time and verified against nodejs.org's published
SHASUMS256 before it enters the bundle — this binary is executed by every user
of the shipped app. The launcher prefers `Contents/Resources/node`
unconditionally; the user's own node is a fallback for a damaged bundle, not a
preference. Verified rather than assumed: with `PATH=/usr/bin:/bin` and no
system node reachable, the bundled runtime serves `/` with HTTP 200. The
checksum earned itself immediately — a curl that timed out mid-transfer left a
truncated tarball the cache check happily accepted, and only the checksum
caught it. Downloads now land on a `.part` name and move on success.

**Tools install from a button** (`lib/install-tool-impl.ts`). At most ONE
verified command per tool, then the tool is read back from the OS — a package
manager that exits non-zero after a successful install, or zero without
putting a binary on PATH, are both real shapes (v31 established the rule for
`launchctl`). Claude Code via `https://claude.ai/install.sh` (verified: 302 →
`downloads.claude.ai/claude-code-releases/bootstrap.sh`, and it installs the
NATIVE build, so it needs no Node of its own); `gh` and `gogcli` via
Homebrew. **No command is invented for Antigravity** — its canonical installer
was never verified against the real thing, and v64's rule is that an
unverified third-party command must not go on screen as the step that
completes something.

**Claude Code is the repair fallback, not the installer.** Reached only from a
button, only after a failure the user just saw. `brew install gh` is one
deterministic line; an agent that runs a command we already know is slower,
costs tokens, and is non-deterministic — which for this audience means an
unreproducible support ticket. The agent earns its place on the failure
branch, which is un-scriptable by definition (no Homebrew, unexpected arch,
distro variance, a proxy) and is exactly where a non-technical user is stuck
today. It reuses Claude Code's own `buildArgs`, so it gets `--allowedTools`
with a fixed Bash allowlist and `--permission-mode manual`, never
`--dangerously-skip-permissions`. `sudo` is absent from the allowlist AND
forbidden in the prompt: an install needing root is the one place human aid is
correct, since a password prompt in a headless spawn is answered by nobody.
Claude Code is the only executor it can run on, because per v56 it is the only
one that honours a tool scope — with a tripwire that refuses if
`enforcesToolScope` ever flips. Success is re-probed from the machine, never
read from the transcript; a test has the agent report "All done!" having
installed nothing, and the result is still `ok: false`.

**Real signed-in state** (`lib/claude-auth-status.ts`). `aiExecutorStatus`
claimed login state "can't be detected without spawning the CLI" and told
users to run a company command to find out. Simply wrong: `claude auth status`
prints JSON with `loggedIn`/`email`/`subscriptionType`. Installed-but-signed-out
is now its own state, because Install and Sign in are different buttons.

**Google's six console pages are driven by a browser agent** (`0.6`). v64
concluded that wall was permanent; that conclusion was about the API, not
about automation, and this slice corrects the over-read. There is still no API
for creating a Google OAuth client. But `claude --chrome` drives the user's
own already-signed-in Chrome, and `gog auth setup` accepts `--credentials
<downloaded JSON> --services gmail,calendar --login` (v0.34.1, flags verified
against the real binary) — so the agent's deliverable is ONE artifact and
everything after it is deterministic. Bounding it to a single verifiable file
is what makes this robust rather than a hope. It is also the substitute for
the gcloud path v64 rejected on cost (~500MB SDK, second sign-in); that
rejection stands. `GOOGLE_CONSOLE_STEPS` moved out of the client component
into a plain module (v51: a server module importing a plain value from
`"use client"` silently gets `undefined`), so the user's checklist and the
agent's checklist are the same array and cannot drift. Visible Terminal, not
headless: the agent operates the user's real Google account, the console can
interrupt with a terms or billing interstitial nobody can enumerate in
advance, and the final `--login` opens a consent screen a human must approve.
The prompt makes the agent verify the browser's signed-in account BEFORE
clicking anything — setting this up on the wrong account silently connects the
wrong mailbox and nothing downstream would notice.

**Chrome's prerequisites, split by what is actually knowable.** Presence is
checkable and is checked before any spawn (`open -Ra "Google Chrome"` resolves
the bundle without launching it — exit 0 present, 1 absent, measured). WHICH
account Chrome is signed in as is not: there is no API, and reading Chrome's
profile would be fragile and a bigger intrusion than the feature is worth. So
it gets an explicit confirmation plus a button that opens the account page in
CHROME specifically — a user whose default browser is Safari would otherwise
verify the wrong browser and confirm something untrue.

**Advanced mode, off by default.** One `localStorage` boolean hides every
surface that assumes terminal literacy: the Network map, MCP connectors, Open
in Terminal, the three non-default AI executors, Notion, and the company path
field. The default direction is the point — v66's discipline applied to
audience instead of agent kind: a new feature is hidden from simple mode
unless it opts in, rather than needing to be excluded one at a time. Two
departures from the original spec, both because 0.6 now exists: Google stays
in simple mode (the spec hid it on the grounds the console step couldn't be
automated), and GitHub stays because `gh auth login` is a browser flow. Open
in Terminal stays visible for `external` folders regardless — it is their only
action (v66), and gating it would leave those cards with no buttons at all.

**Get Started produces a diff instead of a terminal.** Its entire job is
answering "I set this up, now what?", and it answered by opening a terminal.
Simple mode now runs a new `orientation` registry command through the
machinery every other command already uses: agent writes a note, user reads
the diff, user approves. One registry entry and a Sheet around the existing
`CompanyCommandRunner` — no new run/diff/commit code. The prompt is
self-contained rather than delegating to a `.claude/commands/orientation.md`
the company may not have (`commandFileName` is declared but read nowhere), and
it is told to describe only what really exists and say so plainly when
something is missing — an orientation that invents capabilities is worse than
none. Advanced mode keeps v46's terminal session unchanged.

Onboarding now states that Claude Code needs a paid Claude account
(~$20/month). The app never said so, and a user who installs everything and
then hits a paywall blames the app.

**Investigated and rejected: Antigravity as a second browser driver.**
Antigravity is Google's own CLI, so it looked like it could drive Chrome for
0.6 when chosen as the executor. Verified against the real installed binary
(`agy` 1.1.13): no browser/chrome flag, no `mcp` subcommand to attach one
(v61's finding, still true), no plugins, and — asked directly — a tool list
containing no navigate, click, screenshot or DevTools tool. The changelog's
"built-in Chrome DevTools MCP server" is the Antigravity **IDE**, not the CLI;
that distinction is what makes this look possible from outside.
`read_url_content` is not a substitute, since the Cloud Console is an
authenticated SPA that must be clicked through. Two general points kept: a
vendor's own product gets no special access to that vendor's browser (browser
control is a tool the harness implements, not an entitlement), and `agy` is
`enforcesToolScope: false`, so even with the capability it would mean a fully
unscoped agent operating the user's Google account — the hole v56 exists to
close.

**Findings from the branch review, fixed before merge.** A fresh install had
no `DATA_DIR`, and both new terminal writers wrote a script into it without
`mkdir` — so Sign in and Set up Google failed with ENOENT on precisely the
path this slice exists to make work. v38's `open-interactive-terminal-impl`
had the same latent bug and was fixed with them: one root cause, three
writers. External folders could not be registered in simple mode, because the
"existing project" checkbox stayed visible while the path field went
advanced-only — that field now appears whenever the box is ticked, since an
existing folder's location is the one value that cannot be defaulted. And
installer output — written by a package manager or download server, not by us,
arriving through a public Server Action with no size limit — was spliced
verbatim into a prompt whose Bash allowlist includes `curl *` and `npm install
-g *`; it is now capped and wrapped in the same nonced fence from
`prefetch/untrusted-fence.ts` the triage commands use. Both install actions
also indexed a typed `Record` with a client-supplied id and now fail closed.

**Not verified, and deliberately left to the user:** the browser agent's real
run (it creates a Google Cloud project and spends real tokens), the repair
agent's real run (needs a machine without Homebrew), and the `orientation`
command's first spawn. All three are the category CLAUDE.md's standing rule
keeps out of unattended passes. The load-bearing unverified assumption is that
`claude --chrome "<prompt>"` engages the Chrome integration in an interactive
session — the flag exists on the real CLI; that combination has not been run.

## v70 (2026-08-13): stop re-asking macOS for the Keychain on every page render

Fixes a user-reported bug: after connecting Google, a macOS popup saying *"gog
wants to use your confidential information stored in 'gogcli' in your
keychain"* kept coming back — notably on every press of Re-check.

**The prompt itself is not this app's bug, and can't be fixed here.** Homebrew
ships `gog` ad-hoc / linker-signed, so its code hash changes with every
release, and a macOS Keychain ACL binds to the writing process's Designated
Requirement — so the grant "Always Allow" creates stops matching as soon as gog
updates. That's [openclaw/gogcli#569](https://github.com/openclaw/gogcli/issues/569),
opened 2026-05-09 and closed without a fix.

**What this app *was* doing wrong is the frequency.** Every page is
`force-dynamic`, and the `gog auth *` probes that read gog's keyring were
re-run from scratch on every render of Agents (`listGoogleAccountEmails`),
Connect, Network and the Ownership sheet — plus OnboardingWelcome's
refresh-on-window-focus. Two separate bugs stacked on top of that:

1. `googleStatus` ran `gog auth status -j` **and then** `gog auth list -j`.
   Those read *different* Keychain items (`auth status` reports
   `client_secret_in_keyring`; `auth list` reads the token entries), so an
   already-connected user was being asked **twice** per render for an answer
   one call gives. `auth list` now runs first and returns on its own when it
   finds a stored account; `auth status` is only consulted when there is no
   account, which is exactly when its `credentials_exists` discriminator (v64)
   is the thing being asked for.
2. Nothing was cached at all. New `lib/exec-memo.ts` memoizes these read-only
   probes process-wide for 5 minutes, keyed on command + args. Failures are
   never cached — a dismissed Keychain prompt or a one-off `which` failure must
   not pin the answer. It is installed as the *default* `execFn` of
   `connect-status-impl.ts` and `google-accounts.ts`, so every caller is
   covered at once and every DI test (which injects its own `execFn`) is
   untouched.

`recheckConnectStatus()` clears the memo before reading — a separate Server
Action rather than a `force` parameter, per the zero-extra-parameter rule, same
shape as v51's `checkForUpdatesNow` beside the throttled banner check. Both the
Connect page's Re-check button and OnboardingWelcome's refresh-on-focus use it:
those are the two moments whose entire purpose is "the user just changed
something in their terminal," where a cached answer is the wrong answer.

**Measured, not asserted**, against a real production build with a logging
shim in front of the real `gog` on `PATH`, over the same 9 page loads
(`/`, `/network`, `/connect`, three rounds):

| | `gog` spawns |
|---|---|
| before | **15** (9 × `auth list`, 6 × `auth status`) |
| after | **3** (one per route, then cached) |

Five plain reloads of `/connect` afterwards spawned **0**; one Re-check click
spawned exactly **1**, confirming the button still really re-checks. The
Connect page also gained a collapsed explainer on the Google card saying what
the popup is, that `Always Allow` is the right button, that it can return when
the CLI updates, and offering `gog auth keyring file` for anyone who would
rather move the sign-in out of the Keychain entirely.

**Known, disclosed behaviour change, not fixed:** a machine with a stored token
but a deleted `credentials.json` used to land on the `client` stage and now
reads as connected — gog will fail to refresh, and that surfaces on first use.
Detecting it means the second Keychain prompt on every render for every
correctly-configured user, which is the bug this ordering exists to fix.

**Worth not re-deriving:** the memo is per-route, not per-process — Next.js
bundles the server module separately for each route, so `/`, `/network` and
`/connect` each hold their own cache. That's why the "after" number is 3 and
not 1. It's still bounded per route rather than per render, which is the whole
point; making it truly global would mean a shared store the framework doesn't
hand out for free, and buys two spawns.

**Also measured and worth keeping:** `gog auth list -j` returns the same
accounts, scopes and subject under a disposable `--home`, so gog's account list
lives in the Keychain, not on disk (there is no `config.json` until something
writes one). There is no file-backed way to answer "is Google connected"
without touching the keyring — which is why the fix is caching rather than
avoidance.
