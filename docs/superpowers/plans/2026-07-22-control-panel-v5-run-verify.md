# AI-Native Control Panel v5 Slice: Trigger `/verify` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Run verify" control on the `ai-company-starter-main` card that runs `scripts/verify.py --json` directly and shows PASS/WARN/FAIL/INFO results — no Claude Code session spawning, no confirmation dialog (the script is read-only), no lock-file polling (it completes in about a second, so the button just awaits the result).

**Architecture:** A dependency-injected exec wrapper (mirroring `lib/adapters/launchd.ts`) that correctly treats BOTH exit 0 (all pass) and exit 1 (at least one FAIL) as legitimate results carrying valid JSON — only a genuinely unparseable/missing-script case is a real trigger failure. A thin zero-parameter `"use server"` action delegates to it, same split as `trigger-poll.ts`/`trigger-poll-impl.ts` and `save-skill-content.ts`/`-impl.ts`.

**Tech Stack:** Same as v1-v4 — Next.js 15 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, Vitest.

## Global Constraints

- No changes to `scripts/verify.py` itself.
- A nonzero exit code from the script (FAIL present) must be treated as a legitimate `{ran: true, passed: false, rows: [...]}` result, never swallowed into `{ran: false, ...}` — only a genuinely unparseable/missing-script failure is `{ran: false, ...}`.
- No confirmation dialog before running — this control has no side effects to confirm (unlike `trigger-poll-button.tsx`/`skill-editor.tsx`).
- The exported `"use server"` action (`runVerify`) takes zero parameters — the injectable exec seam lives only in the internal `run-verify-impl.ts`.
- No history of past runs — only the latest result is held in component state, discarded on page refresh.

---

### Task 1: `runVerifyImpl` and the `runVerify` Server Action

**Files:**
- Create: `lib/run-verify-impl.ts`
- Create: `lib/run-verify-impl.test.ts`
- Create: `lib/run-verify.ts`

**Interfaces:**
- Consumes: `AGENTS` from `lib/config.ts` (existing).
- Produces: `VerifyStatus` type, `VerifyRow` type `{category, id, status, message}`, `VerifyResult` type `{ran, passed, rows, message}`, `ExecFileFn` type, `runVerifyImpl(execFn?: ExecFileFn): Promise<VerifyResult>`; `runVerify(): Promise<VerifyResult>` (the zero-parameter action) — consumed by `components/verify-button.tsx` (Task 2) and `components/verify-result.tsx` (Task 2, for the `VerifyRow` type).

- [ ] **Step 1: Write the failing test `lib/run-verify-impl.test.ts`**

```ts
import { describe, it, expect, afterEach, vi } from "vitest"
import { runVerifyImpl } from "./run-verify-impl"
import type { ExecFileFn } from "./run-verify-impl"

afterEach(() => {
  vi.resetModules()
})

describe("runVerifyImpl", () => {
  it("returns passed:true when the script exits 0 with all-PASS rows", async () => {
    const fakeExec: ExecFileFn = async () => ({
      stdout: JSON.stringify({
        rows: [{ category: "STRUCTURE", id: "STRUCTURE-01", status: "PASS", message: "ok" }],
      }),
      stderr: "",
    })

    const result = await runVerifyImpl(fakeExec)

    expect(result).toEqual({
      ran: true,
      passed: true,
      rows: [{ category: "STRUCTURE", id: "STRUCTURE-01", status: "PASS", message: "ok" }],
      message: "All checks passed",
    })
  })

  it("treats a nonzero exit carrying valid JSON on stdout as a legitimate failed result, not a trigger error", async () => {
    const rows = [{ category: "HYGIENE", id: "HYGIENE-01", status: "FAIL", message: "found a TODO(temp) marker" }]
    const fakeExec: ExecFileFn = async () => {
      const err = new Error("Command failed with exit code 1") as Error & { stdout: string; stderr: string }
      err.stdout = JSON.stringify({ rows })
      err.stderr = ""
      throw err
    }

    const result = await runVerifyImpl(fakeExec)

    expect(result).toEqual({ ran: true, passed: false, rows, message: "Some checks failed" })
  })

  it("returns ran:false when the exec call fails with no parseable stdout", async () => {
    const fakeExec: ExecFileFn = async () => {
      throw new Error("spawn python3 ENOENT")
    }

    const result = await runVerifyImpl(fakeExec)

    expect(result).toEqual({ ran: false, passed: false, rows: [], message: "spawn python3 ENOENT" })
  })

  it("returns ran:false when stdout is not valid JSON even on a successful exit", async () => {
    const fakeExec: ExecFileFn = async () => ({ stdout: "not json", stderr: "" })

    const result = await runVerifyImpl(fakeExec)

    expect(result).toEqual({
      ran: false,
      passed: false,
      rows: [],
      message: "verify.py produced unparseable output",
    })
  })

  it("returns ran:false when the agent isn't configured", async () => {
    vi.doMock("./config", () => ({ AGENTS: [] }))
    const { runVerifyImpl: mockedRunVerifyImpl } = await import("./run-verify-impl")

    const result = await mockedRunVerifyImpl(async () => ({ stdout: "", stderr: "" }))

    expect(result).toEqual({
      ran: false,
      passed: false,
      rows: [],
      message: 'Agent "ai-company-starter-main" is not configured',
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/run-verify-impl.test.ts`
Expected: FAIL — `Cannot find module './run-verify-impl'`.

- [ ] **Step 3: Write `lib/run-verify-impl.ts`**

```ts
import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { AGENTS } from "./config"

const execFileAsync = promisify(nodeExecFile)

export type VerifyStatus = "PASS" | "WARN" | "FAIL" | "INFO"
export type VerifyRow = { category: string; id: string; status: VerifyStatus; message: string }
export type VerifyResult = { ran: boolean; passed: boolean; rows: VerifyRow[]; message: string }

export type ExecFileFn = (
  command: string,
  args: string[],
  options: { cwd: string }
) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(
  command: string,
  args: string[],
  options: { cwd: string }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args, options)
}

function parseRows(stdout: string): VerifyRow[] | null {
  try {
    const data = JSON.parse(stdout)
    if (!Array.isArray(data.rows)) return null
    return data.rows as VerifyRow[]
  } catch {
    return null
  }
}

const AI_COMPANY_STARTER_MAIN_ID = "ai-company-starter-main"

export async function runVerifyImpl(execFn: ExecFileFn = defaultExecFile): Promise<VerifyResult> {
  const agent = AGENTS.find((a) => a.id === AI_COMPANY_STARTER_MAIN_ID)
  if (!agent) {
    return {
      ran: false,
      passed: false,
      rows: [],
      message: `Agent "${AI_COMPANY_STARTER_MAIN_ID}" is not configured`,
    }
  }

  const scriptPath = path.join(agent.rootPath, "scripts", "verify.py")

  try {
    const { stdout } = await execFn("python3", [scriptPath, "--json"], { cwd: agent.rootPath })
    const rows = parseRows(stdout)
    if (!rows) {
      return { ran: false, passed: false, rows: [], message: "verify.py produced unparseable output" }
    }
    return { ran: true, passed: true, rows, message: "All checks passed" }
  } catch (err) {
    const stdout = err && typeof err === "object" && "stdout" in err ? (err as { stdout: unknown }).stdout : undefined
    if (typeof stdout === "string") {
      const rows = parseRows(stdout)
      if (rows) {
        return { ran: true, passed: false, rows, message: "Some checks failed" }
      }
    }
    return { ran: false, passed: false, rows: [], message: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/run-verify-impl.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write `lib/run-verify.ts`** (the zero-parameter Server Action; no test needed for this thin wrapper — mirrors `lib/trigger-poll.ts` and `lib/save-skill-content.ts`)

```ts
"use server"

import { runVerifyImpl } from "./run-verify-impl"
import type { VerifyResult } from "./run-verify-impl"

export async function runVerify(): Promise<VerifyResult> {
  return runVerifyImpl()
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass (70 from before, plus this task's 5 = 75).

- [ ] **Step 7: Commit**

```bash
git add lib/run-verify-impl.ts lib/run-verify-impl.test.ts lib/run-verify.ts
git commit -m "feat: add runVerify Server Action for ai-company-starter-main's verify.py"
```

---

### Task 2: `VerifyResultList` and `VerifyButton` components

**Files:**
- Create: `components/verify-result.tsx`
- Create: `components/verify-button.tsx`

**Interfaces:**
- Consumes: `VerifyRow`, `VerifyResult` (Task 1); `runVerify` (Task 1); shadcn `Badge`, `Button`, `Sheet*`, `ScrollArea` (existing).
- Produces: `VerifyResultList`, `VerifyButton` components — consumed by `components/agent-card.tsx` (Task 3).

- [ ] **Step 1: Write `components/verify-result.tsx`**

```tsx
import { Badge } from "@/components/ui/badge"
import type { VerifyRow } from "@/lib/run-verify-impl"

const STATUS_ORDER: Record<VerifyRow["status"], number> = { FAIL: 0, WARN: 1, INFO: 2, PASS: 3 }

export function VerifyResultList({ rows }: { rows: VerifyRow[] }) {
  const sorted = [...rows].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  return (
    <div className="space-y-2">
      {sorted.map((row) => (
        <div key={`${row.category}-${row.id}`} className="flex items-start gap-2 text-sm">
          <Badge variant={row.status === "FAIL" ? "destructive" : "outline"}>{row.status}</Badge>
          <div>
            <p className="font-medium">
              {row.category} · {row.id}
            </p>
            <p className="text-muted-foreground">{row.message}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Write `components/verify-button.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { VerifyResultList } from "@/components/verify-result"
import { runVerify } from "@/lib/run-verify"
import type { VerifyResult } from "@/lib/run-verify-impl"

export function VerifyButton() {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  async function handleRun() {
    setPending(true)
    const nextResult = await runVerify()
    setPending(false)
    setResult(nextResult)
  }

  const summary = result
    ? (() => {
        const counts: Record<string, number> = { PASS: 0, WARN: 0, FAIL: 0, INFO: 0 }
        for (const row of result.rows) counts[row.status] = (counts[row.status] ?? 0) + 1
        return `${counts.PASS} passed · ${counts.INFO} info · ${counts.WARN} warn · ${counts.FAIL} failed`
      })()
    : null

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={handleRun} disabled={pending}>
        {pending ? "Running…" : "Run verify"}
      </Button>
      {result && !result.ran && <p className="text-xs text-destructive">{result.message}</p>}
      {result && result.ran && (
        <p className={`text-xs ${result.passed ? "text-muted-foreground" : "text-destructive"}`}>
          {summary}{" "}
          <button className="underline" onClick={() => setDetailsOpen(true)}>
            View details
          </button>
        </p>
      )}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Verify results</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[80vh] pr-4">{result && <VerifyResultList rows={result.rows} />}</ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  )
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. If `Badge`'s `variant` prop doesn't accept `"destructive"`, check `components/ui/badge.tsx`'s generated variant list and adjust to whatever destructive-style variant name it actually exports.

- [ ] **Step 4: Commit**

```bash
git add components/verify-result.tsx components/verify-button.tsx
git commit -m "feat: add VerifyResultList and VerifyButton components"
```

---

### Task 3: Wire `VerifyButton` into `AgentCard` and the agent tree view page

**Files:**
- Modify: `components/agent-card.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `VerifyButton` (Task 2).
- Produces: nothing new for later tasks — this is the integration point, and this task's manual verification is a REAL run (safe, since `verify.py` is read-only with no side effects — unlike v2/v4, this doesn't need to be deferred to a separate final task).

- [ ] **Step 1: Read the current `components/agent-card.tsx` and `app/page.tsx` in full**

- [ ] **Step 2: Modify `components/agent-card.tsx`**

Add a `showVerifyButton?: boolean` prop (a plain flag, not a data prop like `launchdHealth`/`pollStatus`, since `VerifyButton` fetches its own data on click rather than being fed server-rendered state) and render `<VerifyButton />` when true:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Agent, Activity } from "@/lib/adapters/types"
import type { LaunchdHealth } from "@/lib/adapters/launchd"
import type { PollLockStatus } from "@/lib/adapters/poll-lock"
import { TriggerPollButton } from "@/components/trigger-poll-button"
import { VerifyButton } from "@/components/verify-button"

type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  launchdHealth?: LaunchdHealth
  pollStatus?: PollLockStatus
  showVerifyButton?: boolean
}

export function AgentCard({
  agent,
  latestActivity,
  error,
  launchdHealth,
  pollStatus,
  showVerifyButton,
}: AgentCardProps) {
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
        {showVerifyButton && <VerifyButton />}
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
          const isAiCompanyStarterMain = result.agent.id === "ai-company-starter-main"
          return (
            <AgentCard
              key={result.agent.id}
              agent={result.agent}
              latestActivity={latest}
              error={result.error}
              launchdHealth={isTakeshiAgent ? launchdHealth : undefined}
              pollStatus={isTakeshiAgent ? pollStatus : undefined}
              showVerifyButton={isAiCompanyStarterMain}
            />
          )
        })}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Verify in the browser — a REAL run is safe here**

Run: `npm run dev`, open `/`, confirm the "AI Company Starter" card shows a "Run verify" button. Click it for real (safe — `verify.py` only reads files, per its own docstring). Confirm: the button shows "Running…" briefly, then a summary line appears (expect roughly 30 rows total, split across PASS/INFO/WARN/FAIL matching whatever the real repo's current state is). Click "View details" and confirm the Sheet opens showing real category/id/message values, sorted with FAIL/WARN first. Stop the server after confirming.

- [ ] **Step 5: Commit**

```bash
git add components/agent-card.tsx app/page.tsx
git commit -m "feat: wire VerifyButton into the agent tree view"
```

---

### Task 4: README update and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: updated documentation — no new runtime code.

- [ ] **Step 1: Update `README.md`**

Read the current file in full first. Add a new section after "v4: skill/command editor":

```markdown
## v5: triggering ai-company-starter-main's /verify

The "AI Company Starter" card has a "Run verify" button that runs
`scripts/verify.py --json` directly and shows the PASS/WARN/FAIL/INFO
results, with a details view for the full row list. Unlike the
`plh-takeshi-agent` trigger (v2) or skill editing (v4), this needs no
confirmation dialog — `verify.py` only reads files, per its own docstring,
so there's nothing to confirm before running it.

The other 9 slash-commands under `ai-company-starter-main/.claude/commands/`
(`/decision`, `/retro`, `/define-company`, etc.) are NOT triggerable from
this dashboard yet — they're interactive, multi-turn dialogues that need a
real Claude Code session, a separate and larger mechanism than running one
existing script.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass (75 from Task 1 onward, unchanged by this docs-only task).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors; `/` still renders as dynamic (`ƒ`).

- [ ] **Step 4: Final manual pass**

Run `npm run dev`, click "Run verify" on `/` once more as a final regression check, confirm the summary and details still render correctly. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document the ai-company-starter-main verify trigger"
```
