# AI-Native Control Panel v2 Slice: Trigger Poll — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one write action to the otherwise read-only control panel: a button on the `plh-takeshi-agent` card that runs `bin/poll.sh` on demand, with a confirmation step and a live "Running…" status derived from the script's own lock file.

**Architecture:** A Server Action (`triggerPoll`) spawns `bash bin/poll.sh` detached/unref'd, appending to the same log files the scheduled launchd job already uses. A pure helper (`checkPollLockStatus`) mirrors `poll.sh`'s own lock-file check for UI status, without ever touching or reclaiming the lock itself — `poll.sh` remains the sole authority on concurrency safety.

**Tech Stack:** Same as v1 — Next.js 15 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, Vitest.

## Global Constraints

- `triggerPoll()` takes **zero parameters** from any external caller — it looks up `plh-takeshi-agent`'s path internally from `AGENTS`. No path/command/agent-id argument is ever accepted from the client.
- `poll.sh`'s own lock file (`state/poll.lock`) remains the sole safety mechanism against overlapping runs. This slice never deletes, reclaims, or otherwise mutates that lock — only reads its existence/age for display.
- No new instrumentation in `poll.sh`, `guardrail.sh`, or the pipeline itself — this slice only adds a way to invoke the existing script sooner.
- No live log streaming (SSE/websockets) — reuse v1's existing 15s `router.refresh()` polling.
- Every new function that can fail must degrade to a safe default (`{running: false, ...}` / `{started: false, message: ...}`) rather than throwing past its own boundary, matching v1's established house style.

---

### Task 1: `checkPollLockStatus` helper

**Files:**
- Create: `lib/adapters/poll-lock.ts`
- Test: `lib/adapters/poll-lock.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PollLockStatus` type `{ running: boolean; lockAgeSeconds: number | null }`, `checkPollLockStatus(rootPath: string): Promise<PollLockStatus>` — consumed by `lib/trigger-poll.ts` (Task 2) and `app/page.tsx` (Task 4).

- [ ] **Step 1: Write the failing test `lib/adapters/poll-lock.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, rm, utimes, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { checkPollLockStatus } from "./poll-lock"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "poll-lock-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("checkPollLockStatus", () => {
  it("reports not running when the lock directory doesn't exist", async () => {
    const status = await checkPollLockStatus(root)
    expect(status).toEqual({ running: false, lockAgeSeconds: null })
  })

  it("reports running with a computed age when the lock directory exists", async () => {
    const lockPath = path.join(root, "state", "poll.lock")
    await mkdir(lockPath, { recursive: true })
    const tenSecondsAgo = new Date(Date.now() - 10_000)
    await utimes(lockPath, tenSecondsAgo, tenSecondsAgo)

    const status = await checkPollLockStatus(root)

    expect(status.running).toBe(true)
    expect(status.lockAgeSeconds).toBeGreaterThanOrEqual(9)
    expect(status.lockAgeSeconds).toBeLessThanOrEqual(12)
  })

  it("reports not running if the lock path can't be stat'd", async () => {
    const stateDir = path.join(root, "state")
    await mkdir(path.join(stateDir, "poll.lock"), { recursive: true })
    await chmod(stateDir, 0o000)

    try {
      const status = await checkPollLockStatus(root)
      expect(status).toEqual({ running: false, lockAgeSeconds: null })
    } finally {
      await chmod(stateDir, 0o755)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/adapters/poll-lock.test.ts`
Expected: FAIL — `Cannot find module './poll-lock'`.

- [ ] **Step 3: Write `lib/adapters/poll-lock.ts`**

```ts
import { stat } from "node:fs/promises"
import path from "node:path"

export type PollLockStatus = {
  running: boolean
  lockAgeSeconds: number | null
}

export async function checkPollLockStatus(rootPath: string): Promise<PollLockStatus> {
  const lockPath = path.join(rootPath, "state", "poll.lock")
  try {
    const stats = await stat(lockPath)
    const ageSeconds = Math.floor((Date.now() - stats.mtimeMs) / 1000)
    return { running: true, lockAgeSeconds: ageSeconds }
  } catch {
    return { running: false, lockAgeSeconds: null }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/adapters/poll-lock.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/adapters/poll-lock.ts lib/adapters/poll-lock.test.ts
git commit -m "feat: add poll-lock status helper for plh-takeshi-agent"
```

---

### Task 2: `triggerPoll` Server Action

**Files:**
- Create: `lib/trigger-poll.ts`
- Test: `lib/trigger-poll.test.ts`

**Interfaces:**
- Consumes: `AGENTS` from `lib/config.ts` (existing); `checkPollLockStatus` from `lib/adapters/poll-lock.ts` (Task 1).
- Produces: `SpawnOptions` type, `SpawnFn` type, `triggerPoll(spawnFn?: SpawnFn): Promise<{ started: boolean; message: string }>` — consumed by `components/trigger-poll-button.tsx` (Task 3).

- [ ] **Step 1: Write the failing test `lib/trigger-poll.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "trigger-poll-test-"))
  await mkdir(path.join(root, "logs"), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

describe("triggerPoll", () => {
  it("spawns bin/poll.sh with the correct command/args/cwd when no lock is held", async () => {
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
    }))
    const { triggerPoll } = await import("./trigger-poll")

    const spawnCalls: { command: string; args: string[]; options: { cwd: string; detached: boolean } }[] = []
    const fakeSpawn = (command: string, args: string[], options: { cwd: string; detached: boolean; stdio: ["ignore", number, number] }) => {
      spawnCalls.push({ command, args, options })
      return { unref: () => {} }
    }

    const result = await triggerPoll(fakeSpawn)

    expect(result).toEqual({ started: true, message: "Poll started" })
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0].command).toBe("bash")
    expect(spawnCalls[0].args).toEqual([path.join(root, "bin", "poll.sh")])
    expect(spawnCalls[0].options.cwd).toBe(root)
    expect(spawnCalls[0].options.detached).toBe(true)
  })

  it("does not spawn and reports 'Already running' when state/poll.lock exists", async () => {
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
    }))
    await mkdir(path.join(root, "state", "poll.lock"), { recursive: true })
    const { triggerPoll } = await import("./trigger-poll")

    let spawnCalled = false
    const fakeSpawn = () => {
      spawnCalled = true
      return { unref: () => {} }
    }

    const result = await triggerPoll(fakeSpawn)

    expect(result).toEqual({ started: false, message: "Already running" })
    expect(spawnCalled).toBe(false)
  })

  it("reports the error message and does not throw when spawning fails", async () => {
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
    }))
    const { triggerPoll } = await import("./trigger-poll")

    const fakeSpawn = () => {
      throw new Error("spawn failed")
    }

    const result = await triggerPoll(fakeSpawn)

    expect(result).toEqual({ started: false, message: "spawn failed" })
  })

  it("reports an error when plh-takeshi-agent isn't in AGENTS", async () => {
    vi.doMock("./config", () => ({ AGENTS: [] }))
    const { triggerPoll } = await import("./trigger-poll")

    const result = await triggerPoll(() => ({ unref: () => {} }))

    expect(result).toEqual({ started: false, message: 'Agent "plh-takeshi-agent" is not configured' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/trigger-poll.test.ts`
Expected: FAIL — `Cannot find module './trigger-poll'`.

- [ ] **Step 3: Write `lib/trigger-poll.ts`**

```ts
"use server"

import { spawn as nodeSpawn } from "node:child_process"
import { openSync, closeSync } from "node:fs"
import path from "node:path"
import { AGENTS } from "./config"
import { checkPollLockStatus } from "./adapters/poll-lock"

export type SpawnOptions = {
  cwd: string
  detached: boolean
  stdio: ["ignore", number, number]
}

export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => { unref: () => void }

const TAKESHI_AGENT_ID = "plh-takeshi-agent"

function defaultSpawn(command: string, args: string[], options: SpawnOptions) {
  return nodeSpawn(command, args, options)
}

export async function triggerPoll(
  spawnFn: SpawnFn = defaultSpawn
): Promise<{ started: boolean; message: string }> {
  const agent = AGENTS.find((a) => a.id === TAKESHI_AGENT_ID)
  if (!agent) {
    return { started: false, message: `Agent "${TAKESHI_AGENT_ID}" is not configured` }
  }

  const lockStatus = await checkPollLockStatus(agent.rootPath)
  if (lockStatus.running) {
    return { started: false, message: "Already running" }
  }

  try {
    const outPath = path.join(agent.rootPath, "logs", "poll.out.log")
    const errPath = path.join(agent.rootPath, "logs", "poll.err.log")
    const outFd = openSync(outPath, "a")
    const errFd = openSync(errPath, "a")
    const child = spawnFn("bash", [path.join(agent.rootPath, "bin", "poll.sh")], {
      cwd: agent.rootPath,
      detached: true,
      stdio: ["ignore", outFd, errFd],
    })
    child.unref()
    closeSync(outFd)
    closeSync(errFd)
    return { started: true, message: "Poll started" }
  } catch (err) {
    return { started: false, message: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/trigger-poll.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/trigger-poll.ts lib/trigger-poll.test.ts
git commit -m "feat: add triggerPoll Server Action for plh-takeshi-agent"
```

---

### Task 3: shadcn `alert-dialog` + `TriggerPollButton` component

**Files:**
- Create: `components/ui/alert-dialog.tsx` (generated by shadcn CLI)
- Create: `components/trigger-poll-button.tsx`

**Interfaces:**
- Consumes: `PollLockStatus` (Task 1), `triggerPoll` (Task 2).
- Produces: `TriggerPollButton` component — consumed by `components/agent-card.tsx` (Task 4).

- [ ] **Step 1: Generate the shadcn alert-dialog primitive**

Run: `npx shadcn@latest add alert-dialog -y`
Expected: creates `components/ui/alert-dialog.tsx`. If the CLI reports a config mismatch, run `npx shadcn@latest init -d -y` first, then re-run the add command — same fallback pattern used in v1's Task 8.

- [ ] **Step 2: Write `components/trigger-poll-button.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { PollLockStatus } from "@/lib/adapters/poll-lock"
import { triggerPoll } from "@/lib/trigger-poll"

export function TriggerPollButton({ pollStatus }: { pollStatus: PollLockStatus }) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleConfirm() {
    setPending(true)
    setMessage(null)
    const result = await triggerPoll()
    setMessage(result.message)
    setPending(false)
  }

  const running = pollStatus.running || pending

  return (
    <div className="space-y-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" disabled={running}>
            {running ? "Running…" : "Run now"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run the Takeshi agent now?</AlertDialogTitle>
            <AlertDialogDescription>
              This runs the same automated pipeline that normally fires every 5 minutes — run it now?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/alert-dialog.tsx components/trigger-poll-button.tsx package.json package-lock.json
git commit -m "feat: add TriggerPollButton with confirmation dialog"
```

---

### Task 4: Wire into `AgentCard` and the agent tree view page

**Files:**
- Modify: `components/agent-card.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `PollLockStatus` (Task 1), `checkPollLockStatus` (Task 1), `TriggerPollButton` (Task 3).
- Produces: nothing new for later tasks — this is the integration point.

- [ ] **Step 1: Read the current `components/agent-card.tsx` and `app/page.tsx`**

Read both files in full before editing — this task modifies existing v1 files, not scaffolds new ones.

- [ ] **Step 2: Modify `components/agent-card.tsx`**

Add a `pollStatus?: PollLockStatus` prop to `AgentCardProps`, and render `<TriggerPollButton pollStatus={pollStatus} />` inside `CardContent` (after the existing `launchdHealth` paragraph) only when `pollStatus` is provided:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Agent, Activity } from "@/lib/adapters/types"
import type { LaunchdHealth } from "@/lib/adapters/launchd"
import type { PollLockStatus } from "@/lib/adapters/poll-lock"
import { TriggerPollButton } from "@/components/trigger-poll-button"

type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  launchdHealth?: LaunchdHealth
  pollStatus?: PollLockStatus
}

export function AgentCard({ agent, latestActivity, error, launchdHealth, pollStatus }: AgentCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{agent.name}</span>
          <Badge variant="outline">{agent.kind}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {error && <p className="text-destructive">Source unavailable: {error}</p>}
        {!error && !latestActivity && <p className="text-muted-foreground">No activity recorded yet.</p>}
        {!error && latestActivity && (
          <div>
            <p className="font-medium">{latestActivity.title}</p>
            <p className="text-muted-foreground">
              {new Date(latestActivity.timestamp * 1000).toLocaleString()} · {latestActivity.status}
            </p>
          </div>
        )}
        {launchdHealth && (
          <p className="text-muted-foreground">
            launchd: {launchdHealth.loaded ? "loaded" : "not loaded"}
            {launchdHealth.lastExitStatus !== null && ` (last exit ${launchdHealth.lastExitStatus})`}
          </p>
        )}
        {pollStatus && <TriggerPollButton pollStatus={pollStatus} />}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Modify `app/page.tsx`**

```tsx
import { AGENTS, ADAPTERS, TAKESHI_AGENT_LAUNCHD_LABEL } from "@/lib/config"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { checkLaunchdJob } from "@/lib/adapters/launchd"
import { checkPollLockStatus } from "@/lib/adapters/poll-lock"
import { AgentCard } from "@/components/agent-card"

export const dynamic = "force-dynamic"

export default async function AgentTreePage() {
  const takeshiAgent = AGENTS.find((agent) => agent.id === "plh-takeshi-agent")

  const [results, launchdHealth, pollStatus] = await Promise.all([
    getAllActivities(AGENTS, ADAPTERS),
    checkLaunchdJob(TAKESHI_AGENT_LAUNCHD_LABEL),
    takeshiAgent
      ? checkPollLockStatus(takeshiAgent.rootPath)
      : Promise.resolve({ running: false, lockAgeSeconds: null }),
  ])

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">AI-Native Agents</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {results.map((result) => {
          const latest = mergeAndSortActivities([result])[0] ?? null
          const isTakeshiAgent = result.agent.id === "plh-takeshi-agent"
          return (
            <AgentCard
              key={result.agent.id}
              agent={result.agent}
              latestActivity={latest}
              error={result.error}
              launchdHealth={isTakeshiAgent ? launchdHealth : undefined}
              pollStatus={isTakeshiAgent ? pollStatus : undefined}
            />
          )
        })}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`
Expected: the Takeshi card now shows a "Run now" button below the launchd line. Clicking it opens the confirmation dialog. Do NOT click "Confirm" yet in this step — that's Task 5's real-data verification, which has real side effects on the actual agent. Just confirm the dialog opens and "Cancel" closes it without side effects. Stop the server after confirming.

- [ ] **Step 5: Commit**

```bash
git add components/agent-card.tsx app/page.tsx
git commit -m "feat: wire TriggerPollButton into the agent tree view"
```

---

### Task 5: README update and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: updated documentation — no new runtime code.

**Important note for whoever executes this task's manual verification:** clicking "Confirm" in this step runs the REAL `bin/poll.sh` against the REAL `~/AI-Native/plh-takeshi-agent/`. This is the intended feature working as designed, not a mistake — but be aware: `poll.sh` checks Gmail for anything from Takeshi since its stored watermark. If there is no new email, it's a fast no-op (a Gmail search + a log line). If there IS a new unprocessed email waiting, this will kick off the real multi-role pipeline (requirements analyst → architect → senior engineer → QA → code reviewer → CLO → release engineer) against a real target repo, which can create real branches/commits/PRs — exactly what the scheduled launchd job would do anyway within 5 minutes regardless. This is expected, not a bug, but the person running this step should know a real click is about to happen before doing it.

- [ ] **Step 1: Update `README.md`**

Read the current `README.md` in full first. Add a new section after "Known v1 limitations" (or rename that section to reflect v2 additions) documenting the new capability:

```markdown
## v2: triggering plh-takeshi-agent

The Takeshi Email Agent card has a "Run now" button that runs `bin/poll.sh`
immediately instead of waiting for the next scheduled 5-minute launchd tick.
It's safe to click at any time — `poll.sh` has its own lock file
(`state/poll.lock`) that makes an overlapping run (whether triggered here or
by the scheduler) a fast no-op rather than a double-run. The button is
disabled and shows "Running…" whenever that lock is held, regardless of what
started the run.

This is still the only write action in the app — `ai-company-starter-main`
and `plh-ops` remain read-only in this dashboard.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass (should be around 36 tests: the prior 29 plus Task 1's 3 and Task 2's 4).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors; `/` still renders as dynamic (`ƒ`), matching v1's fix.

- [ ] **Step 4: Final manual verification against real data**

Run `npm run dev`, open `/`, confirm the Takeshi card's button/dialog render correctly. Per the note above, clicking "Confirm" triggers the real pipeline — do this deliberately, then:
- Confirm a fresh line appears in `~/AI-Native/plh-takeshi-agent/logs/poll.out.log` with a current timestamp.
- Confirm the button shows "Running…" if the lock is briefly held, and reverts once the run completes.
- If a new report/processed-email activity resulted, confirm it surfaces on `/` and `/activity` within one or two 15s auto-refresh cycles, exactly as v1's existing adapter already handles.

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document the plh-takeshi-agent trigger-poll feature"
```
