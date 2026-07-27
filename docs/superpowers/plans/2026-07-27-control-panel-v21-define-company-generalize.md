# v21: AI-generated ontology entities via generalized define-company Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session note:** this session's subagent-spawn cap (200/session) has
> been hit repeatedly (v14, v16, v17, v18, v19, v20). If a task's
> implementer dispatch fails with a spawn-limit error, do not retry —
> execute that task (and any remaining tasks) directly instead:
> read the target file first, apply the step's code exactly, run the
> listed test commands, then self-review the whole branch before
> merging.

**Goal:** Generalize v8's headless `define-company` command-runner so it
can target any registered `command-set` company (not just
`ai-company-starter-main`), and add a step to v18's wizard that lets the
AI draft tailored ontology entities instead of the verbatim-copied
generic ones.

**Architecture:** Three backend files (`run-company-command-impl.ts`,
the `company-command-status`/`log-tail`/`result` read-path wrappers,
`commit-company-command-result-impl.ts`) gain a required `agentId`
parameter, resolving the target agent via `getEffectiveAgents()` instead
of a hardcoded `ai-company-starter-main` lookup. The per-command data
directory (`run-lock`, `*.run.json`, `*.log`) becomes agent-scoped
(`.data/company-runs/<agentId>/`) to fix a real, currently-latent
collision. The existing Skills-page "Run" tab is left exactly as-is
(still gated to `ai-company-starter-main`); the only new entry point is
a choice step inside `company-setup-wizard.tsx` that runs
`define-company` headlessly using the wizard's already-collected
answers, then shows the AI's diff for confirmation before committing.

**Tech Stack:** Existing subprocess (`node:child_process`), Vitest. No
new dependencies.

## Global Constraints

- Scope is **`define-company` only** — `digest`/`decision`/`retro`/
  `handoff` stay reachable only through the existing, unchanged
  Skills-page Run tab (`ai-company-starter-main`-only).
- No changes to `skill-browser.tsx`'s `matchedCompanyCommand` gating
  logic itself — `define-company` becomes runnable against other
  companies only through the new wizard step.
- `COMPANY_COMMANDS_DATA_DIR` becomes agent-scoped
  (`path.join(COMPANY_COMMANDS_DATA_DIR, agentId)`) everywhere a
  command's run-lock/run-result/log file is read or written — this is a
  correctness fix, not optional.
- Every function that constructs a path from a client-supplied `agentId`
  must first resolve it against `getEffectiveAgents()` and fail
  gracefully (never construct a path from an unresolved `agentId`).
- Existing `ai-company-starter-main` test coverage for all three
  generalized backend files must keep passing with identical assertions
  after call sites are updated to pass that agent id explicitly.
- No new AI-calling infrastructure — reuses the existing headless
  `claude -p` spawn mechanism verbatim.
- Live verification is unit-tests-only for the real spawn path (per the
  spec, confirmed with the user) — the live UI walkthrough covers
  triggering the run and confirming "Started" appears, but does not wait
  for a real completed AI-generated diff.

---

### Task 1: Generalize `runCompanyCommandImpl` and `runCompanyCommand`

**Files:**
- Modify: `lib/company-commands/run-company-command-impl.ts`
- Modify: `lib/company-commands/run-company-command.ts`
- Modify: `lib/company-commands/run-company-command-impl.test.ts`

**Interfaces:**
- Produces: `runCompanyCommandImpl(commandId: string, fieldValues:
  Record<string,string>, agentId: string, spawnFn?: SpawnFn, execFn?:
  ExecFileFn, dataDir?: string): Promise<{started:boolean;message:string}>`
  and `runCompanyCommand(commandId: string, fieldValues:
  Record<string,string>, agentId: string): Promise<{started:boolean;
  message:string}>` — Task 4's `CompanyCommandRunner` and Task 5's
  `DefineCompanyAiDraft` both call `runCompanyCommand` with this exact
  3-argument signature.

- [ ] **Step 1: Update the failing/changed tests first**

Replace the full contents of
`lib/company-commands/run-company-command-impl.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string
let dataDir: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "run-company-command-test-"))
  dataDir = await mkdtemp(path.join(tmpdir(), "run-company-command-data-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

function fakeSpawn(calls: { command: string; args: string[]; options: unknown }[]) {
  return (command: string, args: string[], options: unknown) => {
    calls.push({ command, args, options })
    return { unref: () => {}, on: () => {} }
  }
}

describe("runCompanyCommandImpl", () => {
  it("rejects an unknown commandId before touching the lock or spawning", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "create-epic",
      {},
      "ai-company-starter-main",
      fakeSpawn(calls),
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: false, message: 'Unknown command "create-epic"' })
    expect(calls).toHaveLength(0)
  })

  it("rejects a run missing a required field", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "retro",
      { keep: "x", problem: "y" },
      "ai-company-starter-main",
      fakeSpawn(calls),
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: false, message: 'Field "Try — 1-3 improvements for next cycle" is required' })
    expect(calls).toHaveLength(0)
  })

  it("rejects an unknown field key", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "last week", bogus: "x" },
      "ai-company-starter-main",
      fakeSpawn(calls),
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: false, message: 'Unknown field "bogus"' })
    expect(calls).toHaveLength(0)
  })

  it("spawns claude with -p, --allowedTools Edit-scoped to the output dir, Bash disallowed, permission-mode default, for a new-file-in-dir command", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: { cwd: string; detached: boolean } }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("claude")
    expect(calls[0].args).toContain("-p")
    expect(calls[0].args).toContain("--allowedTools")
    expect(calls[0].args[calls[0].args.indexOf("--allowedTools") + 1]).toBe(
      "Read,Grep,Glob,Edit(notes/company/digests/**)"
    )
    expect(calls[0].args).toContain("--disallowedTools")
    expect(calls[0].args[calls[0].args.indexOf("--disallowedTools") + 1]).toBe("Bash")
    expect(calls[0].args).toContain("--permission-mode")
    expect(calls[0].args[calls[0].args.indexOf("--permission-mode") + 1]).toBe("default")
    expect(calls[0].options.cwd).toBe(root)
    expect(calls[0].options.detached).toBe(true)

    const record = JSON.parse(await readFile(path.join(dataDir, "digest.run.json"), "utf-8"))
    expect(record).toEqual({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [] })
  })

  it("scopes --allowedTools' Edit rule to the exact file for a known-file command", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "definitions", "ontology"), { recursive: true })
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "define-company",
      { domain: "d", stakeholders: "s", valueFlow: "v", bottleneck: "b" },
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls[0].args[calls[0].args.indexOf("--allowedTools") + 1]).toBe(
      "Read,Grep,Glob,Edit(definitions/ontology/company.yaml)"
    )
  })

  it("does not spawn and reports 'Already running' when the lock is already held", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { acquireRunLock } = await import("./run-lock")
    await acquireRunLock(dataDir)
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      fakeSpawn(calls),
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: false, message: "Already running" })
    expect(calls).toHaveLength(0)
  })

  it("reports an error and releases the lock when spawning throws", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const { checkRunLockStatus } = await import("./run-lock")

    const throwingSpawn = () => {
      throw new Error("spawn claude ENOENT")
    }
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      throwingSpawn as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: false, message: "spawn claude ENOENT" })
    expect(await checkRunLockStatus(dataDir)).toEqual({ running: false })
  })

  it("prefetches git log and gh issue list for handoff and embeds them in the prompt", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const execCalls: { command: string; args: string[] }[] = []
    const fakeExec = async (command: string, args: string[]) => {
      execCalls.push({ command, args })
      if (command === "git") return { stdout: "abc1234 fix: something\n", stderr: "" }
      return { stdout: "#12 Open issue example\n", stderr: "" }
    }

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "handoff",
      { blockers: "" },
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      fakeExec,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(execCalls).toEqual([
      { command: "git", args: ["log", "--since=24 hours ago", "--oneline"] },
      { command: "gh", args: ["issue", "list", "--state", "open", "--limit", "10"] },
    ])
    const promptIndex = calls[0].args.indexOf("-p") + 1
    expect(calls[0].args[promptIndex]).toContain("abc1234 fix: something")
    expect(calls[0].args[promptIndex]).toContain("#12 Open issue example")
  })

  it("falls back gracefully when gh is unavailable for handoff's prefetch", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const fakeExec = async (command: string) => {
      if (command === "git") return { stdout: "", stderr: "" }
      throw new Error("gh: command not found")
    }

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "handoff",
      {},
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      fakeExec,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    const promptIndex = calls[0].args.indexOf("-p") + 1
    expect(calls[0].args[promptIndex]).toContain("gh unavailable or not authenticated")
  })

  it("reports an error for an unknown agentId", async () => {
    vi.doMock("../config", () => ({ AGENTS: [] }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const result = await runCompanyCommandImpl("digest", { period: "" }, "no-such-agent", undefined, undefined, dataDir)

    expect(result).toEqual({ started: false, message: 'Unknown company "no-such-agent"' })
  })

  it("keeps two agents' locks and run records fully isolated", async () => {
    const secondRoot = await mkdtemp(path.join(tmpdir(), "run-company-command-second-"))
    try {
      vi.doMock("../config", () => ({
        AGENTS: [
          { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" },
          { id: "second-co", name: "Second Co", rootPath: secondRoot, kind: "command-set" },
        ],
      }))
      const { runCompanyCommandImpl } = await import("./run-company-command-impl")
      const dataDirA = path.join(dataDir, "ai-company-starter-main")
      const dataDirB = path.join(dataDir, "second-co")

      const callsA: { command: string; args: string[]; options: unknown }[] = []
      const callsB: { command: string; args: string[]; options: unknown }[] = []
      const resultA = await runCompanyCommandImpl(
        "digest",
        { period: "" },
        "ai-company-starter-main",
        fakeSpawn(callsA) as never,
        undefined,
        dataDirA
      )
      const resultB = await runCompanyCommandImpl(
        "digest",
        { period: "" },
        "second-co",
        fakeSpawn(callsB) as never,
        undefined,
        dataDirB
      )

      expect(resultA).toEqual({ started: true, message: "Started" })
      expect(resultB).toEqual({ started: true, message: "Started" })
      expect(callsA[0].options).toMatchObject({ cwd: root })
      expect(callsB[0].options).toMatchObject({ cwd: secondRoot })

      const recordA = JSON.parse(await readFile(path.join(dataDirA, "digest.run.json"), "utf-8"))
      const recordB = JSON.parse(await readFile(path.join(dataDirB, "digest.run.json"), "utf-8"))
      expect(recordA.commandId).toBe("digest")
      expect(recordB.commandId).toBe("digest")
    } finally {
      await rm(secondRoot, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail (signature mismatch)**

Run: `npx vitest run lib/company-commands/run-company-command-impl.test.ts`
Expected: FAIL — every call site now passes an extra positional string
argument that the current `runCompanyCommandImpl` doesn't accept where
expected (TypeScript arg-count/type mismatches surface as runtime
failures given `SpawnFn`/`ExecFileFn` land in the wrong parameter slot).

- [ ] **Step 3: Update `lib/company-commands/run-company-command-impl.ts`**

Replace the full file contents:

```ts
import { spawn as nodeSpawn, execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { openSync, closeSync } from "node:fs"
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { getCompanyCommand } from "./registry"
import type { CompanyCommand } from "./types"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { acquireRunLock, releaseRunLock } from "./run-lock"

const execFileAsync = promisify(nodeExecFile)
const MAX_FIELD_LENGTH = 4000

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

function validateFields(command: CompanyCommand, fieldValues: Record<string, string>): string | null {
  const validKeys = new Set(command.fields.map((f) => f.key))
  for (const key of Object.keys(fieldValues)) {
    if (!validKeys.has(key)) return `Unknown field "${key}"`
  }
  for (const field of command.fields) {
    const value = fieldValues[field.key] ?? ""
    if (field.required && value.trim() === "") return `Field "${field.label}" is required`
    if (value.length > MAX_FIELD_LENGTH) return `Field "${field.label}" exceeds ${MAX_FIELD_LENGTH} characters`
  }
  return null
}

async function buildPrefetch(agentRootPath: string, execFn: ExecFileFn): Promise<string> {
  let gitLog: string
  try {
    const { stdout } = await execFn("git", ["log", "--since=24 hours ago", "--oneline"], { cwd: agentRootPath })
    gitLog = stdout.trim() || "(no commits in the last 24 hours)"
  } catch (err) {
    gitLog = `(unable to read git log: ${err instanceof Error ? err.message : String(err)})`
  }

  let issues: string
  try {
    const { stdout } = await execFn("gh", ["issue", "list", "--state", "open", "--limit", "10"], { cwd: agentRootPath })
    issues = stdout.trim() || "(no open issues)"
  } catch {
    issues = "(gh unavailable or not authenticated — issue status not confirmed this run)"
  }

  return `--- git log (last 24 hours) ---\n${gitLog}\n\n--- open issues (gh issue list, up to 10) ---\n${issues}`
}

async function takeBeforeSnapshot(agentRootPath: string, command: CompanyCommand): Promise<string[] | string | null> {
  const absPath = path.join(agentRootPath, command.outputPath)
  if (command.outputKind === "new-file-in-dir") {
    try {
      return await readdir(absPath)
    } catch {
      return []
    }
  }
  try {
    return await readFile(absPath, "utf-8")
  } catch {
    return null
  }
}

export async function runCompanyCommandImpl(
  commandId: string,
  fieldValues: Record<string, string>,
  agentId: string,
  spawnFn: SpawnFn = defaultSpawn,
  execFn: ExecFileFn = defaultExecFile,
  dataDir: string = path.join(COMPANY_COMMANDS_DATA_DIR, agentId)
): Promise<{ started: boolean; message: string }> {
  const command = getCompanyCommand(commandId)
  if (!command) {
    return { started: false, message: `Unknown command "${commandId}"` }
  }

  const fieldError = validateFields(command, fieldValues)
  if (fieldError) {
    return { started: false, message: fieldError }
  }

  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { started: false, message: `Unknown company "${agentId}"` }
  }

  await mkdir(dataDir, { recursive: true })
  const acquired = await acquireRunLock(dataDir)
  if (!acquired) {
    return { started: false, message: "Already running" }
  }

  let outFd: number | undefined
  try {
    const before = await takeBeforeSnapshot(agent.rootPath, command)
    await writeFile(
      path.join(dataDir, `${command.id}.run.json`),
      JSON.stringify({ commandId: command.id, outputKind: command.outputKind, outputPath: command.outputPath, before }),
      "utf-8"
    )

    const today = new Date().toISOString().slice(0, 10)
    const prefetch = command.needsPrefetch ? await buildPrefetch(agent.rootPath, execFn) : ""
    const prompt = command.buildPrompt(fieldValues, today, prefetch)

    const editScopePattern =
      command.outputKind === "new-file-in-dir" ? `${command.outputPath}/**` : command.outputPath

    const logPath = path.join(dataDir, `${command.id}.log`)
    outFd = openSync(logPath, "a")
    const child = spawnFn(
      "claude",
      [
        "-p",
        prompt,
        "--allowedTools",
        `Read,Grep,Glob,Edit(${editScopePattern})`,
        "--disallowedTools",
        "Bash",
        "--permission-mode",
        "default",
        "--output-format",
        "text",
      ],
      { cwd: agent.rootPath, detached: true, stdio: ["ignore", outFd, outFd] }
    )
    child.on("exit", () => {
      releaseRunLock(dataDir).catch(() => {})
    })
    child.unref()
    return { started: true, message: "Started" }
  } catch (err) {
    await releaseRunLock(dataDir).catch(() => {})
    return { started: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    if (outFd !== undefined) closeSync(outFd)
  }
}
```

- [ ] **Step 4: Update `lib/company-commands/run-company-command.ts`**

Replace the full file contents:

```ts
"use server"

import { runCompanyCommandImpl } from "./run-company-command-impl"

export async function runCompanyCommand(
  commandId: string,
  fieldValues: Record<string, string>,
  agentId: string
): Promise<{ started: boolean; message: string }> {
  return runCompanyCommandImpl(commandId, fieldValues, agentId)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/company-commands/run-company-command-impl.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: FAIL — `run-company-command.ts`'s callers (`CompanyCommandRunner`
in `components/company-command-runner.tsx`) don't yet pass `agentId`.
This is expected; Task 4 fixes it. Confirm the ONLY errors are in
`components/company-command-runner.tsx` (missing argument to
`runCompanyCommand`) — if any other file errors, stop and investigate
before continuing.

- [ ] **Step 7: Commit**

```bash
git add lib/company-commands/run-company-command-impl.ts lib/company-commands/run-company-command.ts lib/company-commands/run-company-command-impl.test.ts
git commit -m "feat: generalize runCompanyCommandImpl to accept a target agentId"
```

---

### Task 2: Generalize the read-path wrappers (status, log-tail, result)

**Files:**
- Modify: `lib/company-commands/company-command-status.ts`
- Create: `lib/company-commands/company-command-status.test.ts`
- Modify: `lib/company-commands/company-command-log-tail.ts`
- Modify: `lib/company-commands/company-command-log-tail.test.ts`
- Modify: `lib/company-commands/company-command-result.ts`
- Create: `lib/company-commands/company-command-result.test.ts`

**Interfaces:**
- Consumes: `getEffectiveAgents()` (existing, unchanged);
  `getCompanyCommandResultImpl(commandId, dataDir, agentRootPath)`
  (existing, from `./company-command-result-impl`, **unchanged** — this
  file already takes `dataDir`/`agentRootPath` as plain parameters and
  needs no edits).
- Produces: `getCompanyCommandStatus(agentId: string):
  Promise<{running:boolean}>`, `getCompanyCommandLogTail(commandId:
  string, agentId: string): Promise<{tail:string}>`,
  `getCompanyCommandResult(commandId: string, agentId: string):
  Promise<CompanyCommandResult>` — Task 4's `CompanyCommandRunner` and
  Task 5's `DefineCompanyAiDraft` both call all three with these exact
  signatures.

- [ ] **Step 1: Write the new `company-command-status.test.ts`**

Create `lib/company-commands/company-command-status.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dataDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "company-command-status-test-"))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

describe("getCompanyCommandStatus", () => {
  it("reports not running for an unknown agentId, without touching the filesystem", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({ AGENTS: [] }))
    const { getCompanyCommandStatus } = await import("./company-command-status")

    const result = await getCompanyCommandStatus("no-such-agent")

    expect(result).toEqual({ running: false })
  })

  it("reports not running for a known agent with no lock file", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/irrelevant", kind: "command-set" }],
    }))
    const { getCompanyCommandStatus } = await import("./company-command-status")

    const result = await getCompanyCommandStatus("ai-company-starter-main")

    expect(result).toEqual({ running: false })
  })

  it("reports running when that agent's own lock is held, without being affected by another agent's lock state", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [
        { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/irrelevant", kind: "command-set" },
        { id: "second-co", name: "Second Co", rootPath: "/irrelevant-2", kind: "command-set" },
      ],
    }))
    const { acquireRunLock } = await import("./run-lock")
    await acquireRunLock(path.join(dataDir, "second-co"))
    const { getCompanyCommandStatus } = await import("./company-command-status")

    const secondCoStatus = await getCompanyCommandStatus("second-co")
    const aiCompanyStatus = await getCompanyCommandStatus("ai-company-starter-main")

    expect(secondCoStatus).toEqual({ running: true })
    expect(aiCompanyStatus).toEqual({ running: false })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/company-commands/company-command-status.test.ts`
Expected: FAIL — `getCompanyCommandStatus` doesn't accept an argument yet.

- [ ] **Step 3: Update `lib/company-commands/company-command-status.ts`**

Replace the full file contents:

```ts
"use server"

import path from "node:path"
import { checkRunLockStatus } from "./run-lock"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { getEffectiveAgents } from "../get-effective-agents"

export async function getCompanyCommandStatus(agentId: string): Promise<{ running: boolean }> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { running: false }
  }
  return checkRunLockStatus(path.join(COMPANY_COMMANDS_DATA_DIR, agentId))
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/company-commands/company-command-status.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Update `lib/company-commands/company-command-log-tail.test.ts`**

Replace the full file contents:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
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
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/irrelevant", kind: "command-set" }],
    }))
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("create-epic", "ai-company-starter-main")

    expect(result).toEqual({ tail: "" })
  })

  it("returns empty tail for an unknown agentId", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({ AGENTS: [] }))
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("digest", "no-such-agent")

    expect(result).toEqual({ tail: "" })
  })

  it("returns empty tail when the log file doesn't exist yet", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/irrelevant", kind: "command-set" }],
    }))
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("digest", "ai-company-starter-main")

    expect(result).toEqual({ tail: "" })
  })

  it("returns the log's tail for a known command, scoped to the given agent's own subdirectory", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/irrelevant", kind: "command-set" }],
    }))
    await mkdir(path.join(dataDir, "ai-company-starter-main"), { recursive: true })
    await writeFile(path.join(dataDir, "ai-company-starter-main", "digest.log"), "scanning notes/...\nwrote digest\n")
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("digest", "ai-company-starter-main")

    expect(result).toEqual({ tail: "scanning notes/...\nwrote digest" })
  })

  it("keeps a second agent's log completely isolated", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [
        { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/irrelevant", kind: "command-set" },
        { id: "second-co", name: "Second Co", rootPath: "/irrelevant-2", kind: "command-set" },
      ],
    }))
    await mkdir(path.join(dataDir, "ai-company-starter-main"), { recursive: true })
    await writeFile(path.join(dataDir, "ai-company-starter-main", "digest.log"), "company A's log\n")
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("digest", "second-co")

    expect(result).toEqual({ tail: "" })
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run lib/company-commands/company-command-log-tail.test.ts`
Expected: FAIL — `getCompanyCommandLogTail` doesn't accept a 2nd argument
yet.

- [ ] **Step 7: Update `lib/company-commands/company-command-log-tail.ts`**

Replace the full file contents:

```ts
"use server"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { getCompanyCommand } from "./registry"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { tailLines } from "../log-tail"
import { getEffectiveAgents } from "../get-effective-agents"

const MAX_TAIL_LINES = 200

export async function getCompanyCommandLogTail(commandId: string, agentId: string): Promise<{ tail: string }> {
  const command = getCompanyCommand(commandId)
  if (!command) {
    return { tail: "" }
  }

  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { tail: "" }
  }

  try {
    const content = await readFile(path.join(COMPANY_COMMANDS_DATA_DIR, agentId, `${command.id}.log`), "utf-8")
    return { tail: tailLines(content.replace(/\n$/, ""), MAX_TAIL_LINES) }
  } catch {
    return { tail: "" }
  }
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run lib/company-commands/company-command-log-tail.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Write the new `company-command-result.test.ts`**

Create `lib/company-commands/company-command-result.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dataDir: string
let agentRoot: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "company-command-result-data-"))
  agentRoot = await mkdtemp(path.join(tmpdir(), "company-command-result-agent-"))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  await rm(agentRoot, { recursive: true, force: true })
  vi.resetModules()
})

describe("getCompanyCommandResult", () => {
  it("reports an error for an unknown agentId", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({ AGENTS: [] }))
    const { getCompanyCommandResult } = await import("./company-command-result")

    const result = await getCompanyCommandResult("digest", "no-such-agent")

    expect(result).toEqual({ changed: false, message: 'Unknown company "no-such-agent"' })
  })

  it("reads the given agent's own run record and repo content", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: agentRoot, kind: "command-set" }],
    }))
    await mkdir(path.join(agentRoot, "notes/company/digests"), { recursive: true })
    await mkdir(path.join(dataDir, "ai-company-starter-main"), { recursive: true })
    await writeFile(
      path.join(dataDir, "ai-company-starter-main", "digest.run.json"),
      JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [] })
    )
    await writeFile(path.join(agentRoot, "notes/company/digests/2026-07-23-digest.md"), "# Digest\ncontent")
    const { getCompanyCommandResult } = await import("./company-command-result")

    const result = await getCompanyCommandResult("digest", "ai-company-starter-main")

    expect(result).toEqual({
      changed: true,
      outputPath: path.join("notes/company/digests", "2026-07-23-digest.md"),
      oldText: "",
      newText: "# Digest\ncontent",
      extraFiles: [],
    })
  })

  it("keeps a second agent's result completely isolated from the first's run record", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [
        { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: agentRoot, kind: "command-set" },
        { id: "second-co", name: "Second Co", rootPath: agentRoot, kind: "command-set" },
      ],
    }))
    await mkdir(path.join(dataDir, "ai-company-starter-main"), { recursive: true })
    await writeFile(
      path.join(dataDir, "ai-company-starter-main", "digest.run.json"),
      JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [] })
    )
    const { getCompanyCommandResult } = await import("./company-command-result")

    const result = await getCompanyCommandResult("digest", "second-co")

    expect(result).toEqual({ changed: false, message: "No run recorded for this command yet." })
  })
})
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run lib/company-commands/company-command-result.test.ts`
Expected: FAIL — `getCompanyCommandResult` doesn't accept a 2nd argument
yet.

- [ ] **Step 11: Update `lib/company-commands/company-command-result.ts`**

Replace the full file contents:

```ts
"use server"

import path from "node:path"
import { getCompanyCommandResultImpl } from "./company-command-result-impl"
import type { CompanyCommandResult } from "./company-command-result-impl"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { getEffectiveAgents } from "../get-effective-agents"

export async function getCompanyCommandResult(commandId: string, agentId: string): Promise<CompanyCommandResult> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { changed: false, message: `Unknown company "${agentId}"` }
  }
  return getCompanyCommandResultImpl(commandId, path.join(COMPANY_COMMANDS_DATA_DIR, agentId), agent.rootPath)
}
```

- [ ] **Step 12: Run it to verify it passes**

Run: `npx vitest run lib/company-commands/company-command-result.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 13: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: still FAIL only in `components/company-command-runner.tsx`
(Task 4 fixes it) — confirm no other new errors appeared.

Run: `npx vitest run`
Expected: all prior tests plus these new/updated ones pass (existing
`company-command-result-impl.test.ts` is untouched and must still pass
unchanged — it never took an `agentId`, only `dataDir`/`agentRootPath`).

- [ ] **Step 14: Commit**

```bash
git add lib/company-commands/company-command-status.ts lib/company-commands/company-command-status.test.ts lib/company-commands/company-command-log-tail.ts lib/company-commands/company-command-log-tail.test.ts lib/company-commands/company-command-result.ts lib/company-commands/company-command-result.test.ts
git commit -m "feat: generalize company-command status/log-tail/result wrappers to accept a target agentId"
```

---

### Task 3: Generalize `commitCompanyCommandResultImpl` and `commitCompanyCommandResult`

**Files:**
- Modify: `lib/company-commands/commit-company-command-result-impl.ts`
- Modify: `lib/company-commands/commit-company-command-result.ts`
- Modify: `lib/company-commands/commit-company-command-result-impl.test.ts`

**Interfaces:**
- Consumes: `getEffectiveAgents()` (existing, unchanged);
  `resolveWithinAgentRoot` (existing, from `../path-guard`,
  **unchanged** — already resolves against every effective agent).
- Produces: `commitCompanyCommandResultImpl(commandId: string,
  relativeOutputPath: string, agentId: string, execFn?: ExecFileFn):
  Promise<{committed:boolean;message:string}>` and
  `commitCompanyCommandResult(commandId: string, relativeOutputPath:
  string, agentId: string): Promise<{committed:boolean;message:string}>`
  — Task 4's `CompanyCommandRunner` and Task 5's `DefineCompanyAiDraft`
  both call `commitCompanyCommandResult` with this exact 3-argument
  signature.

- [ ] **Step 1: Update `lib/company-commands/commit-company-command-result-impl.test.ts`**

Replace the full file contents:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "commit-company-command-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

// IMPORTANT: compare git args against `await realpath(root)`, never the raw
// mkdtemp path — on macOS, tmpdir() lives under /var, which is itself a
// symlink to /private/var, so the resolved path this code actually uses
// (via path-guard.ts's realpath-based containment check) differs from the
// raw string `root`. Asserting against raw `root` fails on macOS.

describe("commitCompanyCommandResultImpl", () => {
  it("commits a file within the command's declared output directory", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "notes/company/digests"), { recursive: true })
    await writeFile(path.join(root, "notes/company/digests/2026-07-23-digest.md"), "content")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")
    const resolvedRoot = await realpath(root)

    const calls: { command: string; args: string[] }[] = []
    const fakeExec = async (command: string, args: string[]) => {
      calls.push({ command, args })
      return { stdout: "", stderr: "" }
    }

    const result = await commitCompanyCommandResultImpl(
      "digest",
      path.join("notes/company/digests", "2026-07-23-digest.md"),
      "ai-company-starter-main",
      fakeExec
    )

    expect(result).toEqual({ committed: true, message: "Committed" })
    expect(calls[0]).toEqual({
      command: "git",
      args: ["-C", resolvedRoot, "add", "--", path.join("notes/company/digests", "2026-07-23-digest.md")],
    })
    expect(calls[1].args).toContain("Run /digest via AI-Native control panel")
  })

  it("commits the exact known-file path for a known-file command", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await writeFile(path.join(root, "HANDOFF.md"), "content")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const calls: { command: string; args: string[] }[] = []
    const fakeExec = async (command: string, args: string[]) => {
      calls.push({ command, args })
      return { stdout: "", stderr: "" }
    }

    const result = await commitCompanyCommandResultImpl("handoff", "HANDOFF.md", "ai-company-starter-main", fakeExec)

    expect(result).toEqual({ committed: true, message: "Committed" })
    expect(calls[1].args).toContain("Run /handoff via AI-Native control panel")
  })

  it("refuses a path outside the command's declared output location", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "bin"), { recursive: true })
    await writeFile(path.join(root, "bin", "poll.sh"), "#!/bin/bash\n")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    let execCalled = false
    const fakeExec = async () => {
      execCalled = true
      return { stdout: "", stderr: "" }
    }

    const result = await commitCompanyCommandResultImpl("digest", "bin/poll.sh", "ai-company-starter-main", fakeExec)

    expect(result).toEqual({ committed: false, message: 'Refusing to commit a path outside "digest"\'s expected output location' })
    expect(execCalled).toBe(false)
  })

  it("refuses a path-traversal string that textually starts with the expected output dir but resolves outside it", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    await writeFile(path.join(root, "HANDOFF.md"), "content")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    let execCalled = false
    const fakeExec = async () => {
      execCalled = true
      return { stdout: "", stderr: "" }
    }

    // Deliberately NOT built with path.join/path.normalize: this is meant to
    // simulate the raw, un-normalized string an attacker-controlled caller of
    // the "use server" action would send. Textually, it starts with
    // "docs/decisions/" (the "decision" command's declared outputPath), so a
    // raw-string prefix check would wrongly allow it. Once joined with the
    // agent root and resolved, it actually points at HANDOFF.md at the repo
    // root — a completely different file.
    const maliciousRelativePath = "docs/decisions/../../HANDOFF.md"
    expect(maliciousRelativePath.startsWith("docs/decisions" + path.sep)).toBe(true)

    const result = await commitCompanyCommandResultImpl("decision", maliciousRelativePath, "ai-company-starter-main", fakeExec)

    expect(result).toEqual({ committed: false, message: 'Refusing to commit a path outside "decision"\'s expected output location' })
    expect(execCalled).toBe(false)
  })

  it("refuses an unknown commandId", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const result = await commitCompanyCommandResultImpl("create-epic", "docs/decisions/x.md", "ai-company-starter-main")

    expect(result).toEqual({ committed: false, message: 'Unknown command "create-epic"' })
  })

  it("propagates a commit failure message", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "docs/retros"), { recursive: true })
    await writeFile(path.join(root, "docs/retros/2026-07-23-retro.md"), "content")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const fakeExec = async () => {
      throw new Error("nothing to commit")
    }

    const result = await commitCompanyCommandResultImpl(
      "retro",
      path.join("docs/retros", "2026-07-23-retro.md"),
      "ai-company-starter-main",
      fakeExec
    )

    expect(result).toEqual({ committed: false, message: "nothing to commit" })
  })

  it("reports an error for an unknown agentId", async () => {
    vi.doMock("../config", () => ({ AGENTS: [] }))
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const result = await commitCompanyCommandResultImpl("decision", "docs/decisions/x.md", "no-such-agent")

    expect(result).toEqual({ committed: false, message: 'Unknown company "no-such-agent"' })
  })

  it("commits against the correct target when a second agent is registered", async () => {
    const secondRoot = await mkdtemp(path.join(tmpdir(), "commit-company-command-second-"))
    try {
      vi.doMock("../config", () => ({
        AGENTS: [
          { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" },
          { id: "second-co", name: "Second Co", rootPath: secondRoot, kind: "command-set" },
        ],
      }))
      await mkdir(path.join(secondRoot, "definitions/ontology"), { recursive: true })
      await writeFile(path.join(secondRoot, "definitions/ontology/company.yaml"), "version: 1\n")
      const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")
      const resolvedSecondRoot = await realpath(secondRoot)

      const calls: { command: string; args: string[] }[] = []
      const fakeExec = async (command: string, args: string[]) => {
        calls.push({ command, args })
        return { stdout: "", stderr: "" }
      }

      const result = await commitCompanyCommandResultImpl(
        "define-company",
        "definitions/ontology/company.yaml",
        "second-co",
        fakeExec
      )

      expect(result).toEqual({ committed: true, message: "Committed" })
      expect(calls[0]).toEqual({
        command: "git",
        args: ["-C", resolvedSecondRoot, "add", "--", "definitions/ontology/company.yaml"],
      })
    } finally {
      await rm(secondRoot, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/company-commands/commit-company-command-result-impl.test.ts`
Expected: FAIL — every call site now passes an extra positional string
argument the current function doesn't expect there.

- [ ] **Step 3: Update `lib/company-commands/commit-company-command-result-impl.ts`**

Replace the full file contents:

```ts
import { realpath } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { resolveWithinAgentRoot } from "../path-guard"
import { commitFile } from "../git-commit-file"
import type { ExecFileFn } from "../git-commit-file"
import { getCompanyCommand } from "./registry"

export type CommitCompanyCommandResult = { committed: boolean; message: string }

export async function commitCompanyCommandResultImpl(
  commandId: string,
  relativeOutputPath: string,
  agentId: string,
  execFn?: ExecFileFn
): Promise<CommitCompanyCommandResult> {
  const command = getCompanyCommand(commandId)
  if (!command) {
    return { committed: false, message: `Unknown command "${commandId}"` }
  }

  // Cheap pre-check only: this runs on the raw, un-normalized string and can
  // be bypassed with "../" traversal (e.g. "docs/decisions/../../HANDOFF.md"
  // textually starts with "docs/decisions/"). It exists purely to fail fast
  // on obviously-wrong input without doing filesystem work. It must NEVER be
  // the sole gate — the authoritative decision is the realpath-based check
  // below, which runs on every input that passes this pre-check.
  const cheapIsWithinExpectedScope =
    command.outputKind === "new-file-in-dir"
      ? relativeOutputPath === command.outputPath || relativeOutputPath.startsWith(command.outputPath + path.sep)
      : relativeOutputPath === command.outputPath

  if (!cheapIsWithinExpectedScope) {
    return { committed: false, message: `Refusing to commit a path outside "${command.id}"'s expected output location` }
  }

  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { committed: false, message: `Unknown company "${agentId}"` }
  }

  let expectedRoot: string
  try {
    expectedRoot = await realpath(agent.rootPath)
  } catch (err) {
    return { committed: false, message: err instanceof Error ? err.message : String(err) }
  }

  const absolutePath = path.join(agent.rootPath, relativeOutputPath)
  const guard = await resolveWithinAgentRoot(absolutePath)
  if (!guard || guard.agentRootPath !== expectedRoot) {
    return { committed: false, message: "Refusing to commit a path outside the configured agent root" }
  }

  // Authoritative check: compare the fully-resolved absolute path against a
  // realpath'd version of the command's expected output location. This is
  // what actually gates whether commitFile runs — never the raw string
  // comparison above.
  const expectedOutputAbs = await realpath(path.join(agent.rootPath, command.outputPath)).catch(() => null)
  if (!expectedOutputAbs) {
    return { committed: false, message: `Refusing to commit — "${command.id}"'s expected output location doesn't exist` }
  }

  const isWithinExpectedScope =
    command.outputKind === "new-file-in-dir"
      ? guard.realPath === expectedOutputAbs || guard.realPath.startsWith(expectedOutputAbs + path.sep)
      : guard.realPath === expectedOutputAbs

  if (!isWithinExpectedScope) {
    return { committed: false, message: `Refusing to commit a path outside "${command.id}"'s expected output location` }
  }

  try {
    const relativeToRoot = path.relative(guard.agentRootPath, guard.realPath)
    await commitFile(guard.agentRootPath, relativeToRoot, `Run /${command.id} via AI-Native control panel`, execFn)
    return { committed: true, message: "Committed" }
  } catch (err) {
    return { committed: false, message: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Update `lib/company-commands/commit-company-command-result.ts`**

Replace the full file contents:

```ts
"use server"

import { commitCompanyCommandResultImpl } from "./commit-company-command-result-impl"

export async function commitCompanyCommandResult(
  commandId: string,
  relativeOutputPath: string,
  agentId: string
): Promise<{ committed: boolean; message: string }> {
  return commitCompanyCommandResultImpl(commandId, relativeOutputPath, agentId)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/company-commands/commit-company-command-result-impl.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: still FAIL only in `components/company-command-runner.tsx`
(Task 4 fixes it).

Run: `npx vitest run`
Expected: all tests pass except none — every backend test file should
be green now; only the `.tsx` compile error remains, which `vitest`
doesn't surface (it doesn't type-check `.tsx` files it isn't asked to
run).

- [ ] **Step 7: Commit**

```bash
git add lib/company-commands/commit-company-command-result-impl.ts lib/company-commands/commit-company-command-result.ts lib/company-commands/commit-company-command-result-impl.test.ts
git commit -m "feat: generalize commitCompanyCommandResultImpl to accept a target agentId"
```

---

### Task 4: Wire `agentId` through `CompanyCommandRunner` and its caller

**Files:**
- Modify: `components/company-command-runner.tsx`
- Modify: `components/skill-browser.tsx`

**Interfaces:**
- Consumes: `runCompanyCommand`, `getCompanyCommandStatus`,
  `getCompanyCommandResult`, `commitCompanyCommandResult`,
  `getCompanyCommandLogTail` (all from Tasks 1–3, now requiring
  `agentId`).
- Produces: `CompanyCommandRunner({ command, agentId }: { command:
  CompanyCommand; agentId: string })` — this closes out the `tsc`
  failures left open by Tasks 1–3. No behavior change for the existing
  Skills-page Run tab: it always passes the literal
  `"ai-company-starter-main"`, matching `matchedCompanyCommand`'s own
  existing gate condition exactly.

This task is purely a mechanical ripple fix (the underlying actions now
require a parameter this component didn't have to supply before) — it
does not change what the Skills-page Run tab does or who can see it.

- [ ] **Step 1: Read both files before editing**

Read `components/company-command-runner.tsx` and
`components/skill-browser.tsx` in full. Confirm
`CompanyCommandRunner`'s current prop type is exactly `{ command:
CompanyCommand }` and `skill-browser.tsx`'s render call is exactly
`<CompanyCommandRunner command={matchedCompanyCommand} />`. If either
has drifted, stop and reconcile before editing.

- [ ] **Step 2: Update `components/company-command-runner.tsx`**

Change the function signature from:

```tsx
export function CompanyCommandRunner({ command }: { command: CompanyCommand }) {
```

to:

```tsx
export function CompanyCommandRunner({ command, agentId }: { command: CompanyCommand; agentId: string }) {
```

Change the body of `pollUntilDone` from:

```tsx
  async function pollUntilDone() {
    const status = await getCompanyCommandStatus()
    const logTail = await getCompanyCommandLogTail(command.id)
    setTail(logTail.tail)
    if (status.running) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      return
    }
    setRunning(false)
    const outcome = await getCompanyCommandResult(command.id)
    setResult(outcome)
  }
```

to:

```tsx
  async function pollUntilDone() {
    const status = await getCompanyCommandStatus(agentId)
    const logTail = await getCompanyCommandLogTail(command.id, agentId)
    setTail(logTail.tail)
    if (status.running) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      return
    }
    setRunning(false)
    const outcome = await getCompanyCommandResult(command.id, agentId)
    setResult(outcome)
  }
```

Change the body of `handleRun` from:

```tsx
  async function handleRun() {
    setMessage(null)
    setResult(null)
    setCommitMessage(null)
    const response = await runCompanyCommand(command.id, values)
    setMessage(response.message)
    if (response.started) {
      setRunning(true)
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
    }
  }
```

to:

```tsx
  async function handleRun() {
    setMessage(null)
    setResult(null)
    setCommitMessage(null)
    const response = await runCompanyCommand(command.id, values, agentId)
    setMessage(response.message)
    if (response.started) {
      setRunning(true)
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
    }
  }
```

Change the body of `handleConfirmCommit` from:

```tsx
  async function handleConfirmCommit() {
    if (!result || !result.changed) return
    setCommitting(true)
    const response = await commitCompanyCommandResult(command.id, result.outputPath)
    setCommitting(false)
    setConfirmOpen(false)
    setCommitMessage(response.message)
  }
```

to:

```tsx
  async function handleConfirmCommit() {
    if (!result || !result.changed) return
    setCommitting(true)
    const response = await commitCompanyCommandResult(command.id, result.outputPath, agentId)
    setCommitting(false)
    setConfirmOpen(false)
    setCommitMessage(response.message)
  }
```

- [ ] **Step 3: Update `components/skill-browser.tsx`**

Change:

```tsx
            {view === "run" && matchedCompanyCommand && <CompanyCommandRunner command={matchedCompanyCommand} />}
```

to:

```tsx
            {view === "run" && matchedCompanyCommand && (
              <CompanyCommandRunner command={matchedCompanyCommand} agentId="ai-company-starter-main" />
            )}
```

(`matchedCompanyCommand` is only ever truthy when `selected.agentId ===
"ai-company-starter-main"`, per its own definition a few lines above —
this literal matches that condition exactly, not a new hardcoded
assumption.)

- [ ] **Step 4: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests still pass (this task adds no new tests — no
component-level unit tests exist for any prior slice's UI in this
project; correctness here is covered by the final live verification)

- [ ] **Step 5: Commit**

```bash
git add components/company-command-runner.tsx components/skill-browser.tsx
git commit -m "fix: thread agentId through CompanyCommandRunner and its Skills-page caller"
```

---

### Task 5: Field formatter and the new AI-draft component

**Files:**
- Create: `lib/format-define-company-fields.ts`
- Create: `lib/format-define-company-fields.test.ts`
- Create: `components/define-company-ai-draft.tsx`

**Interfaces:**
- Consumes: `Stakeholder` (existing, from `@/lib/build-company-ontology`,
  unchanged); `runCompanyCommand`, `getCompanyCommandStatus`,
  `getCompanyCommandLogTail`, `getCompanyCommandResult`,
  `commitCompanyCommandResult` (Tasks 1–3); `CompanyCommandResult` type
  (existing, from `@/lib/company-commands/company-command-result-impl`,
  unchanged); `DiffView` (existing, from `@/components/diff-view`,
  unchanged); `LogTailView` (existing, from `@/components/log-tail-view`,
  unchanged).
- Produces: `export function formatDefineCompanyFields(input: {domain:
  string; stakeholders: Stakeholder[]; valueFlow: {input:string;
  transform:string; output:string}; bottleneck: string}):
  Record<string,string>` and `export function DefineCompanyAiDraft({
  agentId, fieldValues, onCancel, onCommitted }: { agentId: string;
  fieldValues: Record<string,string>; onCancel: () => void; onCommitted:
  () => void })` — Task 6's wizard imports both.

- [ ] **Step 1: Write the failing test for the formatter**

Create `lib/format-define-company-fields.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { formatDefineCompanyFields } from "./format-define-company-fields"

describe("formatDefineCompanyFields", () => {
  it("passes domain and bottleneck through unchanged", () => {
    const result = formatDefineCompanyFields({
      domain: "We sell widgets",
      stakeholders: [],
      valueFlow: { input: "", transform: "", output: "" },
      bottleneck: "Manual invoicing",
    })
    expect(result.domain).toBe("We sell widgets")
    expect(result.bottleneck).toBe("Manual invoicing")
  })

  it("formats stakeholders into one line each, dropping incomplete rows", () => {
    const result = formatDefineCompanyFields({
      domain: "d",
      stakeholders: [
        { role: "Client", position: "Pays for the service" },
        { role: "", position: "incomplete, should be dropped" },
        { role: "Support rep", position: "Handles tickets" },
      ],
      valueFlow: { input: "", transform: "", output: "" },
      bottleneck: "b",
    })
    expect(result.stakeholders).toBe("- Client: Pays for the service\n- Support rep: Handles tickets")
  })

  it("formats valueFlow into labeled lines", () => {
    const result = formatDefineCompanyFields({
      domain: "d",
      stakeholders: [],
      valueFlow: { input: "Raw orders", transform: "Assemble widgets", output: "Shipped products" },
      bottleneck: "b",
    })
    expect(result.valueFlow).toBe("Input: Raw orders\nTransform: Assemble widgets\nOutput: Shipped products")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/format-define-company-fields.test.ts`
Expected: FAIL — `Cannot find module './format-define-company-fields'`

- [ ] **Step 3: Implement the formatter**

Create `lib/format-define-company-fields.ts`:

```ts
import type { Stakeholder } from "./build-company-ontology"

export function formatDefineCompanyFields(input: {
  domain: string
  stakeholders: Stakeholder[]
  valueFlow: { input: string; transform: string; output: string }
  bottleneck: string
}): Record<string, string> {
  return {
    domain: input.domain,
    stakeholders: input.stakeholders
      .filter((s) => s.role.trim() && s.position.trim())
      .map((s) => `- ${s.role}: ${s.position}`)
      .join("\n"),
    valueFlow: `Input: ${input.valueFlow.input}\nTransform: ${input.valueFlow.transform}\nOutput: ${input.valueFlow.output}`,
    bottleneck: input.bottleneck,
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/format-define-company-fields.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Create the AI-draft component**

Create `components/define-company-ai-draft.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { DiffView } from "@/components/diff-view"
import { LogTailView } from "@/components/log-tail-view"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { getCompanyCommandStatus } from "@/lib/company-commands/company-command-status"
import { getCompanyCommandResult } from "@/lib/company-commands/company-command-result"
import { getCompanyCommandLogTail } from "@/lib/company-commands/company-command-log-tail"
import { commitCompanyCommandResult } from "@/lib/company-commands/commit-company-command-result"
import type { CompanyCommandResult } from "@/lib/company-commands/company-command-result-impl"

const POLL_INTERVAL_MS = 3000
const DEFINE_COMPANY_COMMAND_ID = "define-company"

export function DefineCompanyAiDraft({
  agentId,
  fieldValues,
  onCancel,
  onCommitted,
}: {
  agentId: string
  fieldValues: Record<string, string>
  onCancel: () => void
  onCommitted: () => void
}) {
  const [phase, setPhase] = useState<"running" | "finished">("running")
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<CompanyCommandResult | null>(null)
  const [tail, setTail] = useState("")
  const [committing, setCommitting] = useState(false)

  async function pollUntilDone() {
    const status = await getCompanyCommandStatus(agentId)
    const logTail = await getCompanyCommandLogTail(DEFINE_COMPANY_COMMAND_ID, agentId)
    setTail(logTail.tail)
    if (status.running) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      return
    }
    setPhase("finished")
    const outcome = await getCompanyCommandResult(DEFINE_COMPANY_COMMAND_ID, agentId)
    setResult(outcome)
  }

  async function start() {
    setMessage(null)
    const response = await runCompanyCommand(DEFINE_COMPANY_COMMAND_ID, fieldValues, agentId)
    setMessage(response.message)
    if (response.started) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
    } else {
      setPhase("finished")
    }
  }

  useEffect(() => {
    start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleConfirmCommit() {
    if (!result || !result.changed) return
    setCommitting(true)
    const response = await commitCompanyCommandResult(DEFINE_COMPANY_COMMAND_ID, result.outputPath, agentId)
    setCommitting(false)
    if (response.committed) {
      onCommitted()
    } else {
      setMessage(response.message)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Asking the AI to draft tailored customer/org/product entities from your answers…
      </p>
      {message && <p className="text-xs text-destructive">{message}</p>}
      {phase === "running" && <LogTailView content={tail} />}
      {phase === "finished" && result && !result.changed && (
        <p className="text-sm text-muted-foreground">{result.message}</p>
      )}
      {phase === "finished" && result && result.changed && (
        <div className="space-y-2 border-t pt-2">
          <p className="text-sm font-medium">{result.outputPath}</p>
          <DiffView oldText={result.oldText} newText={result.newText} />
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={committing}>
          Cancel and save with generic entities instead
        </Button>
        {phase === "finished" && result && result.changed && (
          <Button size="sm" onClick={handleConfirmCommit} disabled={committing}>
            {committing ? "Committing…" : "Confirm & commit"}
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass (previous count + 3 new = the running total
after Task 2 plus 3)

- [ ] **Step 7: Commit**

```bash
git add lib/format-define-company-fields.ts lib/format-define-company-fields.test.ts components/define-company-ai-draft.tsx
git commit -m "feat: add define-company field formatter and AI-draft component"
```

---

### Task 6: Wire the AI-draft choice into the wizard

**Files:**
- Modify: `components/company-setup-wizard.tsx`

**Interfaces:**
- Consumes: `formatDefineCompanyFields`, `DefineCompanyAiDraft` (Task 5).

- [ ] **Step 1: Read the current file before editing**

Read `components/company-setup-wizard.tsx` in full. Confirm it still
matches the shape shipped in v18 (5 `STEPS`, `handleSave` calling
`saveCompanyOntology`, a single "Save" button on the `"review"` step). If
it has drifted, stop and reconcile before editing.

- [ ] **Step 2: Add the new imports**

Change:

```tsx
import { saveCompanyOntology } from "@/lib/save-company-ontology"
import type { Stakeholder } from "@/lib/build-company-ontology"
```

to:

```tsx
import { saveCompanyOntology } from "@/lib/save-company-ontology"
import type { Stakeholder } from "@/lib/build-company-ontology"
import { formatDefineCompanyFields } from "@/lib/format-define-company-fields"
import { DefineCompanyAiDraft } from "@/components/define-company-ai-draft"
```

- [ ] **Step 3: Add AI-draft state and handlers**

Change:

```tsx
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const stepIndex = STEPS.indexOf(step)

  function resetAndClose() {
    setOpen(false)
    setStep("about")
    setDomain("")
    setEmployeeCount("")
    setStakeholders([{ role: "", position: "" }])
    setValueFlow({ input: "", transform: "", output: "" })
    setBottleneck("")
    setMessage(null)
  }
```

to:

```tsx
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [aiDraftFields, setAiDraftFields] = useState<Record<string, string> | null>(null)

  const stepIndex = STEPS.indexOf(step)

  function resetAndClose() {
    setOpen(false)
    setStep("about")
    setDomain("")
    setEmployeeCount("")
    setStakeholders([{ role: "", position: "" }])
    setValueFlow({ input: "", transform: "", output: "" })
    setBottleneck("")
    setMessage(null)
    setAiDraftFields(null)
  }

  function handleStartAiDraft() {
    setMessage(null)
    setAiDraftFields(formatDefineCompanyFields({ domain, stakeholders, valueFlow, bottleneck }))
  }

  function handleCancelAiDraft() {
    setAiDraftFields(null)
  }

  function handleAiDraftCommitted() {
    resetAndClose()
    router.refresh()
  }
```

- [ ] **Step 4: Gate the review step's content on `aiDraftFields`**

Change:

```tsx
            {step === "review" && (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">Your company</p>
                  <p className="text-muted-foreground">{domain || "—"}</p>
                  {employeeCount && <p className="text-muted-foreground">{employeeCount} employees</p>}
                </div>
                <div>
                  <p className="font-medium">Stakeholders</p>
                  {stakeholders
                    .filter((s) => s.role.trim() || s.position.trim())
                    .map((s, i) => (
                      <p key={i} className="text-muted-foreground">
                        {s.role} — {s.position}
                      </p>
                    ))}
                </div>
                <div>
                  <p className="font-medium">Value flow</p>
                  <p className="text-muted-foreground">Receive: {valueFlow.input || "—"}</p>
                  <p className="text-muted-foreground">Do: {valueFlow.transform || "—"}</p>
                  <p className="text-muted-foreground">Deliver: {valueFlow.output || "—"}</p>
                </div>
                <div>
                  <p className="font-medium">Biggest bottleneck</p>
                  <p className="text-muted-foreground">{bottleneck || "—"}</p>
                </div>
              </div>
            )}
```

to:

```tsx
            {step === "review" && !aiDraftFields && (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">Your company</p>
                  <p className="text-muted-foreground">{domain || "—"}</p>
                  {employeeCount && <p className="text-muted-foreground">{employeeCount} employees</p>}
                </div>
                <div>
                  <p className="font-medium">Stakeholders</p>
                  {stakeholders
                    .filter((s) => s.role.trim() || s.position.trim())
                    .map((s, i) => (
                      <p key={i} className="text-muted-foreground">
                        {s.role} — {s.position}
                      </p>
                    ))}
                </div>
                <div>
                  <p className="font-medium">Value flow</p>
                  <p className="text-muted-foreground">Receive: {valueFlow.input || "—"}</p>
                  <p className="text-muted-foreground">Do: {valueFlow.transform || "—"}</p>
                  <p className="text-muted-foreground">Deliver: {valueFlow.output || "—"}</p>
                </div>
                <div>
                  <p className="font-medium">Biggest bottleneck</p>
                  <p className="text-muted-foreground">{bottleneck || "—"}</p>
                </div>
              </div>
            )}
            {step === "review" && aiDraftFields && (
              <DefineCompanyAiDraft
                agentId={agentId}
                fieldValues={aiDraftFields}
                onCancel={handleCancelAiDraft}
                onCommitted={handleAiDraftCommitted}
              />
            )}
```

- [ ] **Step 5: Hide the message line and the Back/Next/Save row while drafting**

Change:

```tsx
            {message && <p className="text-xs text-destructive">{message}</p>}
            <div className="flex justify-between pt-2">
              <Button size="sm" variant="ghost" onClick={goBack} disabled={stepIndex === 0 || pending}>
                Back
              </Button>
              {step === "review" ? (
                <Button size="sm" onClick={handleSave} disabled={pending}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              ) : (
                <Button size="sm" onClick={goNext} disabled={pending || !canGoNext}>
                  Next
                </Button>
              )}
            </div>
```

to:

```tsx
            {!aiDraftFields && message && <p className="text-xs text-destructive">{message}</p>}
            {!aiDraftFields && (
              <div className="flex justify-between pt-2">
                <Button size="sm" variant="ghost" onClick={goBack} disabled={stepIndex === 0 || pending}>
                  Back
                </Button>
                {step === "review" ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleStartAiDraft} disabled={pending}>
                      Let AI draft tailored entities
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={pending}>
                      {pending ? "Saving…" : "Save now"}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={goNext} disabled={pending || !canGoNext}>
                    Next
                  </Button>
                )}
              </div>
            )}
```

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests still pass (this task adds no new tests — same
"no component-level unit tests" precedent as Task 4; covered by live
verification)

- [ ] **Step 7: Commit**

```bash
git add components/company-setup-wizard.tsx
git commit -m "feat: add Let AI draft tailored entities step to the company setup wizard"
```

---

### Task 7: README and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README's most recent section**

Read the end of `README.md` to find the v20 section and match its
heading style (`## vNN: <short title>`).

- [ ] **Step 2: Append the v21 section**

Add, after the v20 section:

```markdown
## v21: AI-generated ontology entities via generalized define-company

After v20, two roadmap threads remained unscoped: a fresh company having
a real integration to connect, and AI-generated `customer`/`org`/
`product` ontology entities via a connected agent (deferred since v18).
Investigating the first found no small next step — a fresh company
already has `api-connect` available as a skill, but no generic workflow
in `ai-company-starter-main`'s template consumes an external
integration, and building one would mean designing something like
`plh-takeshi-agent`'s bespoke email pipeline as a generic feature — the
same scale of "no format to build on" problem v20 declined to solve.

The second turned out to already be mostly built. v8 (long before v18's
wizard existed) already shipped a fully-specified `define-company`
command in `lib/company-commands/registry.ts` that spawns a headless
`claude -p` session and uses the AI's own reasoning to write
`definitions/ontology/company.yaml`'s customer/org/product domains —
exactly the entity-generation half of `/define-company` that v18
explicitly deferred as needing "a connected agent." It just didn't work
for any company besides `ai-company-starter-main`, hardcoded in four
places. v21 generalized all three backend files
(`run-company-command-impl.ts` and the status/log-tail/result/commit
wrappers) to accept a target `agentId`, resolved via
`getEffectiveAgents()` — the same security boundary
(`resolveWithinAgentRoot`) already worked against any registered
company, it just wasn't being asked to. Along the way, found and fixed
a real, previously-invisible bug: the run-lock/run-result/log files were
keyed only by command id in one shared directory, so a second company
running `define-company` would have silently overwritten a first
company's unconfirmed result. `COMPANY_COMMANDS_DATA_DIR` is now scoped
per agent (`.data/company-runs/<agentId>/`).

Scope stayed narrow on purpose: only `define-company` is generalized —
`digest`/`decision`/`retro`/`handoff` still only run through the
existing Skills-page "Run" tab, unchanged and still
`ai-company-starter-main`-only. The one new entry point is a step added
to v18's wizard: after the same 4 questions, "Save now" keeps v18's
exact generic-entity behavior, and a new "Let AI draft tailored
entities" option spawns `define-company` headlessly using the same
answers (reformatted from the wizard's structured shape into the plain
free-text fields `define-company` expects), polls, and shows the AI's
diff for confirmation before committing — nothing is written until the
user explicitly confirms, same as every other write path in this
project.

Per the user's explicit choice, live verification for this slice is
unit-tests-only for the real spawn path (same precedent as v9) — every
prior slice's live test was a near-instant, zero-cost local operation,
and actually triggering `define-company` means a real, paid `claude -p`
session with genuine reasoning time. The generalized plumbing and the
wizard's new step are verified with fake spawn/exec functions and a
live UI walkthrough up to confirming the run reports "Started"; the
real button ships working, and a real end-to-end AI-generated diff is
left for the user to trigger themselves whenever ready.

This is piece 5 of the roadmap.
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit` — expect no errors
Run: `npx vitest run` — expect all tests passing
Run: `npm run build` — expect a clean production build

- [ ] **Step 4: Live UI verification (unit-tests-only for the real spawn, per the spec)**

Start a dev server on an unused port. Using Playwright (or equivalent):

1. Create a disposable company under `/tmp` via the existing "Add a
   company" → create-from-template flow (same as v17–v20's live
   checks).
2. Open its "Set up your company" wizard, fill all 4 steps (including
   at least 2 stakeholder rows to exercise the formatter's filtering),
   reach the review step.
3. Confirm the review step now shows both "Let AI draft tailored
   entities" and "Save now" buttons.
4. Click "Let AI draft tailored entities". Confirm the AI-draft view
   appears immediately (no separate "start" click needed), showing the
   "Asking the AI to draft…" message and a live log-tail area.
5. Confirm `getCompanyCommandStatus`/`getCompanyCommandResult` are being
   polled (network tab or a brief wait) and the UI correctly reflects
   "Started" having been reported — **do not wait for the real `claude
   -p` process to finish**; this live check stops here, per the
   confirmed testing scope.
6. Click "Cancel and save with generic entities instead". Confirm it
   returns to the normal review step with all 4 answers still intact,
   then click "Save now" and confirm the wizard completes exactly as it
   did in v18 (this proves the fallback path is undisturbed).
7. Confirm the real `plh-ops`/`plh-takeshi-agent`/`ai-company-starter-main`
   directories are unmodified throughout (`git status --short` on each
   — must be empty; this test never touches them).
8. Remove the disposable company via the existing "Remove" button, then
   delete the `/tmp` directory. If any detached `claude` process was
   left running from step 4 against the disposable company, note it —
   it's harmless (it can only write inside the already-deleted `/tmp`
   directory, which no longer exists) but confirm via `ps aux | grep
   claude` that nothing unexpected is still attached to a real company's
   directory.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document v21 define-company generalization in README"
```
