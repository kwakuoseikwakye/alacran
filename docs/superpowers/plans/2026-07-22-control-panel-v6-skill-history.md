# AI-Native Control Panel v6 Slice: Skill History/Diff Viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "History" view in `/skills`' detail Sheet showing every commit that touched a skill file, with a per-commit diff reusing v4's `DiffView` — closing the gap v4 explicitly deferred ("every edit is already a git commit, just not yet visible in the dashboard").

**Architecture:** Extract the "resolve path + confirm current `getAllSkills()` member" check (currently inline in v4's `save-skill-content-impl.ts`) into a shared `lib/resolve-known-skill.ts`, refactor that file to use it (regression-proven via its unchanged existing test), then build two new read-only git wrappers (`git log`, `git show <sha>:<path>`) on top of the same shared check.

**Tech Stack:** Same as v1-v5 — Next.js 15 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, Vitest.

## Global Constraints

- `lib/save-skill-content-impl.test.ts`'s existing behavior (all 5 cases, exact messages) must be unchanged after the refactor — run it UNCHANGED to prove this, same discipline as v4 Task 1's `get-activity-detail.test.ts` regression check.
- `getSkillHistoryImpl`/`getSkillRevisionImpl` reuse `ExecFileFn` from `lib/git-commit-file.ts` — no third duplicate definition of that type.
- Git log parsing uses non-printable delimiters (`\x1f` field separator, `\x1e` record separator), not `|`/tabs, since commit messages aren't fully within this app's control long-term.
- No revert/write action anywhere in this slice — every new function here only reads (`git log`, `git show`).
- Every function degrades to a safe `{ok: false, ...}`-shaped result rather than throwing past its own boundary.

---

### Task 1: Extract `resolveKnownSkillPath`; refactor `save-skill-content-impl.ts` to use it

**Files:**
- Create: `lib/resolve-known-skill.ts`
- Create: `lib/resolve-known-skill.test.ts`
- Modify: `lib/save-skill-content-impl.ts`

**Interfaces:**
- Consumes: `resolveWithinAgentRoot` from `lib/path-guard.ts` (existing); `AGENTS`, `SKILL_ADAPTERS` from `lib/config.ts` (existing); `getAllSkills` from `lib/get-all-skills.ts` (existing).
- Produces: `ResolveKnownSkillResult` type, `resolveKnownSkillPath(filePath: string): Promise<ResolveKnownSkillResult>` — consumed by the refactored `save-skill-content-impl.ts` (this task) and by `lib/skill-history-impl.ts` (Task 2).

- [ ] **Step 1: Read the current `lib/save-skill-content-impl.ts` and `lib/save-skill-content-impl.test.ts` in full**

This task refactors an existing, already-shipped file — read both before editing.

- [ ] **Step 2: Write the failing test `lib/resolve-known-skill.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, mkdir, rm, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "resolve-known-skill-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

async function mockAgents() {
  vi.doMock("./config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./config")>()
    return {
      ...actual,
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
    }
  })
}

describe("resolveKnownSkillPath", () => {
  it("resolves a known skill file", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "---\nname: plh-dev-team\ndescription: x\n---\n")

    const { resolveKnownSkillPath } = await import("./resolve-known-skill")
    const result = await resolveKnownSkillPath(skillFile)

    expect(result).toEqual({
      ok: true,
      realPath: await realpath(skillFile),
      agentRootPath: await realpath(root),
    })
  })

  it("reports outside-root for a path outside any configured agent root", async () => {
    await mockAgents()
    const { resolveKnownSkillPath } = await import("./resolve-known-skill")
    const result = await resolveKnownSkillPath(path.join(tmpdir(), "outside.md"))

    expect(result).toEqual({ ok: false, reason: "outside-root" })
  })

  it("reports not-a-known-skill for a path inside an agent root that isn't a scanned entry", async () => {
    await mockAgents()
    await mkdir(path.join(root, "bin"), { recursive: true })
    const notASkill = path.join(root, "bin", "poll.sh")
    await writeFile(notASkill, "#!/bin/bash\n")

    const { resolveKnownSkillPath } = await import("./resolve-known-skill")
    const result = await resolveKnownSkillPath(notASkill)

    expect(result).toEqual({ ok: false, reason: "not-a-known-skill" })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/resolve-known-skill.test.ts`
Expected: FAIL — `Cannot find module './resolve-known-skill'`.

- [ ] **Step 4: Write `lib/resolve-known-skill.ts`**

```ts
import { realpath } from "node:fs/promises"
import { resolveWithinAgentRoot } from "./path-guard"
import { AGENTS, SKILL_ADAPTERS } from "./config"
import { getAllSkills } from "./get-all-skills"

export type ResolveKnownSkillResult =
  | { ok: true; realPath: string; agentRootPath: string }
  | { ok: false; reason: "outside-root" | "not-a-known-skill" }

export async function resolveKnownSkillPath(filePath: string): Promise<ResolveKnownSkillResult> {
  const guard = await resolveWithinAgentRoot(filePath)
  if (!guard) {
    return { ok: false, reason: "outside-root" }
  }

  const results = await getAllSkills(AGENTS, SKILL_ADAPTERS)
  const allEntryPaths = results.flatMap((r) => r.entries.map((entry) => entry.path))
  // Entry paths come from scanning the (unresolved) configured agent root, while
  // guard.realPath has been through realpath() (see path-guard.ts). On macOS,
  // os.tmpdir()-based roots traverse the /var -> /private/var symlink, so the two
  // must be compared after both are realpath()-resolved, not by raw string equality.
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/resolve-known-skill.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Refactor `lib/save-skill-content-impl.ts` to delegate to `resolveKnownSkillPath`**

Replace its entire contents with:

```ts
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { resolveKnownSkillPath } from "./resolve-known-skill"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"

export async function saveSkillContentImpl(
  filePath: string,
  newContent: string,
  execFn?: ExecFileFn
): Promise<{ saved: boolean; message: string }> {
  const resolved = await resolveKnownSkillPath(filePath)
  if (!resolved.ok) {
    return {
      saved: false,
      message:
        resolved.reason === "outside-root"
          ? "Refusing to write a path outside configured agent directories"
          : "Refusing to write a path that is not a known skill/command file",
    }
  }

  let currentContent: string
  try {
    currentContent = await readFile(resolved.realPath, "utf-8")
  } catch (err) {
    return { saved: false, message: err instanceof Error ? err.message : String(err) }
  }

  if (currentContent === newContent) {
    return { saved: false, message: "No changes to save" }
  }

  try {
    await writeFile(resolved.realPath, newContent, "utf-8")
    const relativePath = path.relative(resolved.agentRootPath, resolved.realPath)
    const fileName = path.basename(resolved.realPath)
    await commitFile(resolved.agentRootPath, relativePath, `Edit ${fileName} via AI-Native control panel`, execFn)
    return { saved: true, message: "Saved and committed" }
  } catch (err) {
    return { saved: false, message: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 7: Run the EXISTING `lib/save-skill-content-impl.test.ts` unchanged to confirm no regression**

Run: `npx vitest run lib/save-skill-content-impl.test.ts`
Expected: PASS (5 tests) — same file, same assertions, no modifications needed. This proves the refactor preserved behavior exactly.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests pass (75 from before, plus this task's 3 new = 78).

- [ ] **Step 9: Commit**

```bash
git add lib/resolve-known-skill.ts lib/resolve-known-skill.test.ts lib/save-skill-content-impl.ts
git commit -m "refactor: extract resolveKnownSkillPath shared check from save-skill-content-impl"
```

---

### Task 2: `skill-history-impl.ts` and the `skill-history.ts` Server Actions

**Files:**
- Create: `lib/skill-history-impl.ts`
- Create: `lib/skill-history-impl.test.ts`
- Create: `lib/skill-history.ts`

**Interfaces:**
- Consumes: `resolveKnownSkillPath` (Task 1); `ExecFileFn` from `lib/git-commit-file.ts` (existing, reused not redefined).
- Produces: `SkillCommit` type `{sha, date, message}`, `SkillHistoryResult` type, `SkillRevisionResult` type, `getSkillHistoryImpl(filePath, execFn?)`, `getSkillRevisionImpl(filePath, sha, execFn?)`; `getSkillHistory(filePath)`, `getSkillRevision(filePath, sha)` (the zero-extra-parameter actions) — consumed by `components/skill-history.tsx` (Task 3).

- [ ] **Step 1: Write the failing test `lib/skill-history-impl.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "./git-commit-file"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "skill-history-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

async function mockAgents() {
  vi.doMock("./config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./config")>()
    return {
      ...actual,
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
    }
  })
}

async function makeSkillFile(): Promise<string> {
  await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
  const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
  await writeFile(skillFile, "---\nname: plh-dev-team\ndescription: x\n---\n")
  return skillFile
}

describe("getSkillHistoryImpl", () => {
  it("parses commit history for a known skill file", async () => {
    await mockAgents()
    const skillFile = await makeSkillFile()
    const { getSkillHistoryImpl } = await import("./skill-history-impl")

    const fakeExec: ExecFileFn = async () => ({
      stdout:
        "abc123\x1f2026-07-22T10:00:00+09:00\x1fEdit SKILL.md via AI-Native control panel\x1e" +
        "def456\x1f2026-07-20T10:00:00+09:00\x1fInitial commit\x1e",
      stderr: "",
    })

    const result = await getSkillHistoryImpl(skillFile, fakeExec)

    expect(result).toEqual({
      ok: true,
      message: "",
      commits: [
        { sha: "abc123", date: "2026-07-22T10:00:00+09:00", message: "Edit SKILL.md via AI-Native control panel" },
        { sha: "def456", date: "2026-07-20T10:00:00+09:00", message: "Initial commit" },
      ],
    })
  })

  it("returns an empty commit list gracefully when there is no history yet", async () => {
    await mockAgents()
    const skillFile = await makeSkillFile()
    const { getSkillHistoryImpl } = await import("./skill-history-impl")
    const fakeExec: ExecFileFn = async () => ({ stdout: "", stderr: "" })

    const result = await getSkillHistoryImpl(skillFile, fakeExec)

    expect(result).toEqual({ ok: true, commits: [], message: "" })
  })

  it("refuses a path outside any configured agent root", async () => {
    await mockAgents()
    const { getSkillHistoryImpl } = await import("./skill-history-impl")
    const outsidePath = path.join(tmpdir(), "outside.md")

    const result = await getSkillHistoryImpl(outsidePath)

    expect(result).toEqual({
      ok: false,
      commits: [],
      message: "Refusing to read history for a path outside configured agent directories",
    })
  })

  it("refuses a path inside an agent root that isn't a known skill/command file", async () => {
    await mockAgents()
    await mkdir(path.join(root, "bin"), { recursive: true })
    const notASkill = path.join(root, "bin", "poll.sh")
    await writeFile(notASkill, "#!/bin/bash\n")

    const { getSkillHistoryImpl } = await import("./skill-history-impl")
    const result = await getSkillHistoryImpl(notASkill)

    expect(result).toEqual({
      ok: false,
      commits: [],
      message: "Refusing to read history for a path that is not a known skill/command file",
    })
  })

  it("returns ok:false when the git log command fails", async () => {
    await mockAgents()
    const skillFile = await makeSkillFile()
    const { getSkillHistoryImpl } = await import("./skill-history-impl")
    const fakeExec: ExecFileFn = async () => {
      throw new Error("not a git repository")
    }

    const result = await getSkillHistoryImpl(skillFile, fakeExec)

    expect(result).toEqual({ ok: false, commits: [], message: "not a git repository" })
  })
})

describe("getSkillRevisionImpl", () => {
  it("returns the file content at a given revision", async () => {
    await mockAgents()
    const skillFile = await makeSkillFile()
    const { getSkillRevisionImpl } = await import("./skill-history-impl")

    const fakeExec: ExecFileFn = async () => ({ stdout: "old content at that revision", stderr: "" })

    const result = await getSkillRevisionImpl(skillFile, "abc123", fakeExec)

    expect(result).toEqual({ ok: true, content: "old content at that revision", message: "" })
  })

  it("refuses a path outside any configured agent root", async () => {
    await mockAgents()
    const { getSkillRevisionImpl } = await import("./skill-history-impl")
    const result = await getSkillRevisionImpl(path.join(tmpdir(), "outside.md"), "abc123")

    expect(result).toEqual({
      ok: false,
      content: "",
      message: "Refusing to view history for a path outside configured agent directories",
    })
  })

  it("refuses a path that isn't a known skill/command file", async () => {
    await mockAgents()
    await mkdir(path.join(root, "bin"), { recursive: true })
    const notASkill = path.join(root, "bin", "poll.sh")
    await writeFile(notASkill, "#!/bin/bash\n")

    const { getSkillRevisionImpl } = await import("./skill-history-impl")
    const result = await getSkillRevisionImpl(notASkill, "abc123")

    expect(result).toEqual({
      ok: false,
      content: "",
      message: "Refusing to view history for a path that is not a known skill/command file",
    })
  })

  it("returns ok:false when git show fails (e.g. an invalid SHA)", async () => {
    await mockAgents()
    const skillFile = await makeSkillFile()
    const { getSkillRevisionImpl } = await import("./skill-history-impl")
    const fakeExec: ExecFileFn = async () => {
      throw new Error("fatal: invalid object name")
    }

    const result = await getSkillRevisionImpl(skillFile, "nonexistent", fakeExec)

    expect(result).toEqual({ ok: false, content: "", message: "fatal: invalid object name" })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/skill-history-impl.test.ts`
Expected: FAIL — `Cannot find module './skill-history-impl'`.

- [ ] **Step 3: Write `lib/skill-history-impl.ts`**

```ts
import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { resolveKnownSkillPath } from "./resolve-known-skill"
import type { ExecFileFn } from "./git-commit-file"

const execFileAsync = promisify(nodeExecFile)

export type SkillCommit = { sha: string; date: string; message: string }
export type SkillHistoryResult = { ok: boolean; commits: SkillCommit[]; message: string }
export type SkillRevisionResult = { ok: boolean; content: string; message: string }

async function defaultExecFile(
  command: string,
  args: string[],
  options: { cwd: string }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args, options)
}

const RECORD_SEP = "\x1e"
const FIELD_SEP = "\x1f"
const LOG_FORMAT = `%H${FIELD_SEP}%aI${FIELD_SEP}%s${RECORD_SEP}`

function boundaryMessage(reason: "outside-root" | "not-a-known-skill", verb: string): string {
  return reason === "outside-root"
    ? `Refusing to ${verb} for a path outside configured agent directories`
    : `Refusing to ${verb} for a path that is not a known skill/command file`
}

export async function getSkillHistoryImpl(
  filePath: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<SkillHistoryResult> {
  const resolved = await resolveKnownSkillPath(filePath)
  if (!resolved.ok) {
    return { ok: false, commits: [], message: boundaryMessage(resolved.reason, "read history") }
  }

  const relativePath = path.relative(resolved.agentRootPath, resolved.realPath)

  try {
    const { stdout } = await execFn(
      "git",
      ["-C", resolved.agentRootPath, "log", `--format=${LOG_FORMAT}`, "--", relativePath],
      { cwd: resolved.agentRootPath }
    )
    const commits = stdout
      .split(RECORD_SEP)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const [sha, date, message] = chunk.split(FIELD_SEP)
        return { sha, date, message }
      })
    return { ok: true, commits, message: "" }
  } catch (err) {
    return { ok: false, commits: [], message: err instanceof Error ? err.message : String(err) }
  }
}

export async function getSkillRevisionImpl(
  filePath: string,
  sha: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<SkillRevisionResult> {
  const resolved = await resolveKnownSkillPath(filePath)
  if (!resolved.ok) {
    return { ok: false, content: "", message: boundaryMessage(resolved.reason, "view history") }
  }

  const relativePath = path.relative(resolved.agentRootPath, resolved.realPath)

  try {
    const { stdout } = await execFn("git", ["-C", resolved.agentRootPath, "show", `${sha}:${relativePath}`], {
      cwd: resolved.agentRootPath,
    })
    return { ok: true, content: stdout, message: "" }
  } catch (err) {
    return { ok: false, content: "", message: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/skill-history-impl.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Write `lib/skill-history.ts`** (zero-extra-parameter Server Actions; no test needed for this thin wrapper — mirrors `lib/trigger-poll.ts`, `lib/save-skill-content.ts`, `lib/run-verify.ts`)

```ts
"use server"

import { getSkillHistoryImpl, getSkillRevisionImpl } from "./skill-history-impl"
import type { SkillHistoryResult, SkillRevisionResult } from "./skill-history-impl"

export async function getSkillHistory(filePath: string): Promise<SkillHistoryResult> {
  return getSkillHistoryImpl(filePath)
}

export async function getSkillRevision(filePath: string, sha: string): Promise<SkillRevisionResult> {
  return getSkillRevisionImpl(filePath, sha)
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass (78 from Task 1, plus this task's 9 = 87).

- [ ] **Step 7: Commit**

```bash
git add lib/skill-history-impl.ts lib/skill-history-impl.test.ts lib/skill-history.ts
git commit -m "feat: add skill edit history and revision Server Actions"
```

---

### Task 3: `SkillHistory` component

**Files:**
- Create: `components/skill-history.tsx`

**Interfaces:**
- Consumes: `getSkillHistory`, `getSkillRevision`, `SkillCommit` (Task 2); `DiffView` from `components/diff-view.tsx` (existing, v4, unmodified).
- Produces: `SkillHistory` component — consumed by `components/skill-browser.tsx` (Task 4).

- [ ] **Step 1: Write `components/skill-history.tsx`**

```tsx
"use client"

import { useState, useEffect } from "react"
import { DiffView } from "@/components/diff-view"
import { getSkillHistory, getSkillRevision } from "@/lib/skill-history"
import type { SkillCommit } from "@/lib/skill-history-impl"

export function SkillHistory({ path }: { path: string }) {
  const [commits, setCommits] = useState<SkillCommit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [oldContent, setOldContent] = useState("")
  const [newContent, setNewContent] = useState("")
  const [diffLoading, setDiffLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCommits(null)
    setError(null)
    setSelectedIndex(null)
    async function load() {
      const result = await getSkillHistory(path)
      if (cancelled) return
      if (!result.ok) {
        setError(result.message)
      } else {
        setCommits(result.commits)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [path])

  async function selectCommit(index: number) {
    if (!commits) return
    setSelectedIndex(index)
    setDiffLoading(true)
    const commit = commits[index]
    const olderCommit = commits[index + 1]

    const [newResult, oldResult] = await Promise.all([
      getSkillRevision(path, commit.sha),
      olderCommit ? getSkillRevision(path, olderCommit.sha) : Promise.resolve({ ok: true, content: "", message: "" }),
    ])
    setDiffLoading(false)
    setNewContent(newResult.ok ? newResult.content : "")
    setOldContent(oldResult.ok ? oldResult.content : "")
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!commits) return <p className="text-sm text-muted-foreground">Loading history…</p>
  if (commits.length === 0) {
    return <p className="text-sm text-muted-foreground">No commit history for this file yet.</p>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {commits.map((commit, index) => (
          <button
            key={commit.sha}
            onClick={() => selectCommit(index)}
            className={`block w-full rounded p-2 text-left text-sm ${selectedIndex === index ? "bg-muted" : ""}`}
          >
            <span className="font-mono text-xs text-muted-foreground">{commit.sha.slice(0, 7)}</span>{" "}
            <span className="text-xs text-muted-foreground">{new Date(commit.date).toLocaleString()}</span>
            <p>{commit.message}</p>
          </button>
        ))}
      </div>
      {selectedIndex !== null && (
        <div className="border-t pt-2">
          {diffLoading ? (
            <p className="text-sm text-muted-foreground">Loading diff…</p>
          ) : (
            <DiffView oldText={oldContent} newText={newContent} />
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/skill-history.tsx
git commit -m "feat: add SkillHistory component with per-commit diff"
```

---

### Task 4: Wire `SkillHistory` into `SkillBrowser`

**Files:**
- Modify: `components/skill-browser.tsx`

**Interfaces:**
- Consumes: `SkillHistory` (Task 3).
- Produces: nothing new for later tasks — this is the integration point, with real manual verification against `ai-company-starter-main`'s `stock-note.md` (which v4's own live test left with exactly two real commits).

- [ ] **Step 1: Read the current `components/skill-browser.tsx` in full**

- [ ] **Step 2: Replace `components/skill-browser.tsx` entirely with**

```tsx
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SkillEntry } from "@/lib/skills/types"
import type { SkillAgentResult } from "@/lib/get-all-skills"
import { getActivityDetail } from "@/lib/get-activity-detail"
import { SkillEditor } from "@/components/skill-editor"
import { SkillHistory } from "@/components/skill-history"

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
  const [view, setView] = useState<"content" | "history">("content")

  async function openEntry(entry: SkillEntry) {
    setSelected(entry)
    setDetail(null)
    setDetailError(null)
    setView("content")
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
          <div className="flex gap-2 px-4">
            <Button size="sm" variant={view === "content" ? "default" : "outline"} onClick={() => setView("content")}>
              Content
            </Button>
            <Button size="sm" variant={view === "history" ? "default" : "outline"} onClick={() => setView("history")}>
              History
            </Button>
          </div>
          <ScrollArea className="h-[80vh] pr-4">
            {view === "content" && (
              <>
                {detailError && <p className="text-destructive">{detailError}</p>}
                {!detailError && detail !== null && selected && (
                  <SkillEditor path={selected.path} initialContent={detail} />
                )}
                {!detailError && detail === null && <p>Loading…</p>}
              </>
            )}
            {view === "history" && selected && <SkillHistory path={selected.path} />}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 3: Verify in the browser against real history**

Run: `npm run dev`, open `/skills`, find `ai-company-starter-main`'s `stock-note` command, click it, click "History". Confirm: the commit list shows at least two commits (from v4's live test) plus the repo's original commit, all with real dates/messages/short SHAs. Click the newest commit and confirm the diff shows one line being removed (v4's revert step). Click the next commit and confirm the diff shows that same line being added (v4's original append step). Click "Content" and confirm it still shows the normal read/edit view unaffected. Close and reopen a different entry and confirm the view resets to "Content". Stop the server after confirming.

- [ ] **Step 4: Commit**

```bash
git add components/skill-browser.tsx
git commit -m "feat: add Content/History toggle to the skill detail panel"
```

---

### Task 5: README update and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: updated documentation — no new runtime code.

- [ ] **Step 1: Update `README.md`**

Read the current file in full first. Add a new section after "v5: triggering ai-company-starter-main's /verify":

```markdown
## v6: skill edit history

Every skill/command's detail panel in `/skills` now has a "History" toggle
alongside "Content". It lists every commit that has touched that file and
shows a diff for whichever one you click — reusing the same `DiffView`
v4's editor uses, just fed two revisions of the file pulled via `git show`
instead of a live draft. Nothing here writes anything; it's a viewer on
top of the git history v4's edits were already creating.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass (87 from Task 2 onward, unchanged by this docs-only task).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Final manual pass**

Run `npm run dev`, browse `/skills`, open `stock-note` once more, toggle to "History", confirm it still renders the same two-commit history and diffs correctly as a final regression check. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document the skill edit history viewer"
```
