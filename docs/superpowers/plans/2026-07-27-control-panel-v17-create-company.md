# v17: Create a company from the template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session note:** this session's subagent-spawn cap (200/session) has
> been hit twice already (during v14, confirmed still blocking on v16).
> If a task's implementer dispatch fails with a spawn-limit error, do not
> retry — execute that task (and any remaining tasks) directly instead:
> read the target file first, apply the step's code exactly, run the
> listed test commands, then self-review the whole branch before
> merging.

**Goal:** Let a user scaffold a brand-new company directory from
`ai-company-starter-main`'s generic parts (not its real Kirirom data),
`git init` it, and register it — all from the existing "Add a company"
form, with zero change to today's register-an-existing-directory
behavior.

**Architecture:** A hardcoded template manifest (the exact list of
generic paths to copy) drives a new scaffold function that copies those
paths, writes a fresh `HANDOFF.md`, runs `git init` + an initial commit,
then calls the *existing, untouched* `registerCompanyImpl`. A new
lightweight path-status check tells the UI whether to go straight to
today's register flow, offer to create, or show today's existing error —
without ever string-matching error messages.

**Tech Stack:** Next.js 15 Server Actions, `node:fs/promises`,
`node:child_process` (`execFile`, DI'd exactly like
`lib/git-commit-file.ts`), Vitest.

## Global Constraints

- `lib/companies-registry.ts`'s existing exports (`registerCompanyImpl`,
  `removeCompanyImpl`, `getRegisteredCompanies`) and `lib/register-company.ts`
  / `lib/remove-company.ts` are **never modified** — only new exports are
  added to `companies-registry.ts`. Every existing test in
  `companies-registry.test.ts` must keep passing unchanged.
- Do NOT edit `components/ui/*` — reuse `AlertDialog` exactly as
  `components/skill-editor.tsx` already imports it.
- The template source is always `AGENTS.find(a => a.id ===
  "ai-company-starter-main").rootPath` from `lib/config.ts` — no new
  config, no user-supplied template path.
- The scaffold creates **at most one new leaf directory** — if the
  target's parent directory doesn't exist either, this is a
  `"not-creatable"` status, and the existing `registerCompany` error path
  handles it unchanged. No recursive directory creation beyond one level.
- Every new function that touches the filesystem or spawns `git` follows
  this project's DI convention: a real default, an injectable seam for
  tests. Tests never read from or write to the real
  `ai-company-starter-main` directory — they use disposable `/tmp`
  fixtures built in `beforeEach`/torn down in `afterEach`, per this
  project's standing safe-test-target rule.
- The exact template manifest (which paths get copied) is defined once,
  in `lib/company-template-manifest.ts`, and nowhere else.

---

### Task 1: Template manifest module

**Files:**
- Create: `lib/company-template-manifest.ts`

**Interfaces:**
- Produces: `TEMPLATE_MANIFEST: string[]` (relative paths, copied
  verbatim from `ai-company-starter-main`'s root) and
  `FRESH_HANDOFF_CONTENT: string` — both consumed by Task 3.

This is a pure data module — no test file (same precedent as v16's
`KIND_BADGE_CLASS`, a static lookup with no logic to unit test).

- [ ] **Step 1: Create the manifest file**

Create `lib/company-template-manifest.ts`:

```ts
// Exact relative paths copied from ai-company-starter-main when
// scaffolding a new company. Every path here was individually verified
// to contain no company-specific data (see
// docs/superpowers/specs/2026-07-27-control-panel-v17-create-company-design.md
// for the full audit). Anything not listed here is never copied — this
// is an explicit allowlist, not a blocklist, so newly-added real content
// in ai-company-starter-main can never leak into a new company by
// accident.
//
// definitions/hitl is copied whole-folder because every file in it is
// currently a `<<TODO>>` placeholder template, not filled data — if
// this project ever fills those triggers in with real values in place,
// this entry needs to move to the file-level list below (see
// notes/company/.gitkeep for why: that folder holds real generated
// digests alongside its placeholder, so only the placeholder is listed).
export const TEMPLATE_MANIFEST: string[] = [
  ".claude/hooks",
  ".claude/commands",
  ".claude/rules",
  ".claude/skills",
  ".claude/settings.json",
  "docs/templates",
  "docs/concepts",
  "docs/ai-company-beginner-guide.md",
  "docs/ai-company-beginner-guide-lp.html",
  "docs/ai-company-explainer.md",
  "docs/context-gathering-checklist.md",
  "docs/directory-map.md",
  "docs/feedback-collection.md",
  "docs/participant-guide.md",
  "docs/retreat-day-flow.md",
  "docs/setup-walkthrough.md",
  "docs/starter-manual.md",
  "docs/decisions/README.md",
  "docs/retros/README.md",
  "exercises",
  "scripts/verify.py",
  "scripts/cycle",
  "tests",
  ".github",
  ".gitignore",
  "LICENSE.md",
  "README.md",
  "CLAUDE.md",
  "definitions/README.md",
  "definitions/ontology/README.md",
  "definitions/hitl",
  "definitions/kpi/README.md",
  "definitions/cycles/README.md",
  "definitions/retro/README.md",
  "secrets",
  "state/README.md",
  "notes/README.md",
  "notes/inbox/README.md",
  "notes/market/.gitkeep",
  "notes/clients/.gitkeep",
  "notes/sops/.gitkeep",
  "notes/company/.gitkeep",
]

export const FRESH_HANDOFF_CONTENT = `# HANDOFF — セッション引き継ぎ

このファイルは、セッションを跨いで「今どこにいるか・次に何をやるか」を伝えるための
引き継ぎノートです。\`CLAUDE.md\` §2.6「セッション引き継ぎ」の実装で、セッション終了時に
\`/handoff\` コマンドで追記していきます。

> **配布直後の状態です。** まだ運用セッションの実績はありません。
> 最初のセッションでは、下記「Next up」に沿って着手してください。

---

## はじめての方へ（最初のセッションの進め方）

1. \`CLAUDE.md\` §5「セッションフロー」の開始手順を読む（本ファイルと CLAUDE.md で現在地を把握）。
2. \`exercises/01\`（合宿当日の演習 1 本目）から着手する。
3. 自社コンテキストを入れ始めるなら \`/define-company\` → \`definitions/ontology/company.yaml\` を生成。
4. まとまった変更のあとは \`python3 scripts/verify.py\`（または \`/verify\`）で検証する（偽緑禁止）。
5. セッション終了時に \`/handoff\` で本ファイルを更新し、\`/decision\` \`/retro\` で記録を残す。

---

## Next up

- \`/define-company\` で自社コンテキストを記入する。
`
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/company-template-manifest.ts
git commit -m "feat: add the company scaffold template manifest"
```

---

### Task 2: `getCompanyPathStatusImpl`

**Files:**
- Modify: `lib/companies-registry.ts` (add exports only — do not touch
  any existing function)
- Modify: `lib/companies-registry.test.ts` (add tests only — do not
  touch any existing test)

**Interfaces:**
- Consumes: the file's existing private `exists`/`isDirectory` helpers
  (already defined in this file — no new imports needed).
- Produces: `export type CompanyPathStatus = "exists" | "creatable" |
  "not-creatable"` and `export async function
  getCompanyPathStatusImpl(rootPath: string): Promise<CompanyPathStatus>`
  — Task 4's `get-company-path-status.ts` action calls this directly.

- [ ] **Step 1: Read the current file**

Read `lib/companies-registry.ts` in full. Confirm it still has private
`async function isDirectory(p: string): Promise<boolean>` and `async
function exists(p: string): Promise<boolean>` helpers, and ends with
`removeCompanyImpl`. If it has drifted, stop and reconcile before
editing.

- [ ] **Step 2: Write the failing tests**

Add to the end of `lib/companies-registry.test.ts` (inside the existing
top-level `describe("companies-registry", ...)` block, using the file's
existing `dataDir`/`companyDir` fixtures from its `beforeEach`):

```ts
  it("getCompanyPathStatusImpl returns 'exists' for a path that already exists", async () => {
    const { getCompanyPathStatusImpl } = await import("./companies-registry")
    expect(await getCompanyPathStatusImpl(companyDir)).toBe("exists")
  })

  it("getCompanyPathStatusImpl returns 'creatable' when the path is missing but its parent exists", async () => {
    const { getCompanyPathStatusImpl } = await import("./companies-registry")
    const missingChild = path.join(companyDir, "not-yet-created")
    expect(await getCompanyPathStatusImpl(missingChild)).toBe("creatable")
  })

  it("getCompanyPathStatusImpl returns 'not-creatable' when neither the path nor its parent exist", async () => {
    const { getCompanyPathStatusImpl } = await import("./companies-registry")
    const deeplyMissing = path.join(companyDir, "missing-parent", "missing-child")
    expect(await getCompanyPathStatusImpl(deeplyMissing)).toBe("not-creatable")
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/companies-registry.test.ts`
Expected: FAIL — `getCompanyPathStatusImpl is not a function` (or similar
— the export doesn't exist yet)

- [ ] **Step 4: Add the implementation**

Add to the end of `lib/companies-registry.ts` (after `removeCompanyImpl`,
nothing before it changes):

```ts
export type CompanyPathStatus = "exists" | "creatable" | "not-creatable"

export async function getCompanyPathStatusImpl(rootPath: string): Promise<CompanyPathStatus> {
  if (await exists(rootPath)) {
    return "exists"
  }
  if (await isDirectory(path.dirname(rootPath))) {
    return "creatable"
  }
  return "not-creatable"
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/companies-registry.test.ts`
Expected: PASS (all existing tests plus the 3 new ones)

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `npx vitest run`
Expected: all tests pass (193 existing + 3 new = 196)

- [ ] **Step 7: Commit**

```bash
git add lib/companies-registry.ts lib/companies-registry.test.ts
git commit -m "feat: add getCompanyPathStatusImpl for the create-company flow"
```

---

### Task 3: `createCompanyFromTemplateImpl`

**Files:**
- Create: `lib/create-company-from-template-impl.ts`
- Test: `lib/create-company-from-template-impl.test.ts`

**Interfaces:**
- Consumes: `TEMPLATE_MANIFEST`, `FRESH_HANDOFF_CONTENT` (Task 1);
  `registerCompanyImpl`, `RegisteredCompany` (existing, from
  `./companies-registry`, unchanged); `ExecFileFn` (existing, from
  `./git-commit-file`, unchanged).
- Produces: `export async function createCompanyFromTemplateImpl(name:
  string, rootPath: string, templateSourcePath: string, registryPath?:
  string, execFn: ExecFileFn = defaultExecFile): Promise<{ ok: true;
  company: RegisteredCompany } | { ok: false; message: string }>` — Task
  4's `create-company-from-template.ts` action calls this directly.

- [ ] **Step 1: Write the failing tests**

Create `lib/create-company-from-template-impl.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createCompanyFromTemplateImpl } from "./create-company-from-template-impl"

let templateSourceDir: string
let targetParentDir: string
let registryDir: string
let registryPath: string
let execCalls: { command: string; args: string[] }[]

async function fakeExecFn(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  execCalls.push({ command, args })
  if (args.includes("init")) {
    const dashCIndex = args.indexOf("-C")
    await mkdir(path.join(args[dashCIndex + 1], ".git"), { recursive: true })
  }
  return { stdout: "", stderr: "" }
}

beforeEach(async () => {
  templateSourceDir = await mkdtemp(path.join(tmpdir(), "template-source-"))
  targetParentDir = await mkdtemp(path.join(tmpdir(), "template-target-parent-"))
  registryDir = await mkdtemp(path.join(tmpdir(), "template-registry-"))
  registryPath = path.join(registryDir, "companies.json")
  execCalls = []

  await mkdir(path.join(templateSourceDir, ".claude", "commands"), { recursive: true })
  await writeFile(path.join(templateSourceDir, ".claude", "commands", "decision.md"), "# /decision\n")
  await writeFile(path.join(templateSourceDir, ".claude", "commands", ".DS_Store"), "junk")
  await writeFile(path.join(templateSourceDir, ".gitignore"), "secrets/\n")
  await writeFile(path.join(templateSourceDir, "README.md"), "# Starter\n")
  await mkdir(path.join(templateSourceDir, "examples"), { recursive: true })
  await writeFile(path.join(templateSourceDir, "examples", "demo.md"), "should never be copied")
})

afterEach(async () => {
  await rm(templateSourceDir, { recursive: true, force: true })
  await rm(targetParentDir, { recursive: true, force: true })
  await rm(registryDir, { recursive: true, force: true })
})

describe("createCompanyFromTemplateImpl", () => {
  it("copies manifest entries, excludes .DS_Store, and never copies non-manifest paths", async () => {
    const target = path.join(targetParentDir, "new-co")
    const result = await createCompanyFromTemplateImpl("New Co", target, templateSourceDir, registryPath, fakeExecFn)

    expect(result.ok).toBe(true)
    expect(await readFile(path.join(target, ".claude", "commands", "decision.md"), "utf-8")).toBe("# /decision\n")
    expect(await readFile(path.join(target, ".gitignore"), "utf-8")).toBe("secrets/\n")
    expect(await readFile(path.join(target, "README.md"), "utf-8")).toBe("# Starter\n")
    await expect(stat(path.join(target, ".claude", "commands", ".DS_Store"))).rejects.toThrow()
    await expect(stat(path.join(target, "examples"))).rejects.toThrow()
  })

  it("writes a fresh HANDOFF.md rather than copying one from the source", async () => {
    const target = path.join(targetParentDir, "new-co-2")
    await createCompanyFromTemplateImpl("New Co 2", target, templateSourceDir, registryPath, fakeExecFn)
    const handoff = await readFile(path.join(target, "HANDOFF.md"), "utf-8")
    expect(handoff).toContain("はじめての方へ")
  })

  it("runs git init, add, and commit via the injected exec function, scoped to the new directory", async () => {
    const target = path.join(targetParentDir, "new-co-3")
    await createCompanyFromTemplateImpl("New Co 3", target, templateSourceDir, registryPath, fakeExecFn)
    expect(execCalls).toEqual([
      { command: "git", args: ["-C", target, "init"] },
      { command: "git", args: ["-C", target, "add", "-A"] },
      {
        command: "git",
        args: ["-C", target, "commit", "-m", "Initial commit from ai-company-starter-main template"],
      },
    ])
  })

  it("registers the new company after scaffolding it", async () => {
    const target = path.join(targetParentDir, "new-co-4")
    const result = await createCompanyFromTemplateImpl("New Co 4", target, templateSourceDir, registryPath, fakeExecFn)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.company.name).toBe("New Co 4")
    expect(result.company.rootPath).toBe(target)
  })

  it("fails cleanly without touching disk if the target path already exists", async () => {
    const target = path.join(targetParentDir, "already-exists")
    await mkdir(target)
    const result = await createCompanyFromTemplateImpl("Dup", target, templateSourceDir, registryPath, fakeExecFn)
    expect(result.ok).toBe(false)
    expect(execCalls).toEqual([])
  })

  it("fails cleanly if the parent directory doesn't exist either", async () => {
    const target = path.join(targetParentDir, "missing-parent", "new-co")
    const result = await createCompanyFromTemplateImpl("Dup2", target, templateSourceDir, registryPath, fakeExecFn)
    expect(result.ok).toBe(false)
    expect(execCalls).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/create-company-from-template-impl.test.ts`
Expected: FAIL — `Cannot find module './create-company-from-template-impl'`

- [ ] **Step 3: Implement**

Create `lib/create-company-from-template-impl.ts`:

```ts
import { mkdir, writeFile, stat, cp } from "node:fs/promises"
import path from "node:path"
import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import type { ExecFileFn } from "./git-commit-file"
import { registerCompanyImpl, type RegisteredCompany } from "./companies-registry"
import { TEMPLATE_MANIFEST, FRESH_HANDOFF_CONTENT } from "./company-template-manifest"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function copyManifestEntry(sourceRoot: string, targetRoot: string, relativePath: string): Promise<void> {
  const source = path.join(sourceRoot, relativePath)
  if (!(await pathExists(source))) return
  const target = path.join(targetRoot, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await cp(source, target, {
    recursive: true,
    filter: (src) => path.basename(src) !== ".DS_Store",
  })
}

export async function createCompanyFromTemplateImpl(
  name: string,
  rootPath: string,
  templateSourcePath: string,
  registryPath?: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  if (await pathExists(rootPath)) {
    return { ok: false, message: "This path already exists" }
  }
  if (!(await isDirectory(path.dirname(rootPath)))) {
    return { ok: false, message: "Parent directory does not exist" }
  }

  try {
    await mkdir(rootPath)

    for (const relativePath of TEMPLATE_MANIFEST) {
      await copyManifestEntry(templateSourcePath, rootPath, relativePath)
    }

    await writeFile(path.join(rootPath, "HANDOFF.md"), FRESH_HANDOFF_CONTENT, "utf-8")

    await execFn("git", ["-C", rootPath, "init"])
    await execFn("git", ["-C", rootPath, "add", "-A"])
    await execFn("git", ["-C", rootPath, "commit", "-m", "Initial commit from ai-company-starter-main template"])
  } catch (err) {
    return {
      ok: false,
      message: `Failed to scaffold company: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  return registerCompanyImpl(name, rootPath, registryPath)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/create-company-from-template-impl.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass (196 existing + 6 new = 202)

- [ ] **Step 6: Commit**

```bash
git add lib/create-company-from-template-impl.ts lib/create-company-from-template-impl.test.ts
git commit -m "feat: add createCompanyFromTemplateImpl to scaffold a new company"
```

---

### Task 4: Public Server Actions

**Files:**
- Create: `lib/get-company-path-status.ts`
- Create: `lib/create-company-from-template.ts`

**Interfaces:**
- Consumes: `getCompanyPathStatusImpl`, `CompanyPathStatus` (Task 2);
  `createCompanyFromTemplateImpl` (Task 3); `AGENTS` (existing, from
  `./config`, unchanged).
- Produces: `export async function getCompanyPathStatus(rootPath:
  string): Promise<CompanyPathStatus>` and `export async function
  createCompanyFromTemplate(name: string, rootPath: string):
  Promise<{ ok: true; company: RegisteredCompany } | { ok: false;
  message: string }>` — Task 5's `AddCompanyForm` calls both directly.

No new tests in this task — both are zero-logic wrappers over
already-tested Task 2/3 functions, matching this project's existing
`lib/register-company.ts` (also untested directly, since
`registerCompanyImpl` carries the test coverage).

- [ ] **Step 1: Create the path-status action**

Create `lib/get-company-path-status.ts`:

```ts
"use server"

import { getCompanyPathStatusImpl, type CompanyPathStatus } from "./companies-registry"

export async function getCompanyPathStatus(rootPath: string): Promise<CompanyPathStatus> {
  return getCompanyPathStatusImpl(rootPath)
}
```

- [ ] **Step 2: Create the create-from-template action**

Create `lib/create-company-from-template.ts`:

```ts
"use server"

import { createCompanyFromTemplateImpl } from "./create-company-from-template-impl"
import type { RegisteredCompany } from "./companies-registry"
import { AGENTS } from "./config"

export async function createCompanyFromTemplate(
  name: string,
  rootPath: string
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  const templateAgent = AGENTS.find((a) => a.id === "ai-company-starter-main")
  if (!templateAgent) {
    return { ok: false, message: "Template source (ai-company-starter-main) is not configured" }
  }
  return createCompanyFromTemplateImpl(name, rootPath, templateAgent.rootPath)
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add lib/get-company-path-status.ts lib/create-company-from-template.ts
git commit -m "feat: add public Server Actions for the create-company flow"
```

---

### Task 5: `AddCompanyForm` UI

**Files:**
- Modify: `components/add-company-form.tsx` (full replacement)

**Interfaces:**
- Consumes: `registerCompany` (existing, unchanged), `getCompanyPathStatus`
  and `createCompanyFromTemplate` (Task 4).
- Produces: `AddCompanyForm` — same exported name, same zero props, so
  `app/page.tsx` needs no changes.

- [ ] **Step 1: Read the current file**

Read `components/add-company-form.tsx` in full — confirm it matches the
v14 shape (a collapsed `Button` when `!open`, then a form with Name/Local
directory path `Input`s, an "Add company"/"Cancel" button pair calling
`registerCompany`, using `open`/`name`/`rootPath`/`pending`/`message`
state). If it has drifted, stop and reconcile before editing.

- [ ] **Step 2: Replace the file contents**

Replace all of `components/add-company-form.tsx` with:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { registerCompany } from "@/lib/register-company"
import { getCompanyPathStatus } from "@/lib/get-company-path-status"
import { createCompanyFromTemplate } from "@/lib/create-company-from-template"

export function AddCompanyForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [rootPath, setRootPath] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false)

  async function handleSubmit() {
    setPending(true)
    setMessage(null)
    const status = await getCompanyPathStatus(rootPath)
    if (status === "creatable") {
      setPending(false)
      setConfirmCreateOpen(true)
      return
    }
    const result = await registerCompany(name, rootPath)
    setPending(false)
    if (result.ok) {
      setName("")
      setRootPath("")
      setMessage(`Registered "${result.company.name}"`)
      setOpen(false)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  async function handleConfirmCreate() {
    setConfirmCreateOpen(false)
    setPending(true)
    setMessage(null)
    const result = await createCompanyFromTemplate(name, rootPath)
    setPending(false)
    if (result.ok) {
      setName("")
      setRootPath("")
      setMessage(`Created and registered "${result.company.name}"`)
      setOpen(false)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add a company
      </Button>
    )
  }

  return (
    <div className="max-w-sm space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Add a company</h2>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Second Co" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Local directory path</label>
        <Input
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          placeholder="/Users/you/AI-Native/second-co"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={pending || !name || !rootPath}>
          {pending ? "Adding…" : "Add company"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}

      <AlertDialog open={confirmCreateOpen} onOpenChange={setConfirmCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create this company?</AlertDialogTitle>
            <AlertDialogDescription>
              <code>{rootPath}</code> doesn&apos;t exist yet. Create &quot;{name}&quot; here from the
              ai-company-starter-main template?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCreate}>Create &amp; register</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 3: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all 202 tests still pass (this task adds no new tests — see
Task 6 for live UI verification)

- [ ] **Step 4: Commit**

```bash
git add components/add-company-form.tsx
git commit -m "feat: offer to create a company from the template when its path doesn't exist yet"
```

---

### Task 6: README and final verification

**Files:**
- Modify: `README.md` (append a new section after the most recent
  existing entry)

- [ ] **Step 1: Read the current README's most recent section**

Read the end of `README.md` to find the most recently appended section
(the v16 entry, if this plan runs right after v16) and match its heading
style (`## vNN: <short title>`).

- [ ] **Step 2: Append the v17 section**

Add, after the last existing section:

```markdown
## v17: create a company from the template

"Add a company" (v11) could only register a directory that already had
`.git` and `.claude` — there was no way to create one. This slice adds
that: when the typed path doesn't exist yet (but its parent directory
does), the form now offers to scaffold it from `ai-company-starter-main`'s
generic parts before registering it, instead of immediately erroring.

`ai-company-starter-main` is simultaneously this template's origin *and*
a real, working company (real ontology data, real session history, real
decisions) — so this isn't a blind directory copy. An explicit manifest
(`lib/company-template-manifest.ts`) lists exactly which ~40 paths are
genuinely generic (`.claude/*`, `docs/templates`, `scripts/verify.py`,
empty `definitions/`/`notes/` structure, etc.) and copies only those;
everything else (the real ontology, real decisions, the teaching
`examples/` demo, an unrelated leftover project's `.kiro/specs/`, the
optional `tools/office/` visualization plugin) is never touched. A fresh
`HANDOFF.md` is generated rather than copying the real 172-line session
history. The new directory gets its own `git init` and initial commit,
then registers through the existing, unmodified `registerCompanyImpl`.

This is piece 1 of a larger roadmap toward a Fleece.ai-style onboarding
experience built on `ai-company-starter-main` as the core: guided
company-context setup (v18), integrations setup (v19), and guided
command/workflow discovery (v20) are named but not yet designed.
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit` — expect no errors
Run: `npx vitest run` — expect all 202 tests passing
Run: `npm run build` — expect a clean production build

- [ ] **Step 4: Live visual + functional verification**

Start a dev server on an unused port. Using Playwright (or equivalent),
against a **disposable `/tmp` target directory only** — never write
anywhere under the real `ai-company-starter-main`, `plh-takeshi-agent`,
or `plh-ops`:

1. Open "Add a company", type a name and a path under `/tmp` that
   doesn't exist yet (its parent, `/tmp` itself, does exist). Click "Add
   company" — confirm the new "Create this company?" dialog appears
   (not the old "Path is not a git repository" error).
2. Click "Create & register" — confirm the form closes, a 4th agent card
   appears for the new company, and on disk the target directory now has
   `.git`, `.claude/commands/`, `.claude/skills/`, a fresh `HANDOFF.md`
   (containing the generic preamble, not any real session history), and
   does **not** have `examples/`, `.kiro/`, `tools/office/`, or a filled
   `definitions/ontology/company.yaml`.
3. Confirm `git -C <target> log --oneline` shows exactly one commit.
4. Remove the test company via the existing "Remove" button, then delete
   the disposable `/tmp` directory.
5. Repeat the original failing scenario from before this slice — a path
   whose parent *also* doesn't exist — confirm it still shows today's
   existing "Path does not exist or is not a directory" error, unchanged.
6. Take one screenshot of the new confirmation dialog for the record.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document v17 create-a-company-from-template in README"
```
