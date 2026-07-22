# AI-Native Control Panel v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, read-only Next.js dashboard that shows every AI-Native agent (`plh-takeshi-agent`, `ai-company-starter-main`, `plh-ops`) and its recent activity, sourced entirely from files/git state those tools already produce.

**Architecture:** One adapter per agent (a pure `(agent: Agent) => Promise<Activity[]>` function reading existing files/JSON/JSONL — never writing anything), merged and sorted by a shared utility, rendered by two Server Component pages (agent tree view, activity board) with a client-side auto-refresh and a file-content detail panel.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Vitest.

## Global Constraints

- v1 is read-only: nothing in this plan writes to `plh-takeshi-agent/`, `ai-company-starter-main/`, or `plh-ops/` — only reads.
- No database. Adapters read the filesystem/git live on each request.
- No real-time push (websockets/SSE). Refresh is interval-based polling only.
- No multi-user auth. Localhost-only, single user.
- Every adapter's errors are caught per-agent and rendered as a degraded card state — one broken source must never crash the page.
- `Activity.status` is `"unknown"` whenever an adapter can't confidently classify it — never guessed as `"done"`.
- Framework: Next.js App Router + shadcn/ui, per the approved spec.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `app/layout.tsx`
- Create: `app/globals.css`
- Create: `app/page.tsx`
- Create: `next-env.d.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a runnable Next.js dev server; `tsconfig.json` path alias `"@/*": ["./*"]`; `vitest.config.ts` wired to run `lib/**/*.test.ts` and `components/**/*.test.ts` with the same `@/*` alias; npm scripts `dev`, `build`, `start`, `test`, `lint`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "ai-native-control-panel",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0",
    "tw-animate-css": "^1.2.0",
    "lucide-react": "^0.460.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next.config.ts`**

```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {}

export default nextConfig
```

- [ ] **Step 4: Write `postcss.config.mjs`**

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}

export default config
```

- [ ] **Step 5: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
  },
})
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules/
.next/
.env*.local
next-env.d.ts
```

- [ ] **Step 7: Write `next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 8: Write `app/globals.css`**

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
}

body {
  background-color: var(--background);
  color: var(--foreground);
}
```

- [ ] **Step 9: Write `app/layout.tsx` (placeholder, extended in Task 10)**

```tsx
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "AI-Native Control Panel",
  description: "Read-only status board for AI-Native agents",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 10: Write `app/page.tsx` (placeholder, replaced in Task 8)**

```tsx
export default function Home() {
  return <main className="p-8">AI-Native Control Panel — scaffold OK</main>
}
```

- [ ] **Step 11: Install dependencies**

Run: `npm install`
Expected: installs without error, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 12: Verify the dev server boots**

Run: `npm run dev` (then stop it with Ctrl-C after confirming)
Expected: server starts on `http://localhost:3000`; loading it in a browser shows "AI-Native Control Panel — scaffold OK".

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + TypeScript + Tailwind v4 + Vitest project"
```

---

### Task 2: Shared adapter types and activity merge utility

**Files:**
- Create: `lib/adapters/types.ts`
- Create: `lib/get-all-activities.ts`
- Test: `lib/get-all-activities.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Agent`, `AgentKind`, `Activity`, `ActivityStatus`, `Adapter` (from `lib/adapters/types.ts`); `AgentResult` type, `getAllActivities(agents: Agent[], adapters: Record<string, Adapter>): Promise<AgentResult[]>`, `mergeAndSortActivities(results: AgentResult[]): Activity[]` (from `lib/get-all-activities.ts`). Every later task's adapters implement `Adapter` and every page consumes these two functions.

- [ ] **Step 1: Write `lib/adapters/types.ts`**

```ts
export type AgentKind = "pipeline" | "command-set" | "report-log"

export type Agent = {
  id: string
  name: string
  rootPath: string
  kind: AgentKind
}

export type ActivityStatus = "done" | "needs-attention" | "unknown"

export type Activity = {
  id: string
  agentId: string
  type: string
  timestamp: number
  title: string
  status: ActivityStatus
  detailPath: string
}

export type Adapter = (agent: Agent) => Promise<Activity[]>
```

- [ ] **Step 2: Write the failing test `lib/get-all-activities.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { getAllActivities, mergeAndSortActivities } from "./get-all-activities"
import type { Agent, Activity } from "./adapters/types"

const agentA: Agent = { id: "a", name: "Agent A", rootPath: "/tmp/a", kind: "pipeline" }
const agentB: Agent = { id: "b", name: "Agent B", rootPath: "/tmp/b", kind: "report-log" }

describe("getAllActivities", () => {
  it("isolates a throwing adapter from a healthy one", async () => {
    const results = await getAllActivities([agentA, agentB], {
      a: async () => {
        throw new Error("boom")
      },
      b: async () => [
        { id: "1", agentId: "b", type: "x", timestamp: 100, title: "ok", status: "done", detailPath: "/tmp/b/1" },
      ],
    })
    const a = results.find((r) => r.agent.id === "a")!
    const b = results.find((r) => r.agent.id === "b")!
    expect(a.error).toBe("boom")
    expect(a.activities).toEqual([])
    expect(b.error).toBeNull()
    expect(b.activities).toHaveLength(1)
  })

  it("reports a clear error when no adapter is registered", async () => {
    const results = await getAllActivities([agentA], {})
    expect(results[0].error).toBe('No adapter registered for agent "a"')
  })
})

describe("mergeAndSortActivities", () => {
  it("merges activities from multiple agents sorted by timestamp descending", () => {
    const results = [
      {
        agent: agentA,
        error: null,
        activities: [
          { id: "1", agentId: "a", type: "x", timestamp: 100, title: "old", status: "done", detailPath: "/tmp/1" } as Activity,
        ],
      },
      {
        agent: agentB,
        error: null,
        activities: [
          { id: "2", agentId: "b", type: "y", timestamp: 200, title: "new", status: "done", detailPath: "/tmp/2" } as Activity,
        ],
      },
    ]
    const merged = mergeAndSortActivities(results)
    expect(merged.map((a) => a.id)).toEqual(["2", "1"])
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/get-all-activities.test.ts`
Expected: FAIL — `Cannot find module './get-all-activities'`.

- [ ] **Step 4: Write `lib/get-all-activities.ts`**

```ts
import type { Agent, Activity, Adapter } from "./adapters/types"

export type AgentResult = {
  agent: Agent
  activities: Activity[]
  error: string | null
}

export async function getAllActivities(
  agents: Agent[],
  adapters: Record<string, Adapter>
): Promise<AgentResult[]> {
  return Promise.all(
    agents.map(async (agent) => {
      const adapter = adapters[agent.id]
      if (!adapter) {
        return { agent, activities: [], error: `No adapter registered for agent "${agent.id}"` }
      }
      try {
        const activities = await adapter(agent)
        return { agent, activities, error: null }
      } catch (err) {
        return {
          agent,
          activities: [],
          error: err instanceof Error ? err.message : String(err),
        }
      }
    })
  )
}

export function mergeAndSortActivities(results: AgentResult[]): Activity[] {
  return results.flatMap((r) => r.activities).sort((a, b) => b.timestamp - a.timestamp)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/get-all-activities.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/adapters/types.ts lib/get-all-activities.ts lib/get-all-activities.test.ts
git commit -m "feat: add shared Agent/Activity types and activity merge utility"
```

---

### Task 3: `plh-takeshi-agent` adapter

**Files:**
- Create: `lib/adapters/plh-takeshi-agent.ts`
- Test: `lib/adapters/plh-takeshi-agent.test.ts`

**Interfaces:**
- Consumes: `Agent`, `Activity`, `Adapter` from `lib/adapters/types.ts` (Task 2).
- Produces: `plhTakeshiAgentAdapter: Adapter` — consumed by `lib/config.ts` in Task 7.

- [ ] **Step 1: Write the failing test `lib/adapters/plh-takeshi-agent.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { plhTakeshiAgentAdapter } from "./plh-takeshi-agent"
import type { Agent } from "./types"

let root: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "plh-takeshi-agent-test-"))
  await mkdir(path.join(root, "state"), { recursive: true })
  await mkdir(path.join(root, "reports"), { recursive: true })
  agent = { id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("plhTakeshiAgentAdapter", () => {
  it("marks an email done when status is done and no attention section", async () => {
    await writeFile(
      path.join(root, "state", "processed.json"),
      JSON.stringify({ processed: { abc123: { attempts: 1, status: "done", ts: 1700000000 } } })
    )
    await writeFile(
      path.join(root, "reports", "20260101-120000-abc123.md"),
      "# All good\n\n## Needs human attention\n\nNone.\n"
    )

    const activities = await plhTakeshiAgentAdapter(agent)

    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      id: "abc123",
      status: "done",
      title: "All good",
      timestamp: 1700000000,
    })
  })

  it("marks an email needs-attention when the report flags something", async () => {
    await writeFile(
      path.join(root, "state", "processed.json"),
      JSON.stringify({ processed: { def456: { attempts: 2, status: "done", ts: 1700000100 } } })
    )
    await writeFile(
      path.join(root, "reports", "20260101-120000-def456.md"),
      "# Needs a fix\n\n## Needs human attention\n\n1. Sandbox blocked git access.\n"
    )

    const activities = await plhTakeshiAgentAdapter(agent)

    expect(activities[0].status).toBe("needs-attention")
  })

  it("marks an email needs-attention when processed status is not done, even without a report", async () => {
    await writeFile(
      path.join(root, "state", "processed.json"),
      JSON.stringify({ processed: { ghi789: { attempts: 3, status: "failed", ts: 1700000200 } } })
    )

    const activities = await plhTakeshiAgentAdapter(agent)

    expect(activities[0]).toMatchObject({ status: "needs-attention", title: "Email ghi789" })
  })

  it("picks the most recent report when multiple reports share an email id", async () => {
    await writeFile(
      path.join(root, "state", "processed.json"),
      JSON.stringify({ processed: { jkl000: { attempts: 2, status: "done", ts: 1700000300 } } })
    )
    await writeFile(
      path.join(root, "reports", "20260101-090000-jkl000.md"),
      "# First attempt\n\n## Needs human attention\n\n1. Old blocker.\n"
    )
    await writeFile(
      path.join(root, "reports", "20260101-150000-jkl000.md"),
      "# Second attempt\n\n## Needs human attention\n\nNone.\n"
    )

    const activities = await plhTakeshiAgentAdapter(agent)

    expect(activities[0]).toMatchObject({ title: "Second attempt", status: "done" })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/adapters/plh-takeshi-agent.test.ts`
Expected: FAIL — `Cannot find module './plh-takeshi-agent'`.

- [ ] **Step 3: Write `lib/adapters/plh-takeshi-agent.ts`**

```ts
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import type { Activity, Agent, Adapter } from "./types"

type ProcessedState = {
  processed: Record<string, { attempts: number; status: string; ts: number }>
}

const NEEDS_ATTENTION_HEADING = "## Needs human attention"
const REPORT_FILENAME = /^(\d{8}-\d{6})-([0-9a-f]+)\.md$/

function extractNeedsAttentionText(report: string): string {
  const idx = report.indexOf(NEEDS_ATTENTION_HEADING)
  if (idx === -1) return ""
  const afterHeading = report.slice(idx + NEEDS_ATTENTION_HEADING.length)
  const nextHeadingIdx = afterHeading.indexOf("\n## ")
  const section = nextHeadingIdx === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIdx)
  return section.trim()
}

function reportFlagsAttention(report: string): boolean {
  const text = extractNeedsAttentionText(report)
  if (text === "") return false
  return !/^none\.?$/i.test(text)
}

export const plhTakeshiAgentAdapter: Adapter = async (agent: Agent): Promise<Activity[]> => {
  const statePath = path.join(agent.rootPath, "state", "processed.json")
  const reportsDir = path.join(agent.rootPath, "reports")

  const stateRaw = await readFile(statePath, "utf-8")
  const state = JSON.parse(stateRaw) as ProcessedState

  let reportFiles: string[] = []
  try {
    reportFiles = await readdir(reportsDir)
  } catch {
    reportFiles = []
  }

  const reportByEmailId = new Map<string, { file: string; ts: string }>()
  for (const file of reportFiles) {
    const match = REPORT_FILENAME.exec(file)
    if (!match) continue
    const [, ts, emailId] = match
    const existing = reportByEmailId.get(emailId)
    if (!existing || ts > existing.ts) {
      reportByEmailId.set(emailId, { file, ts })
    }
  }

  const activities: Activity[] = []
  for (const [emailId, entry] of Object.entries(state.processed)) {
    const report = reportByEmailId.get(emailId)
    let flagsAttention = false
    let detailPath = statePath
    let title = `Email ${emailId}`

    if (report) {
      detailPath = path.join(reportsDir, report.file)
      const content = await readFile(detailPath, "utf-8")
      flagsAttention = reportFlagsAttention(content)
      const firstLine = content.split("\n").find((line) => line.startsWith("# "))
      if (firstLine) title = firstLine.replace(/^# /, "").trim()
    }

    const status = entry.status === "done" && !flagsAttention ? "done" : "needs-attention"

    activities.push({
      id: emailId,
      agentId: agent.id,
      type: "email-processed",
      timestamp: entry.ts,
      title,
      status,
      detailPath,
    })
  }

  return activities
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/adapters/plh-takeshi-agent.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/adapters/plh-takeshi-agent.ts lib/adapters/plh-takeshi-agent.test.ts
git commit -m "feat: add plh-takeshi-agent status adapter"
```

---

### Task 4: `ai-company-starter-main` adapter

**Files:**
- Create: `lib/adapters/ai-company-starter-main.ts`
- Test: `lib/adapters/ai-company-starter-main.test.ts`

**Interfaces:**
- Consumes: `Agent`, `Activity`, `Adapter` from `lib/adapters/types.ts` (Task 2).
- Produces: `aiCompanyStarterMainAdapter: Adapter` — consumed by `lib/config.ts` in Task 7.

**Note:** `state/cycles/` ships empty by default per that project's own `state/README.md` ("advanced, optional — teams that don't run cycle scripts leave it empty"), so this adapter must tolerate a missing `state/cycles/` directory entirely, not just malformed content within it.

- [ ] **Step 1: Write the failing test `lib/adapters/ai-company-starter-main.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { aiCompanyStarterMainAdapter } from "./ai-company-starter-main"
import type { Agent } from "./types"

let root: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ai-company-test-"))
  agent = { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("aiCompanyStarterMainAdapter", () => {
  it("reads decisions, handoffs, and retros as done activities, skipping README.md", async () => {
    await mkdir(path.join(root, "docs", "decisions"), { recursive: true })
    await mkdir(path.join(root, "docs", "handoffs"), { recursive: true })
    await mkdir(path.join(root, "docs", "retros", "ec-team"), { recursive: true })

    await writeFile(path.join(root, "docs", "decisions", "README.md"), "# Decisions index\n")
    await writeFile(path.join(root, "docs", "decisions", "2026-07-03-boundary.md"), "# Advanced/optional boundary\n")
    await writeFile(path.join(root, "docs", "handoffs", "2026-07.md"), "# July handoff digest\n")
    await writeFile(path.join(root, "docs", "retros", "ec-team", "2026-07-01.md"), "# EC team retro\n")

    const activities = await aiCompanyStarterMainAdapter(agent)

    expect(activities).toHaveLength(3)
    expect(activities.every((a) => a.status === "done")).toBe(true)
    expect(activities.map((a) => a.title).sort()).toEqual([
      "Advanced/optional boundary",
      "EC team retro",
      "July handoff digest",
    ])
    expect(activities.map((a) => a.type).sort()).toEqual(["decision", "handoff", "retro"])
  })

  it("returns no activities when docs directories don't exist", async () => {
    const activities = await aiCompanyStarterMainAdapter(agent)
    expect(activities).toEqual([])
  })

  it("parses well-formed cycle.jsonl lines and skips malformed ones", async () => {
    const cycleDir = path.join(root, "state", "cycles", "ec-team", "2026-07-01")
    await mkdir(cycleDir, { recursive: true })
    await writeFile(
      path.join(cycleDir, "cycle.jsonl"),
      [
        JSON.stringify({ ts: 1700000000, event: "cycle-started" }),
        "not json",
        JSON.stringify({ event: "missing-timestamp" }),
        JSON.stringify({ ts: 1700003600, type: "cycle-closed" }),
      ].join("\n")
    )

    const activities = await aiCompanyStarterMainAdapter(agent)

    expect(activities).toHaveLength(2)
    expect(activities.map((a) => a.title).sort()).toEqual(["cycle-closed", "cycle-started"])
    expect(activities.every((a) => a.type === "cycle-event")).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/adapters/ai-company-starter-main.test.ts`
Expected: FAIL — `Cannot find module './ai-company-starter-main'`.

- [ ] **Step 3: Write `lib/adapters/ai-company-starter-main.ts`**

```ts
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import type { Activity, Agent, Adapter } from "./types"

async function listMarkdownFilesRecursive(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFilesRecursive(full)))
    } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
      files.push(full)
    }
  }
  return files
}

async function fileToActivity(agentId: string, type: string, filePath: string): Promise<Activity> {
  const [content, stats] = await Promise.all([readFile(filePath, "utf-8"), stat(filePath)])
  const firstLine = content.split("\n").find((line) => line.startsWith("# "))
  const title = firstLine ? firstLine.replace(/^# /, "").trim() : path.basename(filePath)
  return {
    id: filePath,
    agentId,
    type,
    timestamp: Math.floor(stats.mtimeMs / 1000),
    title,
    status: "done",
    detailPath: filePath,
  }
}

function parseCycleLine(line: string): { timestamp: number; title: string } | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return null
  }
  const ts = typeof obj.ts === "number" ? obj.ts : typeof obj.timestamp === "number" ? obj.timestamp : null
  if (ts === null) return null
  const title =
    typeof obj.event === "string" ? obj.event : typeof obj.type === "string" ? obj.type : "cycle event"
  return { timestamp: ts, title }
}

async function cycleActivities(agentId: string, rootPath: string): Promise<Activity[]> {
  const cyclesDir = path.join(rootPath, "state", "cycles")
  let teamDirs: string[]
  try {
    teamDirs = await readdir(cyclesDir)
  } catch {
    return []
  }
  const activities: Activity[] = []
  for (const team of teamDirs) {
    const teamPath = path.join(cyclesDir, team)
    let dateDirs: string[]
    try {
      dateDirs = await readdir(teamPath)
    } catch {
      continue
    }
    for (const date of dateDirs) {
      const filePath = path.join(teamPath, date, "cycle.jsonl")
      let content: string
      try {
        content = await readFile(filePath, "utf-8")
      } catch {
        continue
      }
      content.split("\n").forEach((line, i) => {
        const parsed = parseCycleLine(line)
        if (!parsed) return
        activities.push({
          id: `${filePath}:${i}`,
          agentId,
          type: "cycle-event",
          timestamp: parsed.timestamp,
          title: parsed.title,
          status: "done",
          detailPath: filePath,
        })
      })
    }
  }
  return activities
}

export const aiCompanyStarterMainAdapter: Adapter = async (agent: Agent): Promise<Activity[]> => {
  const [decisionFiles, handoffFiles, retroFiles] = await Promise.all([
    listMarkdownFilesRecursive(path.join(agent.rootPath, "docs", "decisions")),
    listMarkdownFilesRecursive(path.join(agent.rootPath, "docs", "handoffs")),
    listMarkdownFilesRecursive(path.join(agent.rootPath, "docs", "retros")),
  ])

  const fileActivities = await Promise.all([
    ...decisionFiles.map((f) => fileToActivity(agent.id, "decision", f)),
    ...handoffFiles.map((f) => fileToActivity(agent.id, "handoff", f)),
    ...retroFiles.map((f) => fileToActivity(agent.id, "retro", f)),
  ])

  const cycleEvents = await cycleActivities(agent.id, agent.rootPath)

  return [...fileActivities, ...cycleEvents]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/adapters/ai-company-starter-main.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/adapters/ai-company-starter-main.ts lib/adapters/ai-company-starter-main.test.ts
git commit -m "feat: add ai-company-starter-main activity adapter"
```

---

### Task 5: `plh-ops` adapter

**Files:**
- Create: `lib/adapters/plh-ops.ts`
- Test: `lib/adapters/plh-ops.test.ts`

**Interfaces:**
- Consumes: `Agent`, `Activity`, `Adapter` from `lib/adapters/types.ts` (Task 2).
- Produces: `plhOpsAdapter: Adapter` — consumed by `lib/config.ts` in Task 7.

**Deviation from spec (documented, not silent):** the spec mentioned cross-referencing `git log` for commit timestamps. The report filename (`YYYY-MM-DD.md`) is already an authoritative date, so this adapter skips the git-log cross-reference as unnecessary complexity — YAGNI. If a future need arises (e.g. same-day multiple edits), add it then.

- [ ] **Step 1: Write the failing test `lib/adapters/plh-ops.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { plhOpsAdapter } from "./plh-ops"
import type { Agent } from "./types"

let root: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "plh-ops-test-"))
  agent = { id: "plh-ops", name: "PLH Ops", rootPath: root, kind: "report-log" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("plhOpsAdapter", () => {
  it("reads one activity per daily report file, deriving the timestamp from the filename", async () => {
    await mkdir(path.join(root, "reports", "Nana"), { recursive: true })
    await writeFile(path.join(root, "reports", "Nana", "2026-07-08.md"), "# Shipped the AI-Native reorg\n")

    const activities = await plhOpsAdapter(agent)

    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      id: "Nana/2026-07-08",
      type: "daily-report",
      status: "done",
      title: "Nana: Shipped the AI-Native reorg",
      timestamp: Math.floor(new Date("2026-07-08T00:00:00Z").getTime() / 1000),
    })
  })

  it("ignores files that don't match the YYYY-MM-DD.md pattern", async () => {
    await mkdir(path.join(root, "reports", "Nana"), { recursive: true })
    await writeFile(path.join(root, "reports", "Nana", "README.md"), "# Notes\n")

    const activities = await plhOpsAdapter(agent)

    expect(activities).toEqual([])
  })

  it("returns no activities when the reports directory doesn't exist", async () => {
    const activities = await plhOpsAdapter(agent)
    expect(activities).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/adapters/plh-ops.test.ts`
Expected: FAIL — `Cannot find module './plh-ops'`.

- [ ] **Step 3: Write `lib/adapters/plh-ops.ts`**

```ts
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { Activity, Agent, Adapter } from "./types"

const REPORT_FILENAME = /^(\d{4}-\d{2}-\d{2})\.md$/

export const plhOpsAdapter: Adapter = async (agent: Agent): Promise<Activity[]> => {
  const reportsDir = path.join(agent.rootPath, "reports")
  let people: string[]
  try {
    people = await readdir(reportsDir)
  } catch {
    return []
  }

  const activities: Activity[] = []
  for (const person of people) {
    const personDir = path.join(reportsDir, person)
    let files: string[]
    try {
      files = await readdir(personDir)
    } catch {
      continue
    }
    for (const file of files) {
      const match = REPORT_FILENAME.exec(file)
      if (!match) continue
      const [, dateStr] = match
      const filePath = path.join(personDir, file)
      const content = await readFile(filePath, "utf-8")
      const firstLine = content.split("\n").find((line) => line.trim().length > 0)
      const title = firstLine ? firstLine.replace(/^#+\s*/, "").trim() : `${person} — ${dateStr}`

      activities.push({
        id: `${person}/${dateStr}`,
        agentId: agent.id,
        type: "daily-report",
        timestamp: Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000),
        title: `${person}: ${title}`,
        status: "done",
        detailPath: filePath,
      })
    }
  }

  return activities
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/adapters/plh-ops.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/adapters/plh-ops.ts lib/adapters/plh-ops.test.ts
git commit -m "feat: add plh-ops daily-report adapter"
```

---

### Task 6: launchd health check for `plh-takeshi-agent`

**Files:**
- Create: `lib/adapters/launchd.ts`
- Test: `lib/adapters/launchd.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks (standalone).
- Produces: `LaunchdHealth` type `{ loaded: boolean; lastExitStatus: number | null }`, `ExecFn` type `(label: string) => Promise<string>`, `checkLaunchdJob(label: string, exec?: ExecFn): Promise<LaunchdHealth>` — consumed by `app/page.tsx` in Task 8.

- [ ] **Step 1: Write the failing test `lib/adapters/launchd.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { checkLaunchdJob } from "./launchd"

describe("checkLaunchdJob", () => {
  it("reports loaded with the parsed exit status", async () => {
    const fakeExec = async () => `{\n\t"LastExitStatus" = 0;\n\t"Label" = "com.plh.takeshi-agent";\n}`
    const health = await checkLaunchdJob("com.plh.takeshi-agent", fakeExec)
    expect(health).toEqual({ loaded: true, lastExitStatus: 0 })
  })

  it("reports not loaded when the exec call throws", async () => {
    const fakeExec = async () => {
      throw new Error("Could not find service")
    }
    const health = await checkLaunchdJob("com.missing-job", fakeExec)
    expect(health).toEqual({ loaded: false, lastExitStatus: null })
  })

  it("reports loaded with null exit status if the output doesn't match", async () => {
    const fakeExec = async () => "unexpected output"
    const health = await checkLaunchdJob("com.plh.takeshi-agent", fakeExec)
    expect(health).toEqual({ loaded: true, lastExitStatus: null })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/adapters/launchd.test.ts`
Expected: FAIL — `Cannot find module './launchd'`.

- [ ] **Step 3: Write `lib/adapters/launchd.ts`**

```ts
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type LaunchdHealth = {
  loaded: boolean
  lastExitStatus: number | null
}

export type ExecFn = (label: string) => Promise<string>

export async function defaultExec(label: string): Promise<string> {
  const { stdout } = await execFileAsync("launchctl", ["list", label])
  return stdout
}

export async function checkLaunchdJob(label: string, exec: ExecFn = defaultExec): Promise<LaunchdHealth> {
  let output: string
  try {
    output = await exec(label)
  } catch {
    return { loaded: false, lastExitStatus: null }
  }
  const match = /"LastExitStatus"\s*=\s*(-?\d+);/.exec(output)
  return {
    loaded: true,
    lastExitStatus: match ? Number(match[1]) : null,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/adapters/launchd.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/adapters/launchd.ts lib/adapters/launchd.test.ts
git commit -m "feat: add launchd job health check"
```

---

### Task 7: Agent registry (`agents.config.ts` equivalent) wired to real paths

**Files:**
- Create: `lib/config.ts`
- Test: `lib/config.test.ts`

**Interfaces:**
- Consumes: `Agent`, `Adapter` (Task 2); `plhTakeshiAgentAdapter` (Task 3); `aiCompanyStarterMainAdapter` (Task 4); `plhOpsAdapter` (Task 5).
- Produces: `AGENTS: Agent[]`, `ADAPTERS: Record<string, Adapter>`, `TAKESHI_AGENT_LAUNCHD_LABEL: string` — consumed by both pages in Tasks 8 and 9, and by `lib/get-activity-detail.ts` in Task 9.

- [ ] **Step 1: Write the failing test `lib/config.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { AGENTS, ADAPTERS } from "./config"

describe("AGENTS/ADAPTERS wiring", () => {
  it("registers exactly one adapter per configured agent", () => {
    const agentIds = AGENTS.map((a) => a.id).sort()
    const adapterIds = Object.keys(ADAPTERS).sort()
    expect(adapterIds).toEqual(agentIds)
  })

  it("gives every agent a unique id", () => {
    const ids = AGENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/config.test.ts`
Expected: FAIL — `Cannot find module './config'`.

- [ ] **Step 3: Write `lib/config.ts`**

```ts
import path from "node:path"
import os from "node:os"
import type { Agent, Adapter } from "./adapters/types"
import { plhTakeshiAgentAdapter } from "./adapters/plh-takeshi-agent"
import { aiCompanyStarterMainAdapter } from "./adapters/ai-company-starter-main"
import { plhOpsAdapter } from "./adapters/plh-ops"

const AI_NATIVE_ROOT = path.join(os.homedir(), "AI-Native")

export const AGENTS: Agent[] = [
  {
    id: "plh-takeshi-agent",
    name: "Takeshi Email Agent",
    rootPath: path.join(AI_NATIVE_ROOT, "plh-takeshi-agent"),
    kind: "pipeline",
  },
  {
    id: "ai-company-starter-main",
    name: "AI Company Starter",
    rootPath: path.join(AI_NATIVE_ROOT, "ai-company-starter-main"),
    kind: "command-set",
  },
  {
    id: "plh-ops",
    name: "PLH Ops",
    rootPath: path.join(AI_NATIVE_ROOT, "plh-ops"),
    kind: "report-log",
  },
]

export const ADAPTERS: Record<string, Adapter> = {
  "plh-takeshi-agent": plhTakeshiAgentAdapter,
  "ai-company-starter-main": aiCompanyStarterMainAdapter,
  "plh-ops": plhOpsAdapter,
}

export const TAKESHI_AGENT_LAUNCHD_LABEL = "com.plh.takeshi-agent"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts lib/config.test.ts
git commit -m "feat: register AI-Native agents and their adapters"
```

---

### Task 8: shadcn/ui setup and the agent tree view page

**Files:**
- Create: `components.json`
- Create: `lib/utils.ts` (generated by shadcn CLI)
- Create: `components/ui/card.tsx`, `components/ui/badge.tsx` (generated by shadcn CLI)
- Create: `components/agent-card.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `AGENTS`, `ADAPTERS`, `TAKESHI_AGENT_LAUNCHD_LABEL` (Task 7); `getAllActivities`, `mergeAndSortActivities` (Task 2); `checkLaunchdJob` (Task 6).
- Produces: `AgentCard` component (`components/agent-card.tsx`) — reused as a pattern reference by `activity-board.tsx` in Task 9 (not imported, just stylistically consistent).

- [ ] **Step 1: Write `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

- [ ] **Step 2: Generate shadcn/ui primitives**

Run: `npx shadcn@latest add card badge separator scroll-area sheet button -y`
Expected: creates `lib/utils.ts` and `components/ui/{card,badge,separator,scroll-area,sheet,button}.tsx`. If the CLI reports a config mismatch, run `npx shadcn@latest init -d -y` first to reconcile `components.json`/`app/globals.css`, then re-run the `add` command above.

- [ ] **Step 3: Write `components/agent-card.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Agent, Activity } from "@/lib/adapters/types"
import type { LaunchdHealth } from "@/lib/adapters/launchd"

type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  launchdHealth?: LaunchdHealth
}

export function AgentCard({ agent, latestActivity, error, launchdHealth }: AgentCardProps) {
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
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Replace `app/page.tsx`**

```tsx
import { AGENTS, ADAPTERS, TAKESHI_AGENT_LAUNCHD_LABEL } from "@/lib/config"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { checkLaunchdJob } from "@/lib/adapters/launchd"
import { AgentCard } from "@/components/agent-card"

export default async function AgentTreePage() {
  const [results, launchdHealth] = await Promise.all([
    getAllActivities(AGENTS, ADAPTERS),
    checkLaunchdJob(TAKESHI_AGENT_LAUNCHD_LABEL),
  ])

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">AI-Native Agents</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {results.map((result) => {
          const latest = mergeAndSortActivities([result])[0] ?? null
          return (
            <AgentCard
              key={result.agent.id}
              agent={result.agent}
              latestActivity={latest}
              error={result.error}
              launchdHealth={result.agent.id === "plh-takeshi-agent" ? launchdHealth : undefined}
            />
          )
        })}
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`
Expected: `http://localhost:3000` shows three cards (Takeshi Email Agent, AI Company Starter, PLH Ops) each with real latest-activity data pulled from `~/AI-Native/`, and the Takeshi card shows a launchd line. Stop the server with Ctrl-C when confirmed.

- [ ] **Step 6: Commit**

```bash
git add components.json components/ui components/agent-card.tsx app/page.tsx lib/utils.ts package.json package-lock.json
git commit -m "feat: add agent tree view page with shadcn/ui"
```

---

### Task 9: Activity board page with detail panel

**Files:**
- Create: `lib/get-activity-detail.ts`
- Test: `lib/get-activity-detail.test.ts`
- Create: `components/activity-board.tsx`
- Create: `app/activity/page.tsx`

**Interfaces:**
- Consumes: `Activity`, `ActivityStatus` (Task 2); `AGENTS`, `ADAPTERS` (Task 7); `getAllActivities`, `mergeAndSortActivities` (Task 2).
- Produces: `getActivityDetail(detailPath: string): Promise<string>`, `ActivityBoard` component.

- [ ] **Step 1: Write the failing test `lib/get-activity-detail.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "detail-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

describe("getActivityDetail", () => {
  it("reads a file inside a configured agent root", async () => {
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { getActivityDetail } = await import("./get-activity-detail")
    const filePath = path.join(root, "report.md")
    await writeFile(filePath, "hello")

    const content = await getActivityDetail(filePath)
    expect(content).toBe("hello")
  })

  it("refuses to read a path outside any configured agent root", async () => {
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { getActivityDetail } = await import("./get-activity-detail")
    const outsidePath = path.join(tmpdir(), "outside.md")

    await expect(getActivityDetail(outsidePath)).rejects.toThrow(
      "Refusing to read a path outside configured agent directories"
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/get-activity-detail.test.ts`
Expected: FAIL — `Cannot find module './get-activity-detail'`.

- [ ] **Step 3: Write `lib/get-activity-detail.ts`**

```ts
"use server"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { AGENTS } from "./config"

export async function getActivityDetail(detailPath: string): Promise<string> {
  const resolved = path.resolve(detailPath)
  const isWithinAnAgentRoot = AGENTS.some((agent) => {
    const root = path.resolve(agent.rootPath)
    return resolved === root || resolved.startsWith(root + path.sep)
  })
  if (!isWithinAnAgentRoot) {
    throw new Error("Refusing to read a path outside configured agent directories")
  }
  return readFile(resolved, "utf-8")
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/get-activity-detail.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `components/activity-board.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Activity, ActivityStatus } from "@/lib/adapters/types"
import { getActivityDetail } from "@/lib/get-activity-detail"

const COLUMNS: { status: ActivityStatus; label: string }[] = [
  { status: "needs-attention", label: "Needs Attention" },
  { status: "done", label: "Done" },
  { status: "unknown", label: "Unknown" },
]

export function ActivityBoard({ activities }: { activities: Activity[] }) {
  const [selected, setSelected] = useState<Activity | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  async function openActivity(activity: Activity) {
    setSelected(activity)
    setDetail(null)
    setDetailError(null)
    try {
      const content = await getActivityDetail(activity.detailPath)
      setDetail(content)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {COLUMNS.map((column) => (
          <div key={column.status} className="space-y-2">
            <h2 className="font-medium">{column.label}</h2>
            {activities
              .filter((a) => a.status === column.status)
              .map((activity) => (
                <Card key={activity.id} className="cursor-pointer" onClick={() => openActivity(activity)}>
                  <CardHeader className="p-3">
                    <CardTitle className="text-sm font-medium">{activity.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
                    {new Date(activity.timestamp * 1000).toLocaleString()}
                  </CardContent>
                </Card>
              ))}
          </div>
        ))}
      </div>
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected?.title}</SheetTitle>
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

- [ ] **Step 6: Write `app/activity/page.tsx`**

```tsx
import { AGENTS, ADAPTERS } from "@/lib/config"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { ActivityBoard } from "@/components/activity-board"

export default async function ActivityPage() {
  const results = await getAllActivities(AGENTS, ADAPTERS)
  const activities = mergeAndSortActivities(results)

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Activity</h1>
      <ActivityBoard activities={activities} />
    </main>
  )
}
```

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`
Expected: `http://localhost:3000/activity` shows three columns populated with real activities from `~/AI-Native/`; clicking a card opens a side panel showing that file's content. Stop the server with Ctrl-C when confirmed.

- [ ] **Step 8: Commit**

```bash
git add lib/get-activity-detail.ts lib/get-activity-detail.test.ts components/activity-board.tsx app/activity/page.tsx
git commit -m "feat: add activity board page with file-content detail panel"
```

---

### Task 10: Auto-refresh and navigation

**Files:**
- Create: `components/auto-refresh.tsx`
- Create: `components/nav.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AutoRefresh` component, `Nav` component, wired into the root layout so both pages get them for free.

- [ ] **Step 1: Write `components/auto-refresh.tsx`**

```tsx
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const REFRESH_INTERVAL_MS = 15_000

export function AutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [router])

  return null
}
```

- [ ] **Step 2: Write `components/nav.tsx`**

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
    </nav>
  )
}
```

- [ ] **Step 3: Update `app/layout.tsx`**

```tsx
import type { Metadata } from "next"
import "./globals.css"
import { AutoRefresh } from "@/components/auto-refresh"
import { Nav } from "@/components/nav"

export const metadata: Metadata = {
  title: "AI-Native Control Panel",
  description: "Read-only status board for AI-Native agents",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AutoRefresh />
        <Nav />
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`
Expected: nav bar with "Agents"/"Activity" links works both directions; leaving `http://localhost:3000` open with devtools Network tab visible shows a new document/RSC request roughly every 15 seconds without manual reload. Stop the server with Ctrl-C when confirmed.

- [ ] **Step 5: Commit**

```bash
git add components/auto-refresh.tsx components/nav.tsx app/layout.tsx
git commit -m "feat: add auto-refresh and navigation between agent/activity views"
```

---

### Task 11: README and final end-to-end verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: documentation for running the app and extending it with a new agent — no new runtime code.

- [ ] **Step 1: Write `README.md`**

```markdown
# AI-Native Control Panel

Read-only local dashboard for the agents/tools in `~/AI-Native/`
(`plh-takeshi-agent`, `ai-company-starter-main`, `plh-ops`). Shows each
agent's most recent activity and a merged activity board, built entirely
from files/state those tools already produce — nothing here writes to any
of them.

## Run it

    npm install
    npm run dev

Open http://localhost:3000 for the agent tree view, or
http://localhost:3000/activity for the merged activity board.

## Test it

    npm test

## Add a new agent

1. Add an entry to `AGENTS` in `lib/config.ts` with a unique `id` and its
   `rootPath`.
2. Write an adapter in `lib/adapters/<id>.ts` implementing the `Adapter`
   type from `lib/adapters/types.ts` — a pure, read-only
   `(agent) => Promise<Activity[]>` function. Follow the existing adapters
   as examples of the error-handling pattern (never throw past your own
   boundary; return `[]` or skip on missing files).
3. Register it in `ADAPTERS` in `lib/config.ts` under the same `id`.
4. Add adapter tests under `lib/adapters/<id>.test.ts` using a temp
   directory (see `lib/adapters/plh-ops.test.ts` for the pattern).

`lib/config.test.ts` will fail if `AGENTS` and `ADAPTERS` ever drift out of
sync, so a missing adapter registration is caught immediately.

## Known v1 limitations

- Read-only: no way to trigger/assign agent runs from this UI yet.
- No skill-editing/versioning UI yet.
- `ai-company-starter-main`'s `state/cycles/*/*/cycle.jsonl` parsing is
  best-effort/lenient, since that directory ships empty by default and its
  exact schema wasn't verified against real data.
- `plh-ops` activity timestamps come from the report filename, not git log
  (see the adapter's inline note for why).

See `docs/superpowers/specs/2026-07-22-control-panel-design.md` for the
full v1 design and `docs/superpowers/plans/2026-07-22-control-panel-v1.md`
for the implementation plan this was built from.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all adapter/utility tests pass (Tasks 2–7 and 9's tests).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 4: Final manual pass against real data**

Run: `npm run dev`, browse both `/` and `/activity` against the real
`~/AI-Native/` directories (not test fixtures). Confirm: all three agent
cards render without crashing (any one being unavailable shows a degraded
card, not a broken page), the activity board's three columns are populated,
and clicking through several activities of different types (email report,
decision, daily report) opens correct file content in the side panel. Stop
the server with Ctrl-C when confirmed.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add control panel README and usage/extension guide"
```
