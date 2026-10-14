# Alacrán — contributor guide

This is the working agreement for anyone changing this repository, human or AI
coding agent. `CLAUDE.md` is a pointer to this file; this file is the single
source of truth. Read it before your first change.

## What this is

Alacrán is a local Next.js 15 / React 19 / Tailwind v4 app that gives AI a
durable memory of a business. A user describes their company once; it is
written as plain files in a git repository they own, handed to their own AI
coding agent before each task, and every change the agent proposes returns as a
diff for the user to approve before anything is saved. The server runs on
`127.0.0.1` inside a native desktop window. There is no hosted service,
account, telemetry or phone-home. Do not add any of those without an explicit
decision from the maintainer: the README, SECURITY.md and the landing site make
specific promises about what leaves a user's machine.

- `README.md` is the public front page. `CHANGELOG.md` is the dated record of
  every shipped slice, including the reasoning and rejected alternatives. This
  file holds only the standing conventions and rules.
- The audience is non-technical founders and business owners. A new
  user-facing feature defaults to hidden in the simple mode and opts in to
  Advanced, never the reverse.
- Contributor-facing docs (`README.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, `CHANGELOG.md`) are part of the product. A change that
  makes one of them wrong is not finished.

## Commands

```bash
npm install          # not `npm ci`: the lockfile is generated on macOS and is
                     # missing Linux-only optional subtrees, so `npm ci` fails on Linux
npm run dev          # http://localhost:3000
npx tsc --noEmit     # type check (needs next-env.d.ts, which a Next command generates)
npx vitest run       # or: npm test
npm run lint
npm run build        # production build; also type-checks
bash scripts/package-linux.sh   # build the Debian/Ubuntu .deb
```

If `NODE_ENV=production` is exported in your shell, a bare `npm install` prunes
devDependencies. Use `env -u NODE_ENV npm install --include=dev`.

Before you push: `tsc` clean, tests green, lint clean, build succeeds.

## Established conventions

- **Document every feature**, shipped or not. Add a dated `## vNN: <title>`
  section to `CHANGELOG.md` covering what was investigated, decided and left
  open. This file gets a line only when a slice changed something standing.
- **A user-visible slice also writes its `### What's new for you` block.** That
  block alone is what the in-app What's New modal shows. Plain language for a
  non-technical founder: no file paths, CSS, test counts or `tsc`. The heading
  declares the category (`feature`/`improvement`/`fix`) and the release;
  neither is inferred. `CHANGELOG.md`'s header carries the format and
  `parse-changelog.test.ts` fails the suite on a block written in engineering
  voice.
- **`export const dynamic = "force-dynamic"` on every page.** The app reads live
  filesystem and git state; nothing is safely cacheable.
- **Ship only what has been run end to end.** A code path whose flags were
  verified against `--help` but never exercised against a live account does not
  get registered as a user-selectable option.
- **A per-executor answer belongs in a total type, never a hardcoded list.**
  Answer "per AI executor" questions with a `Record<AiExecutorId, …>` or a
  required (nullable) field on `AiExecutor`, so registering another executor
  fails `tsc` until someone answers for it. Name the agents in the UI, never
  hardcoded config filenames.
- **A security guard outlives the configuration that makes it unreachable.**
  `enforcesToolScope`, `CompanyCommand.untrustedInput`, the refusal in
  `runCompanyCommandImpl` and `bashPatterns` may look dead today. Do not delete
  a guard because nothing currently trips it; pin the invariant with a test
  instead.
- **A command that edits on outside evidence needs the fence; one that only
  lists it may not.** When reusing a prefetch builder, re-ask what the
  *consuming* prompt does with the text. The injection fence belongs to the
  use, not to the source.
- **Adapter-per-agent pattern.** `AGENTS` / `ADAPTERS` / `SKILL_ADAPTERS` in
  `lib/config.ts`, generalised by `lib/get-effective-agents.ts` to merge in
  runtime-registered companies. `lib/config.test.ts` fails if they drift.
- **Dependency injection for OS calls.** Every function that shells out, touches
  the filesystem or reads the clock takes an injectable
  `ExecFn`/`SpawnFn`/`ExecFileFn`/`nowSeconds` with a real default. This is how
  the suite never touches real processes or the real clock.
- **Zero-extra-parameter Server Actions.** Public `"use server"` boundaries take
  only real domain parameters. Injectable seams (`execFn`, `registryPath`, …)
  live only in the paired `-impl.ts` file, never on the public action.
- **Dual-gate write security.** `lib/path-guard.ts` (containment: the resolved
  real path must be inside a known agent's root) and
  `lib/resolve-known-skill.ts` (membership: the path must correspond to an
  actual known skill or command file), used together on every read and write
  path. Treat every Server Action parameter as attacker-controlled.
- **Design tokens.** CSS custom properties in `app/globals.css` (a dark base
  `:root` and one `:root[data-theme="light"]` override). Every `components/ui/*`
  primitive consumes them through Tailwind utilities. **Never edit
  `components/ui/*`** to fix a styling issue; fix the token or the consumer's
  className. The main colour is neutral; the brand red (`--brand`, `--marker`,
  `--focus`) is for the mark, focus rings and "needs you" markers only.
- **Glass in four places only:** the sidebar, the toolbar once content scrolls
  under it, the ask box, and overlays. Never on cards or behind dense text.
  Motion answers something the person did and is off under reduced motion
  (`components/os/motion.ts`).
- **The app never loads a font from `fonts.googleapis.com`** (every launch would
  phone home). Don't name a font in a CSS variable.
- **The logo is generated, not hand-edited.** `scripts/generate-logo.py`
  recolours the source artwork (`landing/scorpion.png`) into the committed
  outputs (`landing/logo.png`, `components/alacran-logo.png`,
  `landing/favicon.png`, `app/icon.png`). Change the script and rerun. The app
  consumes it via a static import plus `next/image` with `unoptimized`. The mark
  is 600x626: always size it by width with `height:auto`.
- **Real product marks only.** Brand logos come from
  `scripts/generate-brand-icons.mjs`, which extracts official Simple Icons (CC0)
  path data into `lib/brand-icons.ts` and `landing/brands.js`. `simple-icons` is
  installed `--no-save` for regeneration only; never add it as a runtime
  dependency. Never hand-draw or approximate a vendor logo; name vendors whose
  marks are unavailable in prose.
- **Single-file-scoped git commits.** `lib/git-commit-file.ts` runs
  `git add -- <file> && git commit -m <msg> -- <file>`, never a bare
  `git commit` that could sweep up unrelated changes.
- Use non-printable `\x1e`/`\x1f` delimiters for git-log parsing.
- **Regression-proof extraction.** When refactoring shared logic out from under
  existing tests, already-shipped test files must keep passing unchanged, with
  at most one clearly justified additive mock line for a genuinely new async
  dependency.
- **Guard any client `useEffect` that triggers a real, non-idempotent side
  effect on mount** (spawning a subprocess, starting a paid API call) against
  React Strict Mode's double invoke, with a `useRef` guard. One unguarded
  component once started two real headless agent runs from a single click.

## Testing rules

- **Never write a test that needs the network, a real subprocess or the real
  clock.** If you think you need one, the seam is missing. New behaviour needs a
  test a reviewer can see fail before the fix and pass after it.
- **A synthetic fixture cannot catch template drift.** Read the real bundled
  template in the test.
- **A test total that does not move is not evidence that coverage did not.**
  Diff the `describe` list, not the count.
- **A defaulted writer added to a function whose tests already pass is silently
  a test that writes to real state.** Inject the seam explicitly.
- **Scope every automated-test selector to the dialog under test.** A page-wide
  `querySelector` once reached a live auto-saving control behind an open Sheet
  and committed a real file into a real repo.
- **Never let an automated pass trigger a real headless agent run to
  completion.** Verify up to "Started", then stop; leave the real end-to-end run
  to a human.
- **Use `/usr/bin/grep` for any dead-code claim.** Some shells alias `grep` to a
  tool that skips `*.test.ts` and bails out of complex patterns, which has
  produced wrong "unused" verdicts.
- **Presence is not capability.** Do the smallest real thing, then believe the
  result. When a shape is wrong, measure the shape. A 401 and a 403 are
  different problems with different fixes.

## Next.js and React rules

- **A `"use server"` action that is a bare `return impl(...)` turns any throw
  into Next's redacted production digest.** Every reader of a user-editable file
  returns `{ ok: false, message }` instead. Audit for bare re-exports.
- **`instrumentation.ts` is compiled for the edge runtime too**, so a Node-only
  import must sit inside a positive `NEXT_RUNTIME === "nodejs"` block, not after
  an early return. The early-return shape 500s every page in `next dev` while
  `tsc`, `vitest`, `eslint` and `next build` all stay green.
- **A `force-dynamic` page calling a third-party CLI calls it on every render.**
  Ask what that costs at 50 renders an hour.
- **Route handlers have no CSRF protection; server actions do.** Every handler
  under `app/api` calls `refuseNonLocal` first: Host pinned to loopback on every
  method, Origin and JSON content-type on writes.
- **Platform and capability detection belongs in an effect.** Reading
  `navigator` during render causes hydration mismatches.
- **A git call made while rendering must pass `--no-optional-locks`.** Plain
  `git status` rewrites `.git/index` and can fail an agent's `git add` in the
  same repo; `components/auto-refresh.tsx` re-renders every page every 15
  seconds. Not yet converted: `lib/os/doctor/checks/connectors.ts`.

## Shell, packaging and the OS

- **`cp -R src dst` nests when `dst` exists.** Copy contents into an explicit
  `mkdir -p`'d directory and assert the payload's shape afterwards.
- **Write payload assertions as `if … fi`, never `[ -d x ] && { exit 1; }`.**
  Under `set -euo pipefail` the `&&` form aborts the build on the happy path.
- **`lsof -ti tcp:PORT` matches client sockets too.** Scope it to
  `-sTCP:LISTEN` or a stale-server sweep kills the user's browser.
- **The macOS bundle is `Alacran.app` (unaccented); the data directory is
  `~/Library/Application Support/Alacrán` (accented).** The asymmetry is
  deliberate; "fixing" either orphans real companies or re-breaks launch.
- **A macOS launch verdict must come from a human double-click or the crash
  logs.** An `open`-launched app from an automated shell exits 0 without
  running.
- Bash 3.2: `"${@:-$LIST}"` collapses to one word; use
  `[ $# -eq 0 ] && set -- $LIST`. Prefer one `EXIT` trap over per-function
  `RETURN` traps.
- The standalone payload (`.next/standalone` + `.next/static` + `templates/`) has
  the same shape on every platform. Linux is deliberately not Electron
  (WebKitGTK window, `scripts/webview-linux.py`); see `docs/native-app.md` and
  `docs/architecture.md`. The macOS Electron shell is maintained outside this
  repository.

## Guards and writes

- **Put the guard at the shared chokepoint, but only on the writing path.**
  `resolveKnownSkillPath` gates reads and writes both, so the read-only rule
  lives in a `resolveWritableSkillPath` wrapper.
- **A realpath guard returns null for a path that does not exist, which is every
  create.** Run it on the parent and validate the name separately. Refuse a name
  containing a separator; never `basename` it.
- **A stamp is a claim about what is installed: write it last, and never over a
  partial result.**
- **A refusal placed before the thing that records progress turns one
  unapproved item into a permanent stop.**
- **Compare resolved real paths, never raw strings**, and shape-validate
  anything that becomes an argv token.
- **Never grant a spawned agent bare `Write` or `--permission-mode
  acceptEdits`.** Only `Edit(<pattern>)` rules are path-matched by Claude Code.
- **Never split a gated action into ungated pieces**, and if you are unsure
  whether a gate fired, it fired.

## Safety rule for live and manual tests

The only sanctioned live-test targets:

1. Freshly created, self-destroyed disposable directories under `/tmp`, for
   company registration and generic-adapter tests. Delete them when done.
2. Read-only actions against any real repo (`git status`, opening a detail
   view, running the existing "Run verify" button).

**Never write to, commit in or otherwise mutate a real company repository for
any test or verification purpose.** This rule exists because of a real
production-content-corruption incident. If a live test would need to touch a
real repo, stop and ask how to verify instead of improvising.

## Slice workflow (in brief)

Work is done one versioned slice at a time, each merged before the next starts:

1. **Brainstorm.** Read the real current state, ask clarifying questions, propose
   2-3 approaches, write a spec to
   `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
2. **Plan.** Turn the approved spec into a bite-sized task list at
   `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`, with Global Constraints (what
   not to touch) up front. Both directories are gitignored: they are local
   working documents.
3. **Implement.** One task at a time, read before edit, `tsc` and `vitest` after
   every step, one commit per task. Use a git worktree per slice.
4. **Verify for real.** `npx tsc --noEmit`, `npx vitest run`, `npm run build`,
   then a live pass against a throwaway dev server on a free port, covering the
   golden path.
5. **Finish.** Verify tests on the target branch, merge, remove the worktree.
6. **Document.** Append the `CHANGELOG.md` section and check that `README.md`
   still tells the truth.

## Releases

Merging to `master` does not ship anything. Installed copies learn of an update
only from a newly published release on the public releases repository, and
`package.json`'s version is the only source of `APP_VERSION`
(`lib/app-version.ts`), the number the update checker compares against. Releases
and version bumps are handled by the maintainer.
Never publish a release that is missing one platform's assets: the download
links and the Linux updater resolve against `releases/latest/download/...`, and
a partial release silently breaks the platform that is missing.
