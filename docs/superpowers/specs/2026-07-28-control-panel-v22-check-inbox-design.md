# v22: check-inbox — a real, generic integration-consuming command — design spec

Piece 6 of the roadmap toward a Fleece.ai-style onboarding UI. After v21,
CLAUDE.md's roadmap flagged one remaining thread: a fresh company having
a real integration worth connecting.

## Investigation

**`harness-engineering` is not part of this ecosystem's functional
infrastructure.** It's a clone of a third-party public repo
(`github.com:lopopolo/harness-engineering`, 2 commits) — a
methodology/thesis about writing good agent-facing documentation, not
executable code. `ai-company-starter-main` has zero references to it.
It informed the user's thinking, but it isn't a source of reusable
integration code and this investigation stops there.

**`gog` (gogcli) is the real finding.** `plh-takeshi-agent`'s "email
connection," previously assumed bespoke, is actually a call into a
real, already-installed (`/opt/homebrew/bin/gog`), general-purpose
Google API CLI — Gmail, **Calendar**, Chat, Drive, Contacts, Tasks,
Sheets, Docs, and more — with its own multi-account OAuth store
(confirmed via `gog auth list`: one account currently connected,
`owner@example.com`, scopes `calendar,contacts,docs,drive,gmail,sheets,tasks`).
Invocation is simple and already demonstrated in
`plh-takeshi-agent/bin/poll.sh`/`process.sh`:
`gog -a "$ACCOUNT" gmail search "..." --plain --max 50`,
`gog -a "$ACCOUNT" gmail get "$ID" --format metadata ...`.
`gog -a auto ...` (letting `gog` pick the sole/default account) was
confirmed to work directly against the real inbox during this
investigation (read-only search, no side effects).

**`api-connect`** (already scaffolded into every new company via
`.claude/skills`) is a fully generic, service-agnostic "connect
anything" skill — it already knows how to walk a user through OAuth for
exactly this shape of tool. So the *connecting* half of "a real
integration to connect" was never actually missing. What's missing,
confirmed again, is a generic *workflow* in the template that does
anything with a connected integration once it exists.

**The headless command-runner (v8, generalized in v21) cannot run `gog`
today.** Every one of its 5 existing commands
(`digest`/`decision`/`retro`/`handoff`/`define-company`) spawns with
`--disallowedTools "Bash"` — none of them shell out to an external CLI.
`check-inbox` is the first command that genuinely needs Bash. The exact
precedent for this already exists in this codebase: v9's
`lib/daily-team-log/trigger-daily-team-log-impl.ts` scopes
`--allowedTools` to narrow, exact command prefixes
(`Bash(git -C <path> pull*)`, `Bash(python3 <path>*)`) instead of a
blanket Bash allow/disallow, for the same reason — its trigger also
needs real Bash for `git`/`python3` calls that v8's original 5 commands
never needed.

## Decision (confirmed with the user)

Build exactly one small, generic, read-only command — `check-inbox` —
using `gog`, added to `ai-company-starter-main`'s template so any
company (existing or new) can eventually have it. This is the same
"hand-build one small, real, already-portable thing" shape as v20's
`daily-team-log` installer and v21's `define-company` generalization,
not a new general integration-workflow framework.

## Design

**1. New command.** `check-inbox` (zero fields — no user input needed):
added to `ai-company-starter-main/.claude/commands/check-inbox.md` and
registered in `lib/company-commands/registry.ts`. It runs
`gog -a auto gmail search "is:unread" --plain --max 20`, then for each
result `gog -a auto gmail get <id> --format metadata --headers
From,Subject,Date --plain`, and writes a summary to
`notes/company/email-checks/<YYYY-MM-DD>-inbox-check.md` (a
`new-file-in-dir` output, same shape as `digest`). Strictly read-only:
no `gmail send`, no `gmail messages modify` (no labeling/archiving) —
matches the confirmed "read-only" scope exactly.

**2. Generalize the spawn's Bash gate.** `CompanyCommand` (in
`lib/company-commands/types.ts`) gains an optional
`bashPatterns?: string[]`. In `run-company-command-impl.ts`, when a
command declares no patterns (all 5 existing commands — this field is
simply omitted for them, zero behavior change), the spawn keeps its
current `--disallowedTools "Bash"`. When a command declares patterns,
`--allowedTools` becomes
`Read,Grep,Glob,Edit(<path>),Bash(<pattern1>),Bash(<pattern2>),...` and
`--disallowedTools "Bash"` is omitted entirely. `check-inbox` declares
exactly `["gog -a auto gmail search*", "gog -a auto gmail get*"]` —
nothing else, so the spawned session can search and read inbox metadata
but cannot send, modify, label, or touch any other Google service.

**3. Reachability.** v21 left the Skills-page "Run" tab
(`skill-browser.tsx`'s `matchedCompanyCommand`) gated to
`agentId === "ai-company-starter-main"` for all 5 existing commands.
Since v22's entire point is a *fresh* company using an integration, that
gate is relaxed to `agent.kind === "command-set"` — matching the
pattern already used for `showSetupCompanyButton`/
`showInstallDailyTeamLogButton` elsewhere in this codebase. This
incidentally also makes `digest`/`decision`/`retro`/`handoff`/
`define-company` reachable from any company's Skills page, not just
`ai-company-starter-main` — a natural completion of v21's own
generalization (all 5 are already architecturally generic; nothing
about their `buildPrompt`s assumes one specific company), not new scope
invented for `check-inbox` specifically.

## Non-goals

- No per-company `gog` account configuration or selection — `check-inbox`
  always uses `gog -a auto`. `gog`'s auth store is global per-machine;
  only one company can meaningfully have a distinct connected Google
  account "active" for this command at a time. This is a real,
  **disclosed limitation, not fixed here** — the same shape as v20's
  `daily-team-log` config-collision limitation, and fixing it would mean
  designing multi-tenant account storage, which is exactly the kind of
  "generalize the integration model" scope this project keeps correctly
  declining to build ad hoc.
- No write/send capability of any kind — `check-inbox` never calls
  `gmail send` or `gmail messages modify`.
- No calendar command in this slice (the user chose "check inbox" over
  "check calendar" specifically to keep this narrow).
- No changes to `plh-takeshi-agent`'s own pipeline, config, or its real
  `owner@example.com`/`sender@example.com` account usage.
- No retrofit mechanism for already-registered companies created before
  this command existed in the template — same limitation the 5 existing
  commands already have (a company registered before a command was added
  to `ai-company-starter-main`'s `.claude/commands/` simply doesn't have
  it; there is no "install this one command onto an existing company"
  story here, unlike v20's explicit installer for a different reason).

## Testing

Unit tests for the Bash-gate generalization in
`run-company-command-impl.test.ts`: confirm all 5 existing commands'
spawn args are byte-identical to before (regression proof — `--allowedTools`
unchanged, `--disallowedTools "Bash"` still present); confirm a command
with `bashPatterns` produces `--allowedTools` containing the exact
`Bash(<pattern>)` entries and no `--disallowedTools` flag at all. New
registry test for `check-inbox`'s exact field/output/bashPatterns shape.
`skill-browser.tsx`'s relaxed gate has no direct unit test (matches this
project's established "no component-level unit tests" precedent) —
covered by live verification.

**Live verification is unit-tests-only for the real spawn — same
precedent as v9 and v21.** The real `gog gmail search`/`get` calls read
the user's actual inbox; live verification confirms the Skills-page Run
tab now appears for a disposable `/tmp` company and that triggering
`check-inbox` reports "Started," but does not wait for or confirm a
completed real run. The real button ships working; the user triggers it
themselves whenever ready.
