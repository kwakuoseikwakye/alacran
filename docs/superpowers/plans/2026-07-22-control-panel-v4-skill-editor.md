# AI-Native Control Panel v4 Slice: Skill/Command Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a skill/command file be edited and saved from `/skills`' detail panel, with every save landing as a real, single-file-scoped git commit in that skill's own agent repo — no bespoke versioning, git already does this.

**Architecture:** The symlink-safe path-containment check already proven in v1's `getActivityDetail` is extracted into a shared `lib/path-guard.ts` so both reading and writing share one security boundary. A new save path additionally restricts writes to files that are current members of v3's `getAllSkills()` result (not just "anywhere in an agent root"). Git operations use the same dependency-injection pattern as `lib/adapters/launchd.ts`. A confirmation dialog shows a real line-level diff (via the `diff` package) before anything is written.

**Tech Stack:** Same as v1-v3 — Next.js 15 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, Vitest, plus the new `diff` package.

## Global Constraints

- `get-activity-detail.ts`'s existing behavior (including its exact error message) must be unchanged after Task 1's refactor — its existing test file must pass with zero modifications.
- Writes are restricted to paths that are BOTH (a) within a configured agent root (symlink-safe) AND (b) a current member of `getAllSkills()`'s result — either check failing means refusal.
- A save's git operations are scoped to exactly one file: `git add -- <file>` then `git commit -m <message> -- <file>` — never a broad `git add -A`, since `plh-ops`'s working tree already has unrelated untracked files that must never be swept into an edit commit.
- No new file-reading/writing code duplicates the containment logic — everything routes through `lib/path-guard.ts`.
- Any Server Action here that takes an injectable `execFn`-style test seam must not expose it as a real parameter on the exported `"use server"` action itself (the lesson from v2's fd-leak/spawnFn review) — split into a thin zero-extra-parameter action plus a separately-testable impl file, the same shape as `trigger-poll.ts`/`trigger-poll-impl.ts`.
- Every new/changed function that can fail must degrade to a safe `{saved: false, message: ...}` (or `null`, or `[]` as already established) rather than throwing past its own boundary.

---

### Task 1: Extract `path-guard.ts`; refactor `get-activity-detail.ts` to use it

**Files:**
- Create: `lib/path-guard.ts`
- Create: `lib/path-guard.test.ts`
- Modify: `lib/get-activity-detail.ts`

**Interfaces:**
- Consumes: `AGENTS` from `lib/config.ts` (existing).
- Produces: `PathGuardResult` type `{ realPath: string; agentRootPath: string } | null`, `resolveWithinAgentRoot(requestedPath: string): Promise<PathGuardResult>` — consumed by the refactored `get-activity-detail.ts` (this task) and by `lib/save-skill-content-impl.ts` (Task 3).

- [ ] **Step 1: Write the failing test `lib/path-guard.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "path-guard-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

describe("resolveWithinAgentRoot", () => {
  it("resolves a path inside a configured agent root", async () => {
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { resolveWithinAgentRoot } = await import("./path-guard")
    const filePath = path.join(root, "report.md")
    await writeFile(filePath, "hello")

    const result = await resolveWithinAgentRoot(filePath)
    expect(result).not.toBeNull()
    expect(result?.realPath).toBe(filePath)
    expect(result?.agentRootPath).toBe(root)
  })

  it("returns null for a path outside any configured agent root", async () => {
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { resolveWithinAgentRoot } = await import("./path-guard")
    const outsidePath = path.join(tmpdir(), "outside.md")

    const result = await resolveWithinAgentRoot(outsidePath)
    expect(result).toBeNull()
  })

  it("returns null for a symlink inside agent root pointing to a file outside", async () => {
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { resolveWithinAgentRoot } = await import("./path-guard")

    const outsideRoot = await mkdtemp(path.join(tmpdir(), "outside-test-"))
    try {
      const outsideFile = path.join(outsideRoot, "secret.md")
      await writeFile(outsideFile, "secret content")

      const symlinkPath = path.join(root, "link.md")
      await symlink(outsideFile, symlinkPath)

      const result = await resolveWithinAgentRoot(symlinkPath)
      expect(result).toBeNull()
    } finally {
      await rm(outsideRoot, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/path-guard.test.ts`
Expected: FAIL — `Cannot find module './path-guard'`.

- [ ] **Step 3: Write `lib/path-guard.ts`**

```ts
import { realpath } from "node:fs/promises"
import path from "node:path"
import { AGENTS } from "./config"

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

  for (const agent of AGENTS) {
    const root = await tryRealpath(path.resolve(agent.rootPath))
    if (root === null) continue
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      return { realPath: resolved, agentRootPath: root }
    }
  }
  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/path-guard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `lib/get-activity-detail.ts` to delegate to `path-guard.ts`**

Replace its entire contents with:

```ts
"use server"

import { readFile } from "node:fs/promises"
import { resolveWithinAgentRoot } from "./path-guard"

export async function getActivityDetail(detailPath: string): Promise<string> {
  const result = await resolveWithinAgentRoot(detailPath)
  if (!result) {
    throw new Error("Refusing to read a path outside configured agent directories")
  }
  return readFile(result.realPath, "utf-8")
}
```

- [ ] **Step 6: Run the EXISTING `lib/get-activity-detail.test.ts` unchanged to confirm no regression**

Run: `npx vitest run lib/get-activity-detail.test.ts`
Expected: PASS (3 tests) — same file, same assertions, no modifications needed. This proves the refactor preserved behavior exactly.

- [ ] **Step 7: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: all existing tests still pass (59 from before this task, now 62 with Task 1's 3 new `path-guard.test.ts` cases).

- [ ] **Step 8: Commit**

```bash
git add lib/path-guard.ts lib/path-guard.test.ts lib/get-activity-detail.ts
git commit -m "refactor: extract path-guard.ts shared containment check from get-activity-detail"
```

---

### Task 2: `git-commit-file.ts`

**Files:**
- Create: `lib/git-commit-file.ts`
- Test: `lib/git-commit-file.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ExecFileFn` type `(command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>`, `commitFile(repoRoot: string, relativePath: string, message: string, execFn?: ExecFileFn): Promise<void>` — consumed by `lib/save-skill-content-impl.ts` (Task 3).

- [ ] **Step 1: Write the failing test `lib/git-commit-file.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"

describe("commitFile", () => {
  it("runs git add then git commit scoped to the exact file", async () => {
    const calls: { command: string; args: string[] }[] = []
    const fakeExec: ExecFileFn = async (command, args) => {
      calls.push({ command, args })
      return { stdout: "", stderr: "" }
    }

    await commitFile("/repo", "skills/piro/SKILL.md", "Edit SKILL.md via AI-Native control panel", fakeExec)

    expect(calls).toEqual([
      { command: "git", args: ["-C", "/repo", "add", "--", "skills/piro/SKILL.md"] },
      {
        command: "git",
        args: [
          "-C",
          "/repo",
          "commit",
          "-m",
          "Edit SKILL.md via AI-Native control panel",
          "--",
          "skills/piro/SKILL.md",
        ],
      },
    ])
  })

  it("propagates an error thrown by the injected exec function", async () => {
    const fakeExec: ExecFileFn = async () => {
      throw new Error("nothing to commit")
    }

    await expect(commitFile("/repo", "file.md", "msg", fakeExec)).rejects.toThrow("nothing to commit")
  })

  it("does not attempt commit if add fails", async () => {
    const calls: string[] = []
    const fakeExec: ExecFileFn = async (command, args) => {
      calls.push(args[2])
      if (args[2] === "add") throw new Error("add failed")
      return { stdout: "", stderr: "" }
    }

    await expect(commitFile("/repo", "file.md", "msg", fakeExec)).rejects.toThrow("add failed")
    expect(calls).toEqual(["add"])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/git-commit-file.test.ts`
Expected: FAIL — `Cannot find module './git-commit-file'`.

- [ ] **Step 3: Write `lib/git-commit-file.ts`**

```ts
import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export async function commitFile(
  repoRoot: string,
  relativePath: string,
  message: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<void> {
  await execFn("git", ["-C", repoRoot, "add", "--", relativePath])
  await execFn("git", ["-C", repoRoot, "commit", "-m", message, "--", relativePath])
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/git-commit-file.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/git-commit-file.ts lib/git-commit-file.test.ts
git commit -m "feat: add single-file-scoped git commit helper"
```

---

### Task 3: `saveSkillContent` Server Action (zero-drift action + injectable impl)

**Files:**
- Create: `lib/save-skill-content-impl.ts`
- Create: `lib/save-skill-content-impl.test.ts`
- Create: `lib/save-skill-content.ts`

**Interfaces:**
- Consumes: `resolveWithinAgentRoot` (Task 1); `commitFile`, `ExecFileFn` (Task 2); `AGENTS`, `SKILL_ADAPTERS` from `lib/config.ts` (existing); `getAllSkills` from `lib/get-all-skills.ts` (existing).
- Produces: `saveSkillContentImpl(filePath: string, newContent: string, execFn?: ExecFileFn): Promise<{saved: boolean; message: string}>`; `saveSkillContent(filePath: string, newContent: string): Promise<{saved: boolean; message: string}>` (the `"use server"` action, zero extra parameters) — consumed by `components/skill-editor.tsx` (Task 5).

- [ ] **Step 1: Write the failing test `lib/save-skill-content-impl.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "./git-commit-file"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "save-skill-test-"))
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

describe("saveSkillContentImpl", () => {
  it("writes the file and commits it when the path is a known skill", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "---\nname: plh-dev-team\ndescription: old\n---\nold body\n")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")

    const calls: string[][] = []
    const fakeExec: ExecFileFn = async (_command, args) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }

    const result = await saveSkillContentImpl(
      skillFile,
      "---\nname: plh-dev-team\ndescription: new\n---\nnew body\n",
      fakeExec
    )

    expect(result).toEqual({ saved: true, message: "Saved and committed" })
    const written = await readFile(skillFile, "utf-8")
    expect(written).toContain("new body")
    expect(calls[0]).toEqual(["-C", root, "add", "--", path.join("skills", "plh-dev-team", "SKILL.md")])
    expect(calls[1][0]).toBe("-C")
  })

  it("refuses to write a path outside any configured agent root", async () => {
    await mockAgents()
    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const outsidePath = path.join(tmpdir(), "outside.md")

    const result = await saveSkillContentImpl(outsidePath, "new content")

    expect(result).toEqual({
      saved: false,
      message: "Refusing to write a path outside configured agent directories",
    })
  })

  it("refuses to write a path inside an agent root that isn't a known skill/command file", async () => {
    await mockAgents()
    await mkdir(path.join(root, "bin"), { recursive: true })
    const notASkill = path.join(root, "bin", "poll.sh")
    await writeFile(notASkill, "#!/bin/bash\necho hi\n")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const result = await saveSkillContentImpl(notASkill, "malicious content")

    expect(result).toEqual({
      saved: false,
      message: "Refusing to write a path that is not a known skill/command file",
    })
  })

  it("returns a no-op message when content is unchanged", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    const content = "---\nname: plh-dev-team\ndescription: same\n---\nsame body\n"
    await writeFile(skillFile, content)

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const result = await saveSkillContentImpl(skillFile, content)

    expect(result).toEqual({ saved: false, message: "No changes to save" })
  })

  it("returns a failure message when the commit fails, without throwing", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "old")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const fakeExec: ExecFileFn = async () => {
      throw new Error("not a git repository")
    }

    const result = await saveSkillContentImpl(skillFile, "new", fakeExec)

    expect(result).toEqual({ saved: false, message: "not a git repository" })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/save-skill-content-impl.test.ts`
Expected: FAIL — `Cannot find module './save-skill-content-impl'`.

- [ ] **Step 3: Write `lib/save-skill-content-impl.ts`**

```ts
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { resolveWithinAgentRoot } from "./path-guard"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"
import { AGENTS, SKILL_ADAPTERS } from "./config"
import { getAllSkills } from "./get-all-skills"

export async function saveSkillContentImpl(
  filePath: string,
  newContent: string,
  execFn?: ExecFileFn
): Promise<{ saved: boolean; message: string }> {
  const guard = await resolveWithinAgentRoot(filePath)
  if (!guard) {
    return { saved: false, message: "Refusing to write a path outside configured agent directories" }
  }

  const results = await getAllSkills(AGENTS, SKILL_ADAPTERS)
  const isKnownSkill = results.some((r) => r.entries.some((entry) => entry.path === guard.realPath))
  if (!isKnownSkill) {
    return { saved: false, message: "Refusing to write a path that is not a known skill/command file" }
  }

  let currentContent: string
  try {
    currentContent = await readFile(guard.realPath, "utf-8")
  } catch (err) {
    return { saved: false, message: err instanceof Error ? err.message : String(err) }
  }

  if (currentContent === newContent) {
    return { saved: false, message: "No changes to save" }
  }

  try {
    await writeFile(guard.realPath, newContent, "utf-8")
    const relativePath = path.relative(guard.agentRootPath, guard.realPath)
    const fileName = path.basename(guard.realPath)
    await commitFile(guard.agentRootPath, relativePath, `Edit ${fileName} via AI-Native control panel`, execFn)
    return { saved: true, message: "Saved and committed" }
  } catch (err) {
    return { saved: false, message: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/save-skill-content-impl.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write `lib/save-skill-content.ts`** (the zero-extra-parameter Server Action; no test needed for this thin wrapper — mirrors `lib/trigger-poll.ts`, which also has no direct test, only `trigger-poll-impl.test.ts`)

```ts
"use server"

import { saveSkillContentImpl } from "./save-skill-content-impl"

export async function saveSkillContent(
  filePath: string,
  newContent: string
): Promise<{ saved: boolean; message: string }> {
  return saveSkillContentImpl(filePath, newContent)
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass (62 from Task 1, plus this task's 8 new tests across `git-commit-file.test.ts` and `save-skill-content-impl.test.ts` = 70... but Task 2 already added 3, so at this point: 62 + 3 (Task 2) + 5 (Task 3) = 70).

- [ ] **Step 7: Commit**

```bash
git add lib/save-skill-content-impl.ts lib/save-skill-content-impl.test.ts lib/save-skill-content.ts
git commit -m "feat: add saveSkillContent Server Action with skill-membership check"
```

---

### Task 4: shadcn `textarea` primitive, `diff` dependency, and `DiffView`

**Files:**
- Create: `components/ui/textarea.tsx` (generated by shadcn CLI)
- Create: `components/diff-view.tsx`
- Modify: `package.json` (adds `diff` and `@types/diff`)

**Interfaces:**
- Consumes: `diffLines` from the `diff` package.
- Produces: `DiffView` component — consumed by `components/skill-editor.tsx` (Task 5).

- [ ] **Step 1: Install the `diff` package**

Run: `npm install diff && npm install --save-dev @types/diff`
Expected: `package.json`/`package-lock.json` updated with `diff` in `dependencies` and `@types/diff` in `devDependencies`.

- [ ] **Step 2: Generate the shadcn textarea primitive**

Run: `npx shadcn@latest add textarea -y`
Expected: creates `components/ui/textarea.tsx`. If the CLI reports a config mismatch, run `npx shadcn@latest init -d -y` first, then re-run the add command — same fallback pattern used in v1's Task 8 and v2's Task 3.

- [ ] **Step 3: Write `components/diff-view.tsx`**

```tsx
import { diffLines } from "diff"

export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = diffLines(oldText, newText)
  return (
    <pre className="whitespace-pre-wrap text-xs">
      {parts.map((part, i) => (
        <span
          key={i}
          className={
            part.added
              ? "bg-green-500/20 text-green-700 dark:text-green-400"
              : part.removed
                ? "bg-red-500/20 text-red-700 dark:text-red-400 line-through"
                : ""
          }
        >
          {part.value}
        </span>
      ))}
    </pre>
  )
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/ui/textarea.tsx components/diff-view.tsx package.json package-lock.json
git commit -m "feat: add DiffView component and diff/textarea dependencies"
```

---

### Task 5: `SkillEditor` component, wired into `SkillBrowser`

**Files:**
- Create: `components/skill-editor.tsx`
- Modify: `components/skill-browser.tsx`

**Interfaces:**
- Consumes: `saveSkillContent` (Task 3); `DiffView` (Task 4); shadcn `Textarea`, `AlertDialog*` (Task 4, v2 respectively).
- Produces: `SkillEditor` component — no later task depends on it.

- [ ] **Step 1: Read the current `components/skill-browser.tsx` in full**

- [ ] **Step 2: Write `components/skill-editor.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DiffView } from "@/components/diff-view"
import { saveSkillContent } from "@/lib/save-skill-content"

export function SkillEditor({ path, initialContent }: { path: string; initialContent: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialContent)
  const [savedContent, setSavedContent] = useState(initialContent)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function startEditing() {
    setDraft(savedContent)
    setEditing(true)
    setMessage(null)
  }

  function cancelEditing() {
    setDraft(savedContent)
    setEditing(false)
    setMessage(null)
  }

  async function handleConfirmSave() {
    setPending(true)
    const result = await saveSkillContent(path, draft)
    setPending(false)
    setConfirmOpen(false)
    setMessage(result.message)
    if (result.saved) {
      setSavedContent(draft)
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <pre className="whitespace-pre-wrap text-sm">{savedContent}</pre>
        <Button size="sm" variant="outline" onClick={startEditing}>
          Edit
        </Button>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="min-h-[50vh] font-mono text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={draft === savedContent || pending}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={cancelEditing}>
          Cancel
        </Button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="max-h-[60vh] overflow-y-auto">
                <DiffView oldText={savedContent} newText={draft} />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSave}>Confirm &amp; commit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 3: Modify `components/skill-browser.tsx`**

Replace the entire file with:

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
import { SkillEditor } from "@/components/skill-editor"

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
            {!detailError && detail !== null && selected && (
              <SkillEditor path={selected.path} initialContent={detail} />
            )}
            {!detailError && detail === null && <p>Loading…</p>}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 4: Verify in the browser — UI only, do NOT click "Confirm & commit" yet**

Run: `npm run dev`, open `/skills`, click any entry, confirm the read-only view still renders, click "Edit", confirm the textarea appears pre-filled with the real content, make a small change, click "Save", confirm the confirmation dialog opens showing a correct diff (added lines highlighted green, removed lines struck through and red). Click "Cancel" on the dialog (not "Confirm & commit") and confirm it closes without writing anything. Click the editor's own "Cancel" button and confirm it discards the draft and returns to the read-only view showing the original, unmodified content. Stop the server after confirming. This task deliberately does not perform a real commit — that happens in Task 6 with full awareness, mirroring how v2 deferred its live trigger test to its final task.

- [ ] **Step 5: Commit**

```bash
git add components/skill-editor.tsx components/skill-browser.tsx
git commit -m "feat: add SkillEditor with confirm-with-diff save flow"
```

---

### Task 6: README update and final verification (real commit, deliberately reverted)

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: updated documentation — no new runtime code.

**Important note for whoever executes this task's manual verification:** this step performs a REAL edit + save + git commit against a real agent repository — this is the first task in this slice to actually click "Confirm & commit". To leave no lasting change to real skill content, use a trivially reversible edit: append the exact line `<!-- verified via AI-Native control panel v4 -->` to the very end of a low-stakes file (recommended: `ai-company-starter-main`'s `.claude/commands/stock-note.md`), confirm the commit lands, then immediately perform a SECOND edit through the same UI removing that exact line, confirm that commit lands too — leaving the file's real content byte-for-byte as it was before, but with two new commits in that repo's history proving the full pipeline works end-to-end (including a repo — `ai-company-starter-main` — that has no remote, and would need `git log` to show both commits with the right message and scoped to only that one file).

- [ ] **Step 1: Update `README.md`**

Read the current file in full first. Add a new section after the "v3: skill/command browser" section:

```markdown
## v4: skill/command editor

Any entry in `/skills` can now be edited in place. Clicking "Edit" swaps
the read-only view for a textarea; "Save" shows a real diff of what will
change before anything is written. Confirming writes the file and creates
a git commit scoped to exactly that one file in its own agent's repo — no
custom version history to maintain, `git log`/`git diff`/`git revert`
already work on every edit. Writes are restricted to files that are
current, real skill/command entries — not just anything living inside an
agent's directory.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass (70 from Task 3 onward, unchanged by this docs-only task).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Real end-to-end verification with immediate revert**

Run `npm run dev`. In the browser, open `/skills`, find `ai-company-starter-main`'s `stock-note` command, click it, click "Edit", append the exact line `<!-- verified via AI-Native control panel v4 -->` at the end of the textarea content, click "Save", confirm the diff dialog shows exactly that one added line, click "Confirm & commit". Confirm the success message appears and the read-only view now shows the appended line.

Then immediately edit again: click "Edit", remove that exact line (restoring the file to its original content), click "Save", confirm the diff shows exactly that one removed line, click "Confirm & commit" again.

Stop the dev server, then run `git -C ~/AI-Native/ai-company-starter-main log --oneline -3` and `git -C ~/AI-Native/ai-company-starter-main diff HEAD~2 -- .claude/commands/stock-note.md` to confirm: two new commits exist, both with the `Edit stock-note.md via AI-Native control panel` message, and the net diff across both commits is empty (the file's final content matches its content before this task started).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document the skill/command editor"
```
