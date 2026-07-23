# Control Panel v8: Run ai-company-starter-main Commands — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the dashboard spawn a real, tightly-sandboxed headless Claude Code session for 5 of `ai-company-starter-main`'s commands (`digest`, `decision`, `retro`, `define-company`, `handoff`), then show the user a diff of whatever it wrote and let them confirm-and-commit through the existing single-file-scoped commit path — never letting the spawned agent commit, run Bash, or touch anything outside one known location itself.

**Architecture:** A small per-command registry (`lib/company-commands/registry.ts`) drives everything: field forms, prompt construction, and where output is expected. Spawning (`run-company-command(-impl).ts`) mirrors `trigger-poll-impl.ts`'s `SpawnFn` DI pattern with `--disallowedTools Bash` and `--add-dir` scoped to the command's one output location. A global lock (`run-lock.ts`) serializes runs. After a run, `company-command-result(-impl).ts` diffs a before/after snapshot to find what changed, and `commit-company-command-result(-impl).ts` commits it via the existing, unmodified `git-commit-file.ts` helper — reusing `resolveWithinAgentRoot` from `path-guard.ts` for containment. All new UI lives in one new component (`company-command-runner.tsx`) wired into `SkillBrowser`'s existing detail Sheet as a third "Run" tab.

**Tech Stack:** Next.js 15 Server Actions, `node:child_process` spawn/execFile with dependency-injected fakes, Vitest with real temp-dir fixtures, existing `DiffView`/shadcn `Textarea`/`AlertDialog` components.

## Global Constraints

- **No Bash for the spawned agent, ever** — enforced via `--disallowedTools "Bash"` on every `claude -p` invocation this slice adds, for all 5 commands, no exceptions.
- **`--add-dir` must scope `Write` to exactly the command's declared output location** — never the whole repo root, except for `handoff` where the output file (`HANDOFF.md`) legitimately lives at the repo root.
- **The spawned agent never commits.** Only `commit-company-command-result(-impl).ts`, via the existing unmodified `git-commit-file.ts`, ever runs `git add`/`git commit`, and only after the user confirms a diff dialog.
- **Every prompt template's fixed instruction text precedes any interpolated field value** — a field value must never be the entire prompt string by itself.
- **Zero-extra-parameter Server Actions**: every `"use server"` export in this slice takes only real domain parameters (`commandId`, `fieldValues`, `relativeOutputPath`) — injectable seams (`spawnFn`, `execFn`, `dataDir`) live only on the corresponding `-impl.ts` function, with real defaults.
- **Company-command bookkeeping (lock file, run-record JSON, log file) lives in the control-panel repo's own `.data/company-runs/` directory** (gitignored), never inside `ai-company-starter-main` — that repo must never see control-panel-specific artifacts in its `git status`.
- **TDD with real temp-dir fixtures** (`mkdtemp`/`writeFile`/`rm`) for every new `lib/` file — no checked-in fixture files, matching every prior slice.
- Scope is exactly `digest`, `decision`, `retro`, `define-company`, `handoff`. `create-epic`, `ingest-context`, and `office` are out of scope for this slice (see the design spec's Problem section for why) — do not build anything for them.

---

### Task 1: Types, registry, and shared paths

**Files:**
- Create: `lib/company-commands/types.ts`
- Create: `lib/company-commands/paths.ts`
- Create: `lib/company-commands/registry.ts`
- Create: `lib/company-commands/registry.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `CompanyCommandField`, `CompanyCommand` types; `COMPANY_COMMANDS: CompanyCommand[]`; `getCompanyCommand(id: string): CompanyCommand | undefined`; `COMPANY_COMMANDS_DATA_DIR: string` — every later task imports from here.

- [ ] **Step 1: Write `lib/company-commands/types.ts`**

```ts
export type CompanyCommandField = {
  key: string
  label: string
  required: boolean
  multiline: boolean
  placeholder?: string
}

export type CompanyCommandOutputKind = "new-file-in-dir" | "known-file"

export type CompanyCommand = {
  id: string
  commandFileName: string
  label: string
  fields: CompanyCommandField[]
  outputKind: CompanyCommandOutputKind
  outputPath: string
  needsPrefetch: boolean
  buildPrompt: (fieldValues: Record<string, string>, today: string, prefetch: string) => string
}
```

- [ ] **Step 2: Write `lib/company-commands/paths.ts`**

```ts
import path from "node:path"

export const COMPANY_COMMANDS_DATA_DIR = path.join(process.cwd(), ".data", "company-runs")
```

- [ ] **Step 3: Add `.data/` to `.gitignore`**

Append to the existing `.gitignore` (do not remove any existing line):
```
.data/
```

- [ ] **Step 4: Write `lib/company-commands/registry.ts`**

```ts
import type { CompanyCommand } from "./types"

export const COMPANY_COMMANDS: CompanyCommand[] = [
  {
    id: "digest",
    commandFileName: "digest.md",
    label: "Weekly digest",
    fields: [
      {
        key: "period",
        label: "Period (optional — defaults to the last 7 days)",
        required: false,
        multiline: false,
        placeholder: "e.g. last 7 days",
      },
    ],
    outputKind: "new-file-in-dir",
    outputPath: "notes/company/digests",
    needsPrefetch: false,
    buildPrompt: (fields, today) => `Run this repository's /digest command as described in .claude/commands/digest.md.

Today's date is ${today}. Aggregate scope: ${fields.period?.trim() || "the last 7 days"}.

Scan notes/company/**/*.md (excluding notes/company/digests/), notes/market/**/*.md, notes/clients/**/*.md, notes/sops/**/*.md, docs/decisions/*.md, and docs/retros/*.md for frontmatter created:/updated: dates within the aggregate scope. Count unprocessed notes in notes/inbox/ (excluding README.md) and flag any older than 7 days. Flag any notes/market/**/*.md whose observed_at: is more than 90 days old.

Write the result to notes/company/digests/${today}-digest.md following the exact template structure in .claude/commands/digest.md's "進め方" step 5 (frontmatter with type: digest, status: active, created/updated: ${today}, tags: []; a warning banner that this file is aggregated output, not source of truth; sections for new/updated notes by category, inbox backlog, market freshness warnings, and suggested next actions). Create notes/company/digests/ first if it doesn't exist. Write exactly one file and stop — do not run any other commands.`,
  },
  {
    id: "decision",
    commandFileName: "decision.md",
    label: "Record a decision (RFC)",
    fields: [
      { key: "context", label: "Context", required: true, multiline: true, placeholder: "What situation or constraint made this decision necessary?" },
      { key: "decision", label: "Decision", required: true, multiline: true, placeholder: "What was decided? State it as one clear sentence." },
      { key: "rationale", label: "Rationale", required: true, multiline: true, placeholder: "Why is this the best choice?" },
      { key: "alternatives", label: "Alternatives considered", required: true, multiline: true, placeholder: "What else was considered, and why wasn't it chosen?" },
      { key: "consequences", label: "Consequences", required: true, multiline: true, placeholder: "What changes as a result, good and bad?" },
    ],
    outputKind: "new-file-in-dir",
    outputPath: "docs/decisions",
    needsPrefetch: false,
    buildPrompt: (fields, today) => `Run this repository's /decision command as described in .claude/commands/decision.md.

Today's date is ${today}. Generate a short slug (alphanumeric and hyphens only, 2-4 words) summarizing the decision below, and write docs/decisions/${today}-<slug>.md with this frontmatter and structure:

---
date: ${today}
status: proposed
type: decision
created: ${today}
updated: ${today}
tags: []
---

# <a short title for the decision>

## Context

${fields.context}

## Decision

${fields.decision}

## Rationale

${fields.rationale}

## Alternatives Considered

${fields.alternatives}

## Consequences

${fields.consequences}

Leave status as "proposed" — there is no user available in this run to confirm "accepted." Write exactly one file and stop — do not run any other commands.`,
  },
  {
    id: "retro",
    commandFileName: "retro.md",
    label: "Retrospective (KPT)",
    fields: [
      { key: "keep", label: "Keep — what worked, what should continue", required: true, multiline: true },
      { key: "problem", label: "Problem — what got stuck or was inefficient", required: true, multiline: true },
      { key: "try", label: "Try — 1-3 improvements for next cycle", required: true, multiline: true },
    ],
    outputKind: "new-file-in-dir",
    outputPath: "docs/retros",
    needsPrefetch: false,
    buildPrompt: (fields, today) => `Run this repository's /retro command as described in .claude/commands/retro.md.

Today's date is ${today}. If docs/templates/retrospective-template.yaml exists, read it for structure context, but proceed even if it doesn't. Write docs/retros/${today}-retro.md (creating docs/retros/ first if needed) with this frontmatter and structure:

---
type: retro
status: active
created: ${today}
updated: ${today}
tags: []
---

# Retro ${today}

## Keep

- ${fields.keep}

## Problem

- ${fields.problem}

## Try

- ${fields.try}

## Next actions

- [ ] <turn the Try items above into concrete next actions>

Be honest in Problem — don't varnish over what didn't work. Write exactly one file and stop — do not run any other commands.`,
  },
  {
    id: "define-company",
    commandFileName: "define-company.md",
    label: "Define company ontology",
    fields: [
      { key: "domain", label: "Business domain — what problem does the company solve?", required: true, multiline: true },
      { key: "stakeholders", label: "Key stakeholders — who are the customers/employees/partners and their roles?", required: true, multiline: true },
      { key: "valueFlow", label: "Core value flow — input, transform, output", required: true, multiline: true },
      { key: "bottleneck", label: "Current biggest bottleneck", required: true, multiline: true },
    ],
    outputKind: "known-file",
    outputPath: "definitions/ontology/company.yaml",
    needsPrefetch: false,
    buildPrompt: (fields, today) => `Run this repository's /define-company command as described in .claude/commands/define-company.md.

Read docs/templates/ontology-starter.yaml first for the customer/org/product 3-domain structure this file should follow. Do not edit that template — only write definitions/ontology/company.yaml.

Business domain: ${fields.domain}
Key stakeholders: ${fields.stakeholders}
Core value flow: ${fields.valueFlow}
Current biggest bottleneck: ${fields.bottleneck}

Today's date is ${today}. Write definitions/ontology/company.yaml following the starter template's structure (version, schema_version: "${today}-company", template_origin, status: draft, company_summary, stakeholders, value_flow, then customer/org/product domains filled in from the answers above). Do not write real names, amounts, or contact details directly into attributes — use band expressions (e.g. amount_band) for money and keep genuinely sensitive data out of this file. It is fine to leave some fields as a best-effort draft (status: draft) if the answers above don't fully cover every field. Write exactly one file and stop — do not run any other commands, and do not attempt to git add or commit anything.`,
  },
  {
    id: "handoff",
    commandFileName: "handoff.md",
    label: "Session handoff",
    fields: [
      { key: "blockers", label: "Blockers (optional — leave blank if none)", required: false, multiline: true },
    ],
    outputKind: "known-file",
    outputPath: "HANDOFF.md",
    needsPrefetch: true,
    buildPrompt: (fields, today, prefetch) => `Run this repository's /handoff command as described in .claude/commands/handoff.md.

Today's date is ${today}. You have no Bash access in this run, so here is the pre-fetched context you'd otherwise gather yourself:

${prefetch}

If HANDOFF.md exists, read it first and append a new dated section at the end without disturbing existing sections (if there's already a section for today's date, add a "(2)" suffix to the new heading instead of duplicating it). If it doesn't exist, create it.

Add a section:

## ${today}

### Done today
<summarize the git log above>

### In flight
<work started but not finished, if inferable from the log/issues above — otherwise "None apparent from available context">

### Next up
<open issues from the list above, prioritized, or "None apparent from available context">

### Blockers
${fields.blockers?.trim() || "None (autonomous run — not confirmed with a user; verify and correct if inaccurate)"}

If the file now has more than 5 dated sections (headings starting with "## "), move the oldest excess sections to docs/handoffs/<YYYY-MM>.md (the month of that section's date), creating it with a "# HANDOFF archive <YYYY-MM>" heading if needed, appending in chronological order, and removing them from HANDOFF.md itself. Write the file(s) and stop — do not run any other commands, and do not attempt to git add or commit anything.`,
  },
]

export function getCompanyCommand(id: string): CompanyCommand | undefined {
  return COMPANY_COMMANDS.find((c) => c.id === id)
}
```

- [ ] **Step 5: Write `lib/company-commands/registry.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { COMPANY_COMMANDS, getCompanyCommand } from "./registry"

describe("COMPANY_COMMANDS registry", () => {
  it("has exactly the 5 in-scope commands", () => {
    expect(COMPANY_COMMANDS.map((c) => c.id).sort()).toEqual(
      ["decision", "define-company", "digest", "handoff", "retro"].sort()
    )
  })

  it("every command's required fields are all present in its own buildPrompt output", () => {
    for (const command of COMPANY_COMMANDS) {
      const values: Record<string, string> = {}
      for (const field of command.fields) {
        values[field.key] = field.required ? `TEST_VALUE_${field.key}` : ""
      }
      const prompt = command.buildPrompt(values, "2026-07-23", "TEST_PREFETCH")
      for (const field of command.fields.filter((f) => f.required)) {
        expect(prompt).toContain(`TEST_VALUE_${field.key}`)
      }
    }
  })

  it("only handoff declares needsPrefetch", () => {
    const withPrefetch = COMPANY_COMMANDS.filter((c) => c.needsPrefetch).map((c) => c.id)
    expect(withPrefetch).toEqual(["handoff"])
  })

  it("getCompanyCommand returns undefined for an unknown id", () => {
    expect(getCompanyCommand("create-epic")).toBeUndefined()
    expect(getCompanyCommand("nonexistent")).toBeUndefined()
  })

  it("getCompanyCommand returns the matching entry for a known id", () => {
    expect(getCompanyCommand("digest")?.outputPath).toBe("notes/company/digests")
  })
})
```

- [ ] **Step 6: Run the new test file**

Run: `npx vitest run lib/company-commands/registry.test.ts`
Expected: 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/company-commands/types.ts lib/company-commands/paths.ts lib/company-commands/registry.ts lib/company-commands/registry.test.ts .gitignore
git commit -m "feat: add company-command registry (digest, decision, retro, define-company, handoff)"
```

---

### Task 2: Run lock

**Files:**
- Create: `lib/company-commands/run-lock.ts`
- Create: `lib/company-commands/run-lock.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 directly (takes a `dataDir` string parameter, not the `COMPANY_COMMANDS_DATA_DIR` constant, so it stays independently testable).
- Produces: `acquireRunLock(dataDir: string): Promise<boolean>`, `releaseRunLock(dataDir: string): Promise<void>`, `checkRunLockStatus(dataDir: string): Promise<{ running: boolean }>` — Task 3 and the status action consume these.

- [ ] **Step 1: Write the failing test `lib/company-commands/run-lock.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { acquireRunLock, releaseRunLock, checkRunLockStatus } from "./run-lock"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "run-lock-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("run-lock", () => {
  it("reports not running when no lock exists", async () => {
    expect(await checkRunLockStatus(root)).toEqual({ running: false })
  })

  it("acquires the lock, creating the data dir if needed, and reports running", async () => {
    const acquired = await acquireRunLock(root)
    expect(acquired).toBe(true)
    expect(await checkRunLockStatus(root)).toEqual({ running: true })
    const lockContent = await readFile(path.join(root, "company-command.lock"), "utf-8")
    expect(lockContent).toBe(String(process.pid))
  })

  it("fails to acquire a second time while the lock is held", async () => {
    expect(await acquireRunLock(root)).toBe(true)
    expect(await acquireRunLock(root)).toBe(false)
  })

  it("releases the lock, allowing a subsequent acquire to succeed", async () => {
    await acquireRunLock(root)
    await releaseRunLock(root)
    expect(await checkRunLockStatus(root)).toEqual({ running: false })
    expect(await acquireRunLock(root)).toBe(true)
  })

  it("releasing a lock that doesn't exist does not throw", async () => {
    await expect(releaseRunLock(root)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/company-commands/run-lock.test.ts`
Expected: FAIL — `./run-lock` module not found.

- [ ] **Step 3: Write `lib/company-commands/run-lock.ts`**

```ts
import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

function lockPath(dataDir: string): string {
  return path.join(dataDir, "company-command.lock")
}

export async function checkRunLockStatus(dataDir: string): Promise<{ running: boolean }> {
  try {
    await writeFile(lockPath(dataDir), "", { flag: "r+" })
    return { running: true }
  } catch {
    return { running: false }
  }
}

export async function acquireRunLock(dataDir: string): Promise<boolean> {
  await mkdir(dataDir, { recursive: true })
  try {
    await writeFile(lockPath(dataDir), String(process.pid), { flag: "wx" })
    return true
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "EEXIST") {
      return false
    }
    throw err
  }
}

export async function releaseRunLock(dataDir: string): Promise<void> {
  await unlink(lockPath(dataDir)).catch(() => {})
}
```

Note: `checkRunLockStatus` uses `writeFile(..., { flag: "r+" })` (open for read/write, don't create, don't truncate) purely as an existence probe that doesn't mutate the file's content — a plain `access()` from `node:fs/promises` would be equally correct and is preferred if it's available in the codebase's Node target; use `access` instead if you confirm it behaves identically here (it does — either is fine, but do not use a flag that truncates or creates the file, since that would corrupt the pid content or defeat `acquireRunLock`'s exclusive-create check).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/company-commands/run-lock.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/company-commands/run-lock.ts lib/company-commands/run-lock.test.ts
git commit -m "feat: add company-command run lock (atomic acquire/release)"
```

---

### Task 3: Spawn Server Action (with handoff's prefetch)

**Files:**
- Create: `lib/company-commands/run-company-command-impl.ts`
- Create: `lib/company-commands/run-company-command.ts`
- Create: `lib/company-commands/company-command-status.ts`
- Create: `lib/company-commands/run-company-command-impl.test.ts`

**Interfaces:**
- Consumes: `getCompanyCommand` (Task 1), `acquireRunLock`/`releaseRunLock` (Task 2), `AGENTS` from `../config`.
- Produces: `runCompanyCommand(commandId, fieldValues): Promise<{started, message}>` (the public action Task 6's UI calls), `getCompanyCommandStatus(): Promise<{running}>` (Task 6's UI polls this), and the `.run.json` record file Task 4 reads.

- [ ] **Step 1: Write the failing test `lib/company-commands/run-company-command-impl.test.ts`**

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
    const result = await runCompanyCommandImpl("create-epic", {}, fakeSpawn(calls), undefined, dataDir)

    expect(result).toEqual({ started: false, message: 'Unknown command "create-epic"' })
    expect(calls).toHaveLength(0)
  })

  it("rejects a run missing a required field", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl("retro", { keep: "x", problem: "y" }, fakeSpawn(calls), undefined, dataDir)

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
      fakeSpawn(calls),
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: false, message: 'Unknown field "bogus"' })
    expect(calls).toHaveLength(0)
  })

  it("spawns claude with -p, --add-dir scoped to the output dir, and Bash disallowed, for a new-file-in-dir command", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: { cwd: string; detached: boolean } }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("claude")
    expect(calls[0].args).toContain("-p")
    expect(calls[0].args).toContain("--add-dir")
    expect(calls[0].args[calls[0].args.indexOf("--add-dir") + 1]).toBe(path.join(root, "notes/company/digests"))
    expect(calls[0].args).toContain("--disallowedTools")
    expect(calls[0].args[calls[0].args.indexOf("--disallowedTools") + 1]).toBe("Bash")
    expect(calls[0].options.cwd).toBe(root)
    expect(calls[0].options.detached).toBe(true)

    const record = JSON.parse(await readFile(path.join(dataDir, "digest.run.json"), "utf-8"))
    expect(record).toEqual({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [] })
  })

  it("scopes --add-dir to the containing directory for a known-file command", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "definitions", "ontology"), { recursive: true })
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "define-company",
      { domain: "d", stakeholders: "s", valueFlow: "v", bottleneck: "b" },
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls[0].args[calls[0].args.indexOf("--add-dir") + 1]).toBe(path.join(root, "definitions", "ontology"))
  })

  it("does not spawn and reports 'Already running' when the lock is already held", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { acquireRunLock } = await import("./run-lock")
    await acquireRunLock(dataDir)
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl("digest", { period: "" }, fakeSpawn(calls), undefined, dataDir)

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
    const result = await runCompanyCommandImpl("digest", { period: "" }, throwingSpawn as never, undefined, dataDir)

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
    const result = await runCompanyCommandImpl("handoff", {}, fakeSpawn(calls) as never, fakeExec, dataDir)

    expect(result).toEqual({ started: true, message: "Started" })
    const promptIndex = calls[0].args.indexOf("-p") + 1
    expect(calls[0].args[promptIndex]).toContain("gh unavailable or not authenticated")
  })

  it("reports an error when ai-company-starter-main isn't configured", async () => {
    vi.doMock("../config", () => ({ AGENTS: [] }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const result = await runCompanyCommandImpl("digest", { period: "" }, undefined, undefined, dataDir)

    expect(result).toEqual({ started: false, message: 'Agent "ai-company-starter-main" is not configured' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/company-commands/run-company-command-impl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/company-commands/run-company-command-impl.ts`**

```ts
import { spawn as nodeSpawn, execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { openSync, closeSync } from "node:fs"
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { AGENTS } from "../config"
import { getCompanyCommand } from "./registry"
import type { CompanyCommand } from "./types"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { acquireRunLock, releaseRunLock } from "./run-lock"

const execFileAsync = promisify(nodeExecFile)
const AI_COMPANY_STARTER_MAIN_ID = "ai-company-starter-main"
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
  spawnFn: SpawnFn = defaultSpawn,
  execFn: ExecFileFn = defaultExecFile,
  dataDir: string = COMPANY_COMMANDS_DATA_DIR
): Promise<{ started: boolean; message: string }> {
  const command = getCompanyCommand(commandId)
  if (!command) {
    return { started: false, message: `Unknown command "${commandId}"` }
  }

  const fieldError = validateFields(command, fieldValues)
  if (fieldError) {
    return { started: false, message: fieldError }
  }

  const agent = AGENTS.find((a) => a.id === AI_COMPANY_STARTER_MAIN_ID)
  if (!agent) {
    return { started: false, message: `Agent "${AI_COMPANY_STARTER_MAIN_ID}" is not configured` }
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

    const addDirAbs =
      command.outputKind === "known-file"
        ? path.join(agent.rootPath, path.dirname(command.outputPath))
        : path.join(agent.rootPath, command.outputPath)

    const logPath = path.join(dataDir, `${command.id}.log`)
    outFd = openSync(logPath, "a")
    const child = spawnFn(
      "claude",
      [
        "-p",
        prompt,
        "--add-dir",
        addDirAbs,
        "--allowedTools",
        "Read,Grep,Glob,Write",
        "--disallowedTools",
        "Bash",
        "--permission-mode",
        "acceptEdits",
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

Note for the reviewer: this spawns with a single combined stdout+stderr log file (one `outFd` used for both `stdio` slots), unlike `trigger-poll-impl.ts`'s two separate files — that's intentional (a single merged log is all this feature needs for diagnostic tail-viewing), so expect exactly one `closeSync` call per invocation here, not two.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/company-commands/run-company-command-impl.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Write `lib/company-commands/run-company-command.ts`**

```ts
"use server"

import { runCompanyCommandImpl } from "./run-company-command-impl"

export async function runCompanyCommand(
  commandId: string,
  fieldValues: Record<string, string>
): Promise<{ started: boolean; message: string }> {
  return runCompanyCommandImpl(commandId, fieldValues)
}
```

- [ ] **Step 6: Write `lib/company-commands/company-command-status.ts`**

```ts
"use server"

import { checkRunLockStatus } from "./run-lock"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"

export async function getCompanyCommandStatus(): Promise<{ running: boolean }> {
  return checkRunLockStatus(COMPANY_COMMANDS_DATA_DIR)
}
```

- [ ] **Step 7: Run the full test suite so far**

Run: `npx vitest run`
Expected: all existing tests plus this task's new tests pass, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add lib/company-commands/run-company-command-impl.ts lib/company-commands/run-company-command.ts lib/company-commands/company-command-status.ts lib/company-commands/run-company-command-impl.test.ts
git commit -m "feat: spawn a sandboxed headless claude session per company command"
```

---

### Task 4: Result detection

**Files:**
- Create: `lib/company-commands/company-command-result-impl.ts`
- Create: `lib/company-commands/company-command-result.ts`
- Create: `lib/company-commands/company-command-result-impl.test.ts`

**Interfaces:**
- Consumes: the `.run.json` record file Task 3 writes.
- Produces: `CompanyCommandResult` type, `getCompanyCommandResultImpl(commandId, dataDir, agentRootPath)`, `getCompanyCommandResult(commandId)` — Task 6's UI calls the latter after polling shows the run finished.

- [ ] **Step 1: Write the failing test `lib/company-commands/company-command-result-impl.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getCompanyCommandResultImpl } from "./company-command-result-impl"

let dataDir: string
let agentRoot: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "company-result-data-"))
  agentRoot = await mkdtemp(path.join(tmpdir(), "company-result-agent-"))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  await rm(agentRoot, { recursive: true, force: true })
})

describe("getCompanyCommandResultImpl", () => {
  it("reports no run recorded when the run.json file doesn't exist", async () => {
    const result = await getCompanyCommandResultImpl("digest", dataDir, agentRoot)
    expect(result).toEqual({ changed: false, message: "No run recorded for this command yet." })
  })

  it("detects a new file in a new-file-in-dir command's output directory", async () => {
    await mkdir(path.join(agentRoot, "notes/company/digests"), { recursive: true })
    await writeFile(
      path.join(dataDir, "digest.run.json"),
      JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [] })
    )
    await writeFile(path.join(agentRoot, "notes/company/digests/2026-07-23-digest.md"), "# Digest\ncontent")

    const result = await getCompanyCommandResultImpl("digest", dataDir, agentRoot)

    expect(result).toEqual({
      changed: true,
      outputPath: path.join("notes/company/digests", "2026-07-23-digest.md"),
      oldText: "",
      newText: "# Digest\ncontent",
      extraFiles: [],
    })
  })

  it("reports no changes when no new file appears in the output directory", async () => {
    await mkdir(path.join(agentRoot, "docs/retros"), { recursive: true })
    await writeFile(path.join(agentRoot, "docs/retros/2026-07-01-retro.md"), "old")
    await writeFile(
      path.join(dataDir, "retro.run.json"),
      JSON.stringify({ commandId: "retro", outputKind: "new-file-in-dir", outputPath: "docs/retros", before: ["2026-07-01-retro.md"] })
    )

    const result = await getCompanyCommandResultImpl("retro", dataDir, agentRoot)

    expect(result).toEqual({ changed: false, message: "No changes produced." })
  })

  it("lists extra files beyond the primary one, sorted, if more than one new file appears", async () => {
    await mkdir(path.join(agentRoot, "docs/decisions"), { recursive: true })
    await writeFile(
      path.join(dataDir, "decision.run.json"),
      JSON.stringify({ commandId: "decision", outputKind: "new-file-in-dir", outputPath: "docs/decisions", before: [] })
    )
    await writeFile(path.join(agentRoot, "docs/decisions/b-second.md"), "second")
    await writeFile(path.join(agentRoot, "docs/decisions/a-first.md"), "first")

    const result = await getCompanyCommandResultImpl("decision", dataDir, agentRoot)

    expect(result).toEqual({
      changed: true,
      outputPath: path.join("docs/decisions", "a-first.md"),
      oldText: "",
      newText: "first",
      extraFiles: ["b-second.md"],
    })
  })

  it("detects a content change for a known-file command", async () => {
    await mkdir(path.join(agentRoot, "definitions/ontology"), { recursive: true })
    await writeFile(path.join(agentRoot, "definitions/ontology/company.yaml"), "version: 1\nstatus: draft\n")
    await writeFile(
      path.join(dataDir, "define-company.run.json"),
      JSON.stringify({
        commandId: "define-company",
        outputKind: "known-file",
        outputPath: "definitions/ontology/company.yaml",
        before: null,
      })
    )

    const result = await getCompanyCommandResultImpl("define-company", dataDir, agentRoot)

    expect(result).toEqual({
      changed: true,
      outputPath: "definitions/ontology/company.yaml",
      oldText: "",
      newText: "version: 1\nstatus: draft\n",
      extraFiles: [],
    })
  })

  it("reports no changes for a known-file command whose content is unchanged", async () => {
    await writeFile(path.join(agentRoot, "HANDOFF.md"), "# HANDOFF\nsame content\n")
    await writeFile(
      path.join(dataDir, "handoff.run.json"),
      JSON.stringify({ commandId: "handoff", outputKind: "known-file", outputPath: "HANDOFF.md", before: "# HANDOFF\nsame content\n" })
    )

    const result = await getCompanyCommandResultImpl("handoff", dataDir, agentRoot)

    expect(result).toEqual({ changed: false, message: "No changes produced." })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/company-commands/company-command-result-impl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/company-commands/company-command-result-impl.ts`**

```ts
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

export type CompanyCommandResult =
  | { changed: true; outputPath: string; oldText: string; newText: string; extraFiles: string[] }
  | { changed: false; message: string }

type RunRecord = {
  commandId: string
  outputKind: "new-file-in-dir" | "known-file"
  outputPath: string
  before: string[] | string | null
}

export async function getCompanyCommandResultImpl(
  commandId: string,
  dataDir: string,
  agentRootPath: string
): Promise<CompanyCommandResult> {
  let record: RunRecord
  try {
    const raw = await readFile(path.join(dataDir, `${commandId}.run.json`), "utf-8")
    record = JSON.parse(raw)
  } catch {
    return { changed: false, message: "No run recorded for this command yet." }
  }

  const absPath = path.join(agentRootPath, record.outputPath)

  if (record.outputKind === "new-file-in-dir") {
    const before = Array.isArray(record.before) ? record.before : []
    let current: string[]
    try {
      current = await readdir(absPath)
    } catch {
      current = []
    }
    const newFiles = current.filter((name) => !before.includes(name)).sort()
    if (newFiles.length === 0) {
      return { changed: false, message: "No changes produced." }
    }
    const [primary, ...rest] = newFiles
    const newText = await readFile(path.join(absPath, primary), "utf-8")
    return { changed: true, outputPath: path.join(record.outputPath, primary), oldText: "", newText, extraFiles: rest }
  }

  const before = typeof record.before === "string" ? record.before : ""
  let current: string
  try {
    current = await readFile(absPath, "utf-8")
  } catch {
    current = ""
  }
  if (current === before) {
    return { changed: false, message: "No changes produced." }
  }
  return { changed: true, outputPath: record.outputPath, oldText: before, newText: current, extraFiles: [] }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/company-commands/company-command-result-impl.test.ts`
Expected: PASS, all 6 cases.

- [ ] **Step 5: Write `lib/company-commands/company-command-result.ts`**

```ts
"use server"

import { getCompanyCommandResultImpl } from "./company-command-result-impl"
import type { CompanyCommandResult } from "./company-command-result-impl"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { AGENTS } from "../config"

const AI_COMPANY_STARTER_MAIN_ID = "ai-company-starter-main"

export async function getCompanyCommandResult(commandId: string): Promise<CompanyCommandResult> {
  const agent = AGENTS.find((a) => a.id === AI_COMPANY_STARTER_MAIN_ID)
  if (!agent) {
    return { changed: false, message: `Agent "${AI_COMPANY_STARTER_MAIN_ID}" is not configured` }
  }
  return getCompanyCommandResultImpl(commandId, COMPANY_COMMANDS_DATA_DIR, agent.rootPath)
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/company-commands/company-command-result-impl.ts lib/company-commands/company-command-result.ts lib/company-commands/company-command-result-impl.test.ts
git commit -m "feat: detect what a company-command run actually wrote"
```

---

### Task 5: Commit wrapper

**Files:**
- Create: `lib/company-commands/commit-company-command-result-impl.ts`
- Create: `lib/company-commands/commit-company-command-result.ts`
- Create: `lib/company-commands/commit-company-command-result-impl.test.ts`

**Interfaces:**
- Consumes: `getCompanyCommand` (Task 1), `resolveWithinAgentRoot` (`../path-guard.ts`, unmodified), `commitFile`/`ExecFileFn` (`../git-commit-file.ts`, unmodified), `AGENTS` (`../config`).
- Produces: `commitCompanyCommandResult(commandId, relativeOutputPath): Promise<{committed, message}>` — Task 6's UI calls this from the confirm dialog.

- [ ] **Step 1: Write the failing test `lib/company-commands/commit-company-command-result-impl.test.ts`**

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

    const result = await commitCompanyCommandResultImpl("handoff", "HANDOFF.md", fakeExec)

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

    const result = await commitCompanyCommandResultImpl("digest", "bin/poll.sh", fakeExec)

    expect(result).toEqual({ committed: false, message: 'Refusing to commit a path outside "digest"\'s expected output location' })
    expect(execCalled).toBe(false)
  })

  it("refuses an unknown commandId", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const result = await commitCompanyCommandResultImpl("create-epic", "docs/decisions/x.md")

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

    const result = await commitCompanyCommandResultImpl("retro", path.join("docs/retros", "2026-07-23-retro.md"), fakeExec)

    expect(result).toEqual({ committed: false, message: "nothing to commit" })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/company-commands/commit-company-command-result-impl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/company-commands/commit-company-command-result-impl.ts`**

```ts
import { realpath } from "node:fs/promises"
import path from "node:path"
import { AGENTS } from "../config"
import { resolveWithinAgentRoot } from "../path-guard"
import { commitFile } from "../git-commit-file"
import type { ExecFileFn } from "../git-commit-file"
import { getCompanyCommand } from "./registry"

const AI_COMPANY_STARTER_MAIN_ID = "ai-company-starter-main"

export type CommitCompanyCommandResult = { committed: boolean; message: string }

export async function commitCompanyCommandResultImpl(
  commandId: string,
  relativeOutputPath: string,
  execFn?: ExecFileFn
): Promise<CommitCompanyCommandResult> {
  const command = getCompanyCommand(commandId)
  if (!command) {
    return { committed: false, message: `Unknown command "${commandId}"` }
  }

  const isWithinExpectedScope =
    command.outputKind === "new-file-in-dir"
      ? relativeOutputPath === command.outputPath || relativeOutputPath.startsWith(command.outputPath + path.sep)
      : relativeOutputPath === command.outputPath

  if (!isWithinExpectedScope) {
    return { committed: false, message: `Refusing to commit a path outside "${command.id}"'s expected output location` }
  }

  const agent = AGENTS.find((a) => a.id === AI_COMPANY_STARTER_MAIN_ID)
  if (!agent) {
    return { committed: false, message: `Agent "${AI_COMPANY_STARTER_MAIN_ID}" is not configured` }
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

  try {
    const relativeToRoot = path.relative(guard.agentRootPath, guard.realPath)
    await commitFile(guard.agentRootPath, relativeToRoot, `Run /${command.id} via AI-Native control panel`, execFn)
    return { committed: true, message: "Committed" }
  } catch (err) {
    return { committed: false, message: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/company-commands/commit-company-command-result-impl.test.ts`
Expected: PASS, all 5 cases.

- [ ] **Step 5: Write `lib/company-commands/commit-company-command-result.ts`**

```ts
"use server"

import { commitCompanyCommandResultImpl } from "./commit-company-command-result-impl"

export async function commitCompanyCommandResult(
  commandId: string,
  relativeOutputPath: string
): Promise<{ committed: boolean; message: string }> {
  return commitCompanyCommandResultImpl(commandId, relativeOutputPath)
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add lib/company-commands/commit-company-command-result-impl.ts lib/company-commands/commit-company-command-result.ts lib/company-commands/commit-company-command-result-impl.test.ts
git commit -m "feat: commit a company-command result via the existing single-file commit path"
```

---

### Task 6: UI — Run tab in SkillBrowser

**Files:**
- Create: `components/company-command-runner.tsx`
- Modify: `components/skill-browser.tsx`

**Interfaces:**
- Consumes: `CompanyCommand` (Task 1's `types.ts`), `COMPANY_COMMANDS` (Task 1's `registry.ts`), `runCompanyCommand` (Task 3), `getCompanyCommandStatus` (Task 3), `getCompanyCommandResult` (Task 4), `commitCompanyCommandResult` (Task 5), `DiffView` (existing, unmodified).
- Produces: nothing for later tasks — this is the UI integration point.

- [ ] **Step 1: Read the current `components/skill-browser.tsx` in full** (it's been touched in every prior slice — read its current state, don't assume the v7 content shown in this plan is still exactly current).

- [ ] **Step 2: Write `components/company-command-runner.tsx`**

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
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { getCompanyCommandStatus } from "@/lib/company-commands/company-command-status"
import { getCompanyCommandResult } from "@/lib/company-commands/company-command-result"
import type { CompanyCommandResult } from "@/lib/company-commands/company-command-result-impl"
import { commitCompanyCommandResult } from "@/lib/company-commands/commit-company-command-result"
import type { CompanyCommand } from "@/lib/company-commands/types"

const POLL_INTERVAL_MS = 3000

export function CompanyCommandRunner({ command }: { command: CompanyCommand }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<CompanyCommandResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [commitMessage, setCommitMessage] = useState<string | null>(null)

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function pollUntilDone() {
    const status = await getCompanyCommandStatus()
    if (status.running) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      return
    }
    setRunning(false)
    const outcome = await getCompanyCommandResult(command.id)
    setResult(outcome)
  }

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

  async function handleConfirmCommit() {
    if (!result || !result.changed) return
    setCommitting(true)
    const response = await commitCompanyCommandResult(command.id, result.outputPath)
    setCommitting(false)
    setConfirmOpen(false)
    setCommitMessage(response.message)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {command.fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-sm font-medium">
              {field.label}
              {field.required && " *"}
            </label>
            <Textarea
              rows={field.multiline ? 4 : 1}
              value={values[field.key] ?? ""}
              onChange={(e) => setField(field.key, e.target.value)}
              placeholder={field.placeholder}
              disabled={running}
            />
          </div>
        ))}
      </div>

      <Button size="sm" onClick={handleRun} disabled={running}>
        {running ? "Running…" : `Run /${command.id}`}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}

      {result && !result.changed && <p className="text-sm text-muted-foreground">{result.message}</p>}

      {result && result.changed && (
        <div className="space-y-2 border-t pt-2">
          <p className="text-sm font-medium">{result.outputPath}</p>
          <DiffView oldText={result.oldText} newText={result.newText} />
          {result.extraFiles.length > 0 && (
            <p className="text-xs text-muted-foreground">Also created (not shown): {result.extraFiles.join(", ")}</p>
          )}
          <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)} disabled={committing}>
            Confirm & commit
          </Button>
          {commitMessage && <p className="text-xs text-muted-foreground">{commitMessage}</p>}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Commit this result?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="max-h-[60vh] overflow-y-auto">
                {result && result.changed && <DiffView oldText={result.oldText} newText={result.newText} />}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCommit}>Confirm &amp; commit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 3: Wire a third "Run" tab into `components/skill-browser.tsx`**

Add these imports alongside the existing ones:
```tsx
import { COMPANY_COMMANDS } from "@/lib/company-commands/registry"
import { CompanyCommandRunner } from "@/components/company-command-runner"
```

Change the `view` state's type to include `"run"`:
```tsx
const [view, setView] = useState<"content" | "history" | "run">("content")
```

Add, immediately after the `selected`/`detail` state declarations, a computed match against the registry:
```tsx
const matchedCompanyCommand =
  selected && selected.agentId === "ai-company-starter-main"
    ? COMPANY_COMMANDS.find((c) => selected.path.endsWith(`/commands/${c.commandFileName}`))
    : undefined
```

In the tab button row (next to the existing "Content"/"History" buttons), add a third button shown only when a match exists:
```tsx
{matchedCompanyCommand && (
  <Button size="sm" variant={view === "run" ? "default" : "outline"} onClick={() => setView("run")}>
    Run
  </Button>
)}
```

In the `ScrollArea` body, alongside the existing `view === "content"` and `view === "history"` blocks, add:
```tsx
{view === "run" && matchedCompanyCommand && <CompanyCommandRunner command={matchedCompanyCommand} />}
```

Leave every other existing line (the `SkillEditor`/`SkillHistory` call sites, `openEntry`, etc.) exactly as they are — this task only adds the third tab and its match logic.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/company-command-runner.tsx components/skill-browser.tsx
git commit -m "feat: add a Run tab for company commands in the skill detail panel"
```

---

### Task 7: README and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: updated documentation, a real verified `digest` run — no new runtime code.

- [ ] **Step 1: Update `README.md`**

Read the current file in full first (it's grown across 7 prior slices). Add a new section after the most recent existing version section:

```markdown
## v8: run ai-company-starter-main commands

Five of `ai-company-starter-main`'s ten slash-commands (`digest`, `decision`,
`retro`, `define-company`, `handoff`) can now be run directly from the
`/skills` detail panel's new "Run" tab, instead of only from an interactive
`claude` session. Filling in the command's fields and clicking Run spawns a
real, headless `claude -p` session — but with Bash entirely disallowed and
its Write access scoped, via `--add-dir`, to only that command's expected
output location. The spawned agent can read/grep/glob the repository and
write to that one place; it cannot run shell commands, cannot `git commit`,
and cannot call `gh`. Once the run finishes, the dashboard diffs what
changed and shows the same confirm-with-diff dialog used everywhere else in
this app before committing anything, through the same single-file-scoped
commit path v4 already established — the agent never commits on its own.

Three commands were deliberately left out: `create-epic` (files real GitHub
issues with no further confirmation gate once started — a different design
problem than this slice solves), and `ingest-context` / `office` (hard
interactive gates and a persistent background server, respectively, neither
of which fits "run once, produce a file, exit").
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass — the prior 88 plus this slice's new ones (registry: 5, run-lock: 5, run-company-command-impl: 10, company-command-result-impl: 6, commit-company-command-result-impl: 5 — 31 new tests, 119 total; treat any different-but-reasonable count as fine as long as nothing fails).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Real live verification — `digest` only**

Run `npm run dev`, open `/skills`, select `ai-company-starter-main`'s `digest` command, open the "Run" tab. Leave the optional "Period" field blank. Click Run. Confirm:
- The button shows "Running…" and the status poll eventually clears it.
- A result appears: either a diff of a genuinely new `notes/company/digests/<today>-digest.md` file, or (acceptable) a "No changes produced" message if the agent found nothing to aggregate — either is a valid successful run, not a bug.
- If a diff appears, click "Confirm & commit," confirm the success message, and confirm via `git -C ~/AI-Native/ai-company-starter-main log --oneline -3` that exactly one new commit exists with message `Run /digest via AI-Native control panel`.
- Check `.data/company-runs/digest.log` in the control-panel repo for any sign the agent attempted a Bash command (a permission-denied message) — if so, that's expected and confirms the sandboxing is real, not a failure.
- Confirm `~/AI-Native/plh-takeshi-agent` was never touched (`git -C ~/AI-Native/plh-takeshi-agent status --short` is clean) — the sanctioned live-test surface for this slice is `ai-company-starter-main` only, same as every prior slice.

Do NOT live-test `decision`/`retro`/`define-company`/`handoff` with real content meant to be kept, and do not run them at all unless you also verify and clean up afterward — if you do exercise one, use obviously-fake placeholder field values (e.g. "TEST: placeholder, safe to delete") and remove the resulting file/section afterward (`git revert` the commit or delete-and-commit), leaving `ai-company-starter-main` net-zero for those directories, matching the discipline already established for `stock-note.md`.

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document running ai-company-starter-main commands from the dashboard"
```
