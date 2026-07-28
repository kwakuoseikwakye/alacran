# AI-Native Control Panel — project guide

Local Next.js 15 / React 19 / Tailwind v4 dashboard for managing the tools
in `~/AI-Native/` (`plh-takeshi-agent`, `ai-company-starter-main`,
`plh-ops`), plus any number of additional "companies" registered at
runtime through the UI (see v11 in README.md). Built entirely via
`brainstorm → spec → plan → subagent-driven-development`, one versioned
slice at a time, each merged to `master` before the next starts.

For the full chronological changelog of every shipped slice (v1–v16), see
`README.md`. This file is the *standing* project context — conventions,
safety rules, and workflow — that every slice must follow. It doesn't
change per-slice; `README.md` and this repo's git history do.

> **Active epic:** as of 2026-07-28 the project is in a 4-day push to
> ship this as a downloadable product (login/download gate, payments,
> onboarding, desktop packaging, landing page). The cross-session tracker
> for that push is **`LAUNCH.md`** at the repo root — read its "Current
> position" block first when picking up launch work. `LAUNCH.md` is the
> living runbook; this file remains the standing engineering guide.

## What this app actually is (and isn't) today

This is a **read/manage dashboard for tools you already set up via the
terminal** — it is not yet a self-service "download and configure your
AI-Native instance through the UI" product. Concretely:

- The 3 built-in agents (`plh-takeshi-agent`, `ai-company-starter-main`,
  `plh-ops`) are hardcoded local paths in `lib/config.ts`.
- "Add a company" can now do two things (v17): **register** an
  already-existing local directory (has `.git` + `.claude`, v11's
  original flow, unchanged), or **create** one from scratch when the
  typed path doesn't exist yet — scaffolding a manifest of generic paths
  from `ai-company-starter-main`, `git init`-ing it, then registering it.
  See `docs/superpowers/specs/2026-07-27-control-panel-v17-create-company-design.md`.
- Still missing (named as roadmap, not built): a general plugin/workflow
  packaging format — see "Roadmap" below.

## Established conventions (binding for every slice)

- **`export const dynamic = "force-dynamic"`** on every page — this app
  reads live filesystem/git state, never statically cached.
- **Adapter-per-agent pattern**: `AGENTS` / `ADAPTERS` / `SKILL_ADAPTERS`
  in `lib/config.ts` for the 3 built-ins, generalized via
  `lib/get-effective-agents.ts` (v11) to merge in runtime-registered
  companies. `lib/config.test.ts` fails if `AGENTS`/`ADAPTERS` ever drift
  out of sync.
- **DI for OS calls**: every function that shells out or touches the
  filesystem takes an injectable `ExecFn`/`SpawnFn`/`ExecFileFn` (or, for
  wall-clock reads like v15's `groupActivitiesByDay`, an injectable
  `nowSeconds` parameter) with a real default — this is how the test
  suite avoids ever touching real processes or the real clock.
- **Zero-extra-parameter Server Actions**: public `"use server"`
  boundaries take only real domain parameters; injectable seams
  (`execFn`, `registryPath`, etc.) live only in the paired `-impl.ts`
  file, never on the public action.
- **Dual-gate write security**: `lib/path-guard.ts` (containment — every
  written/read path must resolve inside a known agent's root) and
  `lib/resolve-known-skill.ts` (membership — the path must correspond to
  an actual known skill/command file), used together on every write path.
- **Design tokens (v14)**: dark-only palette, CSS custom properties in
  `app/globals.css`'s `:root` + `@theme inline` block. Every
  `components/ui/*` primitive already consumes these via Tailwind
  utility classes — changing a token's *value* cascades everywhere with
  zero edits to the primitives themselves. **Never edit
  `components/ui/*`** to fix a styling issue; fix the token or the
  *consumer*'s className instead (see v16's Sheet-mobile-width fix for
  the pattern: primitive untouched, 3 consumers each got
  `className="w-full sm:max-w-xl"`).
- **Single-file-scoped git commits**: `lib/git-commit-file.ts` runs
  `git add -- <file> && git commit -m <msg> -- <file>` — never a bare
  `git commit` that could sweep up unrelated changes in a target repo.
- Non-printable `\x1e`/`\x1f` delimiters for git-log parsing (avoids
  collisions with real commit-message content).
- **Regression-proof extraction**: when refactoring shared logic out from
  under existing tests, already-shipped test files must keep passing
  unchanged, with at most one clearly-justified additive mock line for a
  genuinely new async dependency.
- **Any client component whose `useEffect` triggers a real, non-idempotent
  side effect on mount (spawning a subprocess, starting a paid API call)
  must guard against React's development Strict Mode double-invoking
  that effect** — a `useRef` guard (`if (startedRef.current) return;
  startedRef.current = true`) before the side-effecting call. v21's
  `DefineCompanyAiDraft` didn't have this at first and it triggered two
  real headless `claude -p` spawns from one click, caught during live
  verification. This matters for any future component that spawns a
  subprocess on mount, not just this one.
- **Never let an automated live test actually wait for or trigger the
  completion of a real headless `claude -p` spawn** — verify up through
  confirming the run reports "Started," then stop; the real end-to-end
  run is left for the user to trigger themselves. This is the same
  "ask when the risk shape is new" precedent as v9's autonomous-push
  decision, now with worked evidence: v21's live-test walkthrough
  accidentally triggered two real spawns (one from the double-invoke bug
  above, one from a Next.js Fast Refresh remount while iterating on the
  fix) — both were killed immediately, left no partial writes, and cost
  no completed API call, but this is exactly the kind of side effect
  that must not run unattended in this project's live-verification step.

## Standing safety rule — read before running any live/manual test

**The only sanctioned live-test targets in this entire project:**

1. `ai-company-starter-main`'s `.claude/commands/stock-note.md` — for
   real-content-kept edit/revert tests. Always leave it net-zero
   afterward (verify with `git diff` against the pre-test commit).
2. Freshly-created, self-destroyed disposable directories under `/tmp`
   — for company-registration / generic-adapter tests. Delete them when
   done.
3. Read-only actions against any real repo (`git status`, opening a
   detail view, running the existing "Run verify" button) are always
   fine — they don't write anything.

**Never write to, commit in, or otherwise mutate
`~/AI-Native/plh-takeshi-agent` or `~/AI-Native/plh-ops` directly, for
any test or verification purpose.** This rule exists because of a real
production-content-corruption incident early in this project's history.
If a new feature's live test would need to touch either of those two
repos specifically, stop and ask the user how to verify instead of
improvising a workaround.

## Workflow (how every slice gets built)

1. **Brainstorm** (`superpowers:brainstorming`) — explore real current
   state (read code, take real screenshots — never assume from memory),
   ask clarifying questions one at a time, propose 2-3 approaches,
   present the design in sections, write the spec to
   `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, self-review,
   commit.
2. **Plan** (`superpowers:writing-plans`) — turn the approved spec into a
   fully-coded, bite-sized task list at
   `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`, each task ending in an
   independently testable, committed deliverable. Every plan states its
   **Global Constraints** up front (what NOT to touch).
3. **Implement** (`superpowers:subagent-driven-development`, when
   available) — fresh subagent per task, task review after each, final
   whole-branch review before merge. **This session's subagent-spawn cap
   (200/session) has been hit repeatedly (v14, v16, v17, v18, v19, v20,
   v21, v22 — confirmed still blocking on a fresh dispatch attempt every
   time)** —
   when that happens, every task is instead implemented directly
   (read-before-edit, `tsc`/`vitest` after every step, one commit per
   task, self-reviewed whole-branch diff in place of a dispatched
   reviewer). A *new* session gets a fresh cap.
4. **Verify for real** — `npx tsc --noEmit`, `npx vitest run`, `npm run
   build`, then a live Playwright pass against a throwaway dev-server
   port (never 3000 if something's already using it) covering the
   actual golden path, not just type-checks.
5. **Finish** (`superpowers:finishing-a-development-branch`) — verify
   tests on the target branch, fast-forward merge to `master`, remove
   the worktree, delete the branch.
6. **Document** — append a dated `## vNN: <title>` section to
   `README.md`'s changelog (this is the durable, chronological record —
   don't duplicate it here).

Each slice runs in its own git worktree at
`.claude/worktrees/control-panel-vNN-<slug>/` (created via `EnterWorktree`
or `git worktree add`), branch `worktree-control-panel-vNN-<slug>`.

## Current state

**Shipped: v1–v22** (see `README.md` for the full per-slice changelog).
The 3-slice visual/UX pass (v14–v16) is complete. v17 added
create-a-company-from-template — "Add a company" can now scaffold a
brand-new company directory from `ai-company-starter-main`'s generic
parts (via an explicit manifest, `lib/company-template-manifest.ts`),
`git init` it, and register it, instead of only registering an
already-existing directory. v18 added a guided, non-technical
company-context setup wizard (`components/company-setup-wizard.tsx`) —
a step-by-step form (business domain, stakeholders, value flow,
bottleneck, plain-language review) that fills in a freshly-scaffolded
company's `definitions/ontology/company.yaml`, replacing the need to run
`/define-company` in a terminal. It ships only the structured-fields
half of `/define-company`: the `customer`/`org`/`product` domain
entities are copied verbatim from the company's own
`docs/templates/ontology-starter.yaml`, not AI-generated. v19
investigated what "integrations setup" actually means today and found
it's much narrower than it sounds: `plh-takeshi-agent`'s email
connection is a `gog` CLI tool authenticated at the OS level (not
something this dashboard could "set up"), and a fresh v17-scaffolded
company has no workflow that would even consume a connected integration
yet. So v19 shipped only a read-only "Integrations" status line on every
agent card (`lib/get-integration-status.ts`) — `plh-takeshi-agent` shows
its real, already-configured email account, every other agent honestly
shows "none configured yet." **No OAuth, no credential storage, no
"connect X" flow exists anywhere in this app** — new connections still
go through `ai-company-starter-main`'s existing `api-connect` Claude
Code skill, which this dashboard deliberately does not duplicate. v20
investigated the roadmap's "guided command/workflow discovery, possibly
formalizing a plugin concept" and found discovery was already fully
solved (since v11's `genericCommandSetSkillAdapter`), and that a general
plugin-packaging format has no existing mechanism anywhere in this
ecosystem to build on — every real workflow is bespoke to its own repo,
and designing one from scratch would be a bigger effort than v17–v19
combined for a population of examples deliberately kept at one. So v20
hand-built a one-off installer for exactly one already-portable
workflow instead: `plh-ops`'s `daily-team-log` skill
(`lib/install-daily-team-log-impl.ts`) — copies its generic `gather.py`
extractor verbatim, regenerates its `SKILL.md`/`Setup.md` to point at
the installing company's own repo instead of PLH's shared one (the
originals hardcode `takeman555/plh-ops` and `Eito`/`Lucce`/`Nana`), and
commits the result. **Known, disclosed limitation:** `gather.py`'s
config is a fixed, global, per-machine path
(`~/.claude/daily-team-log/config.json`), so only one company's copy can
be actively bootstrapped per machine at a time — documented in the
installed `SKILL.md` itself, not fixed in v20. v21 investigated the
roadmap's remaining "AI-generated ontology entities via a connected
agent" thread (deferred since v18) and found `lib/company-commands
/registry.ts`'s `define-company` command — built in v8, before v18's
wizard existed — already spawns a headless `claude -p` session that
does exactly this reasoning; it was just hardcoded to
`ai-company-starter-main` in four places. v21 generalized
`run-company-command-impl.ts` and the status/log-tail/result/commit
wrappers to accept a target `agentId` (resolved via
`getEffectiveAgents()`, same security boundary as everywhere else) and
fixed a real, previously-latent bug along the way: the run-lock/
run-result/log files were keyed only by command id in one shared
directory, so a second company running `define-company` would have
silently clobbered a first company's unconfirmed result —
`COMPANY_COMMANDS_DATA_DIR` is now scoped per agent. Scope stayed
narrow: only `define-company` is generalized (`digest`/`decision`/
`retro`/`handoff` still only run through the existing, unchanged
Skills-page Run tab), and the one new entry point is a "Let AI draft
tailored entities" step inside v18's wizard
(`components/define-company-ai-draft.tsx`), spawning `define-company`
with the wizard's own answers and showing the AI's diff before
confirming. See
`docs/superpowers/specs/2026-07-27-control-panel-v17-create-company-design.md`,
`...v18-guided-company-setup-design.md`,
`...v19-integrations-status-design.md`,
`...v20-daily-team-log-installer-design.md`, and
`...v21-define-company-generalize-design.md` for full details (the v17
spec also has the agent-agnostic design decision: the portable core is
`definitions/`/`docs/decisions/`/`docs/retros/`/`notes/` — plain data;
`.claude/*` is one Claude-Code-specific adapter on top of it, not the
core itself). v22 investigated the last roadmap thread (a fresh company
having a real integration worth connecting) and found two things prior
slices missed: `harness-engineering` (named "core" since v17, never
examined) is a clone of a third-party methodology-thesis repo, not
functional infrastructure; and `plh-takeshi-agent`'s "email connection"
is actually a call into `gog` (gogcli) — a real, already-installed,
general-purpose Google API CLI (Gmail/Calendar/Drive/…) with its own
OAuth store. So "connect an integration" was never missing (`gog` +
the generic `api-connect` skill already solve it); the gap was that no
template command *consumed* one. v22 added exactly one: `check-inbox`,
a strictly read-only "summarize unread mail" command
(`gog -a auto gmail search`/`get` → `notes/company/email-checks/`,
never send/label/archive/read-body). Two machinery changes:
`CompanyCommand` gained an optional `bashPatterns` field so a command
can get narrowly-scoped `Bash(gog ...)` access instead of v8's blanket
`--disallowedTools "Bash"` (the 5 existing commands omit it and spawn
byte-identically — reusing v9's scoped-Bash approach); and the
Skills-page "Run" tab, gated to `ai-company-starter-main` only since
v21, now opens to any `command-set` company (running against that
company's own repo). The `check-inbox.md` file was added to the
`ai-company-starter-main` template (a commit in THAT repo, not the
control-panel branch) so new companies inherit it via v17's
whole-folder copy. **Known, disclosed limitation:** `gog`'s auth store
is global per-machine and `check-inbox` uses `-a auto`, so only one
company can have its own connected account active at a time — same
shape as v20's limitation, documented not fixed. See
`...v22-check-inbox-design.md`.

## Roadmap (named, not yet designed)

Per the user's stated direction, this dashboard is heading toward a
Fleece.ai-style onboarding + operations UI built around
`ai-company-starter-main` (`harness-engineering` was named alongside it
as "core" since v17, but v22's investigation found it's a third-party
methodology-thesis repo, not functional infrastructure — drop it from
the mental model of "the core"). v17–v22 shipped pieces 1–6 of that
vision (create a company, guided company-context setup, integrations
status, one hand-installed workflow, AI-generated ontology entities, and
one real integration-consuming command). **The roadmap's original
named threads are now all addressed.** The last one — "a fresh company
having a real integration worth connecting" — turned out (v22) to be
largely already-solved: `gog` + the generic `api-connect` skill already
handle connecting; v22 added `check-inbox` as the first template command
that actually *consumes* a connection. There is no "v23" named yet, and
no remaining pre-named roadmap item.

Not designed yet — brainstorm fresh when picked up. A natural next
direction (unpicked): more `gog`-based read-only commands
(`check-calendar` was explicitly deferred from v22 in favor of keeping
that slice to one command), or richer operations on top of what's now
connectable. But given how far v19–v22 each diverged from their one-line
descriptions, investigate what's actually real and buildable before
proposing anything, the same discipline every recent slice followed.
