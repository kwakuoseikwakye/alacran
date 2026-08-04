# AI-Native Control Panel — project guide

Local Next.js 15 / React 19 / Tailwind v4 dashboard for managing AI
"companies." As of v23 it is a **product-shaped** app: a fresh install
starts empty and onboards the user to create their first company. The 3
example agents (`plh-takeshi-agent`, `ai-company-starter-main`,
`plh-ops`) are no longer hardcoded — they load as **existence-gated
built-ins** (`lib/builtin-agents.ts`): present only if their
`~/AI-Native/*` directories exist, so a developer machine keeps full
daily use while a shipped install starts clean. Any number of additional
companies can be registered at runtime through the UI (see v11 in
README.md). Built entirely via
`brainstorm → spec → plan → subagent-driven-development`, one versioned
slice at a time, each merged to `master` before the next starts.

For the full chronological changelog of every shipped slice, see
`CHANGELOG.md`. `README.md` is the public front page (what it is, how to
install it, prerequisites). This file is the *standing* project context — conventions,
safety rules, and workflow — that every slice must follow. It doesn't
change per-slice; `CHANGELOG.md` and this repo's git history do.

> **This is a public, MIT-licensed open source repository** as of
> 2026-08-04. There is no license gate, no paid tier and no checkout — that
> code was deleted, not disabled. `LAUNCH.md` documents the commercial
> launch that was planned and abandoned; it is kept as history and carries a
> banner saying so. Don't reintroduce licensing, telemetry, or a phone-home
> of any kind without an explicit decision from the maintainer: the README,
> SECURITY.md and the landing site all make specific promises about what
> leaves a user's machine, and those promises are now checkable by anyone.
>
> Contributor-facing docs — `README.md`, `CONTRIBUTING.md`, `SECURITY.md`,
> `CODE_OF_CONDUCT.md`, `CHANGELOG.md` — are part of the product now. A
> change that makes one of them wrong isn't finished.

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
- **Design tokens (v14 mechanism, v29 values)**: dark-only palette, CSS
  custom properties in `app/globals.css`'s `:root` + `@theme inline`
  block. Every `components/ui/*` primitive already consumes these via
  Tailwind utility classes — changing a token's *value* cascades
  everywhere with zero edits to the primitives themselves. **Never edit
  `components/ui/*`** to fix a styling issue; fix the token or the
  *consumer*'s className instead (see v16's Sheet-mobile-width fix for
  the pattern: primitive untouched, 3 consumers each got
  `className="w-full sm:max-w-xl"`; and v29's `min-w-0` fixes on
  `CardTitle` consumers, which is a **grid** item whose automatic minimum
  size otherwise defeats `truncate`).
- **One brand across app + marketing (v29)**: the palette is Alacrán
  "venom-night" (`#0c0708`/`#16100f` surfaces, bone text, one red accent
  `#ff2e43`) and the type is Nunito / Nunito Sans, in BOTH
  `app/globals.css` and `landing/styles.css`. **A change to one must be
  mirrored in the other.** The app is dark-only, so the landing site
  defaults to dark too (its light theme is an opt-in toggle persisted to
  `localStorage`).
- **The logo is generated, not hand-edited.** `scripts/generate-logo.py`
  keys and recolours the user-supplied artwork (`landing/scorpion.png` —
  a JPEG with no alpha, despite the name) into FOUR committed outputs:
  `landing/logo.png`, `components/alacran-logo.png`,
  `landing/favicon.png`, `app/icon.png`. Never edit those by hand — change
  the script's `RAMP` and rerun so all four stay in sync. The app consumes
  it via a **static import + `next/image` with `unoptimized`**: the static
  import emits it into `.next/static/media` (already copied by
  `scripts/package-macos.sh`), and `unoptimized` avoids a runtime `sharp`
  dependency the packaged app doesn't ship. The mark is 600x626 —
  **always size it by width with `height:auto`**, never `size-*` or a
  fixed square, or it squashes ~4%.
- **Real product marks only**: brand logos come from
  `scripts/generate-brand-icons.mjs`, which extracts official Simple Icons
  (CC0) path data into the committed `lib/brand-icons.ts` and
  `landing/brands.js`. `simple-icons` is installed `--no-save` for the
  regeneration only — never add it as a runtime dependency. **Never
  hand-draw or approximate a vendor logo.** Slack and OpenAI had their
  marks withdrawn from the dataset; name them in prose instead of
  redrawing them.
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

## Standing release rule — rebuild + republish on every shipped change

**Linux packaging is CI-automated** (`.github/workflows/package-linux.yml`,
triggered on a `vX.Y.Z` tag push, publishes `Alacran.deb` to the public
`alacran-releases` release). **macOS packaging has no CI** — it's a manual
local build (`bash scripts/package-macos.sh`) and a manual upload. This gap
caused a real incident: the public `Alacran.dmg`/`Alacran.zip` sat stale for
~2 days (built 2026-07-29) while multi-model support, the Linux `.deb`, and
the v30 starter-template expansion all shipped to `master` — a user
downloaded the app from the live site and got none of it.

**The rule going forward:** whenever a merged change is the kind a user
would notice (a new feature, a UI change, updated templates — not an
internal refactor or a docs-only commit), rebuild the macOS app
(`bash scripts/package-macos.sh`) from current `master`, self-test it
(the script already does this headlessly), and spot-check that the new
change is actually present in the built payload (e.g. grep
`dist/Alacrán.app/Contents/Resources/app/.next` for a string unique to the
change) before proposing to publish.

**Always ask the user for explicit confirmation before the actual publish
step** (`gh release upload` to the public `alacran-releases` repo) — this
overwrites a live artifact real users are already downloading, so it
follows the same "ask before shared-state, hard-to-reverse actions" rule as
everything else in this project. Building and self-testing locally needs no
confirmation; only the upload does.

Until this becomes a `.github/workflows/package-macos.yml` (not yet
written — would need a signing/notarization story to be worth the same tag
-triggered automation as Linux), this is a manual step that's easy to
forget after a merge. Treat "did the macOS release get rebuilt" as a
standing question at the end of any session that merged a user-visible
change.

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
   `CHANGELOG.md` (this is the durable, chronological record — don't
   duplicate it here). If the change is user-visible, check whether
   `README.md` still tells the truth.

Each slice runs in its own git worktree at
`.claude/worktrees/control-panel-vNN-<slug>/` (created via `EnterWorktree`
or `git worktree add`), branch `worktree-control-panel-vNN-<slug>`.

## Current state

**Shipped: v1–v31** (see `CHANGELOG.md` for the full per-slice changelog).
**v23–v25 (Day 1 of the launch push) began productizing the app:** built-in
agents are now existence-gated (`lib/builtin-agents.ts`'s
`buildBuiltins`), the company template is a committed in-repo snapshot
(`templates/company-starter/`, sourced by `create-company-from-template.ts`
instead of `~/AI-Native/...`), and an empty install shows an
`OnboardingWelcome` with `checkDependencies()` (claude + gog) detection.
See `docs/superpowers/specs/2026-07-28-control-panel-day1-productize-design.md` (and `LAUNCH.md`, now historical).
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
`...v22-check-inbox-design.md`. v31 gave the `plh-takeshi-agent` card an
on/off control for its launchd schedule (`com.plh.takeshi-agent`) —
before this slice the dashboard could start a poll (v2) and observe it,
but stopping the recurring 5-minute schedule needed `launchctl unload`
in a terminal. New `lib/scheduled-job/` decides success by reading the
job's actual state back via `checkLaunchdJob()` rather than trusting
`launchctl`'s exit code — live verification found a redundant `unload`
exits 0 while reporting failure on stderr (macOS 26.2), so exit code
can't be trusted even in the apparent-success case; a thrown error is
still handled defensively for failure modes that were never actually
observed. Bespoke to one agent id, like v2/v9/v19.
See `docs/superpowers/specs/2026-08-04-control-panel-v31-scheduled-job-toggle-design.md`.
**Same-day follow-up made "off" persistent:** a bare `unload` was found to
write no disable override at all (label absent from `launchctl
print-disabled gui/$UID`, macOS 26.2), so the shipped "off" had nothing
backing it across a logout or reboot. Stop and Start now use `-w` in both
directions (`unload -w` / `load -w`). Because only `launchctl enable` had
ever been proven to clear that override, `load -w` doing the same was
measured — not assumed — before any code changed: two independent
round-trips against a disposable job (macOS 26.2, build 25C56) both
cleared the override and reloaded the job. A second exit-code lie, on the
opposite verb from the one already documented, surfaced during that
measurement: a bare `load` while the override is set silently no-ops
*and* exits 0 (stderr-only `Load failed: 5: Input/output error`).
**Documented trap:** `plh-takeshi-agent`'s own `install.sh` uses a bare
`load`, so re-running it while this toggle is off will appear to succeed
without actually starting the job — only this toggle's own Start path
clears the override. That repo can't be modified by this project, so it's
a caveat, not a fix.

**Standing context for the coming slices that retire the daemon:**
`~/AI-Native/plh-takeshi-agent/claude-agent-settings.json` lines 26-27
point their `PreToolUse` guardrail hook at
`/Users/nanaosei/Kirirom/plh-takeshi-agent/bin/guardrail.sh`, a
pre-reorg path that stopped existing when that repo moved to
`~/AI-Native/` on 2026-07-22. The guardrail has therefore been inactive
since then — found while investigating v31, out of scope to fix (that
repo must not be mutated by this project), but relevant when the daemon
itself is eventually retired.

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
