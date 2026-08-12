# AI-Native Control Panel — project guide

Local Next.js 15 / React 19 / Tailwind v4 dashboard for managing AI
"companies." As of v23 it is a **product-shaped** app: a fresh install
starts empty and onboards the user to create their first company. The 3
example agents (`email-pipeline-agent`, `ai-company-starter-main`,
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
> code was deleted, not disabled. A commercial launch (license gate, paid
> subscription, checkout) was planned and then abandoned before this
> release; that history isn't kept in this repo. Don't reintroduce
> licensing, telemetry, or a phone-home
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

- The 3 built-in agents (`email-pipeline-agent`, `ai-company-starter-main`,
  `plh-ops`) are hardcoded local paths in `lib/config.ts`.
- "Add a company" can now do two things (v17): **register** an
  already-existing local directory (has `.git` + `.claude`, v11's
  original flow, unchanged), or **create** one from scratch when the
  typed path doesn't exist yet — scaffolding a manifest of generic paths
  from `ai-company-starter-main`, `git init`-ing it, then registering it.
- Still missing (named as roadmap, not built): a general plugin/workflow
  packaging format — see "Roadmap" below.

## Established conventions (binding for every slice)

- **Every feature gets documented — no exceptions, and not only once it
  ships.** Shipped, in-progress, blocked, or abandoned-after-investigation
  all count. Follow Workflow step 6 below the moment there's something to
  record: a dated note in `CHANGELOG.md` plus a line in this file's
  "Current state" section covering what was investigated, what was
  decided, and what's still open (e.g. blocked pending verification of an
  external tool's real CLI flags). This is what makes the process
  resumable across a session boundary instead of re-derived from scratch.
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
  `#ff2e43`) and the type is **Sora (display) / Inter (body)**, in BOTH
  `app/globals.css` and `landing/styles.css`. **A change to one must be
  mirrored in the other.** The app is dark-only, so the landing site
  defaults to dark too (its light theme is an opt-in toggle persisted to
  `localStorage`). The app must keep loading type through `next/font/google`
  (self-hosted at build time) and never a `fonts.googleapis.com` link, which
  would make every launch phone home; the landing site may use the CDN. The
  type has now changed twice (Geist → Nunito in v29, Nunito → Sora/Inter in
  v62), so **do not name the font in a CSS variable** — the app's tokens are
  `--font-display-face` / `--font-body-face` for exactly that reason. Any type
  change must re-measure the mobile bottom nav (see the long note in
  `app/globals.css` beside `.bottom-nav-item`): it is the one layout a font
  swap can silently break.
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
`~/AI-Native/email-pipeline-agent` or `~/AI-Native/plh-ops` directly, for
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

**Why this matters — the exact point the update checker actually sees a
change:** `lib/updates/fetch-latest-release-impl.ts` polls
`api.github.com/repos/kwakuoseikwakye/alacran-releases/releases/latest` — the
separate public *releases mirror*, never `control-panel` itself. Every
installed copy checks at most once every `CHECK_INTERVAL_MS`
(`lib/updates/update-status-impl.ts`, 24h) per copy, and only in production
builds (`app/layout.tsx` → `getUpdateStatus()`; disabled in `next dev`, or
with `ALACRAN_NO_UPDATE_CHECK=1`). Merging to `master` — even a whole
slice — moves that number **zero**: an installed user sees nothing until a
new release is actually published on `alacran-releases`. That's the entire
reason the steps below exist.

**The rule going forward — do this automatically, without being asked, at
the end of any session that merges a user-visible change** (a new feature, a
UI change, updated templates — not an internal refactor or a docs-only
commit):

1. Bump `package.json`'s version. It's `APP_VERSION`'s only source
   (`lib/app-version.ts`) — the exact number the update checker compares
   against.
2. Rebuild the macOS app (`bash scripts/package-macos.sh`) from current
   `master`, self-test it (the script already does this headlessly), and
   spot-check that the new change is actually present in the built payload
   (e.g. grep `dist/Alacrán.app/Contents/Resources/app/.next` for a string
   unique to the change). There's no equivalent local Linux build to run —
   this dev machine is macOS and has no `dpkg-deb`; Linux's rebuild is
   entirely CI's job, triggered by step 4 below.
3. Commit the version bump and push the commit to `master`.

**Always ask the user for explicit confirmation before either publish
step** — these are the two actions that make a new build live to real
users, so both follow the same "ask before shared-state, hard-to-reverse
actions" rule as everything else in this project:

4. Pushing the matching `vX.Y.Z` tag. The tag push alone is what fires
   `package-linux.yml` and publishes `Alacran.deb` to `alacran-releases` —
   that workflow has no separate approval step of its own, so pushing the
   tag *is* the Linux publish.
5. `gh release upload` for the macOS `.dmg` **and** `.zip` to
   `alacran-releases`. Both, every time — this stopped being cosmetic in
   v57: `.dmg` is the human download, `.zip` is what the in-app updater
   fetches (`MAC_ASSET_URL`). A release published without `Alacran.zip`
   makes every macOS user's "Update & Restart" 404. (Before v57 the `.zip`
   didn't exist at all, despite this line claiming it did.)

Steps 1–3 (bump, rebuild + self-test, push the commit) need no confirmation.
Steps 4 and 5 each do, every time — approval for one doesn't carry to the
other, and approval in a past session doesn't carry to this one.

Until this becomes a `.github/workflows/package-macos.yml` (not yet
written — would need a signing/notarization story to be worth the same tag
-triggered automation as Linux), the macOS half stays a manual local build
plus a confirmed manual upload.

## Workflow (how every slice gets built)

1. **Brainstorm** (`superpowers:brainstorming`) — explore real current
   state (read code, take real screenshots — never assume from memory),
   ask clarifying questions one at a time, propose 2-3 approaches,
   present the design in sections, write the spec to
   `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, self-review,
   commit. **This directory is gitignored** — the spec is a local working
   document scoped to the slice, not part of the public repo. The durable
   public record of what shipped and why is `CHANGELOG.md` (full detail)
   and this file's own "Current state" section (a running summary,
   updated per slice — see step 6).
2. **Plan** (`superpowers:writing-plans`) — turn the approved spec into a
   fully-coded, bite-sized task list at
   `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`, each task ending in an
   independently testable, committed deliverable. Every plan states its
   **Global Constraints** up front (what NOT to touch). Same as the spec,
   this stays local and gitignored.
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
   `CHANGELOG.md` (the durable, chronological record, in full detail),
   *and* add a brief summary of what shipped to this file's own "Current
   state" section below, in the same voice as the entries already there.
   If the change is user-visible, check whether `README.md` still tells
   the truth.

Each slice runs in its own git worktree at
`.claude/worktrees/control-panel-vNN-<slug>/` (created via `EnterWorktree`
or `git worktree add`), branch `worktree-control-panel-vNN-<slug>`.

## Current state

**Shipped: v1–v66** (see `CHANGELOG.md` for the full per-slice changelog —
that file, not this line, is the authority on the next free slice number;
v61 was nearly built as "v58" because this line said v39 while the changelog
was already at v60).
**v23–v25 (Day 1 of the launch push) began productizing the app:** built-in
agents are now existence-gated (`lib/builtin-agents.ts`'s
`buildBuiltins`), the company template is a committed in-repo snapshot
(`templates/company-starter/`, sourced by `create-company-from-template.ts`
instead of `~/AI-Native/...`), and an empty install shows an
`OnboardingWelcome` with `checkDependencies()` (claude + gog) detection.
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
it's much narrower than it sounds: `email-pipeline-agent`'s email
connection is a `gog` CLI tool authenticated at the OS level (not
something this dashboard could "set up"), and a fresh v17-scaffolded
company has no workflow that would even consume a connected integration
yet. So v19 shipped only a read-only "Integrations" status line on every
agent card (`lib/get-integration-status.ts`) — `email-pipeline-agent` shows
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
originals hardcode `example-user/plh-ops` and `Teammate1`/`Teammate2`/`Nana`), and
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
confirming. (v17's design also established the agent-agnostic principle
still in force: the portable core is
`definitions/`/`docs/decisions/`/`docs/retros/`/`notes/` — plain data;
`.claude/*` is one Claude-Code-specific adapter on top of it, not the
core itself.) v22 investigated the last roadmap thread (a fresh company
having a real integration worth connecting) and found two things prior
slices missed: `harness-engineering` (named "core" since v17, never
examined) is a clone of a third-party methodology-thesis repo, not
functional infrastructure; and `email-pipeline-agent`'s "email connection"
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
`...v22-check-inbox-design.md`. v31 gave the `email-pipeline-agent` card an
on/off control for its launchd schedule (`com.example.email-pipeline`) —
before this slice the dashboard could start a poll (v2) and observe it,
but stopping the recurring 5-minute schedule needed `launchctl unload`
in a terminal. New `lib/scheduled-job/` decides success by reading the
job's actual state back via `checkLaunchdJob()` rather than trusting
`launchctl`'s exit code — live verification found a redundant `unload`
exits 0 while reporting failure on stderr (macOS 26.2), so exit code
can't be trusted even in the apparent-success case; a thrown error is
still handled defensively for failure modes that were never actually
observed. Bespoke to one agent id, like v2/v9/v19.
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
**Documented trap:** `email-pipeline-agent`'s own `install.sh` uses a bare
`load`, so re-running it while this toggle is off will appear to succeed
without actually starting the job — only this toggle's own Start path
clears the override. That repo can't be modified by this project, so it's
a caveat, not a fix.

**Standing context for the coming slices that retire the daemon:**
`~/AI-Native/email-pipeline-agent/claude-agent-settings.json` lines 26-27
point their `PreToolUse` guardrail hook at
a pre-reorg absolute path under a former parent directory — a
path that stopped existing when that repo moved to
`~/AI-Native/` on 2026-07-22. The guardrail has therefore been inactive
since then — found while investigating v31, out of scope to fix (that
repo must not be mutated by this project), but relevant when the daemon
itself is eventually retired.

v32 added two more read-only commands, `triage-email` and
`triage-issue`, and the machinery neither could exist without: a
per-command **prefetch seam** (`lib/company-commands/prefetch/`) that
runs control-panel-side, before any agent spawns, and can refuse —
aborting the run with no spawn at all. This exists because the spawned
session's `cwd` is the company's own root with no `--add-dir`; it
cannot read a product repo to route a request into, so the control
panel has to gather that context itself. Config
(`definitions/triage/senders.yaml` and `definitions/triage/repos.yaml`,
in the company's own repo) is fail-closed — missing or empty means
accept nothing — and isn't editable from the dashboard, since
`lib/resolve-known-skill.ts`'s membership check only recognizes
discovered skill/command files, not arbitrary `definitions/` data.
Every `gog` call carries `--readonly --gmail-no-send`; the email body
fetch adds `--wrap-untrusted`. Issue *filing* is deliberately deferred
to v33, behind its own confirmation gate on top of the existing
diff-and-commit one — the same reasoning that kept `create-epic` out of
v8.

v34 added a per-company "Ownership Dashboard" — a "View ownership" button
on every real company's card opens a Sheet showing where its data lives
(local root path, copyable), which AI provider runs its commands, what's
connected, whether it's backed up, and a synthesized "external network
access" summary — composed from signals that already existed
(`getCompanyRemoteImpl`, `getIntegrationStatus`, `getAiExecutorIdForAgent`)
rather than tracking anything new. Deliberately non-committal about
Aider: its model backend (cloud or local) is the user's own config,
invisible to this app, so its network-access line says that rather than
guessing. A final whole-branch review caught a real spec-level flaw
before merge: `getIntegrationStatus` only ever reports a real connection
for `email-pipeline-agent`, which isn't a `command-set` agent and can never
open this Sheet — so the Integrations section and the Google
network-access line were structurally dead code for every company that
could actually reach them. Fixed by falling back to the machine-wide
Google connection (`getConnectStatusImpl`) when no per-company
integration exists.

v35 added a per-company setting — set in the company-setup wizard,
editable afterward — that makes every command for that company run in a
real, visible macOS Terminal window instead of headless, with a pre-run
gate (shows the exact prompt, waits for Enter, or Ctrl-C to abort) before
the agent runs at all, and an offer to continue interactively via
`claude -c` once the constrained run finishes. macOS only. The command's
prompt, tool allowlist, and diff-then-commit gate stay byte-identical to
a headless run — only where the process's stdio goes, and whether a
human sees a gate first, changes; the generated script's own
`trap ... EXIT` owns the run-lock's lifetime instead of Node, since
`open -a Terminal <script>` returns long before the real run finishes.
Two things were measured, not assumed, before shipping: macOS's real
`/bin/bash` is 3.2.57 and has no `mapfile` (an early draft used it;
replaced with a bash-3.2-compatible read loop, verified against the real
shell); and a NUL byte in the prompt would have been a real
argv-injection path into the spawned `claude` process, on exactly the
`triage-email`/`triage-issue` path that handles attacker-influenced
content — caught in review and fixed with a one-line guard before merge.
A final whole-branch review then caught a second, more subtle bug: the
script's `EXIT` trap stayed armed after it explicitly released its own
lock, so closing the window (or Ctrl-C) at the take-over gate could
delete a *later* run's lock for the same company — reproduced on the
real system bash in both the buggy and fixed shapes before the fix
shipped.

v36 fixed a real user-reported bug, not a feature: the macOS app icon
didn't show after install. Root cause, confirmed by direct inspection —
`scripts/package-macos.sh` never generated a `.icns` file and `Info.plist`
had no `CFBundleIconFile` key, so every install got macOS's generic
fallback icon. Fixed by padding the brand mark (600×626, non-square) onto
a square transparent canvas — `sips -p`'s transparency behavior was
measured directly, not assumed, before relying on it — generating the
full `.iconset`, and packing it with `iconutil`. Shipped as a patch
version (v0.5.1), diagnosed via `superpowers:systematic-debugging` rather
than the usual brainstorm-spec-plan flow, since it's a packaging fix with
no application-code change.

v67 replaced `templates/company-starter/` with own-authored scaffolding, which
is what v37 (below) should have done. v37 fixed the license and the branding
but kept shipping the material: 91 of the 96 files still descended from the
kit bundled at `b2692db`, and the 79 that differed did so mostly because they
had been *translated*, which is a derivative work, not an original one. The
template is now 33 files written for this repo — the commands the app's
registry actually runs (each checked against its real `outputPath`), a
rewritten `docs/templates/ontology-starter.yaml` (a hard dependency of
`save-company-ontology-impl.ts`, not an optional doc), a rewritten
`scripts/verify.py` with three checks it can honestly claim, and folder
skeletons. **Provably-own files were kept** (`check-inbox`/`check-notion`/
`triage-*` commands, the triage example YAMLs, all of `templates/packs/` —
none existed at `b2692db`); everything else was dropped rather than rewritten,
since rewriting would have meant inventing features to fill a shape.
`TEMPLATE_MANIFEST` went 34 → 19 entries. **The check to reuse:** compare blob
SHAs at the bundling commit against `HEAD` file by file — that, not reading
the files, is what showed how little of it was ever this project's.

v37 relicensed and de-branded `templates/company-starter/` — the real
bundled source `create-company-from-template.ts` copies into every new
company. It still carried the external license and branding of the
program it was derived from, and had never been re-papered for
redistribution inside a public, MIT-licensed repo. Fixed: replaced that
license with real MIT (matching this repo's own), removed the
originating program's branding throughout ~25 files, and deleted files
that were pure event-logistics content (`exercises/`, participant/day
-flow/feedback docs, feedback issue templates) with no place in a
software template. Also translated all remaining Japanese
content to English (`scripts/cycle/`, a CI sanitize-gate pattern, and a
stale Japanese heading reference in this repo's own
`lib/company-commands/registry.ts`) and removed two features found to be
broken or legally exposed on inspection: the `/office` command and its
test file (`tools/office/office.py` was referenced by both but never
actually bundled in this repo's history — confirmed via `git log --all`
— so every new company inherited a command that always fails and a test
file that fails to even collect), and the `piro`/`piro-run` skills (built
around and named after AWS's real "Kiro" product, "Kiro's little brother,
one letter away" — trademark exposure with no offsetting value for most
users). `lib/company-template-manifest.ts` and
`lib/company-starter-packs.ts` updated so newly-created companies stop
copying the deleted paths. Verified clean via the pre-existing
`scripts/jp-audit.py` (added in an earlier slice to make the Japanese-
translation state objectively checkable rather than eyeballed) and by
confirming, via
`git stash` against the pre-edit baseline, that the one remaining
`templates/company-starter` pytest failure (dangling `PATHREF-01`
references to `examples/harukaze-ec/`) is pre-existing and unrelated.

v38 added an "Open in Terminal" button on every `command-set` agent's card —
real user feedback that after finishing the company-setup wizard, there was
no path to actually building a new skill (the Skills page's Run tab can only
run/edit commands the app already knows about; `resolve-known-skill.ts`
requires the write target to already be a discovered skill, so it can't help
create one). The button opens a real Terminal window, `cd`'d into the
company's root, running a plain interactive session of whichever AI executor
is configured for it — no prompt, no allowlist, no gate, the same thing as
`cd`-ing there and running the executor by hand. Reuses v35's exact
`open -a Terminal` launch mechanism and `shQuote` helper; the new
`buildInteractiveTerminalScript` lives alongside `buildVisibleRunScript`.
macOS only, same gate as v35's visible-run option. A second report from the
same feedback — a company appearing pre-registered on a fresh install on
another machine — turned out not to be a product bug: the real per-user
registry (`~/Library/Application Support/Alacrán/companies.json`) is
confirmed empty on a machine that hasn't registered anything; the dev-mode
registry (`.data/companies.json`, gitignored) is what had it, which only
travels if the whole project folder (not a downloaded release) is copied
between machines. No fix needed — the existing "Remove" button on any
registered company's card already clears it.

v39 added a "company guide" — a plain-language walkthrough of every action
on a company's card, closing the gap v38 opened (a user still didn't know
what any button, including v38's own "Open in Terminal," actually did).
Explicit direction: this has to work for CLI-comfortable and non-technical
users alike, so the copy assumes no CLI literacy at all. No tour library —
a `Sheet` listing one line per action, opened once automatically the first
time a company's info is filled in (a single `localStorage` flag, same
mechanism the landing site already uses for its theme toggle), reachable
anytime after via a small "?" next to the kind badge. Each blurb is
exported as a constant from its own button's file, so the copy lives next
to the component it describes. `lib/company-guide-steps.ts`'s
`buildGuideSteps` takes the exact same show* flags `AgentCard` already
computes, so the guide can never explain a button that isn't really there —
live-verified against the real `ai-company-starter-main` card, which
correctly showed 7 steps and omitted "Remove" (not a registered company).

v40 replaced the top `Nav` bar with a collapsible glassmorphic sidebar
(`components/sidebar.tsx`) — icon rail on desktop, bottom tab strip on
mobile — plus ambient background orbs, both driven by new tokens in
`app/globals.css`. Every page now shares `.dash-topbar`/`.dash-content`
from `app/layout.tsx` instead of its own `<main>` wrapper.

v41 let a company connect and use more than one Google account — `gog`
(the CLI underneath the "email connection") already supported multiple
stored accounts (`gog auth add/list`, `-a <email|alias|auto>` per call);
the app just never exposed more than the one `auto` resolved to. Connect
page now lists every stored account (`lib/google-accounts.ts`) with a
"connect another email" flow; a new per-company
`definitions/integrations/google.yaml` (written via
`saveGoogleAccountsImpl`, same tier/pattern as
`definitions/ontology/company.yaml`) feeds a `GoogleAccountsPicker` card
control, and both `check-inbox` and `triage-email` resolve and loop the
assigned account(s) instead of a hardcoded `-a auto`. Unconfigured
companies are unaffected (`[]` → `["auto"]` fallback everywhere).

v42 added Google Antigravity CLI (`agy`) as a fourth entry in the
already-existing pluggable AI-executor registry (`lib/ai-executors.ts` —
"choose which AI agent runs this company's commands" was not new; it
shipped alongside v41). Flags (`-p ... --output-format text --mode
accept-edits --dangerously-skip-permissions`) were confirmed against the
real installed `agy --help` (v1.1.11) on the user's machine, not web
docs — search results for Antigravity CLI's flags were unreliable enough
to include a hallucinated description ("Anthropic's official CLI for
Claude") on an otherwise-plausible-looking page. `lib/ownership
/summarize-network-access.ts`'s exhaustive `Record<AiExecutorId, string>`
(v34) caught the missing case at `tsc` time, same "always a real
account-bound cloud call" bucket as Claude Code/Codex. **Same-day
follow-up:** the Connect page's "AI agent" card was hardcoded to check
only the `claude` binary — a pre-existing gap (Codex/Aider were never
added either), just more visible now with a 4th option. First fix
(badges for every executor under the one Claude Code card) was itself
called out as bad design — a card titled "AI agent (Claude Code)"
showing 4 tools' status is confusing no matter how accurate the badges
are. Redesigned properly: every registered AI executor now gets its own
full connect-page card (own title, real connected state, own install
guidance via `installHint`/`installLink`, finally used by a UI),
`ConnectStatus.aiExecutors: ToolStatus[]` replacing the single `claude`
field. `onboarding-welcome.tsx`'s Claude-only install gate now looks it
up by id instead of a dedicated field. Live-verified: 6 independent
cards (Claude Code, Codex, Aider, Antigravity, Google, GitHub), each
correct for what's really installed on this machine.

v43 added a "Network" tab — a graphical map of every company on the
machine and exactly what it's plugged into (AI executor, GitHub backup,
Google, Notion), requested directly by the user as an Obsidian-inspired
but deliberately different visualization. Bipartite, not a force graph:
companies on the left, services on the right, curved SVG "cable" edges
between them — the relationships are already known from existing data,
so there's nothing to simulate. `lib/build-network-map.ts` composes the
per-company edge data from primitives that already existed for the
Ownership Sheet and Connect page (`getConnectStatusImpl`,
`getCompanyRemoteImpl`, `getAiExecutorIdForAgent`, `readGoogleAccounts`,
`connectStatus.notion.companies`) — no new detection logic, only a
structured shape instead of a formatted sentence. Edges are only ever
drawn for a service a company's *kind* actually supports elsewhere in
the app (a `pipeline` agent only ever gets a Google/email edge, a
`report-log` agent gets none at all — a genuinely isolated node, which
is honest, not a bug) rather than inventing a capability the rest of the
app doesn't have. Wire color follows the app's own semantic palette, not
per-vendor brand colors, matching `BrandIcon`'s existing house rule that
vendor color is reserved for icons at a live moment: ember for "runs on"
(always true), success-green for a real connection, muted dashes for
"not yet" — `TOOL_BRAND` was exported from `connect-panel.tsx` rather
than redefined, so both pages agree on which executor gets which mark.
Row positions are plain `index * PITCH` arithmetic (no ResizeObserver, no
client-side layout pass) — every node is a fixed-height flex-centered
slot and the SVG viewBox lines up with the same grid, so it works
server-rendered with only a small client component on top for hover-
highlight. Responsive by CSS breakpoint, not JS: below ~880px the wires
and services column disappear and each company's own chip row (already
rendered on desktop too, for redundant non-color-dependent legibility)
carries the same information alone. Live-verified on a throwaway dev
server against real registered companies — hover-dimming, the mobile
stacked layout, and the desktop cable view all confirmed by screenshot;
`/connect` and `/` (Agents) re-verified unaffected by the `TOOL_BRAND`
export. Full suite: 561 tests, `tsc`/`next build` clean.

v44 gave Google Antigravity its own real product mark instead of the
generic Google "G" it was borrowing on `/connect` and the Network tab —
Simple Icons doesn't carry Antigravity yet, so per the "never hand-draw a
vendor logo" rule the fix traced the real gradient arch mark straight from
`antigravity.google`'s own hosted PNG/favicon (`potrace`, build-time-only
like `simple-icons` itself) into a flat path on the same 24×24 grid,
shipped as a `MANUAL_MARKS` array alongside `generate-brand-icons.mjs`'s
existing Simple-Icons `SPEC` so it survives regeneration. `hex` is the
mark's own area-weighted dominant color rather than an invented one — it
lands on the same Google Blue every other Google mark already uses. See
CHANGELOG.md for the affine-transform bug (chained vs. independent
relative-curve control points) caught before this shipped.

v45 fixed a real user-reported bug: a macOS update would install but the
running app kept showing the old version. `scripts/package-macos.sh`'s
launcher killed a prior stale instance with one `kill` + a fixed
`sleep 0.5` and no confirmation the port was actually free — a slow-to-die
prior instance (e.g. mid keep-alive with the very browser tab showing the
update banner) loses the `EADDRINUSE` race silently, and the readiness
check ends up talking to the OLD server. Same bug class already fixed once
in this file (the self-test step's post-run cleanup), just never applied
to the pre-launch clear real installs depend on — fixed by reusing that
exact confirm-and-escalate-to-`-9` loop. Reproduced live with a stale
process that delays its exit past 0.5s before fixing, confirmed cleared
after, and confirmed the fix survives into a real generated launcher
inside a fresh build. Patch version, diagnosed via
`superpowers:systematic-debugging` like v36, no application-code change.

v46 added a "Get Started" button, closing a real gap found by walking
through a concrete case (a user builds a company, writes custom skills,
defines it — then doesn't know how to use any of it): the Skills page's
Run tab only recognizes the 9 fixed built-in commands by exact filename
match, so a user's own custom skills have **no run affordance in the
dashboard at all** — the only real path was already v38's "Open in
Terminal," which opens a real interactive AI session with full file
access but starts completely blank. Rather than building a new mechanism,
"Get Started" reuses v38's exact machinery and just seeds the session's
first message ("read this company's skills and ontology, then introduce
yourself"). Per-executor, verified against each CLI's real `--help`
(installed Codex and ran aider's `--help` specifically to check, same bar
as v42): Claude Code and Codex both start interactive with a bare
positional prompt as the first turn; Google Antigravity CLI needs its own
`-i`/`--prompt-interactive` flag; Aider genuinely has no equivalent (its
only message flag exits after one reply) — `AiExecutor.
buildInteractiveIntroArgs` is deliberately absent for aider rather than a
guessed flag, and the impl falls back to the same blank session with a
message that says so. `buildInteractiveTerminalScript` and
`openInteractiveTerminalImpl` both gained trailing-optional params, so
every existing call site and test needed zero changes. Deliberately not
live-tested end to end — a seeded prompt submits and gets a real reply
the instant the process starts, the same real-API-call risk category this
project already treats headless spawns as off-limits for in an unattended
pass. Verified instead down to the exact spawned argv (8 new unit tests)
and confirmed the button renders correctly gated without ever clicking
it.

v47, a direct follow-up from watching v46 in use: Get Started was
re-reading every skill file and the ontology from scratch on every click,
even when nothing changed. Fixed with a cache the app decides is stale
without any AI call (asking the agent to judge freshness itself still
costs tokens every click) — `lib/company-summary.ts` compares a plain
`git log -1` against the watched paths (`.claude/skills`,
`.claude/commands`, `definitions/ontology/company.yaml`) to a
`source_commit:` field stored in a new file, `docs/company-summary.md`'s
own frontmatter. Match → seeded prompt just says "read the summary."
Mismatch, missing, or git can't answer at all → the full read-everything
prompt, now also writing the summary back with today's date and the real
commit SHA (preserving its existing `created:` date on update, same shape
as `HANDOFF.md`'s command). Lazy, not a watcher — checked only on the next
click, no daemon, matching everything else in this app. Portable core
(`docs/`), not a `.claude/*` executor artifact. Verified with mocked-git
unit tests plus a real disposable `/tmp` git repo exercising all three
transitions against real `git log` and real file writes, deleted after —
still no real AI spawn triggered, same discipline as v46.

v48 fixed the `gog` install link 404ing on the Connect page and in
README — the project moved (real tap is `openclaw/tap`, confirmed via
`brew info gogcli` on this machine) and has since landed in
`homebrew-core` itself with its own canonical site, `https://gogcli.sh`
(verified live). Links and the install command
(`brew install gogcli`, no tap needed anymore) now point there in both
`lib/connect/connect-status-impl.ts` and `README.md`.

v49 moved the Skills page's "Edit" button out of the Content tab's
scroll (it sat below the full file dump) into the tab row itself:
**Content | Edit | History | Run**. `SkillEditor`'s `editing` state
became a controlled prop driven by `SkillBrowser`'s existing `view`
state (an `"edit"` value added alongside the existing three) rather than
self-managed internal state with its own button. Verified live; hit a
real tooling quirk doing it — the screenshot tool kept showing a stale
pre-click frame while the accessibility snapshot and a direct
`document.querySelector` check both confirmed the real DOM was correct
(`Edit` active, a real `<textarea>` present). Trusted the DOM query over
the screenshot.

v50 let users drag-and-drop reorder the Agents-page cards. Two decisions
checked with the user first (both took the simpler, recommended path):
all cards reorder together — the 3 gated built-ins mixed in with
registered companies, not pinned separately — and the order persists to
`localStorage` (same per-browser mechanism as v39's guide-seen flag)
rather than `companies.json`, which also sidesteps built-ins not being
registry entries. New `components/reorderable-grid.tsx` wraps
`.bento-grid` in a client component using native HTML5 drag-and-drop (no
library) and reconciles the saved id order against the live agent list on
mount, so a stale, missing, or empty saved order never drops a card.
Live-verified: dragged a card, watched it reorder, confirmed the new
order survived a reload.

v51 added a `/settings` page: a manual light/dark toggle, a manual
"Check for updates" that bypasses the banner's 24h throttle
(`lib/updates/check-for-updates-now-impl.ts`), resets for the two other
one-time `localStorage` flags this app writes (v50's card order, v39's
guide-seen), and an About card. Light mode is new — the app had been
dark-only since v14/v29 — added by porting the marketing site's already-
shipped light palette into a `:root[data-theme="light"]` override in
`app/globals.css`; every primitive already ran on CSS custom properties
with zero hardcoded colors, so it cascaded with no primitive edits.
Known, disclosed, not fixed: `BrandIcon`'s `tone="brand"` colors stay
tuned for a dark surface in light mode too (still legible, just not
repainted — fixing it means regenerating `lib/brand-icons.ts` with a
second per-icon tint, out of scope for this slice). Building the no-
flash theme script surfaced a real, confirmed React Server Components
bug — a Server Component importing a plain (non-component) value from a
`"use client"` file silently gets `undefined` — fixed by moving
`THEME_STORAGE_KEY` to a plain `lib/theme.ts` module; a second symptom
that looked identical (a client-to-client plain-value import crashing)
was tested in isolation and turned out to be dev-server cache corruption
from rapid edits, not the same bug — the comment in
`lib/updates/wait-for-server-then-reload.ts` says so rather than
repeating the disproven claim.

**Real incident, caught while committing v51's own work:** v0.7.19's
release commit only staged `package.json`/`package-lock.json` — v50's
actual code was left uncommitted and never made it into that release at
all. The published `Alacran.deb` for v0.7.19 (built by CI from a clean
tag checkout) shipped without the reorderable-cards feature; the macOS
`.dmg` (built from the local working tree) had it. Fixed forward as
part of v0.7.20 rather than rewriting the public tag — see CHANGELOG.
Lesson for every future release: `git status --short` before the
version-bump commit, not just `git add package.json`.

v52 fixed a real user-reported backup bug: a company whose `.git` already
had an `origin` remote (set by hand, or inherited from wherever the
directory was registered from) but whose GitHub repo was never actually
created failed every backup with git's raw "correct access rights" error.
`backupCompanyImpl` now treats that specific failure as "stale remote,"
clears it, and falls through to the same create-and-push path a first-
ever backup takes — one shared path instead of two. Any other push
failure (network, auth) still surfaces as a real error.

v53 fixed a real Claude Code false positive: `which claude` succeeded on a
machine with only the Claude desktop app installed (likely a Homebrew Cask
launcher shim also named `claude`), so this app reported "Connected" for a
CLI that wasn't there. `lib/is-claude-code-cli.ts` now confirms with a real
`claude --version` check for the real CLI's own output signature, used
everywhere Claude Code specifically gets checked. Also reworded the AI-
executor "not connected" guidance — "Reopen this app or press Re-check"
was genuinely ambiguous (reads as "refresh the page," which does nothing,
since `scripts/package-macos.sh`'s launcher captures PATH once at
startup) — to explicitly say fully quit and reopen the app itself. And
added `components/connect-help.tsx`, a step-by-step Connect page help
guide (v39's `CompanyGuide` Sheet pattern, gated on "anything not
connected yet") — requested after a non-technical user found the
existing per-card guidance hard to follow alone; content is generic
(terminal 101, copy/paste, the restart gotcha) rather than re-describing
each tool, which is already on its own card.

v54 fixed a real backup bug: the repo got created on GitHub fine, but the
push right after it failed with "correct access rights" even though `gh`
was confirmed signed in. Root cause, confirmed on a real machine: `gh
auth status`'s per-account git-operations protocol was `ssh` (independent
of `gh`'s global config default, and not overridable per-call on `gh repo
create`), so the wired-up remote needed a working SSH key — a completely
separate credential from whatever made `gh auth login` work. Fixed by no
longer trusting gh's chosen protocol: `ensurePushableRemote` in
`lib/github/backup-company-impl.ts` rewrites an SSH remote to HTTPS and
runs `gh auth setup-git` (confirmed live — idempotent) to wire git's
HTTPS credential helper to gh's own token, before every push, on both the
first-backup and subsequent-backup paths.

v55 fixed the same symptom's second real cause: the push was rejected
with GitHub's real "refusing to allow an OAuth App to create or update
workflow ... without `workflow` scope" — because `templates/company-
starter/.github/workflows/verify.yml` was in `TEMPLATE_MANIFEST` and got
copied into every new company, and `gh auth login`'s default scopes
don't include `workflow`. Fixed for new companies (manifest now only
copies `.github/ISSUE_TEMPLATE/config.yml`, not the workflows folder —
`/verify` already runs `scripts/verify.py` directly, no CI needed). The
second half of that fix — a `pushSelfHealingWorkflowScope` that untracked
`.github/workflows` at the tip and retried — was **removed in v56**: it
could not have worked, because GitHub checks what a push *introduces*, not
what the resulting tree contains, and the case it targeted (a pre-v55
company's first-ever backup) pushes the whole history including the commit
that added the file.

v56 fixed three review findings and shipped no new capability. (a) Only
Claude Code ever honoured `editScopePattern`/`bashPatterns` — Codex, Aider
and Antigravity ignore both and pass one coarse auto-approve flag instead,
so the four commands that splice attacker-authored text into a prompt
(`triage-email`, `triage-issue`, `check-inbox`, `check-notion`) had no
sandbox at all on 3 of the 4 selectable executors. New
`AiExecutor.enforcesToolScope` + `CompanyCommand.untrustedInput` refuse that
pairing before the lock and before any prefetch; no flag was invented to
fake a sandbox those CLIs don't have. (b) `spawn` had no `'error'` listener
at five sites — for a binary not on PATH node fires `'error'` and never
`'exit'` (measured on v24.12.0), so the unhandled event killed the server
*and* leaked the run lock, which `lib/file-lock.ts` never sweeps. (c) The
backup fix above became `pushWithWorkflowScopeCheck`, which refuses up front
when history contains a workflow and gh's token lacks the scope, and tells
the user to run `gh auth refresh -s workflow` — deliberately reversing v55's
"rather than making the user re-authenticate" call, since re-authenticating
is the only fix short of rewriting their history. v56 also finished v55's
template half: the three shipped docs that still described
`.github/workflows/verify.yml` were corrected (README's Security Operations
section had been claiming a gitleaks CI scan that no longer ships, and
`scripts/verify.py` never scanned for committed secrets in the first place —
it only checks that `.gitignore` effectively blocks `secrets/`/`.env`), and
`.github` left `TEMPLATE_MANIFEST` entirely. A new test scaffolds from the
REAL bundled template into a disposable `/tmp` dir, which is the only way
this class of drift gets caught — every other test in that file uses a
synthetic source directory.

v57 gave macOS the "Update & Restart" button Linux already had. The reason it
had been refused was measured and found false: `com.apple.quarantine` is
attached by the *downloading application* (browsers opt in, `fetch` doesn't),
so an update the app downloads itself is never quarantined and needs no
`xattr -cr`. The one real unknown — whether macOS 13+ TCC "App Management"
lets an **ad-hoc-signed** app (`TeamIdentifier=not set`, so outside the
signing-identity-based self-update exemption) replace its own bundle — was
settled with a purpose-built probe of this app's exact shape, launched by
LaunchServices from `/Applications`: it succeeded, no prompt. `package-macos.sh`
now also builds `Alacran.zip` (the updater's payload; `ditto -c -k` keeps the
signature and exec bit, which `zip -r` doesn't), `resolveAppBundlePath` finds
the running bundle from `process.cwd()` instead of hardcoding `/Applications`,
and the swap rolls back to the original bundle if the second `rename` fails.
**Both** `.dmg` and `.zip` must now be uploaded on every macOS release — see
the release rule above.

v61 added per-company MCP connectors — a second door onto external tools for
users who don't want the CLI path (`gog`/`gh`/`api-connect` were the only ways
in before this). A live probe run *before* any code collapsed the whole feature
to one file write: a hand-written `.mcp.json` at the company root is picked up
by the real CLI as `Scope: Project config (shared via .mcp.json)`, pending
approval "(run `claude` to approve)" — and running `claude` in the company's
directory is exactly what v38's "Open in Terminal" button already does. So
**this slice ships no OAuth, no token storage and no login button**; Claude
Code owns discovery, approval, the browser flow and the credential, and the
Sheet ends with an instruction instead. New `lib/mcp-servers-config.ts` (read,
fail-soft like `readGoogleAccounts`) and `lib/save-mcp-servers-impl.ts` (write,
mirroring `saveGoogleAccountsImpl`), plus a `Connect tools` Sheet on the card.
Verified against the real installed CLIs, not docs: `claude mcp add -s project`
writes `.mcp.json`, but **`codex mcp add` has no scope flag at all** — it's
machine-global `~/.codex/config.toml`, the fourth instance of the recurring
per-machine-global-config shape after `gog` and `daily-team-log` — and `agy`
(v1.1.11) has no `mcp` subcommand whatsoever. So the button is gated on the
company's executor being Claude Code, which `app/page.tsx` had already
resolved. **Known, disclosed limitations:** Claude Code only; remote `https://`
servers only (stdio/local-command servers are out — that's the one input
needing real command validation, and `claude mcp add` still covers it); and MCP
tools are reachable **only** from Open in Terminal (v38) and Get Started (v46).
That last one is a security decision, not a convenience one: those two paths
have no tool allowlist, so this needed zero changes to the command sandbox,
and the nine headless commands never see an `mcp__*` tool. An MCP tool sits
outside the `Edit(...)`/`Bash(...)` model entirely, so putting one in scope for
a command that splices attacker-authored text into its prompt (`triage-email`,
`triage-issue`, `check-inbox`, `check-notion`) would hand an email author a
write API to the user's Canva/Figma/Lovable account — the exact hole v56
exists to close. Preset URLs came from a real `claude mcp list` where the CLI
health-checked each one; Notion and GitHub are absent because theirs couldn't
be verified that way. Two review catches before merge: `McpServer` must be a
**type-only** import in the `"use client"` Sheet (the config module imports
`node:fs/promises`; a value import would fail the build), and a failed commit
must **not** fail the save here — `.mcp.json` is commonly gitignored in real
repos, so a company registered from an existing directory would otherwise 500
on every save. **The one open question was then settled, and the answer is
"don't build it":** `claude mcp login <name>` *refuses* a still-pending
project server, with "is from .mcp.json and awaiting approval. Run `claude` in
this directory to review it first." — bailing before any network call, writing
nothing to the credential store. Measured directly against a
disposable `/tmp` repo with `--no-browser` and stdin closed, so no OAuth was
ever started. A one-click "Sign in" button is therefore **impossible as
conceived**: login requires approval first, approval is only reachable by
running `claude` interactively in the company's directory, and that is exactly
what v38's Open in Terminal already does. Such a button could only open a
terminal and then tell the user to approve and type `/mcp` — verbatim what the
Sheet's instruction already says. Don't add it.

v63 fixed a user-reported bug: a drawer with a lot of text in it "got stuck" —
its bottom, including the Save/Next buttons, was unreachable. The cause was in
two primitives, not in any drawer. `SheetContent` is a `fixed`, `h-full`,
`flex flex-col` panel that **had no scroll container at all**, so anything
taller than the viewport was clipped with nothing to scroll; only 2 of its 10
consumers had hand-patched an inner `overflow-y-auto`, and the 4 with plain
content were all broken. `AlertDialogContent` had no `max-height` while centred
with `translate-y-[-50%]`, so a tall confirm dialog overflowed *both* ends. Both
fixed in the primitive: `SheetContent` wraps `children` in a
`min-h-0 flex-1 overflow-y-auto` flex column (wrapping rather than scrolling
`SheetContent` itself, so the `absolute` close button stays pinned), and
`AlertDialogContent` got `max-h-[calc(100dvh-2rem)] overflow-y-auto`.
**This is the one sanctioned exception to the "never edit `components/ui/*`"
rule above, confirmed with the maintainer:** that rule governs *styling*
issues, which belong in a token or a consumer's className — a structurally
missing scroll container that every caller routes through is the case where the
rule's own logic points at the primitive. It is not a precedent for colour,
spacing, or width fixes, which still belong in the consumer (see v16/v29).

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

v64 fixed two user-reported Google connection bugs with the same shape — the
app advertising a next step that connected nothing — both root-caused by
probing the live systems rather than reading docs. **(a)** v61's three Google
MCP presets could never authenticate: their authorization server is
`accounts.google.com`, which advertises **no `registration_endpoint`**, and
Claude Code has no pre-registered client for an arbitrary MCP server, so
Dynamic Client Registration is its only route to a `client_id`. They compound
it by answering unauthenticated `initialize`/`tools/list` with `200` instead of
a `401`, so no OAuth flow is ever triggered and the failure only appears per
tool call. Deleted rather than repaired — they'd need a user-created Google
Cloud OAuth client, which a dropdown preset can't supply. **Any new preset must
be DCR-checked first**; the two-curl recipe is in `lib/mcp-presets.ts` and a
test now fails on any re-added `*.googleapis.com` entry. **(b)** The Connect
page offered `gog auth setup` as *the* Google command, wrapped in "complete the
Google sign-in" — but that command is a **guide printer**: bare, it emits
`status: guided`, `credentials_saved: false` and exits having done nothing.
Every not-connected state returned it, so users ran it, nothing happened, and
no further step was shown. Now split into three stages
(`install`/`client`/`account`) off `credentials_exists`, a boolean the code
already parsed and discarded — it's file-backed and flips independently of
`email`, which reads back from the OS keyring (measured against a disposable
`gog --home`), making it the only reliable way to tell "no OAuth client yet"
from "client stored, needs authorizing." The irreducible part is Google's, not
this app's: an OAuth client can only be created by a human in the Cloud console
(no API exists), so the card links all six console pages, says what to click on
each, and ends with one command that stores the download and runs the browser
sign-in. `--open-console` and the gcloud-assisted `--create-project
--enable-apis` path were both measured and rejected for this audience — the
first refuses without gcloud, the second trades console clicks for a ~500MB SDK
install plus a second browser sign-in. Scopes narrowed to `gmail,calendar`
(what `check-inbox`/`triage-email` actually call), which dry-run-verified as
dropping the must-enable APIs from six to exactly the two the card links;
`GOOGLE_SURFACE` lost its Drive/Chat marks to stay honest. **Standing rule this
establishes:** before putting any third-party CLI command on screen as the
thing that completes a step, dry-run it (`--dry-run --json --no-input` here) and
confirm it *acts* — `gog auth setup` looked like an action and was a no-op, and
nothing in the app's own tests could have caught that.

v65 removed the `.claude` requirement from company registration, leaving `.git`
as the only structural check. It was a proxy for "is this an Alacrán company"
that never tested that: `.claude` is a Claude-Code adapter artifact, not the
portable core (v17), so a real company can lack one — `email-pipeline-agent` is
exactly that shape — while any unrelated repo with one passed. Nothing
downstream needs it (`genericCommandSetSkillAdapter` returns empty when absent;
Open in Terminal / Get Started just run the executor in the root), so deleting
the one check at the shared chokepoint fixed all four callers of
`registerCompanyImpl`. `restoreCompanyImpl`'s matching claim was corrected
rather than preserved behind a flag — a clone producing no git repo is still
rejected, but one without `.claude` now restores.
**Two things worth not re-deriving**, both found while importing the
`~/AI-Native/` companies: (1) **registration already grants the full feature
set** — `getEffectiveAgents` maps every registered company to
`kind: "command-set"` unconditionally, and that single flag gates Get Started,
Open in Terminal, Connect tools, Backup, Ownership, the executor/Google
pickers and the guide. There is no app-created privilege; v17's create flow
ends by calling the same `registerCompanyImpl`. (2) **dev and production keep
separate registries by design** (`data-dir.ts`): `next dev` writes the repo's
`.data/`, production writes `~/Library/Application Support/Alacrán/`, because
the packaged launcher `cd`s into the bundle and an update replaces it
wholesale. A company registered in dev is therefore invisible in the installed
app, and the failure looks exactly like a broken registration — it is not.
**Relocating a built-in's directory is a non-solution** and was rejected: card
features come from the hardcoded `kind` in `builtin-agents.ts`, not from
location, so a move changes nothing visible while breaking the live launchd job
(absolute `.../email-pipeline-agent/logs/poll.{out,err}.log`) and un-loading both
built-ins, which are existence-gated on that exact path. Registering such a
directory *alongside* its built-in card is the supported way to get company
features — nothing dedupes by rootPath, so both cards show, which is the
intended outcome here (the built-in card keeps Run now / Stop / the schedule
toggle, which a command-set card does not have).

v66 added a fourth `AgentKind`, `external` — a folder the user already works in
that follows none of this app's conventions, added via a checkbox on "Add a
company" and given exactly one action, **Open in Terminal**. Before it, the only
outcomes were "full command-set company" or "not registered", so v65's relaxed
rules meant an unrelated project got the whole company surface, including a
"Set up your company" button that writes `definitions/ontology/company.yaml`
into it. `RegisteredCompany.kind?: "external"` is optional (absent =
command-set, so no migration), `.git` is skipped **only** for this kind, and
the create-from-template branch is skipped when it's ticked.
**The pattern to preserve:** every other flag in `app/page.tsx` stays keyed to
`isCommandSet` and only `showOpenTerminalButton` ORs in `isExternal`, so a new
company feature is off for external folders by default instead of needing to be
excluded one at a time. Get Started deliberately did NOT follow — it delegates
*through* `openInteractiveTerminalImpl`, so relaxing that shared guard could
have leaked it; the `-with-help` wrapper keeps its own `command-set` check with
a test pinning it.
**Two traps found here, both general:** (1) `build-network-map`'s last branch is
a *fall-through*, not an exhaustive `Record`, so `tsc` cannot catch a new kind
silently acquiring github/google/notion edges — any future `AgentKind` must be
checked against that file by hand (`KIND_BADGE_CLASS` is a real
`Record<AgentKind, string>` and does fail at `tsc`, which is the contrast).
(2) **Scope every automated-test selector to the dialog under test.** A
page-wide `document.querySelector('input[type="checkbox"]')` during this
slice's live pass hit the Google-accounts picker on a card *behind* the open
Sheet; it auto-saves, so it wrote and committed a real file into `plh-triage`.
Caught, reported and reset immediately — but a page-wide selector in this app
can reach live controls that write to real repos on change, and unlike a
Playwright strict-mode locator it will never error on ambiguity.
