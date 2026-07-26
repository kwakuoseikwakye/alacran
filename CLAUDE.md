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

## What this app actually is (and isn't) today

This is a **read/manage dashboard for tools you already set up via the
terminal** — it is not yet a self-service "download and configure your
AI-Native instance through the UI" product. Concretely:

- The 3 built-in agents (`plh-takeshi-agent`, `ai-company-starter-main`,
  `plh-ops`) are hardcoded local paths in `lib/config.ts`.
- "Add a company" (v11) only **registers** an already-existing local
  directory that already has both `.git` and `.claude` — it does not
  scaffold, clone, or `git init` anything. This was a deliberate v11
  scope decision (see `docs/superpowers/specs/2026-07-23-control-panel-v11-company-registry-design.md`),
  not an oversight: at the time, `ai-company-starter-main`'s local clone
  had no `git remote` configured, so there was no way to discover which
  GitHub template to clone from the filesystem alone.
- **v17 (in progress, see "Current work" below)** is scoping exactly the
  missing piece: a real "create a new company from a template" flow
  through the UI, so a user can go from nothing to a registered company
  without leaving the dashboard.

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
   (200/session) has been hit twice (during v14, and confirmed still
   blocking on a fresh attempt during v16)** — when that happens, every
   task is instead implemented directly (read-before-edit, `tsc`/`vitest`
   after every step, one commit per task, self-reviewed whole-branch diff
   in place of a dispatched reviewer). A *new* session gets a fresh cap.
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

**Shipped: v1–v16** (see `README.md` for the full per-slice changelog).
The 3-slice visual/UX pass (v14: design system/nav/Agents page; v15:
Activity page restructure; v16: Skills page/dialogs/responsive audit) is
complete and merged to `master`.

## Current work: v17 — create-a-company-from-template

**Status: scoping (brainstorming in progress as of this writing).**

**Problem:** "Add a company" only registers a directory that *already*
has `.git` + `.claude` — there's no way to create one from the UI. A user
who types a path that doesn't exist yet (e.g. a brand-new company name)
just gets a validation error ("Path is not a git repository").

**Goal:** let a user go from "just a company name" to "a real, registered
company" without leaving the dashboard — scaffolding a new local directory
from a template (most likely `ai-company-starter-main`'s own `.claude/` +
`definitions/` skeleton, stripped of company-specific content — that repo
*is* this framework's "AI company operating system" template, per
`~/AI-Native/README.md`), `git init`-ing it fresh, then registering it
via the existing `registerCompanyImpl` path (which already validates
`.git` + `.claude` presence — see `lib/companies-registry.ts`).

Check `docs/superpowers/specs/` for a `*v17*` file once the design is
written — that's the authoritative, up-to-date scope. This section will
go stale as design decisions get made; the spec file is the source of
truth once it exists.
