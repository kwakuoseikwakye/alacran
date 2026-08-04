# v19: integrations status — design spec

Piece 3 of the roadmap toward a Fleece.ai-style onboarding UI (v17:
create a company; v18: guided company-context setup).

## What "integrations setup" actually means today

The roadmap named v19 as "integrations setup (email, calendar, etc.) so
agents can actually act on a company's behalf." Investigating what that
means concretely, against real state (not assumption):

- `plh-takeshi-agent`'s email connection isn't OAuth or any credential
  this dashboard could store — it's the `gog` CLI tool, authenticated
  once at the OS level entirely outside any repo. The only thing
  visible in-repo is `config.json`'s plain, non-secret `account` field
  (`owner@example.com`) — tracked in git, not a secrets file.
- New connections (to any service) already have a careful, purpose-built
  process: `ai-company-starter-main`'s `api-connect` Claude Code skill.
  It has strict security rules (never let a secret appear in chat,
  hand-off is `.env`-paste only, the AI never logs in, never clicks
  "agree"/"create" buttons — the human always does). Reimplementing any
  part of this inside the web app (OAuth flows, token storage) would
  duplicate an already-solved, already-secure mechanism and turn this
  dashboard into a credential-holding system in its own right — a much
  bigger security surface than anything shipped so far.
- Checked whether a freshly-scaffolded company (v17) has anything that
  would *use* a connected integration: it doesn't. `plh-takeshi-agent`'s
  email pipeline (`gog` + its own `poll.sh`/`process.sh`) is bespoke to
  Kirirom, not part of `ai-company-starter-main`'s generic template. A
  new company has no workflow that would consume "connected email" even
  if one were connected. That gap is what v20 (workflow/plugin install)
  is for.
- Checked `ai-company-starter-main` and `plh-ops` for any existing
  integration of their own: neither has one (no `.env`, no config
  referencing an external service).

**Decision (confirmed with the user):** v19 does not implement any
OAuth flow, does not store any credential, and does not build a "connect
X" flow for a scenario that doesn't exist yet. It ships a **read-only
integrations status view**: surface what's actually configured today
(`plh-takeshi-agent`'s email), and say so honestly for every agent that
has nothing yet. This is real, small, and fully testable against the
actual current state of the system — not speculative code for a future
that depends on v20 existing first.

## Design

A new "Integrations" line on `AgentCard`, in the same place and style as
the existing `launchdHealth` line (`launchd: loaded (last exit 0)`):

- `plh-takeshi-agent`: `Integrations: Email connected (owner@example.com)` —
  read from `config.json`'s `account` field at that agent's `rootPath`.
- Every other agent (`ai-company-starter-main`, `plh-ops`, and any
  registered company): `Integrations: none configured yet`.

No new Server Action needed — this is a read-only value computed
server-side in `app/page.tsx` (same pattern as v18's
`companyOntologyExists` check) and passed to `AgentCard` as a prop.

The check is intentionally agent-ID-specific for now (`if (agent.id ===
"plh-takeshi-agent") { ... }`), not a generic "integrations registry" —
there is exactly one real example to support, and building an abstraction
for a population of one is premature. A second real integration (from a
future agent or v20's plugin concept) is what would justify
generalizing this into something more registry-like; until then this
would be over-engineering ahead of need.

## Non-goals

- No OAuth implementation, no credential/token storage anywhere in this
  app.
- No "connect this integration" UI or flow — there is no real scenario
  today where an agent has a missing-but-needed integration to connect
  (see "What this means today" above). This is explicitly left for
  after v20 (workflow/plugin install) makes that scenario real.
- No changes to `plh-takeshi-agent`, `ai-company-starter-main`, or
  `plh-ops` themselves — read-only observation of `config.json`, nothing
  written.
- No generic "integrations registry" abstraction — one hardcoded,
  agent-specific check, matching the one real example that exists.
- No changes to `.claude/skills/api-connect` — it remains the actual
  mechanism for connecting a new service; this dashboard doesn't
  duplicate or wrap it.

## Testing

`getIntegrationStatus` is a small, pure-enough function (one file read,
no writes, no external calls) tested against a disposable `/tmp` fixture
directory with its own `config.json` — never the real
`plh-takeshi-agent`. Cases: `plh-takeshi-agent`-shaped agent with a valid
`account` field reports connected; a `plh-takeshi-agent`-shaped agent
with a missing or empty `account` field, or a missing `config.json`
entirely, reports not-connected rather than throwing; any other agent id
reports not-connected without attempting to read anything. Live
verification: confirm the real `plh-takeshi-agent` card (read-only,
never written to) shows its actual connected email, and every other
agent card — including a disposable `/tmp` company created via v17's
flow — shows "none configured yet."
