# Control Panel v10: Live Log Streaming — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show growing log content live (via polling, not push) while any of v2/v8/v9's triggers are running, instead of only a boolean "Running…" label.

**Architecture:** One pure-string `tailLines` helper, three thin per-feature "use server" tail actions each reading an already-fixed log path, one shared `<LogTailView>` renderer, and per-component poll-loop wiring — including adding a genuine poll loop to v2's `TriggerPollButton`, which currently has none (a real, previously-latent gap this slice's scoping uncovered).

**Tech Stack:** Next.js Server Actions, Vitest with real temp-dir fixtures, existing shadcn components.

## Global Constraints

- Every new tail action reads a FIXED, non-client-supplied path (or validates a whitelisted id like `getCompanyCommand` already does) — no caller-supplied arbitrary file path, ever.
- `tailLines` is pure string logic — no fs access — independently unit-testable.
- `getDailyTeamLogLogTail` must never be exercised against the real `~/.claude/daily-team-log/` log path or trigger a real run — it only ever reads a log file that a real run would have produced; this task never produces that file for real.
- Zero-extra-parameter Server Actions except where a real domain parameter is unavoidable (`getCompanyCommandLogTail(commandId)`, validated against the registry).
- TDD with real temp-dir fixtures — no checked-in fixture files.

---

### Task 1: `tailLines` helper

**Files:**
- Create: `lib/log-tail.ts`
- Create: `lib/log-tail.test.ts`

**Interfaces:**
- Produces: `tailLines(content: string, maxLines: number): string` — every later task's tail action uses this.

- [ ] **Step 1: Write the failing test `lib/log-tail.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { tailLines } from "./log-tail"

describe("tailLines", () => {
  it("returns all content when shorter than maxLines", () => {
    expect(tailLines("a\nb\nc", 10)).toBe("a\nb\nc")
  })

  it("returns only the last maxLines lines", () => {
    const content = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n")
    const result = tailLines(content, 3)
    expect(result).toBe("line7\nline8\nline9")
  })

  it("returns empty string for empty content", () => {
    expect(tailLines("", 5)).toBe("")
  })

  it("handles a single line with no newline", () => {
    expect(tailLines("only one line", 5)).toBe("only one line")
  })

  it("handles maxLines of exactly the content length", () => {
    expect(tailLines("a\nb\nc", 3)).toBe("a\nb\nc")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/log-tail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/log-tail.ts`**

```ts
export function tailLines(content: string, maxLines: number): string {
  const lines = content.split("\n")
  return lines.slice(-maxLines).join("\n")
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/log-tail.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/log-tail.ts lib/log-tail.test.ts
git commit -m "feat: add tailLines helper for live log viewing"
```

---

### Task 2: v2's poll status + log tail actions

**Files:**
- Create: `lib/get-poll-status.ts`
- Create: `lib/adapters/get-poll-log-tail.ts`
- Create: `lib/adapters/get-poll-log-tail.test.ts`

**Interfaces:**
- Consumes: `tailLines` (Task 1), `checkPollLockStatus` (existing, unmodified `lib/adapters/poll-lock.ts`), `AGENTS` (existing `lib/config.ts`).
- Produces: `getPollStatus(): Promise<PollLockStatus>`, `getPollLogTail(): Promise<{ stdout: string; stderr: string }>` — Task 5's UI wiring for `TriggerPollButton` consumes both.

- [ ] **Step 1: Write `lib/get-poll-status.ts`**

```ts
"use server"

import { AGENTS } from "./config"
import { checkPollLockStatus } from "./adapters/poll-lock"
import type { PollLockStatus } from "./adapters/poll-lock"

const TAKESHI_AGENT_ID = "plh-takeshi-agent"

export async function getPollStatus(): Promise<PollLockStatus> {
  const agent = AGENTS.find((a) => a.id === TAKESHI_AGENT_ID)
  if (!agent) {
    return { running: false, lockAgeSeconds: null }
  }
  return checkPollLockStatus(agent.rootPath)
}
```

- [ ] **Step 2: Write the failing test `lib/adapters/get-poll-log-tail.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "get-poll-log-tail-test-"))
  await mkdir(path.join(root, "logs"), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

describe("getPollLogTail", () => {
  it("returns empty strings when neither log file exists", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
    }))
    const { getPollLogTail } = await import("./get-poll-log-tail")

    const result = await getPollLogTail()

    expect(result).toEqual({ stdout: "", stderr: "" })
  })

  it("returns the tail of both log files when they exist", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
    }))
    await writeFile(path.join(root, "logs", "poll.out.log"), "line1\nline2\n")
    await writeFile(path.join(root, "logs", "poll.err.log"), "warning: x\n")
    const { getPollLogTail } = await import("./get-poll-log-tail")

    const result = await getPollLogTail()

    expect(result).toEqual({ stdout: "line1\nline2", stderr: "warning: x" })
  })

  it("returns empty strings when the agent isn't configured", async () => {
    vi.doMock("../config", () => ({ AGENTS: [] }))
    const { getPollLogTail } = await import("./get-poll-log-tail")

    const result = await getPollLogTail()

    expect(result).toEqual({ stdout: "", stderr: "" })
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/adapters/get-poll-log-tail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `lib/adapters/get-poll-log-tail.ts`**

```ts
"use server"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { AGENTS } from "../config"
import { tailLines } from "../log-tail"

const TAKESHI_AGENT_ID = "plh-takeshi-agent"
const MAX_TAIL_LINES = 200

async function readTail(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, "utf-8")
    return tailLines(content, MAX_TAIL_LINES)
  } catch {
    return ""
  }
}

export async function getPollLogTail(): Promise<{ stdout: string; stderr: string }> {
  const agent = AGENTS.find((a) => a.id === TAKESHI_AGENT_ID)
  if (!agent) {
    return { stdout: "", stderr: "" }
  }

  const [stdout, stderr] = await Promise.all([
    readTail(path.join(agent.rootPath, "logs", "poll.out.log")),
    readTail(path.join(agent.rootPath, "logs", "poll.err.log")),
  ])
  return { stdout, stderr }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/adapters/get-poll-log-tail.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/get-poll-status.ts lib/adapters/get-poll-log-tail.ts lib/adapters/get-poll-log-tail.test.ts
git commit -m "feat: add poll status and log-tail actions for live viewing"
```

---

### Task 3: Company-command log tail action

**Files:**
- Create: `lib/company-commands/company-command-log-tail.ts`
- Create: `lib/company-commands/company-command-log-tail.test.ts`

**Interfaces:**
- Consumes: `tailLines` (Task 1), `getCompanyCommand` (existing `./registry`), `COMPANY_COMMANDS_DATA_DIR` (existing `./paths`).
- Produces: `getCompanyCommandLogTail(commandId: string): Promise<{ tail: string }>` — Task 5's UI wiring consumes this.

- [ ] **Step 1: Write the failing test `lib/company-commands/company-command-log-tail.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dataDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "company-command-log-tail-test-"))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

describe("getCompanyCommandLogTail", () => {
  it("rejects an unknown commandId without touching the filesystem", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("create-epic")

    expect(result).toEqual({ tail: "" })
  })

  it("returns empty tail when the log file doesn't exist yet", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("digest")

    expect(result).toEqual({ tail: "" })
  })

  it("returns the log's tail for a known command", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    await writeFile(path.join(dataDir, "digest.log"), "scanning notes/...\nwrote digest\n")
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("digest")

    expect(result).toEqual({ tail: "scanning notes/...\nwrote digest" })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/company-commands/company-command-log-tail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/company-commands/company-command-log-tail.ts`**

```ts
"use server"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { getCompanyCommand } from "./registry"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { tailLines } from "../log-tail"

const MAX_TAIL_LINES = 200

export async function getCompanyCommandLogTail(commandId: string): Promise<{ tail: string }> {
  const command = getCompanyCommand(commandId)
  if (!command) {
    return { tail: "" }
  }

  try {
    const content = await readFile(path.join(COMPANY_COMMANDS_DATA_DIR, `${command.id}.log`), "utf-8")
    return { tail: tailLines(content, MAX_TAIL_LINES) }
  } catch {
    return { tail: "" }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/company-commands/company-command-log-tail.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/company-commands/company-command-log-tail.ts lib/company-commands/company-command-log-tail.test.ts
git commit -m "feat: add log-tail action for company-command runs"
```

---

### Task 4: Daily-team-log tail action

**Files:**
- Create: `lib/daily-team-log/daily-team-log-log-tail.ts`
- Create: `lib/daily-team-log/daily-team-log-log-tail.test.ts`

**Interfaces:**
- Consumes: `tailLines` (Task 1), `DAILY_TEAM_LOG_LOG_PATH` (existing `./paths`).
- Produces: `getDailyTeamLogLogTail(): Promise<{ tail: string }>` — Task 5's UI wiring consumes this.

- [ ] **Step 1: Write the failing test `lib/daily-team-log/daily-team-log-log-tail.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let logPath: string
let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "daily-team-log-log-tail-test-"))
  logPath = path.join(root, "run.log")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

describe("getDailyTeamLogLogTail", () => {
  it("returns empty tail when the log file doesn't exist", async () => {
    vi.doMock("./paths", () => ({ DAILY_TEAM_LOG_LOG_PATH: logPath }))
    const { getDailyTeamLogLogTail } = await import("./daily-team-log-log-tail")

    const result = await getDailyTeamLogLogTail()

    expect(result).toEqual({ tail: "" })
  })

  it("returns the log's tail when it exists", async () => {
    vi.doMock("./paths", () => ({ DAILY_TEAM_LOG_LOG_PATH: logPath }))
    await writeFile(logPath, "syncing repo...\nno reports to write\n")
    const { getDailyTeamLogLogTail } = await import("./daily-team-log-log-tail")

    const result = await getDailyTeamLogLogTail()

    expect(result).toEqual({ tail: "syncing repo...\nno reports to write" })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/daily-team-log/daily-team-log-log-tail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/daily-team-log/daily-team-log-log-tail.ts`**

```ts
"use server"

import { readFile } from "node:fs/promises"
import { DAILY_TEAM_LOG_LOG_PATH } from "./paths"
import { tailLines } from "../log-tail"

const MAX_TAIL_LINES = 200

export async function getDailyTeamLogLogTail(): Promise<{ tail: string }> {
  try {
    const content = await readFile(DAILY_TEAM_LOG_LOG_PATH, "utf-8")
    return { tail: tailLines(content, MAX_TAIL_LINES) }
  } catch {
    return { tail: "" }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/daily-team-log/daily-team-log-log-tail.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/daily-team-log/daily-team-log-log-tail.ts lib/daily-team-log/daily-team-log-log-tail.test.ts
git commit -m "feat: add log-tail action for daily-team-log runs"
```

---

### Task 5: UI — shared tail view + wiring into all three components

**Files:**
- Create: `components/log-tail-view.tsx`
- Modify: `components/trigger-poll-button.tsx`
- Modify: `components/company-command-runner.tsx`
- Modify: `components/daily-team-log-button.tsx`

**Interfaces:**
- Consumes: `getPollStatus`/`getPollLogTail` (Task 2), `getCompanyCommandLogTail` (Task 3), `getDailyTeamLogLogTail` (Task 4).
- Produces: nothing for later tasks — final integration point.

- [ ] **Step 1: Read the current content of all three modified components in full** before editing (all have been touched by prior slices or are unmodified since their own shipping slice — read current state, don't assume).

- [ ] **Step 2: Write `components/log-tail-view.tsx`**

```tsx
export function LogTailView({ content }: { content: string }) {
  return (
    <pre className="max-h-40 overflow-y-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
      {content || "(no output yet)"}
    </pre>
  )
}
```

- [ ] **Step 3: Rewrite `components/trigger-poll-button.tsx`** to add a real poll loop and tail view

Replace its entire content with:

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
import { LogTailView } from "@/components/log-tail-view"
import type { PollLockStatus } from "@/lib/adapters/poll-lock"
import { triggerPoll } from "@/lib/trigger-poll"
import { getPollStatus } from "@/lib/get-poll-status"
import { getPollLogTail } from "@/lib/adapters/get-poll-log-tail"

const POLL_INTERVAL_MS = 3000

export function TriggerPollButton({ pollStatus }: { pollStatus: PollLockStatus }) {
  const [running, setRunning] = useState(pollStatus.running)
  const [message, setMessage] = useState<string | null>(null)
  const [tail, setTail] = useState("")

  async function pollUntilDone() {
    const status = await getPollStatus()
    const logTail = await getPollLogTail()
    setTail([logTail.stdout, logTail.stderr].filter(Boolean).join("\n"))
    if (status.running) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      return
    }
    setRunning(false)
  }

  async function handleConfirm() {
    setMessage(null)
    const result = await triggerPoll()
    setMessage(result.message)
    if (result.started) {
      setRunning(true)
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
    }
  }

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
      {running && <LogTailView content={tail} />}
    </div>
  )
}
```

Note: `triggerPoll()`'s return type is `{ started: boolean; message: string }`
already — verify this against the current `lib/trigger-poll.ts` before
assuming; if its return type lacks a `started` field, adjust this
component to match its ACTUAL current shape rather than the assumed one
above (read the file first, per Step 1).

- [ ] **Step 4: Add tail polling to `components/company-command-runner.tsx`**

Add the import:
```tsx
import { getCompanyCommandLogTail } from "@/lib/company-commands/company-command-log-tail"
import { LogTailView } from "@/components/log-tail-view"
```

Add a new state:
```tsx
const [tail, setTail] = useState("")
```

In `pollUntilDone`, before the `if (status.running)` check, add:
```tsx
const logTail = await getCompanyCommandLogTail(command.id)
setTail(logTail.tail)
```

In the JSX, add `{running && <LogTailView content={tail} />}` immediately after the existing `{message && ...}` line.

Leave every other existing line (the field form, `handleRun`, `handleConfirmCommit`, the diff/confirm-dialog rendering) untouched.

- [ ] **Step 5: Add tail polling to `components/daily-team-log-button.tsx`**

Add the import:
```tsx
import { getDailyTeamLogLogTail } from "@/lib/daily-team-log/daily-team-log-log-tail"
import { LogTailView } from "@/components/log-tail-view"
```

Add a new state:
```tsx
const [tail, setTail] = useState("")
```

In `pollUntilDone`, before the `if (status.running)` check, add:
```tsx
const logTail = await getDailyTeamLogLogTail()
setTail(logTail.tail)
```

In the JSX, add `{running && <LogTailView content={tail} />}` immediately after the existing `{message && ...}` line.

Leave every other existing line untouched.

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/log-tail-view.tsx components/trigger-poll-button.tsx components/company-command-runner.tsx components/daily-team-log-button.tsx
git commit -m "feat: show live log tail while a trigger is running"
```

---

### Task 6: README and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: updated documentation — no new runtime code.

- [ ] **Step 1: Update `README.md`**

Read the current file in full first. Add a new section after the most recent existing version section:

```markdown
## v10: live log streaming for in-flight runs

The Takeshi-agent poll button, every company-command's "Run" tab, and the
plh-ops daily-team-log button all now show the growing tail of their log
file while running, instead of only a static "Running…" label — polled
the same ~3s interval each already used for its running/idle status, not
a separate mechanism. No websockets or SSE; it's the same file each
feature already writes, just read a little more of it on every tick. The
Takeshi-agent button also gained a real client-side poll loop for the
first time (`getPollStatus`) — previously it only reflected the page's
initial server-render snapshot plus its own button-press state, which
meant it never actually tracked `poll.sh`'s real running state after the
button was clicked; this slice fixed that as a natural part of adding the
tail view, since showing live log content next to a stale running
indicator would have been actively misleading.
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass — the prior 142 plus this slice's new ones (log-tail: 5, get-poll-log-tail: 3, company-command-log-tail: 3, daily-team-log-log-tail: 2 — 13 new, ~155 total; treat a different-but-reasonable count as fine as long as nothing fails).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Manual check (no new live run required)**

Run `npm run dev`, load `/`, and confirm the page renders without error.
This slice adds no new spawn/write surface — it only reads log files
v2/v8/v9 already produce during their own already-verified live tests —
so no NEW live trigger is required to verify this slice. If you want to
visually confirm the tail view works, you may re-run v8's already-safe
`digest` company-command live test (same safe target as before) and
watch the tail update during the run; this is optional, not required, and
if you do it, follow the exact same safety constraints v8's own live-test
task established (only `digest`, never the other 4 commands, never
`plh-takeshi-agent`/`plh-ops`'s daily-team-log for real). Do NOT click
the real Takeshi-agent "Run now" button or the real daily-team-log
"Run now" button as part of this verification — those remain subject to
their own slices' standing constraints (daily-team-log especially: still
never live-tested for real, per the user's v9 decision).

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document live log streaming for in-flight runs"
```
