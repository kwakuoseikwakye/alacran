# Ownership dashboard — per-company "what leaves this machine" view

**Date:** 2026-08-05
**Status:** approved, not yet implemented

## Problem

`docs/vision.md` names an "Ownership Dashboard" as part of the long-range
local-first/ownership vision: every company should clearly show local storage
status, connected cloud services, backup destinations, AI providers, active
integrations, data locations, and external network access, so a user always
knows what stays local and what leaves their machine.

Today that information is real but scattered: `AgentCard` shows one
integration-status line and a backup button; `/connect` shows machine-wide
tool connections (Claude CLI, Google via `gog`, GitHub); the AI-executor
picker shows which CLI a company uses. There is no single place that answers,
per company, "what does this company touch outside my machine."

This slice consolidates those existing, already-real signals into one
per-company view. It does not build a marketplace, multi-framework execution,
or any new integration — those are separate, much larger threads from
`docs/vision.md` that need their own maintainer decisions first.

## Scope

**In:** a "View ownership" button on every `command-set` agent's card (the
same scoping already used for the backup button and AI-executor picker — real
companies, not the `plh-takeshi-agent`/`plh-ops` built-ins), opening a Sheet
with five sections: data location, AI provider, integrations, backup
destination, and a synthesized "external network access" summary.

**Out, deliberately:**
- Any new tracking/instrumentation of actual network calls. "External network
  access" is *derived* from three already-known signals (AI executor, backup
  remote, integration status), not independently measured.
- Extending this to `plh-takeshi-agent`/`plh-ops` — they aren't company-shaped
  (no AI-executor choice, no per-company backup remote in the same sense).
- Surfacing this during onboarding/company creation. The vision doc's other
  stated job for this feature — an onboarding-time explainer — is a real,
  separate slice: it means changing the setup wizard, not just adding a
  reachable view. Deferred until this audit view exists and proves the
  content is right.
- A company-authored `definitions/` manifest declaring allowed network
  access. More explicit, but new data-model work with no evidence yet that
  the derived summary is insufficient.

## Design

### New files

- **`lib/ownership/get-company-ownership-impl.ts`** — `getCompanyOwnershipImpl(agentId, execFn)`.
  Resolves the agent via `getEffectiveAgents()`, then composes:
  - `rootPath` from the resolved `Agent`.
  - `getCompanyRemoteImpl(agentId, execFn)` for the backup destination.
  - `getIntegrationStatus(agent)` for the integration line.
  - `getAiExecutorIdForAgent(agentId)` for the AI provider.

  Injectable `execFn`, real default — same DI convention as every other
  OS-touching function in this project. Returns one `CompanyOwnership` object;
  never throws (each underlying call already degrades to a "not configured"
  value rather than an error, and this composition preserves that).

- **`lib/ownership/ownership-actions.ts`** — `"use server"` boundary,
  `getCompanyOwnership(agentId): Promise<CompanyOwnership>`, zero extra
  parameters, delegating to the impl with its default `execFn`.

- **`lib/ownership/summarize-network-access.ts`** — pure function,
  `summarizeNetworkAccess({ aiExecutorId, hasIntegration, remoteUrl }): NetworkAccessEntry[]`.
  No I/O — takes already-resolved values, returns a list of short entries:

  | Signal | Entry |
  |---|---|
  | `aiExecutorId === "claude-code"` | "Anthropic (Claude Code) — your own account" |
  | `aiExecutorId === "openai-codex"` | "OpenAI (Codex CLI) — your own account" |
  | `aiExecutorId === "aider"` | "Depends on your own Aider model config (OpenAI, Anthropic, or a local model) — not visible to this app" |
  | `hasIntegration` | "Google, via `gog` — your own account" |
  | `remoteUrl` present | "GitHub — your own private repository" |
  | none of the above | "Nothing configured yet — this company hasn't sent anything anywhere." |

  The Aider entry is deliberately non-committal: `lib/ai-executors.ts`
  already documents that Aider's model backend (cloud or local) is the
  user's own config, invisible to this app. Claiming certainty there would
  make the dashboard less honest than the status quo, which is the opposite
  of the point of this feature.

### Shape of `CompanyOwnership`

```ts
export type CompanyOwnership = {
  rootPath: string
  remoteUrl: string | null
  integrationStatus: string
  aiExecutorId: AiExecutorId
  networkAccess: NetworkAccessEntry[]
}

export type NetworkAccessEntry = { label: string }
```

`networkAccess` is computed by `summarizeNetworkAccess` from the other four
fields before the object is returned — the Sheet renders it directly rather
than re-deriving it, keeping all derivation logic in the one pure, tested
function.

### New component

- **`components/company-ownership-sheet.tsx`** — client component, opened by
  a "View ownership" button. Fetches `getCompanyOwnership(agentId)` in a
  `useEffect` on mount (i.e., when the Sheet opens, not when the card
  renders — avoids adding a fetch to every card on every dashboard load).
  Renders the five sections; the "data location" section reuses the existing
  `CommandLine` copy-button component for the root path.

### Existing files touched

- **`components/agent-card.tsx`** — one new optional prop,
  `showOwnershipButton`, rendering the new Sheet-trigger button alongside the
  existing buttons.
- **`app/page.tsx`** — `showOwnershipButton={isCommandSet}` passed down,
  same pattern as `showBackupButton`/`showAiExecutorPicker`.

Nothing else changes. `BackupCompanyButton`, `AiExecutorPicker`, and
`get-integration-status.ts` are reused exactly as they are today — this
slice adds one composition layer and one UI surface on top of them, not a
parallel implementation.

## Failure modes

| Condition | Behaviour |
|---|---|
| Agent not found (shouldn't happen — button only renders for real agents) | Action returns a safe empty/unknown `CompanyOwnership`, Sheet shows "Unable to load" rather than throwing |
| `git remote get-url origin` fails (no remote) | Already handled by `getCompanyRemoteImpl` — `remoteUrl: null`, not an error |
| Integration read fails | Already handled by `getIntegrationStatus` — "none configured yet" |
| AI executor id missing/unrecognized | `getAiExecutorIdForAgent` already falls back to the default (`claude-code`) |

This is a read-only, best-effort status view. No section should ever be able
to block the Sheet from opening or show a raw error to the user.

## Testing

- `get-company-ownership-impl.test.ts` — injected fake `execFn`, asserts
  correct composition, and that a missing remote/integration produces the
  expected "not configured" shape rather than throwing.
- `summarize-network-access.test.ts` — pure function, table-driven: each
  executor id × integration (on/off) × remote (present/absent) combination,
  explicitly including the all-false "nothing configured" case and the Aider
  non-committal case.
- No live/manual test needed beyond a Playwright pass opening the Sheet for
  an existing test company and confirming the five sections render — this
  falls under the standing "read-only actions are always fine" rule, since
  the feature never writes anything. `plh-takeshi-agent` and `plh-ops` are
  never touched (the button doesn't render for them at all).

## Rejected alternatives

**A new dedicated page (like `/connect` but per-company).** More visible,
but is a new nav item and route for a feature that's currently five fields,
four of which are already computed elsewhere. Revisit if this grows into
something with its own workflows (e.g. an allowlist editor), not before.

**Inline section in the existing `AgentCard`.** Zero extra navigation, but
the card is already dense (activity, launchd status, integration line,
several conditional buttons); an always-visible ownership section would make
every card noticeably taller for information that's useful on-demand, not
at-a-glance.

**Fully eager, server-computed ownership object passed down from
`app/page.tsx`.** Would remove the Sheet's own fetch entirely, but the
marginal cost is small (the git-remote check already happens once per
company per page load today, via `BackupCompanyButton`'s own mount fetch)
and this approach would grow `app/page.tsx`'s already-large per-card
computation block for a value only shown on demand. Revisit if profiling
ever shows the on-open fetch causing a visible delay.

## Follow-ups this slice deliberately leaves open

- Surfacing ownership information during company creation/setup (the
  onboarding-time half of the vision doc's stated purpose), once this audit
  view has proven the content and framing are right.
- A dashboard editor for any future company-authored network-access
  declaration, if the derived summary ever proves insufficient.
- The marketplace and multi-AI-framework threads from `docs/vision.md` —
  unrelated to this slice, and each needs its own maintainer decision before
  any design work starts.
