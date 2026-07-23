# Control Panel v11: Register a Second AI Company — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the dashboard manage an additional, user-registered "company" instance (an existing local directory with `.git` and `.claude/`) alongside the 3 hardcoded agents — automatically getting skills browsing/editing/history/revert and a generic activity feed, with zero per-company code.

**Architecture:** A small registry (`lib/companies-registry.ts`) persists registered companies to the control panel's own `.data/companies.json`. A new `lib/get-effective-agents.ts` merges the static 3 agents with registered companies. Two already-generic adapters (skill scanning, extracted; git-log-based activity, new) apply automatically to any registered company. `path-guard.ts`/`resolve-known-skill.ts` and the 3 page components switch from the static `AGENTS`/`ADAPTERS`/`SKILL_ADAPTERS` constants to the effective versions.

**Tech Stack:** Next.js Server Actions, `node:child_process` execFile with injected fakes, Vitest with real temp-dir fixtures.

## Global Constraints

- All registration bookkeeping (`.data/companies.json`) lives in the control-panel repo's own data dir — never inside a registered company's directory.
- Reject-at-the-boundary for every registration validation failure (missing name, bad path, missing `.git`/`.claude`, duplicate path) — no partial writes.
- Removal only un-registers — it must never delete, move, or modify anything inside the registered company's actual directory.
- `lib/skills/ai-company-starter-main.test.ts` (existing, already shipped) must pass completely UNCHANGED after `ai-company-starter-main.ts` becomes a re-export.
- `path-guard.test.ts` and `resolve-known-skill.test.ts` (existing, already shipped) need exactly ONE additive line each (`vi.doMock("../companies-registry"` or `"./companies-registry"` per relative path, returning `getRegisteredCompanies: async () => []`) so they stay deterministic once these files depend on the registry transitively — this is an explicitly-approved, minimal addition, not a sign something's wrong.
- Zero-extra-parameter Server Actions — injectable seams (`registryPath`, `execFn`) live only on `-impl`-shaped functions, never on `"use server"` exports.
- TDD with real temp-dir fixtures — never touch the real `.data/companies.json` or any real `~/AI-Native/` directory from a test.

---

### Task 1: Companies registry (CRUD)

**Files:**
- Create: `lib/companies-registry.ts`
- Create: `lib/companies-registry.test.ts`

**Interfaces:**
- Produces: `RegisteredCompany`, `getRegisteredCompanies(registryPath?)`, `registerCompanyImpl(name, rootPath, registryPath?)`, `removeCompanyImpl(id, registryPath?)` — Task 3's `get-effective-agents.ts` and Task 5's Server Actions consume these.

- [ ] **Step 1: Write the failing test `lib/companies-registry.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getRegisteredCompanies, registerCompanyImpl, removeCompanyImpl } from "./companies-registry"

let dataDir: string
let registryPath: string
let companyDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "companies-registry-data-"))
  registryPath = path.join(dataDir, "companies.json")
  companyDir = await mkdtemp(path.join(tmpdir(), "companies-registry-company-"))
  await mkdir(path.join(companyDir, ".git"))
  await mkdir(path.join(companyDir, ".claude"))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  await rm(companyDir, { recursive: true, force: true })
})

describe("companies-registry", () => {
  it("returns an empty list when the registry file doesn't exist", async () => {
    expect(await getRegisteredCompanies(registryPath)).toEqual([])
  })

  it("returns an empty list when the registry file is unparseable", async () => {
    const { writeFile } = await import("node:fs/promises")
    await writeFile(registryPath, "{ not json")
    expect(await getRegisteredCompanies(registryPath)).toEqual([])
  })

  it("registers a valid company and persists it", async () => {
    const result = await registerCompanyImpl("Second Co", companyDir, registryPath)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.company.name).toBe("Second Co")
    expect(result.company.rootPath).toBe(companyDir)
    expect(typeof result.company.id).toBe("string")
    expect(result.company.id.length).toBeGreaterThan(0)

    const companies = await getRegisteredCompanies(registryPath)
    expect(companies).toEqual([result.company])
  })

  it("rejects a blank name", async () => {
    const result = await registerCompanyImpl("   ", companyDir, registryPath)
    expect(result).toEqual({ ok: false, message: "Name is required" })
  })

  it("rejects a nonexistent path", async () => {
    const result = await registerCompanyImpl("X", path.join(tmpdir(), "does-not-exist-xyz"), registryPath)
    expect(result).toEqual({ ok: false, message: "Path does not exist or is not a directory" })
  })

  it("rejects a path missing .git", async () => {
    const noGit = await mkdtemp(path.join(tmpdir(), "companies-registry-nogit-"))
    await mkdir(path.join(noGit, ".claude"))
    try {
      const result = await registerCompanyImpl("X", noGit, registryPath)
      expect(result).toEqual({ ok: false, message: "Path is not a git repository (no .git found)" })
    } finally {
      await rm(noGit, { recursive: true, force: true })
    }
  })

  it("rejects a path missing .claude", async () => {
    const noClaude = await mkdtemp(path.join(tmpdir(), "companies-registry-noclaude-"))
    await mkdir(path.join(noClaude, ".git"))
    try {
      const result = await registerCompanyImpl("X", noClaude, registryPath)
      expect(result).toEqual({ ok: false, message: "Path has no .claude directory" })
    } finally {
      await rm(noClaude, { recursive: true, force: true })
    }
  })

  it("rejects registering the same rootPath twice", async () => {
    await registerCompanyImpl("First", companyDir, registryPath)
    const result = await registerCompanyImpl("Second", companyDir, registryPath)
    expect(result).toEqual({ ok: false, message: "This directory is already registered" })
  })

  it("removes a registered company", async () => {
    const registered = await registerCompanyImpl("Second Co", companyDir, registryPath)
    if (!registered.ok) throw new Error("setup failed")

    const result = await removeCompanyImpl(registered.company.id, registryPath)
    expect(result).toEqual({ ok: true })
    expect(await getRegisteredCompanies(registryPath)).toEqual([])
  })

  it("reports not-found when removing an unknown id", async () => {
    const result = await removeCompanyImpl("nonexistent-id", registryPath)
    expect(result).toEqual({ ok: false, message: "Not found" })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/companies-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/companies-registry.ts`**

```ts
import { readFile, writeFile, mkdir, stat } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import crypto from "node:crypto"

export type RegisteredCompany = { id: string; name: string; rootPath: string }

const DEFAULT_REGISTRY_PATH = path.join(process.cwd(), ".data", "companies.json")

export async function getRegisteredCompanies(
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<RegisteredCompany[]> {
  let raw: string
  try {
    raw = await readFile(registryPath, "utf-8")
  } catch {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

export async function registerCompanyImpl(
  name: string,
  rootPath: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  if (!name.trim()) {
    return { ok: false, message: "Name is required" }
  }
  if (!(await isDirectory(rootPath))) {
    return { ok: false, message: "Path does not exist or is not a directory" }
  }
  if (!(await exists(path.join(rootPath, ".git")))) {
    return { ok: false, message: "Path is not a git repository (no .git found)" }
  }
  if (!(await exists(path.join(rootPath, ".claude")))) {
    return { ok: false, message: "Path has no .claude directory" }
  }

  const companies = await getRegisteredCompanies(registryPath)
  if (companies.some((c) => c.rootPath === rootPath)) {
    return { ok: false, message: "This directory is already registered" }
  }

  const company: RegisteredCompany = { id: crypto.randomUUID(), name: name.trim(), rootPath }
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(registryPath, JSON.stringify([...companies, company], null, 2), "utf-8")
  return { ok: true, company }
}

export async function removeCompanyImpl(
  id: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true } | { ok: false; message: string }> {
  const companies = await getRegisteredCompanies(registryPath)
  if (!companies.some((c) => c.id === id)) {
    return { ok: false, message: "Not found" }
  }
  const remaining = companies.filter((c) => c.id !== id)
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(registryPath, JSON.stringify(remaining, null, 2), "utf-8")
  return { ok: true }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/companies-registry.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Add `.data/companies.json` awareness to `.gitignore`**

`.data/` is already gitignored from v8 — confirm this covers `.data/companies.json` too (it will, since `.data/` is a whole-directory ignore) and skip any further `.gitignore` edit.

- [ ] **Step 6: Commit**

```bash
git add lib/companies-registry.ts lib/companies-registry.test.ts
git commit -m "feat: add a companies registry (register/list/remove)"
```

---

### Task 2: Generic skill adapter (extracted) and generic activity adapter

**Files:**
- Create: `lib/skills/generic-command-set.ts`
- Modify: `lib/skills/ai-company-starter-main.ts`
- Create: `lib/adapters/generic-git-log.ts`
- Create: `lib/adapters/generic-git-log.test.ts`

**Interfaces:**
- Produces: `genericCommandSetSkillAdapter`, `genericGitLogActivityAdapter` — Task 3's `get-effective-agents.ts` consumes both.

- [ ] **Step 1: Read `lib/skills/ai-company-starter-main.ts` and its test file in full** — confirm current content before extracting.

- [ ] **Step 2: Write `lib/skills/generic-command-set.ts`** with the exact existing logic

```ts
import path from "node:path"
import type { Agent } from "../adapters/types"
import type { SkillAdapter } from "./types"
import { scanSkillsDir, scanCommandsDir } from "./scan-helpers"

export const genericCommandSetSkillAdapter: SkillAdapter = async (agent: Agent) => {
  const [skills, commands] = await Promise.all([
    scanSkillsDir(agent.id, path.join(agent.rootPath, ".claude", "skills")),
    scanCommandsDir(agent.id, path.join(agent.rootPath, ".claude", "commands")),
  ])
  return [...skills, ...commands]
}
```

- [ ] **Step 3: Replace `lib/skills/ai-company-starter-main.ts`'s entire content with a re-export**

```ts
import { genericCommandSetSkillAdapter } from "./generic-command-set"

export const aiCompanyStarterMainSkillsAdapter = genericCommandSetSkillAdapter
```

- [ ] **Step 4: Run `lib/skills/ai-company-starter-main.test.ts` UNCHANGED and confirm it still passes**

Run: `npx vitest run lib/skills/ai-company-starter-main.test.ts`
Expected: PASS, with ZERO changes to that test file — this is the regression proof.

- [ ] **Step 5: Write the failing test `lib/adapters/generic-git-log.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { genericGitLogActivityAdapter } from "./generic-git-log"
import type { Agent } from "./types"
import type { ExecFileFn } from "../git-commit-file"

const AGENT: Agent = { id: "second-co", name: "Second Co", rootPath: "/fake/root", kind: "command-set" }

const RECORD_SEP = "\x1e"
const FIELD_SEP = "\x1f"

describe("genericGitLogActivityAdapter", () => {
  it("converts git log output into activities", async () => {
    const fakeExec: ExecFileFn = async (_command, args) => {
      expect(args).toEqual(["-C", "/fake/root", "log", expect.stringMatching(/^--format=/), "-20"])
      return {
        stdout: [
          `abc123${FIELD_SEP}2026-07-23T10:00:00+09:00${FIELD_SEP}Fix the thing${RECORD_SEP}`,
          `def456${FIELD_SEP}2026-07-22T09:00:00+09:00${FIELD_SEP}Add the other thing${RECORD_SEP}`,
        ].join(""),
        stderr: "",
      }
    }

    const activities = await genericGitLogActivityAdapter(AGENT, fakeExec)

    expect(activities).toEqual([
      {
        id: "abc123",
        agentId: "second-co",
        type: "commit",
        timestamp: Math.floor(new Date("2026-07-23T10:00:00+09:00").getTime() / 1000),
        title: "Fix the thing",
        status: "done",
        detailPath: "/fake/root",
      },
      {
        id: "def456",
        agentId: "second-co",
        type: "commit",
        timestamp: Math.floor(new Date("2026-07-22T09:00:00+09:00").getTime() / 1000),
        title: "Add the other thing",
        status: "done",
        detailPath: "/fake/root",
      },
    ])
  })

  it("returns an empty list when git log fails (e.g. no commits yet)", async () => {
    const fakeExec: ExecFileFn = async () => {
      throw new Error("does not have any commits yet")
    }

    const activities = await genericGitLogActivityAdapter(AGENT, fakeExec)

    expect(activities).toEqual([])
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run lib/adapters/generic-git-log.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write `lib/adapters/generic-git-log.ts`**

```ts
import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import type { Activity, Agent } from "./types"
import type { ExecFileFn } from "../git-commit-file"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

const RECORD_SEP = "\x1e"
const FIELD_SEP = "\x1f"
const LOG_FORMAT = `%H${FIELD_SEP}%aI${FIELD_SEP}%s${RECORD_SEP}`

export async function genericGitLogActivityAdapter(
  agent: Agent,
  execFn: ExecFileFn = defaultExecFile
): Promise<Activity[]> {
  try {
    const { stdout } = await execFn("git", ["-C", agent.rootPath, "log", `--format=${LOG_FORMAT}`, "-20"])
    return stdout
      .split(RECORD_SEP)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const [sha, date, message] = chunk.split(FIELD_SEP)
        return {
          id: sha,
          agentId: agent.id,
          type: "commit",
          timestamp: Math.floor(new Date(date).getTime() / 1000),
          title: message,
          status: "done" as const,
          detailPath: agent.rootPath,
        }
      })
  } catch {
    return []
  }
}
```

Note: this file's exported function signature is `(agent, execFn?)`, not the bare `Adapter = (agent: Agent) => Promise<Activity[]>` type used elsewhere — `get-effective-agents.ts` (Task 3) will wrap it as `(agent) => genericGitLogActivityAdapter(agent)` to satisfy the `Adapter` type when registering it in the effective `ADAPTERS` record, keeping the injectable `execFn` seam available for this file's own tests without polluting the shared `Adapter` type signature every other adapter implements.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run lib/adapters/generic-git-log.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 9: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add lib/skills/generic-command-set.ts lib/skills/ai-company-starter-main.ts lib/adapters/generic-git-log.ts lib/adapters/generic-git-log.test.ts
git commit -m "feat: add generic skill and git-log activity adapters for registered companies"
```

---

### Task 3: Effective agents/adapters merge layer

**Files:**
- Create: `lib/get-effective-agents.ts`
- Create: `lib/get-effective-agents.test.ts`

**Interfaces:**
- Consumes: `AGENTS`/`ADAPTERS`/`SKILL_ADAPTERS` (existing `./config`), `getRegisteredCompanies` (Task 1), `genericCommandSetSkillAdapter`/`genericGitLogActivityAdapter` (Task 2).
- Produces: `getEffectiveAgents()`, `getEffectiveAdapters()`, `getEffectiveSkillAdapters()` — Task 4's `path-guard.ts`/`resolve-known-skill.ts`/page components consume these.

- [ ] **Step 1: Write the failing test `lib/get-effective-agents.test.ts`**

```ts
import { describe, it, expect, afterEach, vi } from "vitest"

afterEach(() => {
  vi.resetModules()
})

describe("get-effective-agents", () => {
  it("returns just the static agents when no companies are registered", async () => {
    vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
    const { getEffectiveAgents } = await import("./get-effective-agents")
    const { AGENTS } = await import("./config")

    const agents = await getEffectiveAgents()

    expect(agents).toEqual(AGENTS)
  })

  it("appends registered companies as command-set agents", async () => {
    vi.doMock("./companies-registry", () => ({
      getRegisteredCompanies: async () => [{ id: "second-co", name: "Second Co", rootPath: "/fake/second-co" }],
    }))
    const { getEffectiveAgents } = await import("./get-effective-agents")
    const { AGENTS } = await import("./config")

    const agents = await getEffectiveAgents()

    expect(agents).toEqual([
      ...AGENTS,
      { id: "second-co", name: "Second Co", rootPath: "/fake/second-co", kind: "command-set" },
    ])
  })

  it("registers the generic skill adapter for each registered company", async () => {
    vi.doMock("./companies-registry", () => ({
      getRegisteredCompanies: async () => [{ id: "second-co", name: "Second Co", rootPath: "/fake/second-co" }],
    }))
    const { getEffectiveSkillAdapters } = await import("./get-effective-agents")
    const { SKILL_ADAPTERS } = await import("./config")
    const { genericCommandSetSkillAdapter } = await import("./skills/generic-command-set")

    const adapters = await getEffectiveSkillAdapters()

    expect(adapters["second-co"]).toBe(genericCommandSetSkillAdapter)
    for (const id of Object.keys(SKILL_ADAPTERS)) {
      expect(adapters[id]).toBe(SKILL_ADAPTERS[id])
    }
  })

  it("registers a generic git-log activity adapter for each registered company", async () => {
    vi.doMock("./companies-registry", () => ({
      getRegisteredCompanies: async () => [{ id: "second-co", name: "Second Co", rootPath: "/fake/second-co" }],
    }))
    const { getEffectiveAdapters } = await import("./get-effective-agents")
    const { ADAPTERS } = await import("./config")

    const adapters = await getEffectiveAdapters()

    expect(typeof adapters["second-co"]).toBe("function")
    for (const id of Object.keys(ADAPTERS)) {
      expect(adapters[id]).toBe(ADAPTERS[id])
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/get-effective-agents.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/get-effective-agents.ts`**

```ts
import type { Agent, Adapter } from "./adapters/types"
import type { SkillAdapter } from "./skills/types"
import { AGENTS, ADAPTERS, SKILL_ADAPTERS } from "./config"
import { getRegisteredCompanies } from "./companies-registry"
import { genericCommandSetSkillAdapter } from "./skills/generic-command-set"
import { genericGitLogActivityAdapter } from "./adapters/generic-git-log"

export async function getEffectiveAgents(): Promise<Agent[]> {
  const companies = await getRegisteredCompanies()
  return [
    ...AGENTS,
    ...companies.map((c): Agent => ({ id: c.id, name: c.name, rootPath: c.rootPath, kind: "command-set" })),
  ]
}

export async function getEffectiveAdapters(): Promise<Record<string, Adapter>> {
  const companies = await getRegisteredCompanies()
  const merged: Record<string, Adapter> = { ...ADAPTERS }
  for (const c of companies) {
    merged[c.id] = (agent) => genericGitLogActivityAdapter(agent)
  }
  return merged
}

export async function getEffectiveSkillAdapters(): Promise<Record<string, SkillAdapter>> {
  const companies = await getRegisteredCompanies()
  const merged: Record<string, SkillAdapter> = { ...SKILL_ADAPTERS }
  for (const c of companies) {
    merged[c.id] = genericCommandSetSkillAdapter
  }
  return merged
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/get-effective-agents.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/get-effective-agents.ts lib/get-effective-agents.test.ts
git commit -m "feat: merge static agents with registered companies"
```

---

### Task 4: Wire effective agents into path-guard, resolve-known-skill, and the 3 pages

**Files:**
- Modify: `lib/path-guard.ts`
- Modify: `lib/path-guard.test.ts`
- Modify: `lib/resolve-known-skill.ts`
- Modify: `lib/resolve-known-skill.test.ts`
- Modify: `app/page.tsx`
- Modify: `app/activity/page.tsx`
- Modify: `app/skills/page.tsx`

**Interfaces:**
- Consumes: `getEffectiveAgents`/`getEffectiveAdapters`/`getEffectiveSkillAdapters` (Task 3).
- Produces: nothing for later tasks — these are consumers, not producers, at this point.

- [ ] **Step 1: Read the current content of all 5 files being modified in full** before editing.

- [ ] **Step 2: Modify `lib/path-guard.ts`**

Change the import and the loop:
```ts
import { realpath } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"

export type PathGuardResult = { realPath: string; agentRootPath: string } | null

async function tryRealpath(p: string): Promise<string | null> {
  try {
    return await realpath(p)
  } catch {
    return null
  }
}

export async function resolveWithinAgentRoot(requestedPath: string): Promise<PathGuardResult> {
  const resolved = await tryRealpath(path.resolve(requestedPath))
  if (resolved === null) {
    return null
  }

  const agents = await getEffectiveAgents()
  for (const agent of agents) {
    const root = await tryRealpath(path.resolve(agent.rootPath))
    if (root === null) continue
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      return { realPath: resolved, agentRootPath: root }
    }
  }
  return null
}
```

- [ ] **Step 3: Add the one required additive line to `lib/path-guard.test.ts`**

In each of the 3 existing `it(...)` blocks, immediately before the existing `vi.doMock("./config", ...)` line, add:
```ts
    vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
```
Do not change anything else in this file — this is the one additive line per test the plan's Global Constraints section calls for, making explicit the "zero registered companies" assumption these tests already implicitly relied on.

- [ ] **Step 4: Run `path-guard.test.ts` and confirm all 3 tests still pass**

Run: `npx vitest run lib/path-guard.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Modify `lib/resolve-known-skill.ts`**

Change the import and the call:
```ts
import { realpath } from "node:fs/promises"
import { resolveWithinAgentRoot } from "./path-guard"
import { getEffectiveAgents, getEffectiveSkillAdapters } from "./get-effective-agents"
import { getAllSkills } from "./get-all-skills"

export type ResolveKnownSkillResult =
  | { ok: true; realPath: string; agentRootPath: string }
  | { ok: false; reason: "outside-root" | "not-a-known-skill" }

export async function resolveKnownSkillPath(filePath: string): Promise<ResolveKnownSkillResult> {
  const guard = await resolveWithinAgentRoot(filePath)
  if (!guard) {
    return { ok: false, reason: "outside-root" }
  }

  const [agents, skillAdapters] = await Promise.all([getEffectiveAgents(), getEffectiveSkillAdapters()])
  const results = await getAllSkills(agents, skillAdapters)
  const allEntryPaths = results.flatMap((r) => r.entries.map((entry) => entry.path))
  const resolvedEntryPaths = await Promise.all(
    allEntryPaths.map(async (entryPath) => {
      try {
        return await realpath(entryPath)
      } catch {
        return null
      }
    })
  )
  const isKnownSkill = resolvedEntryPaths.some((resolved) => resolved === guard.realPath)
  if (!isKnownSkill) {
    return { ok: false, reason: "not-a-known-skill" }
  }

  return { ok: true, realPath: guard.realPath, agentRootPath: guard.agentRootPath }
}
```

- [ ] **Step 6: Add the same additive line to `lib/resolve-known-skill.test.ts`**

Inside the existing `mockAgents()` helper function, add the companies-registry mock alongside the existing `vi.doMock("./config", ...)` call:
```ts
async function mockAgents() {
  vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
  vi.doMock("./config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./config")>()
    return {
      ...actual,
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
    }
  })
}
```
Do not change anything else in this file.

- [ ] **Step 7: Run `resolve-known-skill.test.ts` and confirm all 3 tests still pass**

Run: `npx vitest run lib/resolve-known-skill.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 8: Modify `app/page.tsx`, `app/activity/page.tsx`, `app/skills/page.tsx`**

In each file, replace the import of the static constants with the effective-agents functions, and call them:

`app/page.tsx`: replace
```tsx
import { AGENTS, ADAPTERS, TAKESHI_AGENT_LAUNCHD_LABEL } from "@/lib/config"
```
with
```tsx
import { TAKESHI_AGENT_LAUNCHD_LABEL } from "@/lib/config"
import { getEffectiveAgents, getEffectiveAdapters } from "@/lib/get-effective-agents"
```
and inside the component, before the existing `Promise.all` that builds `results`/`launchdHealth`/`pollStatus`, add:
```tsx
const [agents, adapters] = await Promise.all([getEffectiveAgents(), getEffectiveAdapters()])
```
then change every remaining reference to the bare `AGENTS`/`ADAPTERS` identifiers in this file (the `takeshiAgent = AGENTS.find(...)` line and the `getAllActivities(AGENTS, ADAPTERS)` call) to use `agents`/`adapters` instead. Read the file's current full content first (Step 1) to apply this precisely — do not disturb the `isTakeshiAgent`/`isAiCompanyStarterMain`/`isPlhOps` computations or any other existing logic.

`app/activity/page.tsx`: replace
```tsx
import { AGENTS, ADAPTERS } from "@/lib/config"
```
with
```tsx
import { getEffectiveAgents, getEffectiveAdapters } from "@/lib/get-effective-agents"
```
and change
```tsx
const results = await getAllActivities(AGENTS, ADAPTERS)
```
to
```tsx
const [agents, adapters] = await Promise.all([getEffectiveAgents(), getEffectiveAdapters()])
const results = await getAllActivities(agents, adapters)
```

`app/skills/page.tsx`: replace
```tsx
import { AGENTS, SKILL_ADAPTERS } from "@/lib/config"
```
with
```tsx
import { getEffectiveAgents, getEffectiveSkillAdapters } from "@/lib/get-effective-agents"
```
and change
```tsx
const results = await getAllSkills(AGENTS, SKILL_ADAPTERS)
```
to
```tsx
const [agents, skillAdapters] = await Promise.all([getEffectiveAgents(), getEffectiveSkillAdapters()])
const results = await getAllSkills(agents, skillAdapters)
```

- [ ] **Step 9: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add lib/path-guard.ts lib/path-guard.test.ts lib/resolve-known-skill.ts lib/resolve-known-skill.test.ts app/page.tsx app/activity/page.tsx app/skills/page.tsx
git commit -m "feat: use effective agents (static + registered companies) throughout the app"
```

---

### Task 5: Server Actions and UI — add/remove a company

**Files:**
- Create: `lib/register-company.ts`
- Create: `lib/remove-company.ts`
- Create: `components/add-company-form.tsx`
- Create: `components/remove-company-button.tsx`
- Modify: `components/agent-card.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `registerCompanyImpl`/`removeCompanyImpl` (Task 1).
- Produces: nothing for later tasks — final integration point.

- [ ] **Step 1: Read the current content of `components/agent-card.tsx` and `app/page.tsx` in full** — both have been modified by prior slices; confirm current state before editing.

- [ ] **Step 2: Write `lib/register-company.ts`**

```ts
"use server"

import { registerCompanyImpl } from "./companies-registry"
import type { RegisteredCompany } from "./companies-registry"

export async function registerCompany(
  name: string,
  rootPath: string
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  return registerCompanyImpl(name, rootPath)
}
```

- [ ] **Step 3: Write `lib/remove-company.ts`**

```ts
"use server"

import { removeCompanyImpl } from "./companies-registry"

export async function removeCompany(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  return removeCompanyImpl(id)
}
```

- [ ] **Step 4: Write `components/add-company-form.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { registerCompany } from "@/lib/register-company"

export function AddCompanyForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [rootPath, setRootPath] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit() {
    setPending(true)
    setMessage(null)
    const result = await registerCompany(name, rootPath)
    setPending(false)
    if (result.ok) {
      setName("")
      setRootPath("")
      setMessage(`Registered "${result.company.name}"`)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div className="space-y-2 rounded border p-4">
      <h2 className="text-sm font-medium">Add a company</h2>
      <div className="space-y-1">
        <label className="text-sm">Name</label>
        <Textarea rows={1} value={name} onChange={(e) => setName(e.target.value)} placeholder="Second Co" />
      </div>
      <div className="space-y-1">
        <label className="text-sm">Local directory path</label>
        <Textarea
          rows={1}
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          placeholder="/Users/you/AI-Native/second-co"
        />
      </div>
      <Button size="sm" onClick={handleSubmit} disabled={pending || !name || !rootPath}>
        {pending ? "Adding…" : "Add company"}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
```

- [ ] **Step 5: Write `components/remove-company-button.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { removeCompany } from "@/lib/remove-company"

export function RemoveCompanyButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleConfirm() {
    setPending(true)
    const result = await removeCompany(id)
    setPending(false)
    if (result.ok) {
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div className="space-y-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>
            Remove
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This only un-registers it from the dashboard — the actual directory and its git history are
              never touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Wire `RemoveCompanyButton` into `components/agent-card.tsx`**

Add the import:
```tsx
import { RemoveCompanyButton } from "@/components/remove-company-button"
```

Add a new prop to `AgentCardProps`:
```tsx
removable?: boolean
```

Destructure it, and render it in `CardContent` alongside the existing conditional buttons:
```tsx
{removable && <RemoveCompanyButton id={agent.id} name={agent.name} />}
```

Leave every other existing prop/render line untouched.

- [ ] **Step 7: Wire `removable` and mount `AddCompanyForm` in `app/page.tsx`**

For each agent card rendered in the existing `.map`, compute whether it's a registered company (not one of the 3 static ids) and pass it through:
```tsx
const isRegisteredCompany = !["plh-takeshi-agent", "ai-company-starter-main", "plh-ops"].includes(result.agent.id)
```
Pass `removable={isRegisteredCompany}` to `<AgentCard>` alongside its existing props.

Add the import:
```tsx
import { AddCompanyForm } from "@/components/add-company-form"
```

Render `<AddCompanyForm />` once, after the existing `<div className="grid ...">` of agent cards (as a sibling, not inside the grid).

- [ ] **Step 8: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add lib/register-company.ts lib/remove-company.ts components/add-company-form.tsx components/remove-company-button.tsx components/agent-card.tsx app/page.tsx
git commit -m "feat: add UI to register and remove a second company"
```

---

### Task 6: README and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: updated documentation, a real verified registration + removal.

- [ ] **Step 1: Update `README.md`**

Read the current file in full first. Add a new section after the most recent existing version section:

```markdown
## v11: register a second AI company

The dashboard's home page now has an "Add a company" form: point it at
an existing local directory (one you've already created or cloned
yourself, e.g. via GitHub's "Use this template" on `ai-company-starter-main`
+ `gh repo clone`) that has both a `.git` and a `.claude` directory, and
it becomes a fully managed agent — showing up in the agent tree, the
activity board (via a generic recent-commits feed), and the skills
browser with full editing/history/revert, with zero per-company code.
"Remove" only un-registers it; the actual directory and its git history
are never touched.

Deliberately NOT generalized to registered companies: `ai-company-starter-main`'s
"Run verify" button (v5) and its 5 runnable slash-commands (v8) — both
are hand-authored for this one company's actual script and actual
commands, and a genuinely different second company (different concept,
per the original idea behind this whole project) wouldn't have the same
`scripts/verify.py` or the same commands. Building a truly dynamic
version of either is a bigger, separate effort, not attempted here. Also
not attempted: creating a new company FROM the template automatically —
`ai-company-starter-main`'s local clone has no git remote configured, so
there's no way to discover which GitHub template to clone from the
filesystem alone; you create the new company's directory yourself, the
dashboard only registers it.
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass — the prior 159 plus this slice's new ones (companies-registry: 10, generic-git-log: 2, get-effective-agents: 4 — 16 new, ~175 total; treat a different-but-reasonable count as fine as long as nothing fails).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Real live verification (required)**

1. Create a fresh, disposable local git repo OUTSIDE `~/AI-Native/` to keep it obviously separate from the real 3 agents — e.g.:
   ```bash
   mkdir -p /tmp/second-co-test/.claude/skills/hello-world
   cd /tmp/second-co-test && git init -q
   cat > .claude/skills/hello-world/SKILL.md << 'EOF'
   ---
   name: hello-world
   description: A trivial test skill for v11's live verification.
   ---
   # hello-world
   Just a test.
   EOF
   git add -A && git commit -q -m "initial commit"
   ```
2. Run `npm run dev`, load `/`, use "Add a company" with name "Second Co Test" and path `/tmp/second-co-test`. Confirm it's registered (appears as a new card).
3. Confirm it shows up on `/activity` (with its one "initial commit" as an activity) and `/skills` (with its one `hello-world` skill).
4. Open the `hello-world` skill in `/skills`, confirm you can edit and save it for real (this is a disposable test repo, not `ai-company-starter-main`, so a real content change here is fine and expected — no net-zero restoration needed).
5. Confirm the History view shows the new commit from the edit.
6. Remove the company via its card's "Remove" button. Confirm it disappears from all 3 pages, and confirm `/tmp/second-co-test` still exists on disk with its git history intact (`git -C /tmp/second-co-test log --oneline` still shows both commits).
7. Clean up: `rm -rf /tmp/second-co-test` (this is your own disposable test fixture, not a real agent directory — safe to delete once verification is complete).
8. Confirm `~/AI-Native/plh-takeshi-agent` and `~/AI-Native/plh-ops` were never touched during this test.

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document registering a second AI company"
```
