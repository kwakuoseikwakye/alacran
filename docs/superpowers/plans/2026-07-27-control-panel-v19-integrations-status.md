# v19: integrations status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session note:** this session's subagent-spawn cap (200/session) has
> been hit repeatedly (v14, v16, v17, v18). If a task's implementer
> dispatch fails with a spawn-limit error, do not retry — execute that
> task (and any remaining tasks) directly instead: read the target file
> first, apply the step's code exactly, run the listed test commands,
> then self-review the whole branch before merging.

**Goal:** Show a read-only "Integrations" status line on every agent
card — `plh-takeshi-agent`'s already-configured email account if
present, "none configured yet" for every other agent.

**Architecture:** One small function reads `plh-takeshi-agent`'s
`config.json` (the only agent with any real integration today) and
returns a display string; every other agent short-circuits to "none
configured yet" without touching disk. Computed server-side in
`app/page.tsx`, passed to `AgentCard` as a new required prop.

**Tech Stack:** `node:fs/promises`, Vitest. No new dependencies.

## Global Constraints

- No OAuth, no credential/token storage, no "connect this integration"
  UI or flow anywhere in this slice.
- No changes to `plh-takeshi-agent`, `ai-company-starter-main`, or
  `plh-ops` — read-only observation of `config.json` only.
- The integration check is a single hardcoded `agent.id ===
  "plh-takeshi-agent"` branch, not a generic registry — there is exactly
  one real example to support.
- Tests never read from or write to the real `plh-takeshi-agent`
  directory — a disposable `/tmp` fixture only, per this project's
  standing safe-test-target rule.

---

### Task 1: `getIntegrationStatus`

**Files:**
- Create: `lib/get-integration-status.ts`
- Test: `lib/get-integration-status.test.ts`

**Interfaces:**
- Consumes: `Agent` type (existing, from `./adapters/types`, unchanged
  — has `id: string` and `rootPath: string`).
- Produces: `export async function getIntegrationStatus(agent: Agent):
  Promise<string>` — Task 2 calls this from `app/page.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `lib/get-integration-status.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getIntegrationStatus } from "./get-integration-status"
import type { Agent } from "./adapters/types"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "integration-status-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function takeshiAgent(rootPath: string): Agent {
  return { id: "plh-takeshi-agent", name: "Takeshi Email Agent", rootPath, kind: "pipeline" }
}

describe("getIntegrationStatus", () => {
  it("reports the connected email account for plh-takeshi-agent when config.json has one", async () => {
    await writeFile(path.join(root, "config.json"), JSON.stringify({ account: "owner@example.com" }))
    expect(await getIntegrationStatus(takeshiAgent(root))).toBe("Email connected (owner@example.com)")
  })

  it("reports none configured when config.json is missing", async () => {
    expect(await getIntegrationStatus(takeshiAgent(root))).toBe("none configured yet")
  })

  it("reports none configured when config.json is malformed JSON", async () => {
    await writeFile(path.join(root, "config.json"), "{ not json")
    expect(await getIntegrationStatus(takeshiAgent(root))).toBe("none configured yet")
  })

  it("reports none configured when the account field is missing", async () => {
    await writeFile(path.join(root, "config.json"), JSON.stringify({ sender: "sender@example.com" }))
    expect(await getIntegrationStatus(takeshiAgent(root))).toBe("none configured yet")
  })

  it("reports none configured when the account field is an empty string", async () => {
    await writeFile(path.join(root, "config.json"), JSON.stringify({ account: "   " }))
    expect(await getIntegrationStatus(takeshiAgent(root))).toBe("none configured yet")
  })

  it("reports none configured for any other agent, without reading anything", async () => {
    const otherAgent: Agent = {
      id: "ai-company-starter-main",
      name: "AI Company Starter",
      rootPath: path.join(root, "does-not-exist"),
      kind: "command-set",
    }
    expect(await getIntegrationStatus(otherAgent)).toBe("none configured yet")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/get-integration-status.test.ts`
Expected: FAIL — `Cannot find module './get-integration-status'`

- [ ] **Step 3: Implement**

Create `lib/get-integration-status.ts`:

```ts
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { Agent } from "./adapters/types"

export async function getIntegrationStatus(agent: Agent): Promise<string> {
  if (agent.id !== "plh-takeshi-agent") {
    return "none configured yet"
  }

  try {
    const raw = await readFile(path.join(agent.rootPath, "config.json"), "utf-8")
    const config = JSON.parse(raw) as { account?: unknown }
    if (typeof config.account === "string" && config.account.trim()) {
      return `Email connected (${config.account})`
    }
  } catch {
    return "none configured yet"
  }

  return "none configured yet"
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/get-integration-status.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass (214 existing + 6 new = 220)

- [ ] **Step 6: Commit**

```bash
git add lib/get-integration-status.ts lib/get-integration-status.test.ts
git commit -m "feat: add getIntegrationStatus to surface plh-takeshi-agent's email connection"
```

---

### Task 2: Wire the integration status line into `app/page.tsx` and `AgentCard`

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/agent-card.tsx`

**Interfaces:**
- Consumes: `getIntegrationStatus` (Task 1).
- Produces: `AgentCard` gains a new required prop `integrationStatus:
  string`, rendered unconditionally (every card shows this line, unlike
  the optional status lines that only appear for specific agents).

- [ ] **Step 1: Read both current files**

Read `app/page.tsx` and `components/agent-card.tsx` in full. Confirm
`app/page.tsx` still computes cards inside `await Promise.all(results.map(async
(result) => { ... }))` (the v18 shape), and `components/agent-card.tsx`
still has the exact prop list and `launchdHealth` rendering block shown
below. If either has drifted, stop and reconcile before editing.

- [ ] **Step 2: Modify `app/page.tsx`**

Change the import block from:

```tsx
import { getAvatars } from "@/lib/avatars-registry"
import { companyOntologyExists } from "@/lib/company-ontology-exists"
```

to:

```tsx
import { getAvatars } from "@/lib/avatars-registry"
import { companyOntologyExists } from "@/lib/company-ontology-exists"
import { getIntegrationStatus } from "@/lib/get-integration-status"
```

Change the card-building block from:

```tsx
            const needsCompanySetup =
              result.agent.kind === "command-set" && !(await companyOntologyExists(result.agent.rootPath))
            return (
              <AgentCard
                key={result.agent.id}
                agent={result.agent}
                latestActivity={latest}
                error={result.error}
                launchdHealth={isTakeshiAgent ? launchdHealth : undefined}
                pollStatus={isTakeshiAgent ? pollStatus : undefined}
                showVerifyButton={isAiCompanyStarterMain}
                showDailyTeamLogButton={isPlhOps}
                removable={isRegisteredCompany}
                avatarUrl={avatarByAgentId[result.agent.id] ?? null}
                showSetupCompanyButton={needsCompanySetup}
              />
            )
```

to:

```tsx
            const needsCompanySetup =
              result.agent.kind === "command-set" && !(await companyOntologyExists(result.agent.rootPath))
            const integrationStatus = await getIntegrationStatus(result.agent)
            return (
              <AgentCard
                key={result.agent.id}
                agent={result.agent}
                latestActivity={latest}
                error={result.error}
                launchdHealth={isTakeshiAgent ? launchdHealth : undefined}
                pollStatus={isTakeshiAgent ? pollStatus : undefined}
                showVerifyButton={isAiCompanyStarterMain}
                showDailyTeamLogButton={isPlhOps}
                removable={isRegisteredCompany}
                avatarUrl={avatarByAgentId[result.agent.id] ?? null}
                showSetupCompanyButton={needsCompanySetup}
                integrationStatus={integrationStatus}
              />
            )
```

- [ ] **Step 3: Modify `components/agent-card.tsx`**

Change the props type from:

```tsx
type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  launchdHealth?: LaunchdHealth
  pollStatus?: PollLockStatus
  showVerifyButton?: boolean
  showDailyTeamLogButton?: boolean
  removable?: boolean
  avatarUrl?: string | null
  showSetupCompanyButton?: boolean
}
```

to:

```tsx
type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  launchdHealth?: LaunchdHealth
  pollStatus?: PollLockStatus
  showVerifyButton?: boolean
  showDailyTeamLogButton?: boolean
  removable?: boolean
  avatarUrl?: string | null
  showSetupCompanyButton?: boolean
  integrationStatus: string
}
```

Change the function signature from:

```tsx
export function AgentCard({
  agent,
  latestActivity,
  error,
  launchdHealth,
  pollStatus,
  showVerifyButton,
  showDailyTeamLogButton,
  removable,
  avatarUrl,
  showSetupCompanyButton,
}: AgentCardProps) {
```

to:

```tsx
export function AgentCard({
  agent,
  latestActivity,
  error,
  launchdHealth,
  pollStatus,
  showVerifyButton,
  showDailyTeamLogButton,
  removable,
  avatarUrl,
  showSetupCompanyButton,
  integrationStatus,
}: AgentCardProps) {
```

Change the `launchdHealth` rendering block from:

```tsx
        {launchdHealth && (
          <p className="text-xs text-muted-foreground">
            launchd: {launchdHealth.loaded ? "loaded" : "not loaded"}
            {launchdHealth.lastExitStatus !== null && ` (last exit ${launchdHealth.lastExitStatus})`}
          </p>
        )}
```

to:

```tsx
        {launchdHealth && (
          <p className="text-xs text-muted-foreground">
            launchd: {launchdHealth.loaded ? "loaded" : "not loaded"}
            {launchdHealth.lastExitStatus !== null && ` (last exit ${launchdHealth.lastExitStatus})`}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Integrations: {integrationStatus}</p>
```

- [ ] **Step 4: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all 220 tests still pass (this task adds no new tests)

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/agent-card.tsx
git commit -m "feat: show integration status on every agent card"
```

---

### Task 3: README and final verification

**Files:**
- Modify: `README.md` (append a new section after the most recent
  existing entry)

- [ ] **Step 1: Read the current README's most recent section**

Read the end of `README.md` to find the most recently appended section
(the v18 entry, if this plan runs right after v18) and match its heading
style (`## vNN: <short title>`).

- [ ] **Step 2: Append the v19 section**

Add, after the last existing section:

```markdown
## v19: integrations status

The roadmap named v19 "integrations setup (email, calendar, etc.)" —
investigating what that actually means today found that `plh-takeshi-agent`'s
email connection isn't something this dashboard could meaningfully
"set up": it's the `gog` CLI tool, authenticated once at the OS level
outside any repo, with only a plain, non-secret `account` field in
`config.json` visible in-repo. New connections already have a
purpose-built, carefully security-conscious process
(`ai-company-starter-main`'s `api-connect` Claude Code skill — never lets
a secret touch chat, hands off via `.env`-paste only, the AI never logs
in or clicks "agree"/"create" buttons). Reimplementing any part of that
inside this web app — OAuth flows, credential storage — would duplicate
an already-solved mechanism and turn the dashboard into a
credential-holding system in its own right.

It also turned out a freshly-scaffolded company (v17) has nothing that
would *use* a connected integration yet — `plh-takeshi-agent`'s email
pipeline is bespoke to Kirirom, not part of the generic template. So
there's no real "connect email for your new company" scenario to build
today; that becomes real once v20 (workflow/plugin install) exists.

Given that, v19 ships what's actually real: a read-only "Integrations"
line on every agent card. `plh-takeshi-agent` shows its already-configured
email account; every other agent honestly shows "none configured yet."
No OAuth, no credential storage, no new dependency — one file read, one
hardcoded check for the one real example that exists.

This is piece 3 of the roadmap. v20 (guided command/workflow discovery,
possibly formalizing a "plugin" concept) is next, still just named, not
designed.
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit` — expect no errors
Run: `npx vitest run` — expect all 220 tests passing
Run: `npm run build` — expect a clean production build

- [ ] **Step 4: Live visual + functional verification**

Start a dev server on an unused port. Using Playwright (or equivalent):

1. Navigate to `/` (the Agents page). Confirm the real
   `plh-takeshi-agent` card shows `Integrations: Email connected
   (owner@example.com)` — this is a read-only check against the real
   `config.json`; nothing is written to `plh-takeshi-agent` at any point.
2. Confirm the `ai-company-starter-main` and `plh-ops` cards both show
   `Integrations: none configured yet`.
3. Create a disposable company under `/tmp` via the existing "Add a
   company" → create-from-template flow (same as v17/v18's live checks).
   Confirm its card also shows `Integrations: none configured yet`.
4. Remove the disposable company via the existing "Remove" button, then
   delete the `/tmp` directory.
5. Take one screenshot of the Agents page for the record.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document v19 integrations status in README"
```
