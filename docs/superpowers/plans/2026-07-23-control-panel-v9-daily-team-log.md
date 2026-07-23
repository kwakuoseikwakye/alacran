# Control Panel v9: Trigger plh-ops's Daily Team Log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Run now" button on the `plh-ops` agent card that spawns the exact same headless routine already registered as a local scheduled task, reading the machine's own `~/.claude/daily-team-log/config.json`, with a confirm dialog disclosing that this pushes to the shared repo.

**Architecture:** Extract a generic `lib/file-lock.ts` from `lib/company-commands/run-lock.ts` (regression-proven by that file's own unchanged test), then build a small, independent `lib/daily-team-log/` module: config reader → prompt builder → spawn action (mirroring v8's `Edit(pattern)`/`--permission-mode default` security fix, plus scoped Bash prefixes since this routine genuinely needs git/python3) → status poll → log-tail result reader. UI mirrors `TriggerPollButton`.

**Tech Stack:** Next.js Server Actions, `node:child_process` spawn with injected fakes, Vitest with real temp-dir fixtures.

## Global Constraints

- **No automated live end-to-end run this slice** — the final task runs the test suite and a production build only; it must NOT open a browser and click the real "Run now" button, since a real run pushes to the shared `plh-ops` remote. This was an explicit user decision, not a default — do not "improve" this into a live test.
- **`lib/company-commands/run-lock.test.ts` must pass completely UNCHANGED** after Task 1's extraction — this is the regression proof that the refactor preserved exact behavior.
- **`--allowedTools` grants `Edit(<pattern>)`, never bare `Write`; `--permission-mode` is `default`, never `acceptEdits`** — the exact v8-verified mechanism, reused directly.
- **Bash is scoped to exact command prefixes, never a blanket grant**, even though this routine's prompt has zero field interpolation (so there's no argv-injection surface from user input) — least-privilege stays the default.
- **All bookkeeping (lock, log) lives in the control-panel repo's own `.data/daily-team-log/`, never inside `plh-ops`.**
- **Zero-extra-parameter Server Actions** — injectable seams (`spawnFn`, `dataDir`, `configPath`) live only on `-impl.ts` functions, never on `"use server"` exports.
- **TDD with real temp-dir fixtures** — no checked-in fixture files, and never read/write the REAL `~/.claude/daily-team-log/config.json` from a test.

---

### Task 1: Extract a generic file lock

**Files:**
- Create: `lib/file-lock.ts`
- Create: `lib/file-lock.test.ts`
- Modify: `lib/company-commands/run-lock.ts`

**Interfaces:**
- Produces: `acquireLock(lockFilePath: string): Promise<boolean>`, `releaseLock(lockFilePath: string): Promise<void>`, `checkLockStatus(lockFilePath: string): Promise<{running: boolean}>` — Task 3 uses these directly for the new daily-team-log lock.
- `lib/company-commands/run-lock.ts` keeps its exact existing exported signatures (`acquireRunLock(dataDir)`, `releaseRunLock(dataDir)`, `checkRunLockStatus(dataDir)`) unchanged — only their internals delegate to the new module now.

- [ ] **Step 1: Write `lib/file-lock.ts`**

```ts
import { mkdir, unlink, writeFile, access } from "node:fs/promises"
import path from "node:path"

export async function checkLockStatus(lockFilePath: string): Promise<{ running: boolean }> {
  try {
    await access(lockFilePath)
    return { running: true }
  } catch {
    return { running: false }
  }
}

export async function acquireLock(lockFilePath: string): Promise<boolean> {
  await mkdir(path.dirname(lockFilePath), { recursive: true })
  try {
    await writeFile(lockFilePath, String(process.pid), { flag: "wx" })
    return true
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "EEXIST") {
      return false
    }
    throw err
  }
}

export async function releaseLock(lockFilePath: string): Promise<void> {
  await unlink(lockFilePath).catch(() => {})
}
```

- [ ] **Step 2: Write `lib/file-lock.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { acquireLock, releaseLock, checkLockStatus } from "./file-lock"

let root: string
let lockFilePath: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "file-lock-test-"))
  lockFilePath = path.join(root, "nested", "some.lock")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("file-lock", () => {
  it("reports not running when no lock exists", async () => {
    expect(await checkLockStatus(lockFilePath)).toEqual({ running: false })
  })

  it("acquires the lock, creating parent dirs as needed, and reports running", async () => {
    expect(await acquireLock(lockFilePath)).toBe(true)
    expect(await checkLockStatus(lockFilePath)).toEqual({ running: true })
    expect(await readFile(lockFilePath, "utf-8")).toBe(String(process.pid))
  })

  it("fails to acquire a second time while the lock is held", async () => {
    expect(await acquireLock(lockFilePath)).toBe(true)
    expect(await acquireLock(lockFilePath)).toBe(false)
  })

  it("releases the lock, allowing a subsequent acquire to succeed", async () => {
    await acquireLock(lockFilePath)
    await releaseLock(lockFilePath)
    expect(await checkLockStatus(lockFilePath)).toEqual({ running: false })
    expect(await acquireLock(lockFilePath)).toBe(true)
  })

  it("releasing a lock that doesn't exist does not throw", async () => {
    await expect(releaseLock(lockFilePath)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the new test**

Run: `npx vitest run lib/file-lock.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 4: Refactor `lib/company-commands/run-lock.ts` to delegate to it**

Replace its entire content with:

```ts
import path from "node:path"
import { acquireLock, releaseLock, checkLockStatus } from "../file-lock"

function lockPath(dataDir: string): string {
  return path.join(dataDir, "company-command.lock")
}

export async function checkRunLockStatus(dataDir: string): Promise<{ running: boolean }> {
  return checkLockStatus(lockPath(dataDir))
}

export async function acquireRunLock(dataDir: string): Promise<boolean> {
  return acquireLock(lockPath(dataDir))
}

export async function releaseRunLock(dataDir: string): Promise<void> {
  return releaseLock(lockPath(dataDir))
}
```

- [ ] **Step 5: Run `lib/company-commands/run-lock.test.ts` UNCHANGED and confirm it still passes**

Run: `npx vitest run lib/company-commands/run-lock.test.ts`
Expected: PASS, all 5 existing tests, with ZERO changes to that test file. This is the regression proof — if any assertion fails, the refactor changed observable behavior and must be fixed, not the test.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass (120 prior + 5 new = 125).

- [ ] **Step 7: Commit**

```bash
git add lib/file-lock.ts lib/file-lock.test.ts lib/company-commands/run-lock.ts
git commit -m "refactor: extract generic file-lock from company-commands' run-lock"
```

---

### Task 2: Config reader and prompt builder

**Files:**
- Create: `lib/daily-team-log/read-config.ts`
- Create: `lib/daily-team-log/read-config.test.ts`
- Create: `lib/daily-team-log/build-prompt.ts`
- Create: `lib/daily-team-log/build-prompt.test.ts`

**Interfaces:**
- Produces: `DailyTeamLogConfig`, `ReadConfigResult`, `readDailyTeamLogConfig(configPath?)`, `buildDailyTeamLogPrompt(config)` — Task 3 consumes both.

- [ ] **Step 1: Write `lib/daily-team-log/read-config.ts`**

```ts
import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export type DailyTeamLogConfig = {
  person: string
  outputRepo: string
  clone: string
  gatherPath: string
  skillMdPath: string
}

export type ReadConfigResult =
  | { ok: true; config: DailyTeamLogConfig }
  | { ok: false; reason: "not-found" | "not-bootstrapped" | "invalid" }

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".claude", "daily-team-log", "config.json")

export async function readDailyTeamLogConfig(
  configPath: string = DEFAULT_CONFIG_PATH
): Promise<ReadConfigResult> {
  let raw: string
  try {
    raw = await readFile(configPath, "utf-8")
  } catch {
    return { ok: false, reason: "not-found" }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: "invalid" }
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "invalid" }
  }
  const obj = parsed as Record<string, unknown>

  if (obj.bootstrapped !== true) {
    return { ok: false, reason: "not-bootstrapped" }
  }
  if (typeof obj.person !== "string" || obj.person.trim() === "") {
    return { ok: false, reason: "invalid" }
  }
  if (typeof obj.output_repo !== "string" || obj.output_repo.trim() === "") {
    return { ok: false, reason: "invalid" }
  }

  const outputRepo = obj.output_repo
  const clone = path.dirname(outputRepo)

  return {
    ok: true,
    config: {
      person: obj.person,
      outputRepo,
      clone,
      gatherPath: path.join(clone, "workflow", "daily-team-log", "gather.py"),
      skillMdPath: path.join(clone, "workflow", "daily-team-log", "SKILL.md"),
    },
  }
}
```

- [ ] **Step 2: Write `lib/daily-team-log/read-config.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { readDailyTeamLogConfig } from "./read-config"

let root: string
let configPath: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "read-config-test-"))
  configPath = path.join(root, "config.json")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("readDailyTeamLogConfig", () => {
  it("returns not-found when the config file doesn't exist", async () => {
    const result = await readDailyTeamLogConfig(configPath)
    expect(result).toEqual({ ok: false, reason: "not-found" })
  })

  it("returns invalid for malformed JSON", async () => {
    await writeFile(configPath, "{ not json")
    const result = await readDailyTeamLogConfig(configPath)
    expect(result).toEqual({ ok: false, reason: "invalid" })
  })

  it("returns not-bootstrapped when bootstrapped is not true", async () => {
    await writeFile(
      configPath,
      JSON.stringify({ person: null, projects: [], output_repo: null, bootstrapped: false })
    )
    const result = await readDailyTeamLogConfig(configPath)
    expect(result).toEqual({ ok: false, reason: "not-bootstrapped" })
  })

  it("returns invalid when bootstrapped but person/output_repo are missing", async () => {
    await writeFile(configPath, JSON.stringify({ bootstrapped: true }))
    const result = await readDailyTeamLogConfig(configPath)
    expect(result).toEqual({ ok: false, reason: "invalid" })
  })

  it("returns ok with derived paths for a valid bootstrapped config", async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        person: "Nana",
        projects: ["Kirirom-plh"],
        output_repo: "/Users/nanaosei/plh-ops/reports",
        timezone: "Asia/Tokyo",
        lookback_days: 3,
        bootstrapped: true,
      })
    )
    const result = await readDailyTeamLogConfig(configPath)
    expect(result).toEqual({
      ok: true,
      config: {
        person: "Nana",
        outputRepo: "/Users/nanaosei/plh-ops/reports",
        clone: "/Users/nanaosei/plh-ops",
        gatherPath: "/Users/nanaosei/plh-ops/workflow/daily-team-log/gather.py",
        skillMdPath: "/Users/nanaosei/plh-ops/workflow/daily-team-log/SKILL.md",
      },
    })
  })
})
```

- [ ] **Step 3: Run it to verify it passes**

Run: `npx vitest run lib/daily-team-log/read-config.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 4: Write `lib/daily-team-log/build-prompt.ts`**

```ts
import type { DailyTeamLogConfig } from "./read-config"

export function buildDailyTeamLogPrompt(config: DailyTeamLogConfig): string {
  return `You are running the daily team-alignment report job, unattended. Do not ask questions; handle errors gracefully.

0. Sync the shared repo first:
   git -C ${config.clone} pull --rebase --autostash
   If this fails (offline), continue with local state.

1. Run this exact command and read its output:
   python3 ${config.gatherPath} pending
2. If it prints nothing, reply "no reports to write" and stop.
3. Otherwise, for each printed date (YYYY-MM-DD), one at a time:
   a. Read ${config.skillMdPath} and follow it exactly.
   b. Get that day's clean digest:
      python3 ${config.gatherPath} digest --date <DATE>
   c. Summarize the digest into the FIXED ENGLISH daily-report template defined in SKILL.md (front matter + Summary / Done today / In progress / Blockers - needs decision / Plan for tomorrow / Claude session summary / Numbers - results). Keep every heading and front-matter key EXACTLY. It must be a summary, not a paste of the raw log.
   d. Write it to: ${config.outputRepo}/${config.person}/<DATE>.md
   e. Commit ONLY that file:
      git -C ${config.outputRepo} add ${config.person}/<DATE>.md
      git -C ${config.outputRepo} commit -m "auto(daily-log): <DATE> ${config.person}"
4. Push to the shared repo (retry once on race):
   git -C ${config.clone} pull --rebase --autostash && git -C ${config.clone} push
   If push is rejected, run that same pull --rebase + push line ONE more time.
5. When finished, report which dates you wrote in one line.

Rules:
- English output (repo rule).
- Never use an em dash; use " - " instead.
- Do not write any tokens, API keys, customer personal data, or confidential financial/legal data into the report.
- If one date fails, skip it and continue. Never use git add -A.`
}
```

- [ ] **Step 5: Write `lib/daily-team-log/build-prompt.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { buildDailyTeamLogPrompt } from "./build-prompt"
import type { DailyTeamLogConfig } from "./read-config"

const CONFIG: DailyTeamLogConfig = {
  person: "Nana",
  outputRepo: "/Users/nanaosei/plh-ops/reports",
  clone: "/Users/nanaosei/plh-ops",
  gatherPath: "/Users/nanaosei/plh-ops/workflow/daily-team-log/gather.py",
  skillMdPath: "/Users/nanaosei/plh-ops/workflow/daily-team-log/SKILL.md",
}

describe("buildDailyTeamLogPrompt", () => {
  it("substitutes every config field", () => {
    const prompt = buildDailyTeamLogPrompt(CONFIG)
    expect(prompt).toContain("git -C /Users/nanaosei/plh-ops pull")
    expect(prompt).toContain("python3 /Users/nanaosei/plh-ops/workflow/daily-team-log/gather.py pending")
    expect(prompt).toContain("Read /Users/nanaosei/plh-ops/workflow/daily-team-log/SKILL.md")
    expect(prompt).toContain("/Users/nanaosei/plh-ops/reports/Nana/<DATE>.md")
    expect(prompt).toContain('git -C /Users/nanaosei/plh-ops/reports add Nana/<DATE>.md')
    expect(prompt).toContain('auto(daily-log): <DATE> Nana')
  })

  it("leaves <DATE> as a literal token, not substituted", () => {
    const prompt = buildDailyTeamLogPrompt(CONFIG)
    expect(prompt).toContain("<DATE>")
    expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}\.md/)
  })

  it("never uses an em dash (repo rule the prompt itself states)", () => {
    const prompt = buildDailyTeamLogPrompt(CONFIG)
    expect(prompt).not.toContain("—")
  })
})
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run lib/daily-team-log/build-prompt.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/daily-team-log/read-config.ts lib/daily-team-log/read-config.test.ts lib/daily-team-log/build-prompt.ts lib/daily-team-log/build-prompt.test.ts
git commit -m "feat: read daily-team-log config and build its routine prompt"
```

---

### Task 3: Spawn Server Action

**Files:**
- Create: `lib/daily-team-log/trigger-daily-team-log-impl.ts`
- Create: `lib/daily-team-log/trigger-daily-team-log.ts`
- Create: `lib/daily-team-log/daily-team-log-status.ts`
- Create: `lib/daily-team-log/trigger-daily-team-log-impl.test.ts`
- Create: `lib/daily-team-log/paths.ts`

**Interfaces:**
- Consumes: `readDailyTeamLogConfig` and `buildDailyTeamLogPrompt` (Task 2), `acquireLock`/`releaseLock`/`checkLockStatus` (Task 1's `lib/file-lock.ts`).
- Produces: `triggerDailyTeamLog(): Promise<{started, message}>`, `getDailyTeamLogStatus(): Promise<{running}>` — Task 5's UI calls both; the log file this writes is what Task 4 reads.

- [ ] **Step 1: Write `lib/daily-team-log/paths.ts`**

```ts
import path from "node:path"

export const DAILY_TEAM_LOG_DATA_DIR = path.join(process.cwd(), ".data", "daily-team-log")
export const DAILY_TEAM_LOG_LOCK_PATH = path.join(DAILY_TEAM_LOG_DATA_DIR, "run.lock")
export const DAILY_TEAM_LOG_LOG_PATH = path.join(DAILY_TEAM_LOG_DATA_DIR, "run.log")
```

- [ ] **Step 2: Write the failing test `lib/daily-team-log/trigger-daily-team-log-impl.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { triggerDailyTeamLogImpl } from "./trigger-daily-team-log-impl"
import { checkLockStatus } from "../file-lock"

let configRoot: string
let configPath: string
let dataDir: string
let lockPath: string
let logPath: string

const VALID_CONFIG = {
  person: "Nana",
  projects: ["Kirirom-plh"],
  output_repo: "/tmp/fake-plh-ops/reports",
  timezone: "Asia/Tokyo",
  lookback_days: 3,
  bootstrapped: true,
}

beforeEach(async () => {
  configRoot = await mkdtemp(path.join(tmpdir(), "trigger-daily-team-log-test-"))
  configPath = path.join(configRoot, "config.json")
  dataDir = await mkdtemp(path.join(tmpdir(), "trigger-daily-team-log-data-"))
  lockPath = path.join(dataDir, "run.lock")
  logPath = path.join(dataDir, "run.log")
})

afterEach(async () => {
  await rm(configRoot, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
})

function fakeSpawn(calls: { command: string; args: string[]; options: unknown }[]) {
  return (command: string, args: string[], options: unknown) => {
    calls.push({ command, args, options })
    return { unref: () => {}, on: () => {} }
  }
}

describe("triggerDailyTeamLogImpl", () => {
  it("refuses to spawn when config is not found, without touching the lock", async () => {
    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await triggerDailyTeamLogImpl(configPath, lockPath, logPath, fakeSpawn(calls))

    expect(result).toEqual({
      started: false,
      message: "Not set up on this machine yet — run the daily-team-log skill's one-time setup first.",
    })
    expect(calls).toHaveLength(0)
    expect(await checkLockStatus(lockPath)).toEqual({ running: false })
  })

  it("spawns claude with the built prompt and the expected allowedTools/permission-mode when config is valid", async () => {
    await writeFile(configPath, JSON.stringify(VALID_CONFIG))
    const calls: { command: string; args: string[]; options: { cwd: string; detached: boolean } }[] = []

    const result = await triggerDailyTeamLogImpl(configPath, lockPath, logPath, fakeSpawn(calls) as never)

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("claude")
    expect(calls[0].args).toContain("-p")
    const allowedToolsIndex = calls[0].args.indexOf("--allowedTools") + 1
    const allowedTools = calls[0].args[allowedToolsIndex]
    expect(allowedTools).toContain("Edit(/tmp/fake-plh-ops/reports/**)")
    expect(allowedTools).not.toContain("Write")
    expect(allowedTools).toContain("Bash(git -C /tmp/fake-plh-ops pull*)")
    expect(allowedTools).toContain("Bash(git -C /tmp/fake-plh-ops push*)")
    expect(allowedTools).toContain("Bash(git -C /tmp/fake-plh-ops/reports add*)")
    expect(allowedTools).toContain("Bash(git -C /tmp/fake-plh-ops/reports commit*)")
    expect(allowedTools).toContain("Bash(python3 /tmp/fake-plh-ops/workflow/daily-team-log/gather.py*)")
    expect(calls[0].args[calls[0].args.indexOf("--permission-mode") + 1]).toBe("default")
    expect(calls[0].args).not.toContain("--add-dir")
    expect(calls[0].options.cwd).toBe("/tmp/fake-plh-ops")
    expect(calls[0].options.detached).toBe(true)
  })

  it("does not spawn and reports 'Already running' when the lock is already held", async () => {
    await writeFile(configPath, JSON.stringify(VALID_CONFIG))
    const { acquireLock } = await import("../file-lock")
    await acquireLock(lockPath)

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await triggerDailyTeamLogImpl(configPath, lockPath, logPath, fakeSpawn(calls))

    expect(result).toEqual({ started: false, message: "Already running" })
    expect(calls).toHaveLength(0)
  })

  it("reports an error and releases the lock when spawning throws", async () => {
    await writeFile(configPath, JSON.stringify(VALID_CONFIG))
    const throwingSpawn = () => {
      throw new Error("spawn claude ENOENT")
    }

    const result = await triggerDailyTeamLogImpl(configPath, lockPath, logPath, throwingSpawn as never)

    expect(result).toEqual({ started: false, message: "spawn claude ENOENT" })
    expect(await checkLockStatus(lockPath)).toEqual({ running: false })
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/daily-team-log/trigger-daily-team-log-impl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `lib/daily-team-log/trigger-daily-team-log-impl.ts`**

```ts
import { spawn as nodeSpawn } from "node:child_process"
import { openSync, closeSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { readDailyTeamLogConfig } from "./read-config"
import { buildDailyTeamLogPrompt } from "./build-prompt"
import { acquireLock, releaseLock } from "../file-lock"

export type SpawnOptions = {
  cwd: string
  detached: boolean
  stdio: ["ignore", number, number]
}
export type SpawnedProcess = {
  unref: () => void
  on: (event: "exit", listener: (code: number | null) => void) => void
}
export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => SpawnedProcess

export function defaultSpawn(command: string, args: string[], options: SpawnOptions): SpawnedProcess {
  return nodeSpawn(command, args, options)
}

const NOT_BOOTSTRAPPED_MESSAGE =
  "Not set up on this machine yet — run the daily-team-log skill's one-time setup first."

export async function triggerDailyTeamLogImpl(
  configPath: string,
  lockPath: string,
  logPath: string,
  spawnFn: SpawnFn = defaultSpawn
): Promise<{ started: boolean; message: string }> {
  const configResult = await readDailyTeamLogConfig(configPath)
  if (!configResult.ok) {
    return { started: false, message: NOT_BOOTSTRAPPED_MESSAGE }
  }
  const config = configResult.config

  const acquired = await acquireLock(lockPath)
  if (!acquired) {
    return { started: false, message: "Already running" }
  }

  let outFd: number | undefined
  try {
    const prompt = buildDailyTeamLogPrompt(config)
    const allowedTools = [
      "Read,Grep,Glob",
      `Edit(${config.outputRepo}/**)`,
      `Bash(git -C ${config.clone} pull*)`,
      `Bash(git -C ${config.clone} push*)`,
      `Bash(git -C ${config.outputRepo} add*)`,
      `Bash(git -C ${config.outputRepo} commit*)`,
      `Bash(python3 ${config.gatherPath}*)`,
    ].join(",")

    await mkdir(path.dirname(logPath), { recursive: true })
    outFd = openSync(logPath, "a")
    const child = spawnFn(
      "claude",
      ["-p", prompt, "--allowedTools", allowedTools, "--permission-mode", "default", "--output-format", "text"],
      { cwd: config.clone, detached: true, stdio: ["ignore", outFd, outFd] }
    )
    child.on("exit", () => {
      releaseLock(lockPath).catch(() => {})
    })
    child.unref()
    return { started: true, message: "Started" }
  } catch (err) {
    await releaseLock(lockPath).catch(() => {})
    return { started: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    if (outFd !== undefined) closeSync(outFd)
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/daily-team-log/trigger-daily-team-log-impl.test.ts`
Expected: PASS, all 4 cases.

- [ ] **Step 6: Write `lib/daily-team-log/trigger-daily-team-log.ts`**

```ts
"use server"

import { triggerDailyTeamLogImpl } from "./trigger-daily-team-log-impl"
import { DAILY_TEAM_LOG_LOCK_PATH, DAILY_TEAM_LOG_LOG_PATH } from "./paths"
import os from "node:os"
import path from "node:path"

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".claude", "daily-team-log", "config.json")

export async function triggerDailyTeamLog(): Promise<{ started: boolean; message: string }> {
  return triggerDailyTeamLogImpl(DEFAULT_CONFIG_PATH, DAILY_TEAM_LOG_LOCK_PATH, DAILY_TEAM_LOG_LOG_PATH)
}
```

- [ ] **Step 7: Write `lib/daily-team-log/daily-team-log-status.ts`**

```ts
"use server"

import { checkLockStatus } from "../file-lock"
import { DAILY_TEAM_LOG_LOCK_PATH } from "./paths"

export async function getDailyTeamLogStatus(): Promise<{ running: boolean }> {
  return checkLockStatus(DAILY_TEAM_LOG_LOCK_PATH)
}
```

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add lib/daily-team-log/paths.ts lib/daily-team-log/trigger-daily-team-log-impl.ts lib/daily-team-log/trigger-daily-team-log.ts lib/daily-team-log/daily-team-log-status.ts lib/daily-team-log/trigger-daily-team-log-impl.test.ts
git commit -m "feat: spawn the daily-team-log routine with scoped Edit/Bash permissions"
```

---

### Task 4: Result reader (log tail)

**Files:**
- Create: `lib/daily-team-log/daily-team-log-result-impl.ts`
- Create: `lib/daily-team-log/daily-team-log-result.ts`
- Create: `lib/daily-team-log/daily-team-log-result-impl.test.ts`

**Interfaces:**
- Consumes: the log file Task 3's spawn writes to.
- Produces: `getDailyTeamLogResult(): Promise<{ranAtLeastOnce: boolean; lastLine: string | null}>` — Task 5's UI calls this once the status poll shows idle.

- [ ] **Step 1: Write the failing test `lib/daily-team-log/daily-team-log-result-impl.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getDailyTeamLogResultImpl } from "./daily-team-log-result-impl"

let root: string
let logPath: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "daily-team-log-result-test-"))
  logPath = path.join(root, "run.log")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("getDailyTeamLogResultImpl", () => {
  it("reports not-yet-run when the log file doesn't exist", async () => {
    const result = await getDailyTeamLogResultImpl(logPath)
    expect(result).toEqual({ ranAtLeastOnce: false, lastLine: null })
  })

  it("returns the last non-empty line of the log", async () => {
    await writeFile(logPath, "some earlier output\n\nno reports to write\n\n")
    const result = await getDailyTeamLogResultImpl(logPath)
    expect(result).toEqual({ ranAtLeastOnce: true, lastLine: "no reports to write" })
  })

  it("returns the last non-empty line even without a trailing newline", async () => {
    await writeFile(logPath, "line one\nWrote reports for: 2026-07-21, 2026-07-22")
    const result = await getDailyTeamLogResultImpl(logPath)
    expect(result).toEqual({ ranAtLeastOnce: true, lastLine: "Wrote reports for: 2026-07-21, 2026-07-22" })
  })

  it("reports ranAtLeastOnce true with a null lastLine if the log file is empty", async () => {
    await writeFile(logPath, "")
    const result = await getDailyTeamLogResultImpl(logPath)
    expect(result).toEqual({ ranAtLeastOnce: true, lastLine: null })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/daily-team-log/daily-team-log-result-impl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/daily-team-log/daily-team-log-result-impl.ts`**

```ts
import { readFile } from "node:fs/promises"

export type DailyTeamLogResult = {
  ranAtLeastOnce: boolean
  lastLine: string | null
}

export async function getDailyTeamLogResultImpl(logPath: string): Promise<DailyTeamLogResult> {
  let content: string
  try {
    content = await readFile(logPath, "utf-8")
  } catch {
    return { ranAtLeastOnce: false, lastLine: null }
  }

  const lines = content.split("\n").map((line) => line.trim()).filter((line) => line.length > 0)
  const lastLine = lines.length > 0 ? lines[lines.length - 1] : null
  return { ranAtLeastOnce: true, lastLine }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/daily-team-log/daily-team-log-result-impl.test.ts`
Expected: PASS, all 4 cases.

- [ ] **Step 5: Write `lib/daily-team-log/daily-team-log-result.ts`**

```ts
"use server"

import { getDailyTeamLogResultImpl } from "./daily-team-log-result-impl"
import type { DailyTeamLogResult } from "./daily-team-log-result-impl"
import { DAILY_TEAM_LOG_LOG_PATH } from "./paths"

export async function getDailyTeamLogResult(): Promise<DailyTeamLogResult> {
  return getDailyTeamLogResultImpl(DAILY_TEAM_LOG_LOG_PATH)
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/daily-team-log/daily-team-log-result-impl.ts lib/daily-team-log/daily-team-log-result.ts lib/daily-team-log/daily-team-log-result-impl.test.ts
git commit -m "feat: read the daily-team-log run's final status line"
```

---

### Task 5: UI — Run now button on the plh-ops card

**Files:**
- Create: `components/daily-team-log-button.tsx`
- Modify: `components/agent-card.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `triggerDailyTeamLog` (Task 3), `getDailyTeamLogStatus` (Task 3), `getDailyTeamLogResult` (Task 4).
- Produces: nothing for later tasks — this is the final integration point.

- [ ] **Step 1: Read the current `components/agent-card.tsx` and `app/page.tsx` in full** before editing (both have been touched by prior slices).

- [ ] **Step 2: Write `components/daily-team-log-button.tsx`**

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
import { triggerDailyTeamLog } from "@/lib/daily-team-log/trigger-daily-team-log"
import { getDailyTeamLogStatus } from "@/lib/daily-team-log/daily-team-log-status"
import { getDailyTeamLogResult } from "@/lib/daily-team-log/daily-team-log-result"

const POLL_INTERVAL_MS = 3000

export function DailyTeamLogButton() {
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function pollUntilDone() {
    const status = await getDailyTeamLogStatus()
    if (status.running) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      return
    }
    setRunning(false)
    const result = await getDailyTeamLogResult()
    setMessage(result.lastLine ?? "Finished (no output captured).")
  }

  async function handleConfirm() {
    setMessage(null)
    const response = await triggerDailyTeamLog()
    if (!response.started) {
      setMessage(response.message)
      return
    }
    setRunning(true)
    setTimeout(pollUntilDone, POLL_INTERVAL_MS)
  }

  return (
    <div className="space-y-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={running}>
            {running ? "Running…" : "Run now"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run the daily team-log now?</AlertDialogTitle>
            <AlertDialogDescription>
              This reads your local Claude Code session history, writes and commits a report, and
              pushes it to the shared plh-ops repo — the same routine that already runs automatically
              every night at 22:00.
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

- [ ] **Step 3: Wire it into `components/agent-card.tsx`**

Add the import:
```tsx
import { DailyTeamLogButton } from "@/components/daily-team-log-button"
```

Add a new prop to `AgentCardProps`:
```tsx
showDailyTeamLogButton?: boolean
```

Add it to the destructured props, and render it alongside the existing `showVerifyButton` line:
```tsx
{showDailyTeamLogButton && <DailyTeamLogButton />}
```

Leave every other existing line untouched.

- [ ] **Step 4: Wire the new prop through `app/page.tsx`**

Add, alongside the existing `isAiCompanyStarterMain` computation inside the `.map`:
```tsx
const isPlhOps = result.agent.id === "plh-ops"
```

Pass it to `AgentCard`:
```tsx
showDailyTeamLogButton={isPlhOps}
```

Leave every other existing line untouched.

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/daily-team-log-button.tsx components/agent-card.tsx app/page.tsx
git commit -m "feat: add a Run now button for plh-ops's daily-team-log"
```

---

### Task 6: README and final verification (no live run)

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: updated documentation — no new runtime code, no live run.

- [ ] **Step 1: Update `README.md`**

Read the current file in full first. Add a new section after the most recent existing version section:

```markdown
## v9: trigger plh-ops's daily-team-log on demand

The `plh-ops` card now has a "Run now" button that triggers the exact same
routine already registered as a nightly (22:00) scheduled task on this
machine — reading `~/.claude/daily-team-log/config.json`, summarizing the
operator's own local Claude Code session history, and committing the
result to the shared `plh-ops` repo. Unlike every other write action in
this app, this one **pushes to a remote shared with Takeshi's analysis
agent and teammates** — the confirm dialog discloses this plainly before
the run starts, since there's no local diff to preview beforehand (the
routine's job is to summarize and commit autonomously, same as its
existing nightly schedule). The spawned session still follows this
project's least-privilege discipline: no bare `Write` grant (only
`Edit(<output_repo>/**)`), `--permission-mode default` (not `acceptEdits`),
and Bash scoped to the exact five command shapes the routine needs — never
a blanket grant, even though this routine's prompt has no user-field
interpolation at all (there's nothing here for a user to inject into).

If the machine hasn't run the daily-team-log skill's one-time setup yet,
the button reports that plainly instead of attempting a run.
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass — 125 from before this slice plus this slice's new ones (file-lock: 5, read-config: 5, build-prompt: 3, trigger-daily-team-log-impl: 4, daily-team-log-result-impl: 4 — 21 new, ~146 total; treat a different-but-reasonable count as fine as long as nothing fails).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Do NOT perform a live end-to-end run**

Per the explicit user decision for this slice, do not open the dev server and click the real "Run now" button, and do not invoke `triggerDailyTeamLog`/`triggerDailyTeamLogImpl` against the real `~/.claude/daily-team-log/config.json` or the real `~/AI-Native/plh-ops` repo for any reason. Verification for this task is the test suite and build only. If you want to sanity-check the button renders, it is acceptable to load `/` in a browser and confirm the "Run now" button and its confirm dialog TEXT appear correctly on the `plh-ops` card — but do not click "Confirm" in that dialog.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document triggering plh-ops's daily-team-log from the dashboard"
```
