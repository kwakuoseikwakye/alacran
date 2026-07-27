# v21: AI-generated ontology entities via generalized define-company — design spec

Piece 5 of the roadmap toward a Fleece.ai-style onboarding UI. After v20,
CLAUDE.md's roadmap flagged two threads still genuinely unscoped: (1) a
fresh company having a real integration worth connecting, and (2)
AI-generated `customer`/`org`/`product` ontology entities via a
connected agent, deferred since v18.

## Investigation

**Thread 1 (a real integration to connect) — still a dead end.** A fresh
v17-scaffolded company already has `api-connect` available (it's a
skill; `.claude/skills` is copied wholesale by v17's manifest), so the
"connect an integration" mechanism itself isn't missing. What's missing
is a generic *workflow* that would consume a connected integration —
none of `ai-company-starter-main`'s 10 slash-commands touch an external
service. Building one would mean designing something like
`plh-takeshi-agent`'s email pipeline as a generic template feature — the
same scale of problem v20 explicitly declined to solve (no existing
format to build on, bigger than v17-v20 combined for a population of
examples deliberately kept small). No real, small next step exists here
yet.

**Thread 2 (AI-generated ontology entities) — genuinely real and small.**
`lib/company-commands/registry.ts` already has a fully-specified
`define-company` command (built in v8, well before v18's wizard
existed): it spawns a headless `claude -p` session, reads
`docs/templates/ontology-starter.yaml` for structure, and uses the AI's
own reasoning to write `definitions/ontology/company.yaml`'s
`customer`/`org`/`product` domains from four free-text answers — exactly
the entity-generation half of `/define-company` that v18 explicitly
deferred as needing "a connected agent." That mechanism has existed
since v8. The only reason it doesn't work for a v17-created company
today: it's hardcoded to `ai-company-starter-main` in four places —
`skill-browser.tsx`'s `matchedCompanyCommand` check, and the same
hardcoded `AI_COMPANY_STARTER_MAIN_ID` lookup in
`run-company-command-impl.ts`, `company-command-result.ts`, and
`commit-company-command-result-impl.ts`. A v17-created company already
has every file this needs (`.claude/commands/define-company.md`,
`docs/templates/ontology-starter.yaml`) — this is a generalization gap,
not missing infrastructure.

**The security boundary is already agent-generic.** `commitCompanyCommandResultImpl`
calls `resolveWithinAgentRoot` (`lib/path-guard.ts`), which already
resolves against `getEffectiveAgents()` — every registered company, not
just the 3 static ones. The only hardcoded piece is which agent's root
counts as `expectedRoot` for the post-resolution comparison. Generalizing
this subsystem does not require touching the containment/security logic
itself, only which agent it's evaluated against.

**A real, currently-latent bug that generalization would expose.**
`lib/company-commands/paths.ts`'s `COMPANY_COMMANDS_DATA_DIR` is one
fixed directory (`.data/company-runs/`), and the run-lock, run-result
(`<commandId>.run.json`), and log-tail (`<commandId>.log`) files are all
keyed only by `command.id` — never by agent. Today this is invisible
(only one agent ever runs commands). Once a second company can run
`define-company`, an unconfirmed result from Company A would be silently
overwritten if Company B runs the same command before A confirms. This
must be fixed as part of v21 (scope the data dir per agent), not
disclosed as a limitation — it's a correctness bug once two agents share
the command surface, not a scoping tradeoff.

**Field shape mismatch.** The wizard's `CompanyOntologyAnswers` has
`stakeholders: Stakeholder[]` (structured) and
`valueFlow: { input, transform, output }` (structured), while
`define-company`'s command fields each expect a single free-text
multiline string. Passing the wizard's answers into `define-company`'s
prompt needs a small formatting step (one line per stakeholder;
`Input:`/`Transform:`/`Output:` for value flow) — not a 1:1 passthrough.

## Decision (confirmed with the user)

Don't build a new mechanism. Generalize v8's existing headless
command-runner subsystem so it can target any registered `command-set`
agent, and wire up exactly one new entry point: a step inside v18's
wizard that lets the AI draft entities instead of using the
verbatim-copied generic ones. Scope is **`define-company` only** —
`digest`/`decision`/`retro`/`handoff` are not part of this slice; a
fresh company has little content for `digest` to summarize yet anyway,
and generalizing 4 more commands is separate scope from "unlock
AI-generated entities." The existing Skills-page "Run" tab is left
exactly as-is, still gated to `ai-company-starter-main` for all 5
commands — no second entry point to the newly-generalized backend.

## Design

**Backend generalization (all 3 files, `agentId` becomes a first-class
domain parameter, not a DI seam):**

- `runCompanyCommandImpl(commandId, fieldValues, agentId, ...)` resolves
  the target agent via `getEffectiveAgents()` instead of the hardcoded
  `AI_COMPANY_STARTER_MAIN_ID` lookup. `COMPANY_COMMANDS_DATA_DIR`
  becomes agent-scoped: `path.join(COMPANY_COMMANDS_DATA_DIR, agentId)`,
  fixing the run-lock/run-result/log collision above — each agent gets
  its own lock, its own `<commandId>.run.json`, its own `<commandId>.log`.
- `getCompanyCommandResultImpl`/`company-command-result.ts` and
  `getCompanyCommandLogTail` take the same `agentId` and read from that
  agent's own data subdirectory.
- `commitCompanyCommandResultImpl` resolves `expectedRoot` from the
  passed `agentId` via `getEffectiveAgents()` instead of the hardcoded
  id. The `resolveWithinAgentRoot` containment check itself is untouched
  — it already works against any effective agent.
- The public Server Actions (`runCompanyCommand`, `getCompanyCommandResult`,
  `commitCompanyCommandResult`, `getCompanyCommandStatus`,
  `getCompanyCommandLogTail`) all gain the same `agentId` parameter —
  it's a real domain param (which company to target), so it belongs on
  the public boundary directly, same reasoning as `agentId` on
  `installDailyTeamLog` in v20.
- Existing tests for these files (all written against the implicit
  `ai-company-starter-main` target) get their call sites updated to pass
  that same agent id explicitly — this is expected, mechanical work for
  generalizing a subsystem, not the kind of avoidable test-file edit v13's
  lesson was about. Every existing assertion's behavior stays identical.

**Wizard flow (`components/company-setup-wizard.tsx`):** after the
existing "review" step, add a new choice step: **"Save now"** (today's
exact behavior — `saveCompanyOntology` writes the generic-template
entities immediately, unchanged) vs. **"Let AI draft tailored entities"**.
Choosing the AI path calls `runCompanyCommand("define-company",
{domain, stakeholders: <formatted>, valueFlow: <formatted>, bottleneck},
agentId)` using the wizard's already-collected answers (no re-entry),
then polls every 3s (same interval and pattern as
`CompanyCommandRunner`) showing the live log tail while waiting. On
completion, shows the diff (`DiffView`, reused as-is) with **"Confirm &
commit"** or **"Cancel and save with generic entities instead"** (falls
back to the "Save now" behavior, discarding the AI draft). If the run
fails to start, or the AI produced no changes, the message shows inline
and the user stays on the choice step — no dead end. Nothing is written
to disk until the user explicitly confirms, matching every prior
write-action's confirm-with-diff invariant in this project.

New sub-flow logic (poll/diff/confirm state machine specific to the
AI-draft path) lives in its own component rather than growing
`company-setup-wizard.tsx` (already 227 lines across 5 steps) further —
exact file boundary is a plan-level decision, but it must not be
inlined wholesale into the existing wizard file.

## Non-goals

- No generalization of `digest`/`decision`/`retro`/`handoff` — they stay
  `ai-company-starter-main`-only via the existing Skills-page Run tab,
  unchanged.
- No changes to the Skills-page Run tab's gating (`skill-browser.tsx`'s
  `matchedCompanyCommand` check) — it remains hardcoded to
  `ai-company-starter-main`. `define-company` becomes runnable against
  other companies only through the new wizard step.
- No new AI-calling infrastructure — this reuses v8's existing headless
  `claude -p` spawn mechanism verbatim, generalized to accept a target
  agent.
- No fix for thread 1 (a real integration for a fresh company to
  connect) — investigated above, no small real next step found.
- No change to `saveCompanyOntology`/`buildCompanyOntology` — the
  "Save now" path stays byte-for-byte what v18 shipped.

## Testing

Unit tests mock `getEffectiveAgents()`/`AGENTS` with two distinct fake
companies (same pattern as v20's `install-daily-team-log-impl.test.ts`):
confirm each agent's run-lock/run-result/log files land in its own
`.data/company-runs/<agentId>/` without colliding; confirm running
`define-company` against Company A while Company B has an unconfirmed
result doesn't touch B's files; confirm an unknown `agentId` fails
cleanly at each of the three generalized functions; confirm
`commitCompanyCommandResultImpl`'s containment check still rejects a
path outside the target agent's root. Existing
`ai-company-starter-main` test coverage is updated to pass that agent id
explicitly and must keep passing with identical assertions (regression
proof, per this project's established discipline).

**Live verification is unit-tests-only for the real spawn path — same
precedent as v9.** Every prior slice's live test was a near-instant,
zero-cost local file/git operation; actually spawning `define-company`
means a real, paid `claude -p` session with real wall-clock reasoning
time — a new risk/cost shape, not a bigger version of what's already
been safely live-tested. Confirmed with the user: verify the
generalized plumbing and wizard wiring entirely with fake
`spawn`/`exec` functions; the live UI walkthrough covers everything up
to and including triggering the run (confirming it reports "Started"
and the poll loop begins), but does not wait for or confirm a real
completed AI-generated diff. The real button ships working; the user
triggers a real run themselves whenever ready, at their own discretion.
