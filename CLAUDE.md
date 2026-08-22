# AI-Native Control Panel — project guide

Local Next.js 15 / React 19 / Tailwind v4 dashboard for managing AI
"companies." As of v23 it is a **product-shaped** app: a fresh install
starts empty and onboards the user to create their first company. The 2
example agents (`ai-company-starter-main`, `plh-ops`) are no longer
hardcoded — they load as **existence-gated built-ins** (`lib/builtin-agents.ts`): present only if their
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

- The 2 built-in agents (`ai-company-starter-main`, `plh-ops`) are
  hardcoded local paths in `lib/config.ts`. A third, an email-polling
  daemon, was removed in v68 — see "Current state" below.
- "Add a company" can now do two things (v17): **register** an
  already-existing local directory (has `.git` + `.claude`, v11's
  original flow, unchanged), or **create** one from scratch when the
  typed path doesn't exist yet — scaffolding a manifest of generic paths
  from `ai-company-starter-main`, `git init`-ing it, then registering it.
- Still missing (named as roadmap, not built): a general plugin/workflow
  packaging format — see "Roadmap" below.

**Who this is actually for, decided 2026-08-14.** The audience is the
maintainer's AI-native bootcamp members, who are **not technically
comfortable**. That makes "read/manage dashboard for tools you already set up
via the terminal" the wrong shape, and it is now a stated goal to leave it:
**the app should cover the technical part itself.** Concretely — bundle Node,
install and sign in to Claude Code from a button, hide every terminal-literate
surface behind an Advanced toggle, and make the first win a diff the user
approves rather than a terminal that opens. The ordered plan is
`docs/superpowers/specs/2026-08-14-non-technical-path-design.md`; the summary
is in "Roadmap" below. Until that ships, this section still describes the app
truthfully.

**Binding consequence for every slice from here:** a new user-facing feature
defaults to **hidden for the simple mode** and opts in to Advanced, never the
reverse — the same "keyed to `isCommandSet`, OR in one flag" discipline v66
established, applied to audience instead of agent kind.

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
  in `lib/config.ts` for the 2 built-ins, generalized via
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

**Never write to, commit in, or otherwise mutate any real repo under
`~/AI-Native/` directly — including `~/AI-Native/plh-ops` — for any test
or verification purpose.** This rule exists because of a real
production-content-corruption incident early in this project's history.
If a new feature's live test would need to touch one of those repos
specifically, stop and ask the user how to verify instead of improvising
a workaround. (v68 removed the app's only write path into the
email-daemon repo, but the rule stands for every other one.)

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

   **Both halves of that last sentence turned out to be wrong in v69.**
   (a) CI's publish step is broken: `package-linux.yml`'s final step needs a
   repo secret `RELEASES_REPO_TOKEN` (a PAT with write access to
   `alacran-releases` — the default `GITHUB_TOKEN` is scoped to the repo the
   workflow runs in), and that secret is **not set** (`gh secret list --repo
   kwakuoseikwakye/alacran` is empty). The v0.13.1 run built a perfectly good
   `.deb`, then died on `gh: To use GitHub CLI in a GitHub Actions workflow,
   set the GH_TOKEN environment variable` (exit 4). The workflow has no
   `upload-artifact` step, so a failed publish **loses the build entirely**.
   (b) There IS a local Linux route — Docker. This is what actually shipped
   v0.13.1's `.deb`:

       docker run --rm -v "$PWD":/src -w /work node:24-bookworm bash -c '
         cp -r /src/. /work/; rm -rf /work/node_modules /work/.next /work/dist
         cd /work && npm install && bash scripts/package-linux.sh
         mkdir -p /src/dist && cp /work/dist/*.deb /src/dist/'

   `npm install`, not `npm ci` (the same lockfile drift CI documents). The
   script's own headless self-test runs inside the container, so the `.deb`
   is boot-tested on real Debian before it ships. One transient failure to
   expect: `next/font/google` fetches at build time, and a flaky fetch fails
   the whole build with a webpack error — just re-run it.
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
   didn't exist at all, despite this line claiming it did.) **v69 generalizes
   this to all three assets: never publish a release that is missing one.**
   `DEB_ASSET_URL`, `MAC_ASSET_URL` and both landing-page download buttons all
   resolve against `releases/latest/download/...`, so a release carrying only
   some of them silently breaks the *other* platform the moment it becomes
   latest — the Linux updater reports "Couldn't download the update. Check
   your connection and try again", which is a lie. If one platform's artifact
   can't be built, publish nothing and say so. Note GitHub stores the macOS
   `.dmg` unaccented (`Alacran.dmg`), which is what every link expects.

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

**Shipped: v1–v69** (see `CHANGELOG.md` for the full per-slice changelog —
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
the installing company's own repo instead of the upstream shared one (the
originals hardcode an owner/repo slug and per-teammate folder names), and
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

**This whole daemon surface was removed from the app in v68** — the card,
the poll trigger, the schedule toggle, the launchd helpers and the
built-in itself. Everything above is kept as the record of what was built
and what was measured about `launchctl`'s exit codes, not as a
description of code that still exists. The daemon repo itself is
untouched on disk and still runs on its own; this app simply no longer
knows about it.

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

v68 removed the email-polling daemon surface entirely — the built-in, its
card, the poll trigger (v2), v31's schedule toggle, the launchd/poll-lock
helpers, and 6 test files. The app now loads **2** existence-gated built-ins.
**The finding to reuse:** a real mailbox was printed on screen from **two**
unrelated places — `getIntegrationStatus` (the card) and `buildNetworkMap`'s
`readPipelineEmail` (the Network tab's Google edge) — and only grepping for the
*symbol* rather than the feature surfaced the second. Fixing the one you were
told about would have left the other live. **A bug caught in the same pass:**
removing the `pipeline` early-return made that kind fall through to the
company branch and silently acquire github/google/notion/executor edges —
exactly what v66's note warns about, since that branch is a fall-through and
not an exhaustive `Record`. `pipeline` is now listed in the isolated-node
guard; the kind itself was kept because ~15 unrelated tests use it as a
fixture.

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

v69 added **freee** (Japanese accounting/HR/invoicing/payroll/e-signature) to
v61's per-company MCP connector presets — one entry in `MCP_PRESETS`, no new
mechanism. It shipped as one line because it passed v64's standing gate first:
unauthenticated `POST https://mcp.freee.co.jp/mcp` returns a real **401 with
`WWW-Authenticate`** (the exact thing the deleted Google presets never did —
they answered 200 with a tool list, so no OAuth flow ever started), and its
authorization server is its own origin advertising
`registration_endpoint: https://mcp.freee.co.jp/register`, so Claude Code can
complete DCR. **freee's local stdio server (`npx freee-mcp`) was deliberately
not used** — `isSafeServerUrl` is https-only by design, because a stdio server
means a user-supplied command line, the one input needing real command
validation; `claude mcp add` still covers it. No new tests: the preset
assertions are loops over `MCP_PRESETS`, so any addition is already covered.
README's connector line was corrected in passing — it still named "a Google
MCP server", deleted back in v64.

v70 fixed a user-reported bug: after connecting Google, macOS kept popping "gog
wants to use your confidential information stored in 'gogcli' in your keychain",
especially on every Re-check. **The prompt is gog's, not ours, and is
unfixable here** — Homebrew ships `gog` ad-hoc/linker-signed, so its code hash
changes every release and a Keychain ACL binds to the writing process's
Designated Requirement, so "Always Allow" stops matching after any gog update
(openclaw/gogcli#569, closed without a fix). What *was* this app's bug is the
frequency: every page is `force-dynamic`, so the keyring-reading `gog auth *`
probes re-ran on every render of Agents/Connect/Network/Ownership plus
OnboardingWelcome's refresh-on-focus, and `googleStatus` ran `auth status` **and**
`auth list` — which read **different** Keychain items, so a connected user was
asked twice per render for what one call answers. Now `auth list` runs first and
returns on its own when it finds an account (`auth status` only when there is
none, which is exactly when its `credentials_exists` discriminator from v64 is
what's being asked), and new `lib/exec-memo.ts` memoizes these read-only probes
for 5 minutes, keyed on command+args, installed as the *default* `execFn` of
`connect-status-impl.ts` and `google-accounts.ts` so every caller is covered at
once and every DI test is untouched. Failures are never cached. Measured against
a real build with a logging shim in front of the real `gog`: **15 spawns → 3**
over the same 9 page loads; 5 plain reloads spawn 0; one Re-check spawns exactly
1. **Two things not to re-derive:** (1) the memo is **per-route, not
per-process** — Next bundles the server module separately per route, which is
why "after" is 3 and not 1; (2) `gog auth list -j` returns the same accounts and
scopes under a disposable `--home`, so gog's account list lives in the Keychain,
not on disk — there is no file-backed way to answer "is Google connected", which
is why the fix is caching rather than avoidance. **Standing rule this reinforces
(v64's, from the other direction):** a `force-dynamic` page calling a third-party
CLI calls it on *every render* — before adding one to a page, ask what it costs
when it runs 50 times an hour, because here the cost was a GUI dialog, not CPU.


**v71 (2026-08-14) shipped the first slice of the non-technical path** — the
app now covers the technical part instead of detecting it and instructing.
Node is bundled into the macOS build (pinned, checksum-verified against
nodejs.org, launcher prefers it unconditionally; proven with `PATH=/usr/bin:/bin`
and no system node). Claude Code, `gh` and `gogcli` install from a button —
at most ONE verified command each, then the tool is read back from the OS
rather than the exit code trusted (v31's rule). **No command was invented for
Antigravity**, per v64. Claude Code is the **repair fallback, not the
installer**: reached only from a button after a failure the user saw, scoped
with `--allowedTools` + `--permission-mode manual`, never
`--dangerously-skip-permissions`, `sudo` absent from the allowlist AND
forbidden in the prompt, and success re-probed from the machine rather than
read from the transcript. `claude auth status` now gives real signed-in state,
deleting the false claim that it "can't be detected without spawning the CLI."
**Google's six console pages are driven by `claude --chrome`**, correcting
v64's over-read: no API exists for creating an OAuth client (still true), but a
browser agent routes around it, and `gog auth setup --credentials <file>
--services gmail,calendar --login` makes the agent's deliverable ONE verifiable
artifact. Chrome's presence is checked for real before any spawn; which account
it is signed in as is not checkable, so it gets a confirmation plus a button
that opens the account page in Chrome specifically. **Advanced mode is off by
default**, hiding the Network map, MCP, Open in Terminal, the three non-default
executors, Notion and the path field; Get Started now runs an `orientation`
command through the existing run→diff→approve machinery instead of opening a
terminal. **Three paths are built but never really run** — the browser agent,
the repair agent, and `orientation` — all deliberately left for the maintainer,
per the standing rule about unattended real spawns. The one load-bearing
unverified assumption is that `claude --chrome "<prompt>"` engages the Chrome
integration in an interactive session.

**Standing constraint added here:** `daily-team-log` is the maintainer's own
workflow. It reaches the UI only through the existence-gated `plh-ops` built-in
and must never arrive in a user's company by scaffolding — pinned by a test in
`lib/company-template-manifest.test.ts`. Note the gate protects public
*installs*, not a company folder handed to someone by hand: on the maintainer's
machine the button installs it INTO a target repo and commits there.


**v72 (2026-08-14) followed v71 within hours, from real use.** Google services
are now a user-chosen set (`lib/google-services.ts` — one catalog read by the
picker, the `gog auth add --services` command, and the console pages the
browser agent enables; consent FAILS for a service whose API was never
enabled, so those two lists must be the same list). **The card's marks are
derived from the scopes `gog auth list -j` really reports**, retiring v64's
"keep the marks in sync" rule by not keeping two lists — and note gog's scope
names are not its service ids (Docs is `.../auth/documents`, Sheets is
`.../auth/spreadsheets`), measured on a real store. **Standing rule added:
simple mode must never hide something already in use.** v71 hid MCP, Notion,
Aider and Antigravity by default and a real user reported them as "removed";
worse, hiding the card also removed the only control that could change it
back. Now: hidden until real, then always shown (executor card when a company
is assigned to it, Notion card when a company has it configured, MCP button
when a company has servers). Open in Terminal and Network stay purely
advanced — neither is state you can be mid-way through depending on.


**v73 (2026-08-14) rebuilt the Skills page as a two-pane file explorer**
(companies and their files left, selected file right, kinds as sub-groups,
search, collapsible companies) and repaired a **dead palette**: that page used
five tokens that stopped existing when the palette changed — `bg-shell`,
`bg-shell-2`, `border-line`, `text-bone`, `text-dune` — so the classes resolved
to nothing (transparent panels; a bare `border` falling back to `currentColor`).
**The finding to reuse:** grepping for the dead tokens rather than fixing the
reported page found the same palette live in `activity-board.tsx` and
`activity-day-group.tsx` — same shape as v68. `glass-edge` IS real; don't
"fix" it. When touching a page that looks broken rather than merely ugly,
check its classes against the tokens actually defined in `app/globals.css`
before redesigning anything.

**v74 (2026-08-16) closed the door v72 left shut.** The service picker only
existed on the paths that run when Google is *not* connected, so anyone who
connected before it shipped was stuck with gmail+calendar and no way to widen
it. One control (`ConnectGoogleApps`) now serves both jobs, because
`gog auth add <email> --services …` is the same command for a stored account
(re-authorize wider) and a new one (first authorize). **The rule to keep:
re-authorizing with a narrower `--services` list silently drops scopes**, so
the command is built from the union, the agent prompt says so explicitly, and
already-granted checkboxes are checked *and disabled*. Whether a run is
first-time setup or "add more apps" is read off the machine
(`listGoogleAccounts`, memoized per v70) rather than trusted from the client —
which also yields the granted set for free. **The bug to not repeat:**
`grantedServices` is a union across accounts and is wrong for any per-account
control; `accountServices` carries the per-account map for that. Card title is
now plain "Google" — naming two services in a title over a card showing seven
marks was the same "the card lies" failure v64 and v72 each fixed once.

**v75 (2026-08-16) fixed four review findings in v74's own Google flow**, all
shipped in the published v0.17.0 and all one shape: v74's safety argument
(always send the union, never a narrower `--services`) holds only where the app
knows what an account carries, and four paths reached the picker without
knowing. **Rules worth keeping:** (1) *absent* `accountServices` means
**unknown**, never none — the `gog auth status` fallback genuinely cannot read
scopes, and any consumer that treats missing as empty will offer a
scope-revoking command; (2) never pass a module's raw `execFn` into
`listGoogleAccounts` — the v70 memo lives on its own default, and this module's
exec is shared with `openChromeAccountCheckImpl`, which must NOT be memoized
(a second click would no-op), so the account read needs its own seam; (3)
`serviceListArg` substitutes the defaults for an empty list, so it must never
be used to compare two service sets — compare ids; (4) the server matches
addresses case-insensitively, so every client lookup must too. **The
test-hygiene lesson was the sharper one:** giving that read a real default made
an existing test read the developer's own gog store — green on CI, red here,
plus a Keychain prompt. Every `setupGoogleImpl` test now injects an explicit
account reader. Also: the install-repair agent is bounded with
`--max-budget-usd` (real on the installed CLI; `--max-turns` is not), and
`KeychainNote` renders at every not-connected Google stage including `install`.
**Left open:** a spend cap is not a wall-clock cap, and the existing 15-minute
`execFile` timeout should already have made the reported one-hour run
impossible — most likely `promisify(execFile)` never settling while a
grandchild holds the stdio pipes. Own slice.

**v76 (2026-08-17) put real marketing expertise in the marketing starter pack** —
ten skills vendored from `coreyhaines31/marketingskills` (MIT) at a pinned tag,
into `templates/packs/marketing/.claude/skills/`. **No application code
changed:** a pack overlay is copied with a recursive `cp` rather than through
`TEMPLATE_MANIFEST`, and `genericCommandSetSkillAdapter` has scanned
`<company>/.claude/skills/*/SKILL.md` since v11, so third-party skills reach a
new company as files alone. `scripts/sync-marketing-skills.sh` is the entire
update mechanism — bump `TAG`, rerun, review the diff; it wipes and rewrites,
so an upstream rename or deletion propagates, and it exits non-zero when a
curated id has no `SKILL.md` at the pin. **Rules this sets for any future
vendoring:** ship the upstream license and tag beside the files
(`UPSTREAM.md`) — v37/v67 exist because provenance wasn't papered; strip the
upstream repo's own test fixtures (`evals/`); and keep the pack an overlay,
which is why it's ten skills and not all 49. **Not wired to
`definitions/ontology/company.yaml`** despite the overlap: the
`product-marketing` skill's own job is to write the context file the others
read, so a translation layer would sit between two things that already work.
The template runs at scaffold time only — companies created before this get
nothing, and re-syncing an existing one isn't built.

**v77 (2026-08-17) made template updates reach companies that already exist** —
an "Update skills" button that applies newer vendored skills in place, closing
the limitation v76 shipped with. **The rule this establishes, and the reason it
was a slice and not a project: sync only what the app owns.** Vendored content
is stamped (`UPSTREAM.md`, `Tag:`) and replaced wholesale, so updating is a copy
and no merge policy has to exist; anything a user edits (ontology, notes, their
own skills) is never touched. Content you want existing users to receive ships
inside a stamped, app-owned folder — updating a file a user may have customized
is a different feature (diff-and-approve) and must not be folded into this one.
**Detection must work for companies that predate the content**, which have no
stamp to compare: nothing records which pack a company came from, so
`lib/vendored-skills.ts` matches it by a command only that pack ships and treats
"no stamp" as behind. **Replace entries one by one, never the containing
directory** — the user's own skills and `daily-team-log` (v20) live in
`.claude/skills` too, which also means a skill dropped upstream lingers rather
than being deleted (the safe direction). `commitFile` now takes
`string | string[]` so the commit is pathspec-scoped to exactly what was
written; a failed commit does not fail the update (v61's call).
**The v66 trap was closed by construction, not by aim:** no repo under
`~/AI-Native/` has the marker command, verified before the live pass, so the
button cannot render on a real company's card at all.
**Two defects an adversarial review caught here, both green under the first test
suite, and the rule that covers both:** a stamp is a claim about what is
installed, so write it ONLY when the claim is completely true — last, and never
over a partial result. (a) Replacing every bundled entry name deleted a
hand-written skill that happened to share one, and for unstamped companies —
this feature's whole population — nothing in `.claude/skills` is app-owned;
the test that passed used a deliberately non-colliding name. An existing entry
is now replaced only when a stamp proves the app installed the set, else it is
skipped and named back to the user. (b) `readdir` returns `UPSTREAM.md` first,
so a mid-copy throw stamped the new tag over old skills, and since the button
compares only the tag it then vanished and stranded the company.

**v78 (2026-08-17) applied a repo-wide over-engineering audit** — net -479 lines,
one dependency (`clsx`) gone, no feature removed, and `eslint` clean for the
first time (it also fixed 5 pre-existing warnings). Biggest: -169 lines of dead
`landing/styles.css` left by the cinematic rewrite, the orphan `landing/pricing`
page, `scripts/jp-audit.py` (its migration ended in v67), the `ScrollArea`
wrapper whose two consumers wanted only `overflow-y-auto`, six copies of one
`pathExists` helper, and the unreachable `needs-attention` activity branch.
**The dead-CSS rule to reuse:** a compound or descendant selector part matches
only if EVERY class in it appears in the markup, so one dead ancestor kills the
rule — the weaker "all classes dead" test leaves half the family behind. Verify
by rule-count-per-class against the baseline, then probe computed styles in a
browser; both were needed here.
**Three findings were rejected and should stay rejected:** `checkDependencies`
is not derivable from `ConnectStatus` (`ToolStatus` has no `installed` field, so
cutting it means adding one); `AgentCard`'s nine `show*` props ARE v66's
default-off safety property; and the `"use server"`/`-impl.ts` pairing earns its
keep, since 32 of 32 impls have their own test file.
**Process:** a verifier agent left a stray `lib/zz-collision-probe.test.ts`
behind during v77's review and it inflated that slice's reported test count —
check `git status` for agent leftovers before trusting a number.

**v79 (2026-08-17) added 12 HR skills to the HR & People pack** (tuanductran/hr-skills,
MIT, pinned v1.4.0) and turned `sync-marketing-skills.sh` into
`scripts/sync-vendored-skills.sh` — a table of packs, run with no args for all
or a pack name for one. **This is the proof v77's mechanism generalizes: adding
a pack is one entry in `VENDORED_SKILL_PACKS` plus one case block, and nothing
else in the app changes.** Two rules this run establishes: (1) **never let a
sync-script rewrite move an existing pack's `Tag:` line** — regenerating
marketing changed only its stamp's title and script name, because the tag is
what the staleness check compares and touching it would offer every existing
company an update that changes nothing; (2) **marker commands must be unique
across packs**, or one pack's skills land in another's companies — a test pins
it, alongside a test that each pack really ships its own marker. Pack tests now
iterate `VENDORED_SKILL_PACKS`, so listing a pack is what earns it coverage.
Bash 3.2 traps met here: `"${@:-$LIST}"` collapses to one word (use
`[ $# -eq 0 ] && set -- $LIST`), and prefer one `EXIT` trap over per-function
`RETURN` traps.

**v80 (2026-08-18) added 10 stack-agnostic engineering skills** to the Software
engineering pack (Jeffallan/claude-skills, MIT, pinned v0.4.16). **Cost of a
third pack: one case block in the sync script and one entry in
`VENDORED_SKILL_PACKS` — zero new tests, because v79's `describe.each` covers
whatever is listed.** Two judgments to keep: (1) upstream's ~57 language,
framework and vendor specialists (`rust-engineer`, `shopify-expert`) are
deliberately NOT in the default set — each serves one company, so the vendored
set stays stack-agnostic and maps onto the pack's own commands; a company adds an
id to the script for its stack. (2) A marker command must be checked against the
BASE template as well as the other packs — a name `templates/company-starter`
ships would match every company on the machine, not one pack's.

**v81 (2026-08-18) made vendored skills app-managed and read-only in the app** —
the maintainer ships skill updates, so the app must not accept an edit it will
overwrite on the next update. **Where the gate goes:** `resolveKnownSkillPath` is
the shared membership check for skill READS and WRITES both, so the rule lives in
a `resolveWritableSkillPath` wrapper used by the one writer
(`saveSkillContentImpl`); gating the shared function itself would have blocked
reading the content and history of a managed skill, which must keep working. Any
new writer should reach for the writable variant — that is why it is named that
way, and tests pin the read paths. **Ownership is v77's rule reused, not a second
one:** app-managed means under `.claude/skills/<name>/`, company carries a stamp,
and the marker-matched pack ships that `<name>`. The stamp requirement is what
keeps a pre-v76 company's same-named files theirs. The UI hides the Edit tab for
managed skills (computed server-side on the Skills page) instead of failing after
the user types. **v77's skip-on-collision logic stays** — Open in Terminal still
gives full file access, so a hand-written collision is still possible and must
never be overwritten.

**v82 (2026-08-18) added a `customer-support` skill to the Customer support pack**,
vendored from `wshobson/agents` (MIT) rather than the aggregator it was requested
from. **The rule this hardens: check the licence before vendoring, and trace a
copy to its origin rather than refusing outright.** The requested repo
(`eduard22222222/claude-skill-stack`) has NO licence anywhere, so redistributing
it in this public MIT repo and in every shipped binary would repeat the v37/v67
mistake; a code search for the skill's first line found 599 copies and one
MIT-licensed origin, which is what shipped. Signals that a source is a scrape and
not an origin: frontmatter like `source: community` / `risk: unknown`, no tags or
releases, and references to files that do not exist in the repo.
**Two mechanism generalisations came with it:** a pin may be a commit SHA when
upstream publishes no tags (archive URL differs: `archive/<sha>.tar.gz`, and the
UI shortens a SHA to 7 chars), and a pack may vendor loose `.md` files via `SRC`
/ `SRC_FILES` instead of `skills/<id>/SKILL.md`. Existing packs keep the defaults
and must regenerate byte-identical — resync all packs and diff before committing.

**v83 (2026-08-18) fixed a packaging break that silently half-built every company
created in v0.19.0-v0.22.0** — pack overlay copied, base skeleton missing, and
`{ ok: true }` returned. **Three rules from it.** (1) `cp -R src dst` NESTS when
dst exists: v77's literal `path.join(process.cwd(), "templates", "packs")` made
Next's file tracing copy `templates/` into `.next/standalone`, so the packaging
scripts' `cp -R templates "$PAYLOAD/templates"` started nesting and hid
`company-starter` from the read path. Copy CONTENTS (`templates/.`) into an
explicit `mkdir -p`'d directory. (2) **A skip-if-missing loop turns a packaging
slip into silent data loss** — `copyManifestEntry` skipping absent entries is
right per-file and wrong for the whole root, so
`createCompanyFromTemplateImpl` now refuses when the template root is absent.
(3) **Write payload assertions as `if ... fi`, never `[ -d x ] && { exit 1; }`** —
under `set -euo pipefail` the `&&` form aborts the build on the happy path. Both
package scripts now assert `templates/company-starter` exists and
`templates/templates` does not.
**And a standing tooling warning:** `grep` in this shell wraps
`ugrep --ignore-files` and silently skips `*.test.ts`, so every dead-code claim
must use `/usr/bin/grep` — v78's audit and a wrong "unused" call on
`GOOGLE_SETUP_SERVICES` both came from this.

**v84 (2026-08-18) gave scheduled, unattended runs to the app that only ever
ran on a click** — any command whose fields are all optional (`orientation`,
`digest`, `handoff`, `check-inbox`, `check-notion`, `triage-email`) can run once
a day at a chosen time. **The security argument is that the scheduler adds
nothing:** it calls `runCompanyCommandImpl` with `{}` and nothing else, so the
allowlist, v56's `untrustedInput` refusal, the run lock and the before-snapshot
are all byte-identical, and `commitCompanyCommandResultImpl` remains the only
committer. **Auto-commit is opt-in per schedule, off by default, and refused in
code for any command with `untrustedInput`** (`check-inbox`, `check-notion`,
`triage-email` always wait for a human) — the allowlist confines where an
injected prompt can write and cannot make what it wrote true, so those are the
results where "nobody looked" IS the risk. Even with it on the agent does not
commit: the app diffs and calls the same `commitCompanyCommandResultImpl` the
approve button calls. **Because the spawn is detached**, auto-commit needed a
completion watcher — each tick sweeps `pendingCommit` records BEFORE firing
anything new (firing first would retake the before-snapshot and bury last
night's result), checks the run lock has dropped, then commits; `pendingCommit`
is also what stops the sweep committing a diff the *user* left unapproved. **The real work was the waiting, not the running:** a
run record already survived its run but nothing could find it again, so an
overnight diff was invisible until you clicked Run, which retakes the `before`
snapshot and destroys it. Fixed with a mount-load in `CompanyCommandRunner`,
`listPendingReviews`, and a dot in the Skills tree and sidebar — plus the bug
that made "pending" meaningless: committing left `.run.json` behind, so an
approved run looked unapproved forever (now deleted after a successful commit,
best-effort). **Rules from the timer itself:** it lives in `instrumentation.ts`
because Next's `register()` runs once per server process and that process is the
only thing outliving a browser tab (so "closed the tab" works and "quit the app"
honestly doesn't); `"HH:MM"` string comparison against `localStamp(now)` means
no date and therefore no DST arithmetic anywhere; `schedules.json` (browser-
written) and `schedules-last-run.json` (ticker-written) are separate files with
one writer each, which removes the race a lock would otherwise be needed for;
`skipDate` stops a schedule saved at 15:00 for 07:00 from firing on Save; and
the stamp is written **whether or not the run started**, because stamping only
successes turns a permanent refusal into a per-minute retry until midnight.
Live-probed with `ALACRAN_DATA_DIR` pointed at a throwaway dir and a company
that doesn't exist — the refusal returns before the `mkdir` and before any
spawn, so the whole path was exercised with no real agent run, per the standing
rule. **The trap worth not repeating, and the reason step 4's live pass exists:**
Next compiles `instrumentation.ts` for the edge runtime too, so a Node-only
import must sit INSIDE a positive `if (process.env.NEXT_RUNTIME === "nodejs")`
block (dead code the edge build drops), not after an early return — the
early-return shape 500s every page in `next dev` while `tsc`, `vitest`,
`eslint` and `next build` all stay green, because minification removes the
unreachable code before webpack can complain. Found by curling a real dev
server, and by nothing else.

**v85 (2026-08-19) rebuilt the Connect page as grouped list rows** — one
bordered container per group (*Your AI*, *Accounts*, *Per company*), one
`<details>` row per tool, setup unfolding only for the row you click. It had
been a two-up card grid with all six tools' full setup expanded at once.
`ConnectRow`/`ConnectGroup` are presentational only and every body is the
previous JSX verbatim, so no connect logic moved. **Two defects the collapse
exposed, both worth generalising:** a row whose body is entirely `!live`
content opens onto an *empty panel* once connected (GitHub did — every row
needs one true thing to say in the connected state), and a status label hidden
to fit a narrow row leaves colour as the only carrier of state
(`sr-only sm:not-sr-only`, not `hidden sm:inline`). Rows are `<details>` rather
than a state-managed accordion, so the toggle, keyboard support and keeping
closed content out of the tab order are native and nothing tracks which row is
open.


**v86 (2026-08-19) made a company's standing context readable by every executor,
and let a company hold more than one starter pack.** `AGENTS.md` is now the
working agreement and `CLAUDE.md` a two-line `@AGENTS.md` pointer — the
template's own §1 rule ("`.claude/` is one adapter for one tool") applied to the
context file itself, which had been under a vendor's filename since v17 and so
auto-loaded for exactly one of the four executors. Existing companies get a
button that moves their own file, edits intact, in one commit.
**The rule this sets: a second copy of the same prose is drift you cannot see** —
scaffolding and backfill both produce the pointer, so a test asserts the constant
is byte-identical to the bundled template.
**Two first-match-wins loops and one shared stamp were what made multi-pack
impossible**, and both would have shipped silently: a company had ONE
`.claude/skills/UPSTREAM.md`, so with two packs each looked stale against the
other's tag and the update button flip-flopped forever; `isAppManagedSkillPath`
returned on the first matching pack, handing a second pack's skills back as
"yours to edit" right before the next update overwrote them. Stamps are per-pack
now (`UPSTREAM-<pack>.md`), the legacy name is read but never written or deleted
so it stays the scaffolding pack's stamp (no migration, and hand-copied files
self-heal), and both loops consider every match. **`markerCommand` is gone:**
`isPackInstalled` derives pack membership from the pack's own command files, so
there is one detector instead of two, and the pinned invariant got stronger —
no command filename may be shared between two packs or with the base template.
**A silent permanent wedge was fixed at the shared function:** `file-lock.ts`
wrote a pid nothing read, so one crash mid-run made a company report "Already
running" forever, schedules included. It now collects a lock whose writer is
gone, records the SERVER's pid (the right proxy — while it lives only its own
handlers touch the lock), and errs toward held on anything ambiguous, because a
wrongly-held lock costs a restart and a wrongly-released one starts a second
agent on a live run.
**v83's grep trap recurred and is worth re-reading:** a repo-wide unused-export
sweep reported ~35 dead exports under this shell's `grep`; several were live in
tests only. `/usr/bin/grep`, always, for any dead-code claim.

**v89 (2026-08-21) grouped the Skills tree by department and gave the agent card
one primary action.** Both were user reports of the same defect — a flat list
where nothing said what mattered. **The pattern to reuse: derive the grouping,
don't store it.** A skill's department comes from `templates/packs/`'s own
`category` field via `lib/skills/departments.ts`, keyed by **path** (frontmatter
`name:` is user-editable, so a rename would silently drop a skill out of its
group) — a `departments.json` would be v86's two-detectors problem again. User
filing overrides it in **localStorage**, the same tier as `reorderable-grid`'s
card order, which is what lets a v81 app-managed skill be refiled without
writing to a file the next update overwrites; an override equal to the derived
value is **deleted, not stored**, or a later pack recategorisation is pinned
forever. Constants shared with the client live in `company-starter-packs.ts`,
since `departments.ts` imports `node:fs`. **On the card:** primary solid first
(setup wizard until there's an ontology, then Get Started — never both),
offers as a chip row, configuration behind a native `<details>` that is
deliberately **uncounted**, because `AdvancedOnly` decides on the client whether
two of its children exist. **Two layout facts:** `.bento-grid`'s item is
`ReorderableGrid`'s draggable wrapper, so equal-height cards need
`.bento-grid > * > .bento-card { height: 100% }`; and `mt-auto` on the action
block was tried and reverted — one card with its More open voids the middle of
every other card, which is the same thing the original `justify-end` body did.

**v90 (2026-08-21) fixed a reported "there is no section to add more Gmail
accounts" that was a labelling bug, not a missing feature.** Adding a second
account has worked since v41 and shares one control with "turn on more apps"
since v74, because `gog auth add <email> --services …` is the same command for
both — but the field arrived pre-filled with the existing account under a
heading about apps, so nothing said the second job existed. **The rule: when
one control does two jobs, the label has to follow the selection, or it only
ever advertises the first.** The address chips became a visible selector with a
dashed "+ Add another account" (which resets the picker to defaults rather than
inheriting the previous account's ticks), and the heading switches on `stored`.
Also deleted the passive `<Badge>` address list — the row's own `detail` already
names them, so three renderings of one list in one panel is what made the
clickable chips read as decoration.

**v91 (2026-08-21) fixed a user-reported "Couldn't save: An error occurred in the
Server Components render" when editing a company.** Root cause: the scaffold template
`templates/company-starter/docs/templates/ontology-starter.yaml` has been **invalid
YAML since f253aa9 (2026-08-12)** — `<<TODO: hint>>` reads as a nested mapping in a
compact mapping, so `yaml@2.9.0` throws. `buildCompanyOntology` PARSES that file (v18:
the customer/org/product domains are copied verbatim), so setup and edit could never
save for any company scaffolded in that window. **Two standing rules.** (1) A
`"use server"` action that is a bare `return impl(...)` turns any impl throw into
Next's redacted production digest — so every reader of a user-editable file must return
`{ok:false, message}`; this was the last unguarded YAML parse, its three siblings all
had the guard. (2) **Fixing a bundled template does not fix companies that already
copied it** — each holds its own copy (three on this machine did). An unparseable
company template now falls back to the app's own, which the v83 packaging assertion
guarantees is present and `adopt-folder.ts` already reads at runtime. **The test lesson
is v56's again:** `build-company-ontology.test.ts` was green the whole time because
every case used a synthetic template string; it now reads the REAL bundled file, and
reverting the fix turns three tests red. Reproduction method worth reusing: run
`ALACRAN_DATA_DIR=<tmp> PORT=<not 3000> npm start` against a disposable /tmp company —
production masks the error in the browser but logs it in full server-side.

**v92 (2026-08-21) applied a repo-wide over-engineering audit: net -56 lines, no
dependency removable.** The only real find was 47 lines of the LANDING page's
terminal-mockup CSS (`.mac-*`, `.terminal-line`) plus `.a-glass` living in
`app/globals.css` — all used solely by `landing/index.html`, which has its own
copies. `.a-glass`'s comment still claimed it was shared with the landing nav; its
one consumer was `components/nav.tsx`, deleted back in v40. **The verification
method is the reusable part:** v78 requires a browser probe for any dead-CSS
claim, and PNG bytes differ on every run here because of the `a-rise` stagger and
the ambient orbs — so capture with `reducedMotion: "reduce"` plus an injected
`animation:none;transition:none`, and diff per pixel. All six routes came back 0
of 1,152,000 pixels changed. **What was rejected should stay rejected** (full list
in the changelog): every prod dependency earns its place, `cn()` cannot be
unwrapped because most consumers are untouchable `components/ui/*`, `SkillAdapter`
has two implementations, the tiny `"use server"` files are real client boundaries,
34/34 `-impl.ts` still have tests, and there are zero exports referenced nowhere.
Un-exporting the 49 file-local symbols saves 0 lines and is v86's false-positive
shape.

**v93 (2026-08-21) stopped the Google setup agent operating the wrong account.**
This machine has three Chrome profiles (personal Gmail, work address, a project
account); `open -a "Google Chrome"` opens the last-used one, the app named none,
and the only guard was a line in the prompt asking the model to notice. **The
finding to keep: "there is no API for which Google account Chrome is signed in
as" was FALSE and had been load-bearing since v71.** There is no web API, but
Chrome writes it to `Local State` as plain JSON beside the profiles —
`lib/chrome-profiles.ts` reads it on both macOS and Linux. `setupGoogleImpl` now
**refuses before spawning** when no profile matches the typed address, naming the
addresses that do exist; a match is passed as `--profile-directory` and named in
the prompt. **Two rules worth reusing:** an unreadable `Local State` is
"can't tell", not "no match", so it falls through to the old behaviour instead of
blocking a working setup; and on macOS `open --args` is silently ignored when the
app is already running, so profile selection must invoke the Chrome binary
directly. **The residual, marked `ponytail:` in the source:** the app cannot force
which window `claude --chrome` attaches to — that is Claude Code's behaviour — so
the profile is named in the prompt too. Restricting to "any browser with the
Claude extension" is not available: `--chrome` is Chrome-only, with no equivalent
flag to select another.

**v94 (2026-08-21) followed v93 after a real agent run failed.** v93 fixed which
Chrome profile the app OPENS; this is which browser the agent ATTACHES to, and
they are different problems. **The finding: the Claude browser extension
registers connections against the CLAUDE ACCOUNT, not the machine** — a Chrome on
another computer signed into the same Claude account is offered as a connectable
browser, and the run attached to a Linux box's Chrome from this Mac. Not
choosable from here. **A wrong hypothesis worth not retrying:** the agent
suggested the extension was missing from the Default profile (extensions are
per-profile); checked directly, `fcoeoabgfenejglbffodgkkbkcdhcgfn` is in BOTH
Default and Profile 2, so an extension pre-flight would have returned a false
green. What the app does now is raise the matching profile's Chrome itself right
before spawning (reusing `openChromeAccountCheckImpl`, not a second opener) and
name the failure mode in the prompt. **Standing answer for "make it work with any
agent":** the browser route cannot be — `--chrome` is Claude Code's own flag with
no equivalent elsewhere, the same shape as v42/v61's MCP finding. The
agent-agnostic route already exists and is rendered for every executor: the six
console links plus one `gog auth setup` command. Only the shortcut is Claude-only,
and no new mechanism was built to pretend otherwise.

**v95 (2026-08-21) stopped treating a new address as a first-time setup.** A
machine with two connected Google accounts, adding a third with Drive ticked, was
handed the whole six-step console job — because `setupGoogleImpl` read
"is this set up" off the TARGET ADDRESS, which for a new address is always empty.
**The rule: the OAuth client and the enabled APIs belong to the PROJECT, not to an
address.** Once any account is connected a client exists; once any account carries
a scope that API is enabled. Derived now from the union across all accounts
(`listGoogleAccounts` + `servicesFromScopes`), giving three cases: nothing
connected → full first-time job; client exists and every ticked service already
enabled → **no console and no AI**, just `gog auth add` in a visible terminal
(which is also the any-executor answer, and skips the Chrome profile gate since
consent opens in the default browser); client exists but an API is missing → the
short job for exactly those pages. **The conflation to not reintroduce:**
`buildGoogleExpandPrompt` used one list for both "which APIs still need enabling"
and "what `--services` to request" — they diverge for a new address on a set-up
machine, and getting it wrong authorizes the new address for scopes another
account happens to hold. A test pins that direction specifically.

**v96 (2026-08-22) fixed a v95 regression: one OAuth client does not serve every
account.** Adding a personal `@gmail.com` to a machine connected to a `@plh.life`
Workspace hit Google's `Error 403: org_internal`. **The rule v95 missed: an OAuth
client belongs to ONE Cloud project, and an Internal consent screen admits only
that Workspace's accounts.** v95 reused the client whenever any account existed,
which for an outside address is a guaranteed 403 — before v95 that case ran the
full console path and would have worked. **gog already models this and the app was
ignoring it:** `auth setup`/`auth add` take `--client=NAME` ("selects stored
credentials + token bucket") and `auth list -j` reports a `client` per account, so
clients coexist with separate credentials and tokens. `GoogleAccount` now carries
`client`; `clientNameForAddress` reuses the client already serving the address's
DOMAIN and otherwise derives a new one (`gmail.com` → `gmail-com`), so a new
project never disturbs the working accounts. Two consequences worth keeping:
"enabled APIs" must be read from the accounts on THAT client, not the machine-wide
union (only meaningful within one project); and a virgin machine still uses gog's
own `default` name, since the first client has nothing to coexist with.

**v97 (2026-08-22) fixed two things a failed setup run exposed.** (1) The mangled
console URLs users reported (`console.cloud.googgoogleapis.com`) were a TERMINAL
artifact, not bad data — a ~4KB prompt passed as one argv token, redrawn over
itself. Generating the prompt proved the links were intact. It now goes to
`google-setup-prompt.md` with a one-line "read this" instruction (the shape
`buildVisibleRunScript` already used), and a test asserts every
`GOOGLE_CONSOLE_STEPS` href survives into the file. **Rule: verify a "corrupted
output" report against the generator before believing it.** (2) The real blocker:
`ConnectGoogleApps` ("Add another account") never rendered the console
walkthrough, so an out-of-org address got only the AI route (which had zero
connected browsers) and a `gog auth add` that can only return
`org_internal`. It now detects the case client-side by domain and renders the
full walkthrough plus the correct `gog auth setup … --client <domain>` command.
**Standing decision: the AI browser shortcut no longer leads on that card.** It
has failed three distinct ways in real use (wrong profile, remote-only browsers,
no browser at all), each costing a session; the console steps need no extension,
no pairing and no particular AI. The card now also states the prerequisite chain
— the extension pairs by CLAUDE ACCOUNT, so the profile needs the extension AND a
claude.ai login matching the account this app runs on — because none of it is
checkable from here.

**v98 (2026-08-23) made the Google browser-agent route reachable instead of
routing around it.** Its prerequisite chain is four links and only two were ever
checked: Chrome installed (v71), a profile signed in as the target address (v93),
**the Claude extension installed in THAT profile** (new — extensions are
per-profile, so `ChromeProfile.hasClaudeExtension` reads
`<profile>/Extensions/fcoeoabgfenejglbffodgkkbkcdhcgfn` and `setupGoogleImpl`
refuses before spawning if it is missing), and **that profile signed in to
claude.ai as the same Claude account this app runs on** — which is what an empty
`list_connected_browsers` actually means. **The rule: the extension pairs by
CLAUDE ACCOUNT, not by machine.** That last link cannot be read locally, but it
can be acted on: the new "Pair the extension" button opens claude.ai/chrome in
the matching profile and names the account from `claude auth status`
(`fundpeck@gmail.com` here). Note link 3 alone would NOT have explained the
reported failure — the extension was already in the right profile — which is why
the pairing step, not the extension check, is the fix. v97's ordering stands: the
console steps still lead, since they need none of this.

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

### The non-technical path (specced 2026-08-14, next up)

Supersedes the "unpicked directions" paragraph above as the next work. Full
spec: `docs/superpowers/specs/2026-08-14-non-technical-path-design.md`. Build
in this order — each item is the laziest shape that works, and later items are
worthless if earlier ones don't ship:

| # | Slice | Item | Why first |
| --- | --- | --- | --- |
| 0.1 | v71 | Bundle `node` into the macOS app | The launcher currently shows an `osascript` alert and quits without it (`scripts/package-macos.sh:134-136`). Gate zero. |
| 0.2 | v71 | Install Claude Code from a button | `https://claude.ai/install.sh` (verified: 302 → `downloads.claude.ai/claude-code-releases/bootstrap.sh`) installs the **native** build, no Node needed. |
| 0.3 | v71 | Sign-in button + real signed-in state | `claude auth login --email <addr>` in a visible Terminal (reuse v35/v38's `open -a Terminal`); `claude auth status` prints JSON with `loggedIn`/`email`/`subscriptionType`. |
| 0.4 | v71 | Install `gh`, `gog` and `agy` as tarballs into `~/.local/bin` | No brew, no sudo (brew's installer prompts for a password, which fails "without human aid"). Pass `--git-protocol https` to `gh auth login` — v54 exists because gh chose `ssh`. |
| 0.5 | v71 | Claude Code as the install **repair fallback**, not the installer | Deterministic one-liner first; on non-zero exit, a "Let the AI fix this" button hands it the stderr with `bashPatterns` scoped to install commands. Never `--dangerously-skip-permissions`, never unattended, never `sudo`. Agent-as-primary was rejected: non-determinism is an unreproducible support ticket for this audience. |
| 0.6 | v75 | **Google set up by a browser-driving agent** (own slice) | Removes the six-console-page wall. `claude --chrome` drives the user's already-signed-in Chrome through `GOOGLE_CONSOLE_STEPS` (which becomes the agent's checklist rather than the user's instructions) to produce **one artifact** — a Desktop OAuth client JSON — then the app runs `gog auth setup <email> --credentials <path> --services gmail,calendar,drive --login` deterministically. Success is `gog auth list -j` returning the account, never the agent's self-report (v31 discipline). |
| 1 | v72 | `advancedMode` localStorage boolean, default off | Hides Network tab, Google/GitHub/Notion cards, MCP button, Open in Terminal, the path field. Google leaves the default path for free. |
| 2.1 | v73 | Default the company path to `~/AI-Native/<slug>` | Last typed technical value in the happy path. |
| 2.2 | v73 | Get Started → a headless job with a diff | **One** new `registry.ts` entry (`orientation`) reusing v46's prompt; flows through the existing run → diff → approve UI with zero new UI. |
| 3 | v74 | Say "Claude Code needs a paid account (~$20/mo)" in onboarding | Cheapest churn fix available. Ten minutes. |
| 4 | later | Windows | ~half a non-technical cohort, and the only expensive item. **Gate it on 0–3 shipping and a real cohort being watched using them.** |

**Three findings from the spec's live probing, so they aren't re-derived:**
(a) `claude auth status` answers "is the user signed in" in one call — the
existing `aiExecutorStatus` comment claiming login state "can't be detected
without spawning the CLI" is wrong and should be deleted, not worked around;
route the call through `lib/exec-memo.ts` per v70. (b) `COMMON_BINS`
(`scripts/package-macos.sh:127`) **already contains `$HOME/.local/bin`**, where
the native installer lands, and PATH lookup happens at exec time — so the
"Fully quit and reopen the Alacrán app itself" guidance is probably already
obsolete; verify against a real install and delete it rather than keeping a
sentence that scares this audience. (c) **v64's "console-only" finding is
about the API, not about automation, and an early draft of this plan
over-read it.** No API exists for creating a Google OAuth client — that
stands. But `claude --chrome` drives the console in the user's own
already-signed-in Chrome, and `gog auth setup` accepts `--credentials
<downloaded JSON> --services gmail,calendar,drive --login` (v0.34.1, flags
verified), so the agent only has to produce **one file** and everything after
is deterministic. This is the substitute for the gcloud path v64 rejected on
cost (~500MB SDK + a second sign-in) — the rejection stands, the conclusion
that the wall was permanent does not. **Scope consequence:** v64 narrowed to
`gmail,calendar` and dropped Drive's mark from `GOOGLE_SURFACE`; if
`--services` includes `drive`, that mark must come back or the card lies in
exactly the way v64 fixed.

**Explicitly out of scope:** removing the Anthropic subscription requirement
(impossible — state it plainly instead), and any hosted/phone-home component,
which the README and SECURITY.md still forbid.

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
