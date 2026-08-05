# Ownership Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every real company (`command-set` agent) a "View ownership" button that opens a Sheet showing where its data lives, which AI provider runs it, what's connected, whether it's backed up, and a synthesized summary of what leaves the machine.

**Architecture:** One new `lib/ownership/` module composes three already-real, already-tested data sources (`getCompanyRemoteImpl`, `getIntegrationStatus`, `getAiExecutorIdForAgent`) into a single `CompanyOwnership` object, plus one pure function that derives the "external network access" summary from it. A thin server action exposes the composition to the client. One new client component (`CompanyOwnershipSheet`) renders it, following the existing fetch-on-click-then-open-Sheet pattern already used by `VerifyButton`. `AgentCard` and `app/page.tsx` get one new prop each to wire it in — no existing component's behavior changes.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Vitest, existing `components/ui/sheet.tsx` (Radix Dialog-based), existing `components/copy-button.tsx`.

## Global Constraints

- **DI for OS calls:** any function touching the filesystem or shelling out takes an injectable function (`ExecFileFn`) with a real default. `getCompanyOwnershipImpl` must accept an injectable `execFn` and an injectable `aiExecutorRegistryPath`, both defaulted for production use.
- **Zero-extra-parameter Server Actions:** the public `"use server"` boundary (`getCompanyOwnership`) takes only `agentId` — no injectable seams. Seams live only in the paired `-impl.ts` file.
- **`export const dynamic = "force-dynamic"`** is already set on `app/page.tsx` — no new page is being added, so nothing new needed here.
- **Never edit `components/ui/*`** — the Sheet primitive is used as-is; if a styling issue arises, fix it in the consumer.
- **Single-file-scoped git commits** — each task's commit touches only the files that task creates or modifies.
- **This is a read-only feature.** Nothing in this plan writes to a company's repo, calls `git commit`, or spawns a subprocess other than the existing read-only `git remote get-url origin` check that `getCompanyRemoteImpl` already performs.
- Run `npx tsc --noEmit` and `npx vitest run` after every task; both must be clean before moving to the next task.

---

### Task 1: `summarizeNetworkAccess` — the pure derivation function

**Files:**
- Create: `lib/ownership/summarize-network-access.ts`
- Test: `lib/ownership/summarize-network-access.test.ts`

**Interfaces:**
- Consumes: `AiExecutorId` type from `lib/ai-executors.ts` (already exists: `"claude-code" | "openai-codex" | "aider"`).
- Produces: `NetworkAccessEntry = { label: string }`, `SummarizeNetworkAccessInput = { aiExecutorId: AiExecutorId; hasIntegration: boolean; remoteUrl: string | null }`, and `summarizeNetworkAccess(input: SummarizeNetworkAccessInput): NetworkAccessEntry[]` — used by Task 2.

**Note on the spec's "nothing configured" case:** `AiExecutorId` is an exhaustive 3-value union and every company always has a default (`claude-code`), so the AI-provider line is always present — there is no reachable all-empty state. The minimal case is a one-entry array (just the AI-provider line), not a special "nothing configured" string.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/ownership/summarize-network-access.test.ts
import { describe, it, expect } from "vitest"
import { summarizeNetworkAccess } from "./summarize-network-access"

describe("summarizeNetworkAccess", () => {
  it("includes only the AI executor line when nothing else is configured", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "claude-code", hasIntegration: false, remoteUrl: null })
    expect(result).toEqual([{ label: "Anthropic (Claude Code) — your own account" }])
  })

  it("labels the OpenAI Codex executor", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "openai-codex", hasIntegration: false, remoteUrl: null })
    expect(result).toEqual([{ label: "OpenAI (Codex CLI) — your own account" }])
  })

  it("gives Aider a non-committal line rather than claiming certainty about its backend", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "aider", hasIntegration: false, remoteUrl: null })
    expect(result).toEqual([
      {
        label:
          "Depends on your own Aider model config (OpenAI, Anthropic, or a local model) — not visible to this app",
      },
    ])
  })

  it("adds the Google line when an integration is connected", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "claude-code", hasIntegration: true, remoteUrl: null })
    expect(result).toEqual([
      { label: "Anthropic (Claude Code) — your own account" },
      { label: "Google, via gog — your own account" },
    ])
  })

  it("adds the GitHub line when a backup remote is configured", () => {
    const result = summarizeNetworkAccess({
      aiExecutorId: "claude-code",
      hasIntegration: false,
      remoteUrl: "git@github.com:me/acme.git",
    })
    expect(result).toEqual([
      { label: "Anthropic (Claude Code) — your own account" },
      { label: "GitHub — your own private repository" },
    ])
  })

  it("includes all three lines when everything is configured", () => {
    const result = summarizeNetworkAccess({
      aiExecutorId: "openai-codex",
      hasIntegration: true,
      remoteUrl: "git@github.com:me/acme.git",
    })
    expect(result).toEqual([
      { label: "OpenAI (Codex CLI) — your own account" },
      { label: "Google, via gog — your own account" },
      { label: "GitHub — your own private repository" },
    ])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/ownership/summarize-network-access.test.ts`
Expected: FAIL — `./summarize-network-access` does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// lib/ownership/summarize-network-access.ts
import type { AiExecutorId } from "../ai-executors"

export type NetworkAccessEntry = { label: string }

export type SummarizeNetworkAccessInput = {
  aiExecutorId: AiExecutorId
  hasIntegration: boolean
  remoteUrl: string | null
}

// Only claim what we actually know. Claude Code and Codex are always a real
// cloud API call under the user's own account; Aider's backend is the user's
// own config (see lib/ai-executors.ts) and is genuinely invisible to this app,
// so it gets an honest "depends," not a guess.
const AI_EXECUTOR_NETWORK_LABEL: Record<AiExecutorId, string> = {
  "claude-code": "Anthropic (Claude Code) — your own account",
  "openai-codex": "OpenAI (Codex CLI) — your own account",
  aider: "Depends on your own Aider model config (OpenAI, Anthropic, or a local model) — not visible to this app",
}

export function summarizeNetworkAccess(input: SummarizeNetworkAccessInput): NetworkAccessEntry[] {
  const entries: NetworkAccessEntry[] = [{ label: AI_EXECUTOR_NETWORK_LABEL[input.aiExecutorId] }]
  if (input.hasIntegration) {
    entries.push({ label: "Google, via gog — your own account" })
  }
  if (input.remoteUrl) {
    entries.push({ label: "GitHub — your own private repository" })
  }
  return entries
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/ownership/summarize-network-access.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/ownership/summarize-network-access.ts lib/ownership/summarize-network-access.test.ts
git commit -m "Add summarizeNetworkAccess pure function for the ownership dashboard"
```

---

### Task 2: `getCompanyOwnershipImpl` — the composition layer

**Files:**
- Create: `lib/ownership/get-company-ownership-impl.ts`
- Test: `lib/ownership/get-company-ownership-impl.test.ts`

**Interfaces:**
- Consumes:
  - `getEffectiveAgents(): Promise<Agent[]>` from `lib/get-effective-agents.ts` (existing).
  - `getCompanyRemoteImpl(agentId: string, execFn?: ExecFileFn): Promise<RemoteResult>` from `lib/github/backup-company-impl.ts` (existing; `RemoteResult = { ok: true; remoteUrl: string | null } | { ok: false; message: string }`).
  - `getIntegrationStatus(agent: Agent): Promise<string>` from `lib/get-integration-status.ts` (existing).
  - `getAiExecutorIdForAgent(agentId: string, registryPath?: string): Promise<AiExecutorId>` from `lib/ai-executor-registry.ts` (existing).
  - `summarizeNetworkAccess` from Task 1.
  - `ExecFileFn` type from `lib/git-commit-file.ts` (existing).
- Produces: `CompanyOwnership = { ok: true; rootPath: string; remoteUrl: string | null; integrationStatus: string; aiExecutorId: AiExecutorId; networkAccess: NetworkAccessEntry[] } | { ok: false; message: string }` and `getCompanyOwnershipImpl(agentId: string, execFn?: ExecFileFn, aiExecutorRegistryPath?: string): Promise<CompanyOwnership>` — used by Task 3 (the server action) and Task 4 (the Sheet component, for the type only).

This mirrors the `RemoteResult`/`BackupResult` discriminated-union shape already used in `backup-company-impl.ts`, rather than a separate "safe empty" sentinel — consistent with how failure is represented elsewhere in this codebase.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/ownership/get-company-ownership-impl.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "../git-commit-file"

let root: string
let dataDir: string
let aiExecutorRegistryPath: string

function fakeExec(handler: (command: string, args: string[]) => unknown): ExecFileFn {
  return async (command, args) => {
    const result = handler(command, args)
    if (result instanceof Error) throw result
    const r = (result ?? {}) as { stdout?: string; stderr?: string }
    return { stdout: r.stdout ?? "", stderr: r.stderr ?? "" }
  }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ownership-company-"))
  dataDir = await mkdtemp(path.join(tmpdir(), "ownership-data-"))
  aiExecutorRegistryPath = path.join(dataDir, "ai-executors.json")
  vi.doMock("../get-effective-agents", () => ({
    getEffectiveAgents: async () => [{ id: "acme", name: "Acme Co", rootPath: root, kind: "command-set" }],
  }))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

describe("getCompanyOwnershipImpl", () => {
  it("rejects an unknown company", async () => {
    const { getCompanyOwnershipImpl } = await import("./get-company-ownership-impl")
    const exec = fakeExec(() => new Error("should not be called"))
    expect(await getCompanyOwnershipImpl("nope", exec, aiExecutorRegistryPath)).toEqual({
      ok: false,
      message: "Unknown company",
    })
  })

  it("composes a fresh company with no remote, no integration, default executor", async () => {
    const { getCompanyOwnershipImpl } = await import("./get-company-ownership-impl")
    const exec = fakeExec(() => new Error("fatal: No such remote 'origin'"))
    const result = await getCompanyOwnershipImpl("acme", exec, aiExecutorRegistryPath)
    expect(result).toEqual({
      ok: true,
      rootPath: root,
      remoteUrl: null,
      integrationStatus: "none configured yet",
      aiExecutorId: "claude-code",
      networkAccess: [{ label: "Anthropic (Claude Code) — your own account" }],
    })
  })

  it("reflects a configured backup remote and a non-default executor", async () => {
    await mkdir(path.dirname(aiExecutorRegistryPath), { recursive: true })
    await writeFile(
      aiExecutorRegistryPath,
      JSON.stringify([{ agentId: "acme", executorId: "openai-codex" }]),
      "utf-8"
    )
    const { getCompanyOwnershipImpl } = await import("./get-company-ownership-impl")
    const exec = fakeExec(() => ({ stdout: "git@github.com:me/acme.git\n" }))
    const result = await getCompanyOwnershipImpl("acme", exec, aiExecutorRegistryPath)
    expect(result).toEqual({
      ok: true,
      rootPath: root,
      remoteUrl: "git@github.com:me/acme.git",
      integrationStatus: "none configured yet",
      aiExecutorId: "openai-codex",
      networkAccess: [
        { label: "OpenAI (Codex CLI) — your own account" },
        { label: "GitHub — your own private repository" },
      ],
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/ownership/get-company-ownership-impl.test.ts`
Expected: FAIL — `./get-company-ownership-impl` does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// lib/ownership/get-company-ownership-impl.ts
import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { getEffectiveAgents } from "../get-effective-agents"
import { getCompanyRemoteImpl } from "../github/backup-company-impl"
import { getIntegrationStatus } from "../get-integration-status"
import { getAiExecutorIdForAgent } from "../ai-executor-registry"
import { summarizeNetworkAccess } from "./summarize-network-access"
import type { ExecFileFn } from "../git-commit-file"
import type { AiExecutorId } from "../ai-executors"
import type { NetworkAccessEntry } from "./summarize-network-access"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export type CompanyOwnership =
  | {
      ok: true
      rootPath: string
      remoteUrl: string | null
      integrationStatus: string
      aiExecutorId: AiExecutorId
      networkAccess: NetworkAccessEntry[]
    }
  | { ok: false; message: string }

export async function getCompanyOwnershipImpl(
  agentId: string,
  execFn: ExecFileFn = defaultExecFile,
  aiExecutorRegistryPath?: string
): Promise<CompanyOwnership> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company" }

  const remoteResult = await getCompanyRemoteImpl(agentId, execFn)
  const remoteUrl = remoteResult.ok ? remoteResult.remoteUrl : null

  const integrationStatus = await getIntegrationStatus(agent)
  const hasIntegration = integrationStatus !== "none configured yet"

  const aiExecutorId = await getAiExecutorIdForAgent(agentId, aiExecutorRegistryPath)

  const networkAccess = summarizeNetworkAccess({ aiExecutorId, hasIntegration, remoteUrl })

  return {
    ok: true,
    rootPath: agent.rootPath,
    remoteUrl,
    integrationStatus,
    aiExecutorId,
    networkAccess,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/ownership/get-company-ownership-impl.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/ownership/get-company-ownership-impl.ts lib/ownership/get-company-ownership-impl.test.ts
git commit -m "Add getCompanyOwnershipImpl composing existing ownership signals"
```

---

### Task 3: `getCompanyOwnership` server action

**Files:**
- Create: `lib/ownership/ownership-actions.ts`

**Interfaces:**
- Consumes: `getCompanyOwnershipImpl` and `CompanyOwnership` from Task 2.
- Produces: `getCompanyOwnership(agentId: string): Promise<CompanyOwnership>` — used by Task 4.

No dedicated test file — every existing `*-actions.ts` in this codebase (`github-actions.ts`, `connect-actions.ts`, `update-actions.ts`) is an untested thin delegator to its already-tested `-impl.ts`; this follows the same convention.

- [ ] **Step 1: Write the implementation**

```ts
// lib/ownership/ownership-actions.ts
"use server"

import { getCompanyOwnershipImpl } from "./get-company-ownership-impl"
import type { CompanyOwnership } from "./get-company-ownership-impl"

export async function getCompanyOwnership(agentId: string): Promise<CompanyOwnership> {
  return getCompanyOwnershipImpl(agentId)
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: all existing tests plus Tasks 1–2's new tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/ownership/ownership-actions.ts
git commit -m "Add getCompanyOwnership server action"
```

---

### Task 4: `CompanyOwnershipSheet` component

**Files:**
- Create: `components/company-ownership-sheet.tsx`

**Interfaces:**
- Consumes: `getCompanyOwnership` from Task 3, `CompanyOwnership` type from Task 2, `CopyButton` from `components/copy-button.tsx` (existing), `Button` from `components/ui/button.tsx` (existing), `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`/`SheetDescription` from `components/ui/sheet.tsx` (existing).
- Produces: `CompanyOwnershipSheet({ agentId, companyName }: { agentId: string; companyName: string })` — a self-contained component, used by Task 5.

This follows the same "fetch on click, then open the Sheet" pattern already used by `components/verify-button.tsx`, and the same `<div className="space-y-4 px-4 pb-4">` body-padding convention already used by `components/company-setup-wizard.tsx`'s Sheet.

- [ ] **Step 1: Write the component**

```tsx
// components/company-ownership-sheet.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { CopyButton } from "@/components/copy-button"
import { getCompanyOwnership } from "@/lib/ownership/ownership-actions"
import type { CompanyOwnership } from "@/lib/ownership/get-company-ownership-impl"

const AI_EXECUTOR_LABEL: Record<string, string> = {
  "claude-code": "Claude Code",
  "openai-codex": "OpenAI Codex CLI",
  aider: "Aider",
}

export function CompanyOwnershipSheet({ agentId, companyName }: { agentId: string; companyName: string }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [ownership, setOwnership] = useState<CompanyOwnership | null>(null)

  async function handleOpen() {
    setPending(true)
    const result = await getCompanyOwnership(agentId)
    setPending(false)
    setOwnership(result)
    setOpen(true)
  }

  return (
    <>
      <Button size="sm" variant="outline" className="w-full" onClick={handleOpen} disabled={pending}>
        {pending ? "Loading…" : "View ownership"}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>What {companyName} uses, and where it lives</SheetTitle>
            <SheetDescription>What stays on this machine, and what leaves it.</SheetDescription>
          </SheetHeader>
          {ownership && !ownership.ok && (
            <p className="px-4 text-sm text-destructive">Unable to load: {ownership.message}</p>
          )}
          {ownership && ownership.ok && (
            <div className="space-y-4 px-4 pb-4 text-sm">
              <section className="space-y-1.5">
                <h3 className="font-medium">Data location</h3>
                <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2">
                  <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-pre">
                    {ownership.rootPath}
                  </code>
                  <CopyButton text={ownership.rootPath} />
                </div>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-medium">AI provider</h3>
                <p className="text-muted-foreground">
                  {AI_EXECUTOR_LABEL[ownership.aiExecutorId] ?? ownership.aiExecutorId}
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-medium">Integrations</h3>
                <p className="text-muted-foreground">{ownership.integrationStatus}</p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-medium">Backup destination</h3>
                <p className="text-muted-foreground">
                  {ownership.remoteUrl ?? "Not backed up yet — nothing leaves this machine."}
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-medium">External network access</h3>
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                  {ownership.networkAccess.map((entry) => (
                    <li key={entry.label}>{entry.label}</li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/company-ownership-sheet.tsx
git commit -m "Add CompanyOwnershipSheet component"
```

---

### Task 5: Wire the button into `AgentCard` and `app/page.tsx`

**Files:**
- Modify: `components/agent-card.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `CompanyOwnershipSheet` from Task 4.
- Produces: `AgentCard` gains one new optional prop, `showOwnershipButton?: boolean`.

- [ ] **Step 1: Add the prop and render the button in `AgentCard`**

In `components/agent-card.tsx`, add the import:

```tsx
import { CompanyOwnershipSheet } from "@/components/company-ownership-sheet"
```

Add `showOwnershipButton?: boolean` to `AgentCardProps`, alongside `showBackupButton?: boolean`:

```tsx
  showBackupButton?: boolean
  showOwnershipButton?: boolean
```

Add it to the destructured props of `AgentCard`:

```tsx
  showBackupButton,
  showOwnershipButton,
```

Render it right after the existing backup button, inside the same `<div className="space-y-2 pt-1">` block:

```tsx
          {showBackupButton && <BackupCompanyButton agentId={agent.id} companyName={agent.name} />}
          {showOwnershipButton && <CompanyOwnershipSheet agentId={agent.id} companyName={agent.name} />}
```

- [ ] **Step 2: Pass the prop from `app/page.tsx`**

In `app/page.tsx`, find the existing line:

```tsx
                showBackupButton={isCommandSet}
```

Add directly after it:

```tsx
                showOwnershipButton={isCommandSet}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS, including any existing `agent-card` or `page` tests if present.

- [ ] **Step 5: Commit**

```bash
git add components/agent-card.tsx app/page.tsx
git commit -m "Wire View ownership button into AgentCard and the Agents page"
```

---

### Task 6: Full verification pass

**Files:** none created or modified — this task only runs checks.

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Live Playwright pass against a throwaway dev-server port**

Start the dev server on a port other than 3000 if something is already using it. Navigate to the Agents page, confirm at least one `command-set` company's card shows a "View ownership" button, click it, and confirm the Sheet opens showing all five sections (Data location with a copyable path, AI provider, Integrations, Backup destination, External network access) with no console errors. This is entirely read-only — it does not touch `plh-takeshi-agent` or `plh-ops` (the button doesn't render for them), and matches only the sanctioned read-only live-test category ("opening a detail view... always fine — they don't write anything").

- [ ] **Step 5: Spot-check the CHANGELOG**

Confirm whether this warrants a dated `## vNN: Ownership dashboard` entry in `CHANGELOG.md` per this project's documentation convention (append it if so — check the current highest `vNN` in `CHANGELOG.md` first, since v33 is already reserved for the deferred "file as GitHub issue" triage follow-up).
