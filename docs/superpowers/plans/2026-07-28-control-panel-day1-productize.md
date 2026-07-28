# Day 1 Productize (de-PLH + bundle template + onboarding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session note:** the subagent-spawn cap (200/session) has blocked every
> dispatch this session (v14, v16–v22). If a dispatch fails with a spawn-limit
> error, implement directly: read the target file first, apply the step's code
> exactly, run the listed tests, self-review before merging.
>
> **Structure:** three slices (v23, v24, v25), each built + tested + **merged on
> its own branch** before the next starts. Each slice runs the normal
> worktree → build → verify → merge → exit-worktree flow. This one plan doc is
> shared across all three (it lives on `master`).

**Goal:** a fresh install of `control-panel` starts empty, ships no PLH/Kirirom
data, assumes no `~/AI-Native/*` path, and onboards the user to create their
first company — while the developer's own machine keeps full daily use with zero
setup.

**Architecture:** built-in agents load only if their `~/AI-Native/*` directories
exist (via a testable `buildBuiltins(exists)`); the company template is a
committed in-repo snapshot instead of a live path; an empty agent list renders a
first-run onboarding screen with dependency detection.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Vitest. No new dependencies.

## Global Constraints

- **Existence-gated built-ins:** the 3 PLH agents load iff their directories
  exist. Fresh install → empty `AGENTS`/`ADAPTERS`/`SKILL_ADAPTERS`. Dev machine
  → all present → unchanged behavior.
- **Bundle, don't clone:** the template is a committed `templates/company-starter/`
  snapshot; create-company copies from there, not `~/AI-Native/...`.
- **Detect-and-guide only:** onboarding detects `claude` + `gog` and instructs;
  it never auto-installs.
- **No behavior change when built-ins are present:** on the dev machine the only
  visible diffs are the genericized template strings; the bespoke v2/v5/v9/v19/v20
  features are untouched and stay dormant only when their agent is absent.
- **Standing safety rule:** `~/AI-Native/ai-company-starter-main` is read only as
  the one-time snapshot source (read-only, verified clean); `plh-takeshi-agent`
  and `plh-ops` are never written. Live tests use disposable `/tmp` companies.

---

# Slice v23 — De-PLH the config

**Branch:** `worktree-control-panel-v23-de-plh-config` (own worktree; merge to
`master` when green, then continue to v24).

### Task 1: `buildBuiltins` + config refactor

**Files:**
- Create: `lib/builtin-agents.ts`
- Create: `lib/builtin-agents.test.ts`
- Modify: `lib/config.ts`

**Interfaces:**
- Produces: `buildBuiltins(exists: (absPath: string) => boolean): { agents:
  Agent[]; adapters: Record<string, Adapter>; skillAdapters: Record<string,
  SkillAdapter> }` and `loadBuiltins()` (calls `buildBuiltins` with
  `fs.existsSync`). `lib/config.ts` re-exports `AGENTS` / `ADAPTERS` /
  `SKILL_ADAPTERS` (same names/shapes as before) + the unchanged
  `TAKESHI_AGENT_LAUNCHD_LABEL`.

- [ ] **Step 1: Write the failing test**

Create `lib/builtin-agents.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { buildBuiltins } from "./builtin-agents"

describe("buildBuiltins", () => {
  it("includes all 3 builtins when every dir exists", () => {
    const b = buildBuiltins(() => true)
    expect(b.agents.map((a) => a.id).sort()).toEqual([
      "ai-company-starter-main",
      "plh-ops",
      "plh-takeshi-agent",
    ])
  })

  it("includes none when no dir exists", () => {
    const b = buildBuiltins(() => false)
    expect(b.agents).toEqual([])
    expect(b.adapters).toEqual({})
    expect(b.skillAdapters).toEqual({})
  })

  it("includes only the subset whose dirs exist", () => {
    const b = buildBuiltins((p) => p.endsWith("plh-ops"))
    expect(b.agents.map((a) => a.id)).toEqual(["plh-ops"])
    expect(Object.keys(b.adapters)).toEqual(["plh-ops"])
    expect(Object.keys(b.skillAdapters)).toEqual(["plh-ops"])
  })

  it("keeps adapter maps in sync with the agent list in every gate state (machine-independent drift guard)", () => {
    const gates: Array<(p: string) => boolean> = [
      () => true,
      () => false,
      (p) => p.includes("takeshi"),
    ]
    for (const exists of gates) {
      const b = buildBuiltins(exists)
      const ids = b.agents.map((a) => a.id).sort()
      expect(Object.keys(b.adapters).sort()).toEqual(ids)
      expect(Object.keys(b.skillAdapters).sort()).toEqual(ids)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/builtin-agents.test.ts`
Expected: FAIL — `Cannot find module './builtin-agents'`

- [ ] **Step 3: Create `lib/builtin-agents.ts`**

```ts
import path from "node:path"
import os from "node:os"
import { existsSync } from "node:fs"
import type { Agent, Adapter } from "./adapters/types"
import { plhTakeshiAgentAdapter } from "./adapters/plh-takeshi-agent"
import { aiCompanyStarterMainAdapter } from "./adapters/ai-company-starter-main"
import { plhOpsAdapter } from "./adapters/plh-ops"
import type { SkillAdapter } from "./skills/types"
import { aiCompanyStarterMainSkillsAdapter } from "./skills/ai-company-starter-main"
import { plhTakeshiAgentSkillsAdapter } from "./skills/plh-takeshi-agent"
import { plhOpsSkillsAdapter } from "./skills/plh-ops"

const AI_NATIVE_ROOT = path.join(os.homedir(), "AI-Native")

type BuiltinDescriptor = {
  agent: Agent
  adapter: Adapter
  skillAdapter: SkillAdapter
}

// Built-in example agents. Each loads only if its directory exists on disk, so
// a shipped/product install (no ~/AI-Native/*) starts empty while a developer
// machine keeps full daily use with zero setup.
const BUILTIN_DESCRIPTORS: BuiltinDescriptor[] = [
  {
    agent: {
      id: "plh-takeshi-agent",
      name: "Takeshi Email Agent",
      rootPath: path.join(AI_NATIVE_ROOT, "plh-takeshi-agent"),
      kind: "pipeline",
    },
    adapter: plhTakeshiAgentAdapter,
    skillAdapter: plhTakeshiAgentSkillsAdapter,
  },
  {
    agent: {
      id: "ai-company-starter-main",
      name: "AI Company Starter",
      rootPath: path.join(AI_NATIVE_ROOT, "ai-company-starter-main"),
      kind: "command-set",
    },
    adapter: aiCompanyStarterMainAdapter,
    skillAdapter: aiCompanyStarterMainSkillsAdapter,
  },
  {
    agent: {
      id: "plh-ops",
      name: "PLH Ops",
      rootPath: path.join(AI_NATIVE_ROOT, "plh-ops"),
      kind: "report-log",
    },
    adapter: plhOpsAdapter,
    skillAdapter: plhOpsSkillsAdapter,
  },
]

export type Builtins = {
  agents: Agent[]
  adapters: Record<string, Adapter>
  skillAdapters: Record<string, SkillAdapter>
}

export function buildBuiltins(exists: (absPath: string) => boolean): Builtins {
  const present = BUILTIN_DESCRIPTORS.filter((d) => exists(d.agent.rootPath))
  return {
    agents: present.map((d) => d.agent),
    adapters: Object.fromEntries(present.map((d) => [d.agent.id, d.adapter])),
    skillAdapters: Object.fromEntries(present.map((d) => [d.agent.id, d.skillAdapter])),
  }
}

export function loadBuiltins(): Builtins {
  return buildBuiltins((absPath) => existsSync(absPath))
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/builtin-agents.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Refactor `lib/config.ts` to use it**

Replace the full contents of `lib/config.ts`:

```ts
import { loadBuiltins } from "./builtin-agents"
import type { Agent, Adapter } from "./adapters/types"
import type { SkillAdapter } from "./skills/types"

const builtins = loadBuiltins()

export const AGENTS: Agent[] = builtins.agents
export const ADAPTERS: Record<string, Adapter> = builtins.adapters
export const SKILL_ADAPTERS: Record<string, SkillAdapter> = builtins.skillAdapters

export const TAKESHI_AGENT_LAUNCHD_LABEL = "com.plh.takeshi-agent"
```

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass. `lib/config.test.ts` (the AGENTS↔ADAPTERS drift
guard) still passes — parity holds for whatever subset the dev machine loads
(and this machine has all 3 dirs, so it loads 3).

- [ ] **Step 7: Commit**

```bash
git add lib/builtin-agents.ts lib/builtin-agents.test.ts lib/config.ts
git commit -m "feat: load built-in agents only when their directories exist"
```

### Task 2: Hide the broken fresh-install action + genericize PLH strings

**Files:**
- Modify: `app/page.tsx`
- Modify: `lib/create-company-from-template-impl.ts`
- Modify: `lib/create-company-from-template-impl.test.ts`
- Modify: `components/add-company-form.tsx`

**Interfaces:** none new — small edits to existing files.

- [ ] **Step 1: Gate the install-daily-team-log button on `plh-ops` presence**

The install action (v20) reads `plh-ops` from `AGENTS` as its source; with no
`plh-ops` present it would error if clicked. In `app/page.tsx`, add a
`plh-ops`-presence check and require it for the button.

Change:

```tsx
  const avatarByAgentId = Object.fromEntries(avatars.map((a) => [a.agentId, a.imageUrl]))
  const takeshiAgent = agents.find((agent) => agent.id === "plh-takeshi-agent")
```

to:

```tsx
  const avatarByAgentId = Object.fromEntries(avatars.map((a) => [a.agentId, a.imageUrl]))
  const takeshiAgent = agents.find((agent) => agent.id === "plh-takeshi-agent")
  const plhOpsSource = agents.find((agent) => agent.id === "plh-ops")
```

Change:

```tsx
            const showInstallDailyTeamLogButton =
              result.agent.kind === "command-set" && !(await dailyTeamLogInstalled(result.agent.rootPath))
```

to:

```tsx
            const showInstallDailyTeamLogButton =
              Boolean(plhOpsSource) &&
              result.agent.kind === "command-set" &&
              !(await dailyTeamLogInstalled(result.agent.rootPath))
```

- [ ] **Step 2: Genericize the scaffold commit message**

In `lib/create-company-from-template-impl.ts`, change:

```ts
    await execFn("git", ["-C", rootPath, "commit", "-m", "Initial commit from ai-company-starter-main template"])
```

to:

```ts
    await execFn("git", ["-C", rootPath, "commit", "-m", "Initial commit from company starter template"])
```

- [ ] **Step 3: Update the impl test's commit-message assertion**

In `lib/create-company-from-template-impl.test.ts`, change:

```ts
        args: ["-C", target, "commit", "-m", "Initial commit from ai-company-starter-main template"],
```

to:

```ts
        args: ["-C", target, "commit", "-m", "Initial commit from company starter template"],
```

- [ ] **Step 4: Genericize the add-company confirm dialog copy**

In `components/add-company-form.tsx`, change:

```tsx
              <code>{rootPath}</code> doesn&apos;t exist yet. Create &quot;{name}&quot; here from the
              ai-company-starter-main template?
```

to:

```tsx
              <code>{rootPath}</code> doesn&apos;t exist yet. Create &quot;{name}&quot; here from the
              company starter template?
```

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass (the updated commit-message assertion now matches).

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx lib/create-company-from-template-impl.ts lib/create-company-from-template-impl.test.ts components/add-company-form.tsx
git commit -m "feat: gate install-daily-team-log on plh-ops presence; genericize template strings"
```

### Slice v23 completion

- [ ] Run the full gate: `npx tsc --noEmit`, `npx vitest run`, `npm run build` —
      all green.
- [ ] Self-review the branch diff (files touched match this slice only).
- [ ] Merge `worktree-control-panel-v23-de-plh-config` to `master`
      (fast-forward), verify tests on master, remove the worktree.
- [ ] Update `LAUNCH.md`: Day 1 Updates log + Session handoff.

---

# Slice v24 — Bundle the company-starter template

**Branch:** `worktree-control-panel-v24-bundle-template` (branch from the
updated `master` after v23 merges).

### Task 1: Create the committed template snapshot

**Files:**
- Create: `templates/company-starter/**` (snapshot of the manifest paths)

**Interfaces:** none — this task produces committed files that Task 2 points to.

- [ ] **Step 1: Snapshot the manifest paths from the live source**

Run this from the repo root (copies exactly the `TEMPLATE_MANIFEST` allowlist
paths — the set v17 audited as containing zero company-specific data):

```bash
SRC="$HOME/AI-Native/ai-company-starter-main"
DST="templates/company-starter"
mkdir -p "$DST"
PATHS=(
  ".claude/hooks" ".claude/commands" ".claude/rules" ".claude/skills" ".claude/settings.json"
  "docs/templates" "docs/concepts" "docs/ai-company-beginner-guide.md"
  "docs/ai-company-beginner-guide-lp.html" "docs/ai-company-explainer.md"
  "docs/context-gathering-checklist.md" "docs/directory-map.md" "docs/feedback-collection.md"
  "docs/participant-guide.md" "docs/retreat-day-flow.md" "docs/setup-walkthrough.md"
  "docs/starter-manual.md" "docs/decisions/README.md" "docs/retros/README.md"
  "exercises" "scripts/verify.py" "scripts/cycle" "tests" ".github" ".gitignore"
  "LICENSE.md" "README.md" "CLAUDE.md" "definitions/README.md" "definitions/ontology/README.md"
  "definitions/hitl" "definitions/kpi/README.md" "definitions/cycles/README.md"
  "definitions/retro/README.md" "secrets" "state/README.md" "notes/README.md"
  "notes/inbox/README.md" "notes/market/.gitkeep" "notes/clients/.gitkeep"
  "notes/sops/.gitkeep" "notes/company/.gitkeep"
)
for p in "${PATHS[@]}"; do
  mkdir -p "$DST/$(dirname "$p")"
  cp -R "$SRC/$p" "$DST/$p" 2>/dev/null || echo "MISSING IN SOURCE: $p"
done
find "$DST" -name ".DS_Store" -delete
```

Note any `MISSING IN SOURCE` lines — a manifest path absent from the live source
is a pre-existing manifest issue to flag, not silently ignore.

- [ ] **Step 2: Scrub-verify the snapshot has no company-specific data**

```bash
grep -rniE "kirirom|takeshi|plh-ops|plh-takeshi|nana@plh\.life|/Users/nanaosei" templates/company-starter/ || echo "CLEAN: no company-specific data found"
```

Expected: `CLEAN`. If anything matches, stop — a manifest path is leaking real
data and the manifest (not this snapshot) must be fixed first. (The generic
`api-connect`/`check-inbox` command files legitimately mention "gog"/"Google" —
those are fine; the grep above targets Kirirom/PLH specifics + absolute dev
paths only.)

- [ ] **Step 3: Confirm the snapshot covers every manifest entry**

Create a temporary check and run it, then delete it:

```bash
cat > /tmp/verify-bundle.mjs <<'EOF'
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
// The manifest is TS; parse the string-array entries out of the source text.
const txt = readFileSync("lib/company-template-manifest.ts", "utf-8")
const arrayBody = txt.split("TEMPLATE_MANIFEST: string[] = [")[1].split("]")[0]
const paths = [...arrayBody.matchAll(/"([^"]+)"/g)].map((m) => m[1])
const missing = paths.filter((p) => !existsSync(path.join("templates/company-starter", p)))
console.log(missing.length ? "MISSING FROM BUNDLE:\n" + missing.join("\n") : "BUNDLE COVERS ALL MANIFEST PATHS")
EOF
node /tmp/verify-bundle.mjs
rm /tmp/verify-bundle.mjs
```

Expected: `BUNDLE COVERS ALL MANIFEST PATHS`. (Scoping the match to the array
body means only real manifest entries are checked.)

- [ ] **Step 4: Commit the snapshot**

```bash
git add templates/company-starter
git commit -m "feat: bundle the cleaned company-starter template into the app"
```

### Task 2: Point create-company at the bundled template

**Files:**
- Modify: `lib/create-company-from-template.ts`

**Interfaces:**
- Consumes: `createCompanyFromTemplateImpl(name, rootPath, templateSourcePath,
  ...)` (existing, unchanged — already takes the source path as a parameter).
- Produces: `createCompanyFromTemplate(name, rootPath)` now sources from the
  bundled `templates/company-starter/` and no longer depends on `AGENTS`.

- [ ] **Step 1: Repoint the public action**

Replace the full contents of `lib/create-company-from-template.ts`:

```ts
"use server"

import path from "node:path"
import { createCompanyFromTemplateImpl } from "./create-company-from-template-impl"
import type { RegisteredCompany } from "./companies-registry"

const BUNDLED_TEMPLATE_PATH = path.join(process.cwd(), "templates", "company-starter")

export async function createCompanyFromTemplate(
  name: string,
  rootPath: string
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  return createCompanyFromTemplateImpl(name, rootPath, BUNDLED_TEMPLATE_PATH)
}
```

(This removes the `AGENTS` import + the "template source not configured" branch —
the bundled path always exists in the app, so the check is obsolete.)

- [ ] **Step 2: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors (nothing else imports the removed branch).

Run: `npx vitest run`
Expected: all tests pass (the impl test runs against its own `/tmp` fixture
source and is unaffected).

- [ ] **Step 3: Live-verify the bundled path works end-to-end**

Start a dev server on an unused port. Create a disposable company under `/tmp`
via the "Add a company" → create-from-template flow. Confirm on disk that the
new company has the expected structure (`.claude/commands/` incl. `check-inbox.md`,
`definitions/`, `notes/`, a git repo with one commit "Initial commit from
company starter template") and **no PLH/Kirirom data**. Confirm
`~/AI-Native/ai-company-starter-main` is untouched (`git status --short`).
Remove the company, delete the `/tmp` dir.

- [ ] **Step 4: Commit**

```bash
git add lib/create-company-from-template.ts
git commit -m "feat: create companies from the bundled template, not a local path"
```

### Slice v24 completion

- [ ] Full gate: `npx tsc --noEmit`, `npx vitest run`, `npm run build` — green.
- [ ] Self-review branch diff (only `templates/company-starter/**` +
      `create-company-from-template.ts`).
- [ ] Merge to `master`, verify tests, remove worktree.
- [ ] Update `LAUNCH.md`: Day 1 Updates log + Session handoff.

---

# Slice v25 — First-run onboarding + dependency detection

**Branch:** `worktree-control-panel-v25-onboarding` (branch from `master` after
v24 merges).

### Task 1: `checkDependencies` action

**Files:**
- Create: `lib/check-dependencies-impl.ts`
- Create: `lib/check-dependencies.ts`
- Create: `lib/check-dependencies-impl.test.ts`

**Interfaces:**
- Produces: `checkDependenciesImpl(execFn?: ExecFileFn): Promise<DependencyStatus>`
  and `checkDependencies(): Promise<DependencyStatus>`, where
  `type DependencyStatus = { claude: boolean; gog: boolean }`. Task 2's
  onboarding component calls `checkDependencies()`.

- [ ] **Step 1: Write the failing test**

Create `lib/check-dependencies-impl.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { checkDependenciesImpl } from "./check-dependencies-impl"
import type { ExecFileFn } from "./check-dependencies-impl"

describe("checkDependenciesImpl", () => {
  it("reports both present when `which` resolves for both", async () => {
    const execFn: ExecFileFn = async () => ({ stdout: "/usr/bin/x", stderr: "" })
    expect(await checkDependenciesImpl(execFn)).toEqual({ claude: true, gog: true })
  })

  it("reports a dependency absent when `which` rejects for it", async () => {
    const execFn: ExecFileFn = async (_command, args) => {
      if (args[0] === "gog") throw new Error("not found")
      return { stdout: "/usr/bin/claude", stderr: "" }
    }
    expect(await checkDependenciesImpl(execFn)).toEqual({ claude: true, gog: false })
  })

  it("reports both absent when `which` rejects for both", async () => {
    const execFn: ExecFileFn = async () => {
      throw new Error("not found")
    }
    expect(await checkDependenciesImpl(execFn)).toEqual({ claude: false, gog: false })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/check-dependencies-impl.test.ts`
Expected: FAIL — `Cannot find module './check-dependencies-impl'`

- [ ] **Step 3: Implement**

Create `lib/check-dependencies-impl.ts`:

```ts
import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export type DependencyStatus = { claude: boolean; gog: boolean }

async function isPresent(execFn: ExecFileFn, name: string): Promise<boolean> {
  try {
    await execFn("which", [name])
    return true
  } catch {
    return false
  }
}

export async function checkDependenciesImpl(execFn: ExecFileFn = defaultExecFile): Promise<DependencyStatus> {
  const [claude, gog] = await Promise.all([isPresent(execFn, "claude"), isPresent(execFn, "gog")])
  return { claude, gog }
}
```

Create `lib/check-dependencies.ts`:

```ts
"use server"

import { checkDependenciesImpl } from "./check-dependencies-impl"
import type { DependencyStatus } from "./check-dependencies-impl"

export async function checkDependencies(): Promise<DependencyStatus> {
  return checkDependenciesImpl()
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/check-dependencies-impl.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check + full suite**

Run: `npx tsc --noEmit` — no errors
Run: `npx vitest run` — all pass

- [ ] **Step 6: Commit**

```bash
git add lib/check-dependencies-impl.ts lib/check-dependencies.ts lib/check-dependencies-impl.test.ts
git commit -m "feat: add checkDependencies (claude + gog detection)"
```

### Task 2: Onboarding welcome component + empty-state wiring

**Files:**
- Create: `components/onboarding-welcome.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `checkDependencies` + `DependencyStatus` (Task 1); `AddCompanyForm`
  (existing).
- Produces: `OnboardingWelcome` React component; `app/page.tsx` renders it when
  `agents.length === 0`.

No unit test — project has no component-level UI tests; covered by live
verification.

- [ ] **Step 1: Create the onboarding component**

Create `components/onboarding-welcome.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { AddCompanyForm } from "@/components/add-company-form"
import { checkDependencies } from "@/lib/check-dependencies"
import type { DependencyStatus } from "@/lib/check-dependencies-impl"

function DepRow({ label, ok, guidance }: { label: string; ok: boolean | undefined; guidance: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="font-medium">{label}</span>
      {ok === undefined ? (
        <span className="text-muted-foreground">checking…</span>
      ) : ok ? (
        <span className="text-muted-foreground">✓ installed</span>
      ) : (
        <span className="max-w-xs text-right text-destructive">{guidance}</span>
      )}
    </div>
  )
}

export function OnboardingWelcome() {
  const [deps, setDeps] = useState<DependencyStatus | null>(null)

  useEffect(() => {
    checkDependencies().then(setDeps)
  }, [])

  return (
    <div className="mx-auto max-w-xl space-y-6 py-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Welcome — set up your AI company</h1>
        <p className="text-sm text-muted-foreground">
          Create your first company from the built-in template, then connect your own AI agent to run it.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-4">
        <p className="text-sm font-medium">You&apos;ll need these installed first:</p>
        <DepRow
          label="Claude Code CLI"
          ok={deps?.claude}
          guidance="Install Claude Code, then reopen this app"
        />
        <DepRow
          label="gog (Google CLI)"
          ok={deps?.gog}
          guidance="Install gog to connect Gmail / Calendar later"
        />
      </div>

      <AddCompanyForm />
    </div>
  )
}
```

- [ ] **Step 2: Wire the empty-state into `app/page.tsx`**

Add the import (with the other component imports):

```tsx
import { OnboardingWelcome } from "@/components/onboarding-welcome"
```

Change:

```tsx
  const avatarByAgentId = Object.fromEntries(avatars.map((a) => [a.agentId, a.imageUrl]))
  const takeshiAgent = agents.find((agent) => agent.id === "plh-takeshi-agent")
  const plhOpsSource = agents.find((agent) => agent.id === "plh-ops")
```

to:

```tsx
  if (agents.length === 0) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <OnboardingWelcome />
      </main>
    )
  }

  const avatarByAgentId = Object.fromEntries(avatars.map((a) => [a.agentId, a.imageUrl]))
  const takeshiAgent = agents.find((agent) => agent.id === "plh-takeshi-agent")
  const plhOpsSource = agents.find((agent) => agent.id === "plh-ops")
```

(The early return sits after the first `Promise.all` that computes `agents`/
`adapters`/`avatars`, so the second `Promise.all` — activities, launchd, poll —
is skipped entirely when there are no agents.)

- [ ] **Step 3: Type-check and run the full suite**

Run: `npx tsc --noEmit` — no errors
Run: `npx vitest run` — all pass

- [ ] **Step 4: Live-verify the empty state**

Because this dev machine has the `~/AI-Native/*` dirs, `agents` is non-empty and
onboarding won't show naturally. Verify it two ways:
1. Temporarily force the empty branch (e.g. run the dev server with `AGENTS`
   empty by pointing `HOME` at an empty dir, OR temporarily hardcode
   `if (true)` on the empty-state check), load `/`, confirm the Welcome renders
   with real dependency status (both should show ✓ installed on this machine),
   and that "Add a company" is present. Revert the temporary change.
2. Confirm the normal (non-empty) path still renders the agent grid unchanged.

- [ ] **Step 5: Commit**

```bash
git add components/onboarding-welcome.tsx app/page.tsx
git commit -m "feat: first-run onboarding welcome with dependency detection"
```

### Slice v25 completion

- [ ] Full gate: `npx tsc --noEmit`, `npx vitest run`, `npm run build` — green.
- [ ] Self-review branch diff.
- [ ] Merge to `master`, verify tests, remove worktree.
- [ ] Update `LAUNCH.md`: **Day 1 Status → DONE**, Updates log, Session handoff,
      and **Current position → Day 2**.

---

## After Day 1 (all three slices merged)

- [ ] Update `README.md` with a combined `## v23–v25: productize (Day 1 of
      launch)` section (de-PLH, bundled template, onboarding), matching the
      existing changelog style.
- [ ] Update `CLAUDE.md` "Current state" + the app-description opening (it still
      says the app manages the 3 hardcoded `~/AI-Native/` tools — now they're
      existence-gated built-ins).
- [ ] Update memory (`project_control-panel.md`) with the productization pivot.
