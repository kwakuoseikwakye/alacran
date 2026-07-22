# AI-Native Control Panel v3 Slice: Skill/Command Browser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/skills` page listing every skill/command across all three agents, grouped by agent, with a click-to-view detail panel reusing v1's existing file-read Server Action unchanged.

**Architecture:** Three new per-agent "skill adapters" (mirroring v1's per-agent activity adapters) built on a shared `scan-helpers.ts` (subdirectory-of-SKILL.md scanning + flat-.md-file scanning) and a shared `parse-frontmatter.ts` (extracts `name`/`description` from the YAML frontmatter every skill/command file already uses). A merge utility mirrors `get-all-activities.ts`. The detail panel reuses `getActivityDetail` from v1 unchanged, since every skill/command file lives inside an already-whitelisted agent root.

**Tech Stack:** Same as v1/v2 — Next.js 15 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, Vitest.

## Global Constraints

- This slice is read-only: no Server Action here ever writes to `.claude/skills/`, `.claude/commands/`, `skills/`, or `workflow/`.
- No new YAML dependency — frontmatter parsing extracts exactly `name`/`description` via a small purpose-built parser.
- No recursive scanning into a skill's own subdirectories (e.g. `piro/scripts/`, `piro/reference/`) — only the top-level `SKILL.md` (or, for commands, the command's own `.md` file) is an entry.
- A subdirectory under a skills folder that has no `SKILL.md` inside it is not an entry at all (skipped silently) — this is different from a `SKILL.md` that exists but has missing/malformed frontmatter (which still becomes an entry, with a filename-based fallback name and empty description).
- A missing skills/commands directory for an agent returns `[]`, not an error — a project having no skills yet is not a failure state.
- `app/skills/page.tsx` must export `const dynamic = "force-dynamic"` from the start (v1 shipped without this on its first two pages and had to fix it after the fact — don't repeat that).

---

### Task 1: Shared types and the skill merge utility

**Files:**
- Create: `lib/skills/types.ts`
- Create: `lib/get-all-skills.ts`
- Test: `lib/get-all-skills.test.ts`

**Interfaces:**
- Consumes: `Agent` from `lib/adapters/types.ts` (existing).
- Produces: `SkillKind`, `SkillEntry`, `SkillAdapter` (from `lib/skills/types.ts`); `SkillAgentResult` type, `getAllSkills(agents, adapters): Promise<SkillAgentResult[]>`, `mergeAndSortSkills(results): SkillEntry[]` (from `lib/get-all-skills.ts`). Every later adapter task implements `SkillAdapter`; the page (Task 8) consumes both functions.

- [ ] **Step 1: Write `lib/skills/types.ts`**

```ts
import type { Agent } from "../adapters/types"

export type SkillKind = "skill" | "command"

export type SkillEntry = {
  id: string
  agentId: string
  kind: SkillKind
  name: string
  description: string
  path: string
}

export type SkillAdapter = (agent: Agent) => Promise<SkillEntry[]>
```

- [ ] **Step 2: Write the failing test `lib/get-all-skills.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { getAllSkills, mergeAndSortSkills } from "./get-all-skills"
import type { Agent } from "./adapters/types"
import type { SkillEntry } from "./skills/types"

const agentA: Agent = { id: "a", name: "Agent A", rootPath: "/tmp/a", kind: "pipeline" }
const agentB: Agent = { id: "b", name: "Agent B", rootPath: "/tmp/b", kind: "report-log" }

describe("getAllSkills", () => {
  it("isolates a throwing adapter from a healthy one", async () => {
    const results = await getAllSkills([agentA, agentB], {
      a: async () => {
        throw new Error("boom")
      },
      b: async () => [
        { id: "1", agentId: "b", kind: "skill", name: "z-skill", description: "", path: "/tmp/b/1" },
      ],
    })
    const a = results.find((r) => r.agent.id === "a")!
    const b = results.find((r) => r.agent.id === "b")!
    expect(a.error).toBe("boom")
    expect(a.entries).toEqual([])
    expect(b.error).toBeNull()
    expect(b.entries).toHaveLength(1)
  })

  it("reports a clear error when no adapter is registered", async () => {
    const results = await getAllSkills([agentA], {})
    expect(results[0].error).toBe('No skill adapter registered for agent "a"')
  })
})

describe("mergeAndSortSkills", () => {
  it("merges entries from multiple agents sorted alphabetically by name", () => {
    const results = [
      {
        agent: agentA,
        error: null,
        entries: [
          { id: "1", agentId: "a", kind: "skill", name: "z-skill", description: "", path: "/tmp/1" } as SkillEntry,
        ],
      },
      {
        agent: agentB,
        error: null,
        entries: [
          { id: "2", agentId: "b", kind: "command", name: "a-command", description: "", path: "/tmp/2" } as SkillEntry,
        ],
      },
    ]
    const merged = mergeAndSortSkills(results)
    expect(merged.map((e) => e.id)).toEqual(["2", "1"])
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/get-all-skills.test.ts`
Expected: FAIL — `Cannot find module './get-all-skills'`.

- [ ] **Step 4: Write `lib/get-all-skills.ts`**

```ts
import type { Agent } from "./adapters/types"
import type { SkillEntry, SkillAdapter } from "./skills/types"

export type SkillAgentResult = {
  agent: Agent
  entries: SkillEntry[]
  error: string | null
}

export async function getAllSkills(
  agents: Agent[],
  adapters: Record<string, SkillAdapter>
): Promise<SkillAgentResult[]> {
  return Promise.all(
    agents.map(async (agent) => {
      const adapter = adapters[agent.id]
      if (!adapter) {
        return { agent, entries: [], error: `No skill adapter registered for agent "${agent.id}"` }
      }
      try {
        const entries = await adapter(agent)
        return { agent, entries, error: null }
      } catch (err) {
        return { agent, entries: [], error: err instanceof Error ? err.message : String(err) }
      }
    })
  )
}

export function mergeAndSortSkills(results: SkillAgentResult[]): SkillEntry[] {
  return results.flatMap((r) => r.entries).sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/get-all-skills.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/skills/types.ts lib/get-all-skills.ts lib/get-all-skills.test.ts
git commit -m "feat: add shared SkillEntry types and skill merge utility"
```

---

### Task 2: Frontmatter parser

**Files:**
- Create: `lib/skills/parse-frontmatter.ts`
- Test: `lib/skills/parse-frontmatter.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Frontmatter` type `{ name?: string; description?: string }`, `parseFrontmatter(content: string): Frontmatter` — consumed by `lib/skills/scan-helpers.ts` (Task 3).

- [ ] **Step 1: Write the failing test `lib/skills/parse-frontmatter.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { parseFrontmatter } from "./parse-frontmatter"

describe("parseFrontmatter", () => {
  it("extracts name and description from well-formed frontmatter", () => {
    const content = "---\nname: piro\ndescription: Generates Kiro-compatible specs.\n---\n\n# piro\n"
    expect(parseFrontmatter(content)).toEqual({ name: "piro", description: "Generates Kiro-compatible specs." })
  })

  it("returns an empty object when there is no frontmatter", () => {
    const content = "# Just a heading\n\nSome body text.\n"
    expect(parseFrontmatter(content)).toEqual({})
  })

  it("returns whatever fields are present when one is missing", () => {
    const content = "---\nname: verify\n---\n\n# /verify\n"
    expect(parseFrontmatter(content)).toEqual({ name: "verify" })
  })

  it("ignores extra frontmatter fields", () => {
    const content = "---\nname: office\ndescription: Runs the office script.\nallowed-tools: Bash\n---\n"
    expect(parseFrontmatter(content)).toEqual({ name: "office", description: "Runs the office script." })
  })

  it("returns an empty object when the frontmatter block is never closed", () => {
    const content = "---\nname: broken\ndescription: no closing delimiter\n\n# body without closing ---\n"
    expect(parseFrontmatter(content)).toEqual({})
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/skills/parse-frontmatter.test.ts`
Expected: FAIL — `Cannot find module './parse-frontmatter'`.

- [ ] **Step 3: Write `lib/skills/parse-frontmatter.ts`**

```ts
export type Frontmatter = {
  name?: string
  description?: string
}

export function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith("---")) return {}
  const closingIndex = content.indexOf("\n---", 3)
  if (closingIndex === -1) return {}
  const block = content.slice(3, closingIndex)

  const result: Frontmatter = {}
  for (const line of block.split("\n")) {
    const nameMatch = /^name:\s*(.+)$/.exec(line.trim())
    if (nameMatch) result.name = nameMatch[1].trim()
    const descMatch = /^description:\s*(.+)$/.exec(line.trim())
    if (descMatch) result.description = descMatch[1].trim()
  }
  return result
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/skills/parse-frontmatter.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/skills/parse-frontmatter.ts lib/skills/parse-frontmatter.test.ts
git commit -m "feat: add frontmatter name/description parser"
```

---

### Task 3: Shared scan helpers

**Files:**
- Create: `lib/skills/scan-helpers.ts`
- Test: `lib/skills/scan-helpers.test.ts`

**Interfaces:**
- Consumes: `SkillEntry` (Task 1), `parseFrontmatter` (Task 2).
- Produces: `scanSkillsDir(agentId: string, skillsDir: string): Promise<SkillEntry[]>`, `scanCommandsDir(agentId: string, commandsDir: string): Promise<SkillEntry[]>` — both consumed by all three per-agent adapters (Tasks 4-6).

- [ ] **Step 1: Write the failing test `lib/skills/scan-helpers.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { scanSkillsDir, scanCommandsDir } from "./scan-helpers"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "scan-helpers-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("scanSkillsDir", () => {
  it("returns one entry per subdirectory containing a SKILL.md, parsing its frontmatter", async () => {
    await mkdir(path.join(root, "piro"), { recursive: true })
    await writeFile(
      path.join(root, "piro", "SKILL.md"),
      "---\nname: piro\ndescription: Generates Kiro-compatible specs.\n---\n\n# piro\n"
    )

    const entries = await scanSkillsDir("ai-company-starter-main", root)

    expect(entries).toEqual([
      {
        id: path.join(root, "piro", "SKILL.md"),
        agentId: "ai-company-starter-main",
        kind: "skill",
        name: "piro",
        description: "Generates Kiro-compatible specs.",
        path: path.join(root, "piro", "SKILL.md"),
      },
    ])
  })

  it("falls back to the directory name when frontmatter is missing or has no name", async () => {
    await mkdir(path.join(root, "mystery-skill"), { recursive: true })
    await writeFile(path.join(root, "mystery-skill", "SKILL.md"), "# No frontmatter here\n")

    const entries = await scanSkillsDir("plh-ops", root)

    expect(entries).toEqual([
      {
        id: path.join(root, "mystery-skill", "SKILL.md"),
        agentId: "plh-ops",
        kind: "skill",
        name: "mystery-skill",
        description: "",
        path: path.join(root, "mystery-skill", "SKILL.md"),
      },
    ])
  })

  it("skips a subdirectory that has no SKILL.md at all, without dropping siblings", async () => {
    await mkdir(path.join(root, "piro", "scripts"), { recursive: true })
    await writeFile(path.join(root, "piro", "scripts", "validate.py"), "# not a skill\n")
    await writeFile(path.join(root, "piro", "SKILL.md"), "---\nname: piro\ndescription: x\n---\n")
    await mkdir(path.join(root, "not-a-skill"), { recursive: true })

    const entries = await scanSkillsDir("ai-company-starter-main", root)

    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe("piro")
  })

  it("returns an empty array when the skills directory doesn't exist", async () => {
    const entries = await scanSkillsDir("plh-takeshi-agent", path.join(root, "does-not-exist"))
    expect(entries).toEqual([])
  })
})

describe("scanCommandsDir", () => {
  it("returns one entry per .md file, using the filename (without extension) as fallback name", async () => {
    await mkdir(root, { recursive: true })
    await writeFile(
      path.join(root, "verify.md"),
      "---\nname: verify\ndescription: Runs verification.\n---\n\n# /verify\n"
    )
    await writeFile(path.join(root, "README.md"), "# Commands index\n")

    const entries = await scanCommandsDir("ai-company-starter-main", root)

    expect(entries).toHaveLength(2)
    const verify = entries.find((e) => e.path.endsWith("verify.md"))
    expect(verify).toMatchObject({ name: "verify", description: "Runs verification.", kind: "command" })
    const readme = entries.find((e) => e.path.endsWith("README.md"))
    expect(readme).toMatchObject({ name: "README", description: "" })
  })

  it("ignores non-markdown files", async () => {
    await mkdir(root, { recursive: true })
    await writeFile(path.join(root, "notes.txt"), "not a command\n")

    const entries = await scanCommandsDir("ai-company-starter-main", root)

    expect(entries).toEqual([])
  })

  it("returns an empty array when the commands directory doesn't exist", async () => {
    const entries = await scanCommandsDir("plh-ops", path.join(root, "does-not-exist"))
    expect(entries).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/skills/scan-helpers.test.ts`
Expected: FAIL — `Cannot find module './scan-helpers'`.

- [ ] **Step 3: Write `lib/skills/scan-helpers.ts`**

```ts
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { SkillEntry } from "./types"
import { parseFrontmatter } from "./parse-frontmatter"

async function entryFromFile(
  agentId: string,
  kind: SkillEntry["kind"],
  filePath: string,
  fallbackName: string
): Promise<SkillEntry | null> {
  let content: string
  try {
    content = await readFile(filePath, "utf-8")
  } catch {
    return null
  }
  const fm = parseFrontmatter(content)
  return {
    id: filePath,
    agentId,
    kind,
    name: fm.name ?? fallbackName,
    description: fm.description ?? "",
    path: filePath,
  }
}

export async function scanSkillsDir(agentId: string, skillsDir: string): Promise<SkillEntry[]> {
  let dirNames: string[]
  try {
    dirNames = await readdir(skillsDir)
  } catch {
    return []
  }
  const entries: SkillEntry[] = []
  for (const dirName of dirNames) {
    const skillFile = path.join(skillsDir, dirName, "SKILL.md")
    const entry = await entryFromFile(agentId, "skill", skillFile, dirName)
    if (entry) entries.push(entry)
  }
  return entries
}

export async function scanCommandsDir(agentId: string, commandsDir: string): Promise<SkillEntry[]> {
  let fileNames: string[]
  try {
    fileNames = await readdir(commandsDir)
  } catch {
    return []
  }
  const entries: SkillEntry[] = []
  for (const fileName of fileNames) {
    if (!fileName.endsWith(".md")) continue
    const filePath = path.join(commandsDir, fileName)
    const fallbackName = fileName.replace(/\.md$/, "")
    const entry = await entryFromFile(agentId, "command", filePath, fallbackName)
    if (entry) entries.push(entry)
  }
  return entries
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/skills/scan-helpers.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/skills/scan-helpers.ts lib/skills/scan-helpers.test.ts
git commit -m "feat: add shared skill/command directory scan helpers"
```

---

### Task 4: `ai-company-starter-main` skills adapter

**Files:**
- Create: `lib/skills/ai-company-starter-main.ts`
- Test: `lib/skills/ai-company-starter-main.test.ts`

**Interfaces:**
- Consumes: `Agent` from `lib/adapters/types.ts`; `SkillAdapter` (Task 1); `scanSkillsDir`, `scanCommandsDir` (Task 3).
- Produces: `aiCompanyStarterMainSkillsAdapter: SkillAdapter` — consumed by `lib/config.ts` (Task 7).

- [ ] **Step 1: Write the failing test `lib/skills/ai-company-starter-main.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { aiCompanyStarterMainSkillsAdapter } from "./ai-company-starter-main"
import type { Agent } from "../adapters/types"

let root: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ai-company-skills-test-"))
  agent = { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("aiCompanyStarterMainSkillsAdapter", () => {
  it("combines .claude/skills and .claude/commands into one list", async () => {
    await mkdir(path.join(root, ".claude", "skills", "piro"), { recursive: true })
    await writeFile(
      path.join(root, ".claude", "skills", "piro", "SKILL.md"),
      "---\nname: piro\ndescription: Generates specs.\n---\n"
    )
    await mkdir(path.join(root, ".claude", "commands"), { recursive: true })
    await writeFile(
      path.join(root, ".claude", "commands", "verify.md"),
      "---\nname: verify\ndescription: Runs verification.\n---\n"
    )

    const entries = await aiCompanyStarterMainSkillsAdapter(agent)

    expect(entries).toHaveLength(2)
    expect(entries.find((e) => e.kind === "skill")).toMatchObject({ name: "piro" })
    expect(entries.find((e) => e.kind === "command")).toMatchObject({ name: "verify" })
  })

  it("returns an empty array when neither directory exists", async () => {
    const entries = await aiCompanyStarterMainSkillsAdapter(agent)
    expect(entries).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/skills/ai-company-starter-main.test.ts`
Expected: FAIL — `Cannot find module './ai-company-starter-main'`.

- [ ] **Step 3: Write `lib/skills/ai-company-starter-main.ts`**

```ts
import path from "node:path"
import type { Agent } from "../adapters/types"
import type { SkillAdapter } from "./types"
import { scanSkillsDir, scanCommandsDir } from "./scan-helpers"

export const aiCompanyStarterMainSkillsAdapter: SkillAdapter = async (agent: Agent) => {
  const [skills, commands] = await Promise.all([
    scanSkillsDir(agent.id, path.join(agent.rootPath, ".claude", "skills")),
    scanCommandsDir(agent.id, path.join(agent.rootPath, ".claude", "commands")),
  ])
  return [...skills, ...commands]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/skills/ai-company-starter-main.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/skills/ai-company-starter-main.ts lib/skills/ai-company-starter-main.test.ts
git commit -m "feat: add ai-company-starter-main skills+commands adapter"
```

---

### Task 5: `plh-takeshi-agent` skills adapter

**Files:**
- Create: `lib/skills/plh-takeshi-agent.ts`
- Test: `lib/skills/plh-takeshi-agent.test.ts`

**Interfaces:**
- Consumes: `Agent`; `SkillAdapter` (Task 1); `scanSkillsDir` (Task 3).
- Produces: `plhTakeshiAgentSkillsAdapter: SkillAdapter` — consumed by `lib/config.ts` (Task 7).

- [ ] **Step 1: Write the failing test `lib/skills/plh-takeshi-agent.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { plhTakeshiAgentSkillsAdapter } from "./plh-takeshi-agent"
import type { Agent } from "../adapters/types"

let root: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "plh-takeshi-skills-test-"))
  agent = { id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("plhTakeshiAgentSkillsAdapter", () => {
  it("scans the skills/ directory", async () => {
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    await writeFile(
      path.join(root, "skills", "plh-dev-team", "SKILL.md"),
      "---\nname: plh-dev-team\ndescription: Runs the dev team pipeline.\n---\n"
    )

    const entries = await plhTakeshiAgentSkillsAdapter(agent)

    expect(entries).toEqual([
      {
        id: path.join(root, "skills", "plh-dev-team", "SKILL.md"),
        agentId: "plh-takeshi-agent",
        kind: "skill",
        name: "plh-dev-team",
        description: "Runs the dev team pipeline.",
        path: path.join(root, "skills", "plh-dev-team", "SKILL.md"),
      },
    ])
  })

  it("returns an empty array when skills/ doesn't exist", async () => {
    const entries = await plhTakeshiAgentSkillsAdapter(agent)
    expect(entries).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/skills/plh-takeshi-agent.test.ts`
Expected: FAIL — `Cannot find module './plh-takeshi-agent'`.

- [ ] **Step 3: Write `lib/skills/plh-takeshi-agent.ts`**

```ts
import path from "node:path"
import type { Agent } from "../adapters/types"
import type { SkillAdapter } from "./types"
import { scanSkillsDir } from "./scan-helpers"

export const plhTakeshiAgentSkillsAdapter: SkillAdapter = async (agent: Agent) => {
  return scanSkillsDir(agent.id, path.join(agent.rootPath, "skills"))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/skills/plh-takeshi-agent.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/skills/plh-takeshi-agent.ts lib/skills/plh-takeshi-agent.test.ts
git commit -m "feat: add plh-takeshi-agent skills adapter"
```

---

### Task 6: `plh-ops` skills adapter

**Files:**
- Create: `lib/skills/plh-ops.ts`
- Test: `lib/skills/plh-ops.test.ts`

**Interfaces:**
- Consumes: `Agent`; `SkillAdapter` (Task 1); `scanSkillsDir` (Task 3).
- Produces: `plhOpsSkillsAdapter: SkillAdapter` — consumed by `lib/config.ts` (Task 7).

- [ ] **Step 1: Write the failing test `lib/skills/plh-ops.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { plhOpsSkillsAdapter } from "./plh-ops"
import type { Agent } from "../adapters/types"

let root: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "plh-ops-skills-test-"))
  agent = { id: "plh-ops", name: "PLH Ops", rootPath: root, kind: "report-log" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("plhOpsSkillsAdapter", () => {
  it("scans the workflow/ directory", async () => {
    await mkdir(path.join(root, "workflow", "daily-team-log"), { recursive: true })
    await writeFile(
      path.join(root, "workflow", "daily-team-log", "SKILL.md"),
      "---\nname: daily-team-log\ndescription: Generates the daily report.\n---\n"
    )

    const entries = await plhOpsSkillsAdapter(agent)

    expect(entries).toEqual([
      {
        id: path.join(root, "workflow", "daily-team-log", "SKILL.md"),
        agentId: "plh-ops",
        kind: "skill",
        name: "daily-team-log",
        description: "Generates the daily report.",
        path: path.join(root, "workflow", "daily-team-log", "SKILL.md"),
      },
    ])
  })

  it("returns an empty array when workflow/ doesn't exist", async () => {
    const entries = await plhOpsSkillsAdapter(agent)
    expect(entries).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/skills/plh-ops.test.ts`
Expected: FAIL — `Cannot find module './plh-ops'`.

- [ ] **Step 3: Write `lib/skills/plh-ops.ts`**

```ts
import path from "node:path"
import type { Agent } from "../adapters/types"
import type { SkillAdapter } from "./types"
import { scanSkillsDir } from "./scan-helpers"

export const plhOpsSkillsAdapter: SkillAdapter = async (agent: Agent) => {
  return scanSkillsDir(agent.id, path.join(agent.rootPath, "workflow"))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/skills/plh-ops.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/skills/plh-ops.ts lib/skills/plh-ops.test.ts
git commit -m "feat: add plh-ops skills adapter"
```

---

### Task 7: Wire `SKILL_ADAPTERS` into `lib/config.ts`

**Files:**
- Modify: `lib/config.ts`
- Modify: `lib/config.test.ts`

**Interfaces:**
- Consumes: `SkillAdapter` (Task 1); `aiCompanyStarterMainSkillsAdapter` (Task 4); `plhTakeshiAgentSkillsAdapter` (Task 5); `plhOpsSkillsAdapter` (Task 6).
- Produces: `SKILL_ADAPTERS: Record<string, SkillAdapter>` — consumed by `app/skills/page.tsx` (Task 8).

- [ ] **Step 1: Read the current `lib/config.ts` and `lib/config.test.ts` in full**

This task modifies existing v1/v2 files — read both before editing.

- [ ] **Step 2: Write the failing test addition in `lib/config.test.ts`**

Add this test inside the existing `describe("AGENTS/ADAPTERS wiring", ...)` block (alongside the two existing tests), and add the new import at the top:

```ts
import { AGENTS, ADAPTERS, SKILL_ADAPTERS } from "./config"
```

```ts
  it("registers exactly one skill adapter per configured agent", () => {
    const agentIds = AGENTS.map((a) => a.id).sort()
    const skillAdapterIds = Object.keys(SKILL_ADAPTERS).sort()
    expect(skillAdapterIds).toEqual(agentIds)
  })
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/config.test.ts`
Expected: FAIL — `SKILL_ADAPTERS` is not exported from `./config`.

- [ ] **Step 4: Modify `lib/config.ts`**

Add these imports near the top (alongside the existing adapter imports):

```ts
import type { SkillAdapter } from "./skills/types"
import { aiCompanyStarterMainSkillsAdapter } from "./skills/ai-company-starter-main"
import { plhTakeshiAgentSkillsAdapter } from "./skills/plh-takeshi-agent"
import { plhOpsSkillsAdapter } from "./skills/plh-ops"
```

Add this export after the existing `ADAPTERS` export (before `TAKESHI_AGENT_LAUNCHD_LABEL`):

```ts
export const SKILL_ADAPTERS: Record<string, SkillAdapter> = {
  "plh-takeshi-agent": plhTakeshiAgentSkillsAdapter,
  "ai-company-starter-main": aiCompanyStarterMainSkillsAdapter,
  "plh-ops": plhOpsSkillsAdapter,
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/config.ts lib/config.test.ts
git commit -m "feat: register skill adapters alongside activity adapters"
```

---

### Task 8: Skills page, browser component, and nav link

**Files:**
- Create: `app/skills/page.tsx`
- Create: `components/skill-browser.tsx`
- Modify: `components/nav.tsx`

**Interfaces:**
- Consumes: `AGENTS`, `SKILL_ADAPTERS` (Task 7); `getAllSkills`, `mergeAndSortSkills` (Task 1); `getActivityDetail` (existing, from v1, unmodified).
- Produces: `SkillBrowser` component, `/skills` route — no later task depends on these.

- [ ] **Step 1: Read the current `components/nav.tsx` in full**

- [ ] **Step 2: Write `app/skills/page.tsx`**

```tsx
import { AGENTS, SKILL_ADAPTERS } from "@/lib/config"
import { getAllSkills, mergeAndSortSkills } from "@/lib/get-all-skills"
import { SkillBrowser } from "@/components/skill-browser"

export const dynamic = "force-dynamic"

export default async function SkillsPage() {
  const results = await getAllSkills(AGENTS, SKILL_ADAPTERS)
  const entries = mergeAndSortSkills(results)

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Skills &amp; Commands</h1>
      <SkillBrowser results={results} entries={entries} />
    </main>
  )
}
```

- [ ] **Step 3: Write `components/skill-browser.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SkillEntry } from "@/lib/skills/types"
import type { SkillAgentResult } from "@/lib/get-all-skills"
import { getActivityDetail } from "@/lib/get-activity-detail"

export function SkillBrowser({
  results,
  entries,
}: {
  results: SkillAgentResult[]
  entries: SkillEntry[]
}) {
  const [selected, setSelected] = useState<SkillEntry | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  async function openEntry(entry: SkillEntry) {
    setSelected(entry)
    setDetail(null)
    setDetailError(null)
    try {
      const content = await getActivityDetail(entry.path)
      setDetail(content)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <div className="space-y-6">
        {results.map((result) => (
          <div key={result.agent.id} className="space-y-2">
            <h2 className="font-medium">{result.agent.name}</h2>
            {result.error && <p className="text-sm text-destructive">Source unavailable: {result.error}</p>}
            {!result.error && (
              <div className="grid gap-3 sm:grid-cols-2">
                {entries
                  .filter((entry) => entry.agentId === result.agent.id)
                  .map((entry) => (
                    <Card key={entry.id} className="cursor-pointer" onClick={() => openEntry(entry)}>
                      <CardHeader className="p-3">
                        <CardTitle className="flex items-center justify-between text-sm font-medium">
                          <span>{entry.name}</span>
                          <Badge variant="outline">{entry.kind}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
                        {entry.description || "No description."}
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[80vh] pr-4">
            {detailError && <p className="text-destructive">{detailError}</p>}
            {!detailError && <pre className="whitespace-pre-wrap text-sm">{detail ?? "Loading…"}</pre>}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 4: Modify `components/nav.tsx`**

Add a third link after "Activity":

```tsx
import Link from "next/link"

export function Nav() {
  return (
    <nav className="flex gap-4 border-b p-4 text-sm">
      <Link href="/" className="hover:underline">
        Agents
      </Link>
      <Link href="/activity" className="hover:underline">
        Activity
      </Link>
      <Link href="/skills" className="hover:underline">
        Skills
      </Link>
    </nav>
  )
}
```

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`
Expected: `http://localhost:3000/skills` shows three agent sections (AI Company Starter, Takeshi Email Agent, PLH Ops) with real skills/commands from `~/AI-Native/` — 4 skills + 10 commands under AI Company Starter, 1 skill under Takeshi, 8 under PLH Ops. Clicking a card of each visibly different kind (a skill and a command) opens the side panel with real file content. The nav bar now shows "Agents / Activity / Skills" and all three links work. Stop the server after confirming.

- [ ] **Step 6: Commit**

```bash
git add app/skills/page.tsx components/skill-browser.tsx components/nav.tsx
git commit -m "feat: add /skills page with per-agent skill/command browser"
```

---

### Task 9: README update and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: updated documentation — no new runtime code.

- [ ] **Step 1: Read the current `README.md` in full, then add a new section**

Add after the "v2: triggering plh-takeshi-agent" section:

```markdown
## v3: skill/command browser

`/skills` lists every skill and command across all three agents — read-only,
same as v1's status board. It's built from the same YAML frontmatter
(`name`/`description`) every skill/command file already has; nothing new to
maintain in those files. Clicking an entry reuses the same file-detail Server
Action the activity board uses (`lib/get-activity-detail.ts`), since every
skill/command lives inside an agent root that function already trusts.

Still no editing — this is a viewer, not yet an editor. Adding a 4th agent
means writing one adapter under `lib/skills/` matching the pattern of the
existing three, registering it in `SKILL_ADAPTERS` in `lib/config.ts`, same
as adding an activity adapter.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass (37 from before, plus this slice's ~23 new tests across `lib/get-all-skills.test.ts`, `lib/skills/parse-frontmatter.test.ts`, `lib/skills/scan-helpers.test.ts`, the three adapter tests, and `lib/config.test.ts`'s extra case).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors; `/skills` renders as dynamic (`ƒ`), matching `/` and `/activity`.

- [ ] **Step 4: Final manual pass against real data**

Run `npm run dev`, browse `/skills` against the real `~/AI-Native/` directories. Confirm: all three agent sections render with the expected counts (4 skills + 10 commands for `ai-company-starter-main`, 1 for `plh-takeshi-agent`, 8 for `plh-ops`), no section shows a "Source unavailable" error, and clicking through at least one entry per agent opens real, correct file content. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document the /skills browser"
```
