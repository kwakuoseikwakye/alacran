# v18: guided company-context setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session note:** this session's subagent-spawn cap (200/session) has
> been hit repeatedly (v14, v16, v17). If a task's implementer dispatch
> fails with a spawn-limit error, do not retry — execute that task (and
> any remaining tasks) directly instead: read the target file first,
> apply the step's code exactly, run the listed test commands, then
> self-review the whole branch before merging.

**Goal:** Let a non-technical user fill in a freshly-scaffolded company's
`definitions/ontology/company.yaml` through a step-by-step wizard in the
dashboard, instead of running `/define-company` in a terminal.

**Architecture:** A pure function turns wizard answers + the company's
own `docs/templates/ontology-starter.yaml` into a complete YAML document
(via the new `yaml` package, for correct escaping of free-text input); an
I/O layer resolves the target company server-side and writes + commits
the file through the existing `commitFile()` helper; a new
`AgentCard` button (shown only when no `company.yaml` exists yet) opens
the wizard in a `Sheet`.

**Tech Stack:** Next.js 15 Server Actions, the `yaml` npm package (new
dependency), `node:fs/promises`, existing shadcn primitives (`Sheet`,
`Input`, `Textarea`, `Button`), Vitest.

## Global Constraints

- Do NOT edit `components/ui/*`.
- Do NOT edit `lib/companies-registry.ts`, `lib/register-company.ts`,
  `lib/create-company-from-template*.ts`, or anything under
  `ai-company-starter-main` itself — v17's flow is untouched, and this
  feature never targets `ai-company-starter-main` in practice (it already
  has a `company.yaml`, so the "missing ontology" condition never matches
  it).
- The target company's `rootPath` is always resolved **server-side** by
  looking up a given `agentId` in `getEffectiveAgents()` — the public
  Server Action never accepts a client-supplied path.
- The `customer`/`org`/`product` sections of the generated
  `company.yaml` are copied verbatim (parsed then re-serialized) from
  that company's own `docs/templates/ontology-starter.yaml` — never
  invented or hand-authored.
- No AI/LLM calls anywhere in this slice.
- Tests never read from or write to the real `ai-company-starter-main` —
  disposable `/tmp` fixtures only, per this project's standing
  safe-test-target rule.

---

### Task 1: `buildCompanyOntology` (pure YAML builder)

**Files:**
- Create: `lib/build-company-ontology.ts`
- Test: `lib/build-company-ontology.test.ts`

**Interfaces:**
- Produces: `export type Stakeholder = { role: string; position: string }`,
  `export type CompanyOntologyAnswers = { domain: string; employeeCount?:
  number; stakeholders: Stakeholder[]; valueFlow: { input: string;
  transform: string; output: string }; bottleneck: string }`, and
  `export function buildCompanyOntology(companyName: string, answers:
  CompanyOntologyAnswers, ontologyStarterYamlContent: string, todayDate?:
  string): string` — Task 3's impl file imports all of these.

- [ ] **Step 1: Add the `yaml` dependency**

Run: `npm install yaml`
Expected: `package.json`'s `dependencies` gains a `"yaml"` entry.

- [ ] **Step 2: Write the failing tests**

Create `lib/build-company-ontology.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parse } from "yaml"
import { buildCompanyOntology } from "./build-company-ontology"
import type { CompanyOntologyAnswers } from "./build-company-ontology"

const FIXTURE_TEMPLATE = `
version: 1
schema_version: "template"
customer:
  domain: customer
  entities:
    - id: customer.account
      type: account
org:
  domain: org
  entities: []
product:
  domain: product
  entities: []
`

function baseAnswers(): CompanyOntologyAnswers {
  return {
    domain: "We help small shops manage inventory.",
    employeeCount: 3,
    stakeholders: [{ role: "Shop owner", position: "Pays for the service" }],
    valueFlow: { input: "Sales data", transform: "Forecast restocking needs", output: "Reorder alerts" },
    bottleneck: "Manually checking stock levels every morning.",
  }
}

describe("buildCompanyOntology", () => {
  it("produces valid, parseable YAML with the expected structure", () => {
    const yamlText = buildCompanyOntology("Second Co", baseAnswers(), FIXTURE_TEMPLATE, "2026-07-27")
    const parsed = parse(yamlText)

    expect(parsed.version).toBe(1)
    expect(parsed.schema_version).toBe("2026-07-27-company")
    expect(parsed.template_origin).toBe("docs/templates/ontology-starter.yaml")
    expect(parsed.status).toBe("draft")
    expect(parsed.company_summary).toEqual({
      name: "Second Co",
      domain: "We help small shops manage inventory.",
      employee_count: 3,
      primary_bottleneck: "Manually checking stock levels every morning.",
    })
    expect(parsed.stakeholders).toEqual([{ role: "Shop owner", position: "Pays for the service" }])
    expect(parsed.value_flow).toEqual({
      input: "Sales data",
      transform: "Forecast restocking needs",
      output: "Reorder alerts",
    })
  })

  it("copies customer/org/product from the template verbatim", () => {
    const yamlText = buildCompanyOntology("Second Co", baseAnswers(), FIXTURE_TEMPLATE, "2026-07-27")
    const parsed = parse(yamlText)

    expect(parsed.customer).toEqual({ domain: "customer", entities: [{ id: "customer.account", type: "account" }] })
    expect(parsed.org).toEqual({ domain: "org", entities: [] })
    expect(parsed.product).toEqual({ domain: "product", entities: [] })
  })

  it("omits employee_count entirely when not provided", () => {
    const answers = { ...baseAnswers(), employeeCount: undefined }
    const yamlText = buildCompanyOntology("Second Co", answers, FIXTURE_TEMPLATE, "2026-07-27")
    const parsed = parse(yamlText)

    expect(parsed.company_summary.employee_count).toBeUndefined()
    expect("employee_count" in parsed.company_summary).toBe(false)
  })

  it("handles multiple stakeholders", () => {
    const answers = {
      ...baseAnswers(),
      stakeholders: [
        { role: "Shop owner", position: "Pays for the service" },
        { role: "Warehouse staff", position: "Executes reorders" },
      ],
    }
    const yamlText = buildCompanyOntology("Second Co", answers, FIXTURE_TEMPLATE, "2026-07-27")
    const parsed = parse(yamlText)

    expect(parsed.stakeholders).toHaveLength(2)
    expect(parsed.stakeholders[1]).toEqual({ role: "Warehouse staff", position: "Executes reorders" })
  })

  it("round-trips free text containing YAML-special characters correctly", () => {
    const answers = {
      ...baseAnswers(),
      domain: `We handle "urgent" requests: same-day, when needed.`,
    }
    const yamlText = buildCompanyOntology("Second Co", answers, FIXTURE_TEMPLATE, "2026-07-27")
    const parsed = parse(yamlText)

    expect(parsed.company_summary.domain).toBe(`We handle "urgent" requests: same-day, when needed.`)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/build-company-ontology.test.ts`
Expected: FAIL — `Cannot find module './build-company-ontology'`

- [ ] **Step 4: Implement**

Create `lib/build-company-ontology.ts`:

```ts
import { parse, stringify } from "yaml"

export type Stakeholder = { role: string; position: string }

export type CompanyOntologyAnswers = {
  domain: string
  employeeCount?: number
  stakeholders: Stakeholder[]
  valueFlow: { input: string; transform: string; output: string }
  bottleneck: string
}

export function buildCompanyOntology(
  companyName: string,
  answers: CompanyOntologyAnswers,
  ontologyStarterYamlContent: string,
  todayDate: string = new Date().toISOString().slice(0, 10)
): string {
  const template = parse(ontologyStarterYamlContent) as {
    customer?: unknown
    org?: unknown
    product?: unknown
  }

  const companySummary: Record<string, unknown> = {
    name: companyName,
    domain: answers.domain,
  }
  if (answers.employeeCount !== undefined) {
    companySummary.employee_count = answers.employeeCount
  }
  companySummary.primary_bottleneck = answers.bottleneck

  const output = {
    version: 1,
    schema_version: `${todayDate}-company`,
    template_origin: "docs/templates/ontology-starter.yaml",
    status: "draft",
    company_summary: companySummary,
    stakeholders: answers.stakeholders,
    value_flow: answers.valueFlow,
    customer: template.customer,
    org: template.org,
    product: template.product,
  }

  return stringify(output)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/build-company-ontology.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass (202 existing + 5 new = 207)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/build-company-ontology.ts lib/build-company-ontology.test.ts
git commit -m "feat: add buildCompanyOntology to turn wizard answers into company.yaml"
```

---

### Task 2: `companyOntologyExists`

**Files:**
- Create: `lib/company-ontology-exists.ts`
- Test: `lib/company-ontology-exists.test.ts`

**Interfaces:**
- Produces: `export async function companyOntologyExists(rootPath:
  string): Promise<boolean>` — Task 4 calls this from `app/page.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `lib/company-ontology-exists.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { companyOntologyExists } from "./company-ontology-exists"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "company-ontology-exists-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("companyOntologyExists", () => {
  it("returns false when definitions/ontology/company.yaml is missing", async () => {
    expect(await companyOntologyExists(root)).toBe(false)
  })

  it("returns true when definitions/ontology/company.yaml exists", async () => {
    await mkdir(path.join(root, "definitions", "ontology"), { recursive: true })
    await writeFile(path.join(root, "definitions", "ontology", "company.yaml"), "version: 1\n")
    expect(await companyOntologyExists(root)).toBe(true)
  })

  it("returns false when the definitions directory doesn't exist at all", async () => {
    expect(await companyOntologyExists(path.join(root, "does-not-exist"))).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/company-ontology-exists.test.ts`
Expected: FAIL — `Cannot find module './company-ontology-exists'`

- [ ] **Step 3: Implement**

Create `lib/company-ontology-exists.ts`:

```ts
import { stat } from "node:fs/promises"
import path from "node:path"

export async function companyOntologyExists(rootPath: string): Promise<boolean> {
  try {
    await stat(path.join(rootPath, "definitions", "ontology", "company.yaml"))
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/company-ontology-exists.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass (207 existing + 3 new = 210)

- [ ] **Step 6: Commit**

```bash
git add lib/company-ontology-exists.ts lib/company-ontology-exists.test.ts
git commit -m "feat: add companyOntologyExists helper"
```

---

### Task 3: `saveCompanyOntologyImpl` and the public Server Action

**Files:**
- Create: `lib/save-company-ontology-impl.ts`
- Create: `lib/save-company-ontology.ts`
- Test: `lib/save-company-ontology-impl.test.ts`

**Interfaces:**
- Consumes: `buildCompanyOntology`, `CompanyOntologyAnswers` (Task 1);
  `getEffectiveAgents` (existing, from `./get-effective-agents`,
  unchanged); `commitFile`, `ExecFileFn` (existing, from
  `./git-commit-file`, unchanged).
- Produces: `export async function saveCompanyOntologyImpl(agentId:
  string, answers: CompanyOntologyAnswers, execFn?: ExecFileFn):
  Promise<{ ok: true } | { ok: false; message: string }>` and, wrapping
  it, `export async function saveCompanyOntology(agentId: string,
  answers: CompanyOntologyAnswers): Promise<{ ok: true } | { ok: false;
  message: string }>` — Task 4's wizard component calls
  `saveCompanyOntology` directly.

- [ ] **Step 1: Write the failing tests**

Create `lib/save-company-ontology-impl.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { parse } from "yaml"
import type { ExecFileFn } from "./git-commit-file"
import type { CompanyOntologyAnswers } from "./build-company-ontology"

let root: string
let execCalls: { command: string; args: string[] }[]

async function fakeExecFn(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  execCalls.push({ command, args })
  return { stdout: "", stderr: "" }
}

const ANSWERS: CompanyOntologyAnswers = {
  domain: "We help small shops manage inventory.",
  employeeCount: 3,
  stakeholders: [{ role: "Shop owner", position: "Pays for the service" }],
  valueFlow: { input: "Sales data", transform: "Forecast restocking needs", output: "Reorder alerts" },
  bottleneck: "Manually checking stock levels every morning.",
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "save-ontology-"))
  await mkdir(path.join(root, "docs", "templates"), { recursive: true })
  await writeFile(
    path.join(root, "docs", "templates", "ontology-starter.yaml"),
    "customer:\n  domain: customer\norg:\n  domain: org\nproduct:\n  domain: product\n"
  )
  execCalls = []
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
      AGENTS: [{ id: "second-co", name: "Second Co", rootPath: root, kind: "command-set" }],
    }
  })
}

describe("saveCompanyOntologyImpl", () => {
  it("writes definitions/ontology/company.yaml and commits it", async () => {
    await mockAgents()
    const { saveCompanyOntologyImpl } = await import("./save-company-ontology-impl")

    const result = await saveCompanyOntologyImpl("second-co", ANSWERS, fakeExecFn)

    expect(result).toEqual({ ok: true })
    const written = await readFile(path.join(root, "definitions", "ontology", "company.yaml"), "utf-8")
    const parsed = parse(written)
    expect(parsed.company_summary.name).toBe("Second Co")
    expect(parsed.company_summary.domain).toBe("We help small shops manage inventory.")
  })

  it("commits the file via the injected exec function, scoped to the one file", async () => {
    await mockAgents()
    const { saveCompanyOntologyImpl } = await import("./save-company-ontology-impl")

    await saveCompanyOntologyImpl("second-co", ANSWERS, fakeExecFn)

    const relativePath = path.join("definitions", "ontology", "company.yaml")
    expect(execCalls).toEqual([
      { command: "git", args: ["-C", root, "add", "--", relativePath] },
      {
        command: "git",
        args: ["-C", root, "commit", "-m", "Define company context via AI-Native control panel", "--", relativePath],
      },
    ])
  })

  it("fails cleanly for an unknown agent id", async () => {
    await mockAgents()
    const { saveCompanyOntologyImpl } = await import("./save-company-ontology-impl")

    const result = await saveCompanyOntologyImpl("no-such-agent", ANSWERS, fakeExecFn)

    expect(result).toEqual({ ok: false, message: "Unknown company" })
    expect(execCalls).toEqual([])
  })

  it("fails cleanly when the company has no ontology-starter.yaml template", async () => {
    await mockAgents()
    await rm(path.join(root, "docs", "templates", "ontology-starter.yaml"))
    const { saveCompanyOntologyImpl } = await import("./save-company-ontology-impl")

    const result = await saveCompanyOntologyImpl("second-co", ANSWERS, fakeExecFn)

    expect(result).toEqual({
      ok: false,
      message: "This company is missing docs/templates/ontology-starter.yaml",
    })
    expect(execCalls).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/save-company-ontology-impl.test.ts`
Expected: FAIL — `Cannot find module './save-company-ontology-impl'`

- [ ] **Step 3: Implement**

Create `lib/save-company-ontology-impl.ts`:

```ts
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { buildCompanyOntology } from "./build-company-ontology"
import type { CompanyOntologyAnswers } from "./build-company-ontology"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"

export async function saveCompanyOntologyImpl(
  agentId: string,
  answers: CompanyOntologyAnswers,
  execFn?: ExecFileFn
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { ok: false, message: "Unknown company" }
  }

  const templatePath = path.join(agent.rootPath, "docs", "templates", "ontology-starter.yaml")
  let templateContent: string
  try {
    templateContent = await readFile(templatePath, "utf-8")
  } catch {
    return { ok: false, message: "This company is missing docs/templates/ontology-starter.yaml" }
  }

  const yamlContent = buildCompanyOntology(agent.name, answers, templateContent)
  const relativePath = path.join("definitions", "ontology", "company.yaml")
  const targetPath = path.join(agent.rootPath, relativePath)

  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, yamlContent, "utf-8")
  await commitFile(agent.rootPath, relativePath, "Define company context via AI-Native control panel", execFn)

  return { ok: true }
}
```

Create `lib/save-company-ontology.ts`:

```ts
"use server"

import { saveCompanyOntologyImpl } from "./save-company-ontology-impl"
import type { CompanyOntologyAnswers } from "./build-company-ontology"

export async function saveCompanyOntology(
  agentId: string,
  answers: CompanyOntologyAnswers
): Promise<{ ok: true } | { ok: false; message: string }> {
  return saveCompanyOntologyImpl(agentId, answers)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/save-company-ontology-impl.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass (210 existing + 4 new = 214)

- [ ] **Step 6: Commit**

```bash
git add lib/save-company-ontology-impl.ts lib/save-company-ontology.ts lib/save-company-ontology-impl.test.ts
git commit -m "feat: add saveCompanyOntologyImpl and its public Server Action"
```

---

### Task 4: `CompanySetupWizard` component, and wiring it into `app/page.tsx` and `AgentCard`

**Files:**
- Create: `components/company-setup-wizard.tsx`
- Modify: `app/page.tsx`
- Modify: `components/agent-card.tsx`

**Interfaces:**
- Consumes: `saveCompanyOntology` (Task 3); `CompanyOntologyAnswers`,
  `Stakeholder` (Task 1); `companyOntologyExists` (Task 2).
- Produces: `CompanySetupWizard({ agentId, companyName }: { agentId:
  string; companyName: string })`, and `AgentCard`'s new
  `showSetupCompanyButton?: boolean` prop, which renders
  `<CompanySetupWizard agentId={agent.id} companyName={agent.name} />`
  when true. This task creates the component and wires it in together, so
  it type-checks in one pass — building the wizard component before the
  page/card changes that reference it (Steps 1–2), then the wiring
  (Steps 3–4), then one type-check covering all of it (Step 5).

No separate test file for the wizard component — this project has no
component-level unit tests for any prior slice's UI (v14–v17 all relied
on live Playwright verification only); Task 5 covers that.

- [ ] **Step 1: Create the wizard component**

Create `components/company-setup-wizard.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { saveCompanyOntology } from "@/lib/save-company-ontology"
import type { Stakeholder } from "@/lib/build-company-ontology"

const STEPS = ["about", "stakeholders", "value-flow", "bottleneck", "review"] as const
type Step = (typeof STEPS)[number]

export function CompanySetupWizard({ agentId, companyName }: { agentId: string; companyName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("about")
  const [domain, setDomain] = useState("")
  const [employeeCount, setEmployeeCount] = useState("")
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([{ role: "", position: "" }])
  const [valueFlow, setValueFlow] = useState({ input: "", transform: "", output: "" })
  const [bottleneck, setBottleneck] = useState("")
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

  function goNext() {
    setStep(STEPS[stepIndex + 1])
  }

  function goBack() {
    setStep(STEPS[stepIndex - 1])
  }

  function updateStakeholder(index: number, field: keyof Stakeholder, value: string) {
    setStakeholders((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  function addStakeholder() {
    setStakeholders((prev) => [...prev, { role: "", position: "" }])
  }

  function removeStakeholder(index: number) {
    setStakeholders((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setPending(true)
    setMessage(null)
    const result = await saveCompanyOntology(agentId, {
      domain,
      employeeCount: employeeCount.trim() ? Number(employeeCount) : undefined,
      stakeholders: stakeholders.filter((s) => s.role.trim() && s.position.trim()),
      valueFlow,
      bottleneck,
    })
    setPending(false)
    if (result.ok) {
      resetAndClose()
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  const aboutValid = domain.trim().length > 0
  const stakeholdersValid = stakeholders.some((s) => s.role.trim() && s.position.trim())
  const valueFlowValid = Boolean(valueFlow.input.trim() && valueFlow.transform.trim() && valueFlow.output.trim())
  const bottleneckValid = bottleneck.trim().length > 0

  const canGoNext =
    (step === "about" && aboutValid) ||
    (step === "stakeholders" && stakeholdersValid) ||
    (step === "value-flow" && valueFlowValid) ||
    (step === "bottleneck" && bottleneckValid)

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Set up your company
      </Button>
      <Sheet open={open} onOpenChange={(next) => !next && resetAndClose()}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Set up {companyName}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            {step === "about" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">What problem does your company solve?</label>
                  <Textarea value={domain} onChange={(e) => setDomain(e.target.value)} className="min-h-24" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">How many employees? (optional)</label>
                  <Input
                    type="number"
                    min="0"
                    value={employeeCount}
                    onChange={(e) => setEmployeeCount(e.target.value)}
                  />
                </div>
              </div>
            )}
            {step === "stakeholders" && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Who are your key stakeholders?</p>
                {stakeholders.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={s.role}
                      onChange={(e) => updateStakeholder(i, "role", e.target.value)}
                      placeholder="Role (e.g. Client)"
                    />
                    <Input
                      value={s.position}
                      onChange={(e) => updateStakeholder(i, "position", e.target.value)}
                      placeholder="Their position (e.g. Pays for the service)"
                    />
                    {stakeholders.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removeStakeholder(i)}>
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={addStakeholder}>
                  Add another stakeholder
                </Button>
              </div>
            )}
            {step === "value-flow" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">What do you receive?</label>
                  <Textarea
                    value={valueFlow.input}
                    onChange={(e) => setValueFlow((v) => ({ ...v, input: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">What do you do with it?</label>
                  <Textarea
                    value={valueFlow.transform}
                    onChange={(e) => setValueFlow((v) => ({ ...v, transform: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">What do you deliver?</label>
                  <Textarea
                    value={valueFlow.output}
                    onChange={(e) => setValueFlow((v) => ({ ...v, output: e.target.value }))}
                  />
                </div>
              </div>
            )}
            {step === "bottleneck" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  What&apos;s the most time-consuming or tribal-knowledge-dependent work right now?
                </label>
                <Textarea value={bottleneck} onChange={(e) => setBottleneck(e.target.value)} className="min-h-24" />
              </div>
            )}
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
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 2: Read both files this task also modifies**

Read `app/page.tsx` and `components/agent-card.tsx` in full. Confirm
`app/page.tsx` still computes `results`/`avatarByAgentId` the way shown
below, and `components/agent-card.tsx` still has the exact prop list and
`<div className="space-y-2 pt-1">` action block shown below. If either
has drifted, stop and reconcile before editing.

- [ ] **Step 3: Modify `app/page.tsx`**

Change the import block at the top from:

```tsx
import { TAKESHI_AGENT_LAUNCHD_LABEL } from "@/lib/config"
import { getEffectiveAgents, getEffectiveAdapters } from "@/lib/get-effective-agents"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { checkLaunchdJob } from "@/lib/adapters/launchd"
import { checkPollLockStatus } from "@/lib/adapters/poll-lock"
import { AgentCard } from "@/components/agent-card"
import { AddCompanyForm } from "@/components/add-company-form"
import { getAvatars } from "@/lib/avatars-registry"
```

to:

```tsx
import { TAKESHI_AGENT_LAUNCHD_LABEL } from "@/lib/config"
import { getEffectiveAgents, getEffectiveAdapters } from "@/lib/get-effective-agents"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { checkLaunchdJob } from "@/lib/adapters/launchd"
import { checkPollLockStatus } from "@/lib/adapters/poll-lock"
import { AgentCard } from "@/components/agent-card"
import { AddCompanyForm } from "@/components/add-company-form"
import { getAvatars } from "@/lib/avatars-registry"
import { companyOntologyExists } from "@/lib/company-ontology-exists"
```

Change the `results.map` block from:

```tsx
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((result) => {
          const latest = mergeAndSortActivities([result])[0] ?? null
          const isTakeshiAgent = result.agent.id === "plh-takeshi-agent"
          const isAiCompanyStarterMain = result.agent.id === "ai-company-starter-main"
          const isPlhOps = result.agent.id === "plh-ops"
          const isRegisteredCompany = !["plh-takeshi-agent", "ai-company-starter-main", "plh-ops"].includes(
            result.agent.id
          )
          return (
            <AgentCard
              key={result.agent.id}
              agent={result.agent}
              latestActivity={latest}
              error={result.error}
              launchdHealth={isTakeshiAgent ? launchdHealth : undefined}
              pollStatus={isTakeshiAgent ? pollStatus : undefined}
              showVerifyButton={isAiCompanyStarterMain}
              showDailyTeamLogButton={isPlhOps}
              removable={isRegisteredCompany}
              avatarUrl={avatarByAgentId[result.agent.id] ?? null}
            />
          )
        })}
      </div>
```

to:

```tsx
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {await Promise.all(
          results.map(async (result) => {
            const latest = mergeAndSortActivities([result])[0] ?? null
            const isTakeshiAgent = result.agent.id === "plh-takeshi-agent"
            const isAiCompanyStarterMain = result.agent.id === "ai-company-starter-main"
            const isPlhOps = result.agent.id === "plh-ops"
            const isRegisteredCompany = !["plh-takeshi-agent", "ai-company-starter-main", "plh-ops"].includes(
              result.agent.id
            )
            const needsCompanySetup =
              result.agent.kind === "command-set" && !(await companyOntologyExists(result.agent.rootPath))
            return (
              <AgentCard
                key={result.agent.id}
                agent={result.agent}
                latestActivity={latest}
                error={result.error}
                launchdHealth={isTakeshiAgent ? launchdHealth : undefined}
                pollStatus={isTakeshiAgent ? pollStatus : undefined}
                showVerifyButton={isAiCompanyStarterMain}
                showDailyTeamLogButton={isPlhOps}
                removable={isRegisteredCompany}
                avatarUrl={avatarByAgentId[result.agent.id] ?? null}
                showSetupCompanyButton={needsCompanySetup}
              />
            )
          })
        )}
      </div>
```

- [ ] **Step 4: Modify `components/agent-card.tsx`**

Add one import, alongside the existing component imports:

```tsx
import { CompanySetupWizard } from "@/components/company-setup-wizard"
```

Change the props type from:

```tsx
type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  launchdHealth?: LaunchdHealth
  pollStatus?: PollLockStatus
  showVerifyButton?: boolean
  showDailyTeamLogButton?: boolean
  removable?: boolean
  avatarUrl?: string | null
}
```

to:

```tsx
type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  launchdHealth?: LaunchdHealth
  pollStatus?: PollLockStatus
  showVerifyButton?: boolean
  showDailyTeamLogButton?: boolean
  removable?: boolean
  avatarUrl?: string | null
  showSetupCompanyButton?: boolean
}
```

Change the function signature from:

```tsx
export function AgentCard({
  agent,
  latestActivity,
  error,
  launchdHealth,
  pollStatus,
  showVerifyButton,
  showDailyTeamLogButton,
  removable,
  avatarUrl,
}: AgentCardProps) {
```

to:

```tsx
export function AgentCard({
  agent,
  latestActivity,
  error,
  launchdHealth,
  pollStatus,
  showVerifyButton,
  showDailyTeamLogButton,
  removable,
  avatarUrl,
  showSetupCompanyButton,
}: AgentCardProps) {
```

Change the action block from:

```tsx
        <div className="space-y-2 pt-1">
          {pollStatus && <TriggerPollButton pollStatus={pollStatus} />}
          {showVerifyButton && <VerifyButton />}
          {showDailyTeamLogButton && <DailyTeamLogButton />}
          {removable && <RemoveCompanyButton id={agent.id} name={agent.name} />}
          <AgentAvatarForm agentId={agent.id} currentUrl={avatarUrl ?? null} />
        </div>
```

to:

```tsx
        <div className="space-y-2 pt-1">
          {pollStatus && <TriggerPollButton pollStatus={pollStatus} />}
          {showVerifyButton && <VerifyButton />}
          {showDailyTeamLogButton && <DailyTeamLogButton />}
          {showSetupCompanyButton && <CompanySetupWizard agentId={agent.id} companyName={agent.name} />}
          {removable && <RemoveCompanyButton id={agent.id} name={agent.name} />}
          <AgentAvatarForm agentId={agent.id} currentUrl={avatarUrl ?? null} />
        </div>
```

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all 214 tests still pass (this task adds no new tests)

- [ ] **Step 6: Commit**

```bash
git add components/company-setup-wizard.tsx app/page.tsx components/agent-card.tsx
git commit -m "feat: add the company-context setup wizard and wire it into AgentCard"
```

---

### Task 5: README and final verification

**Files:**
- Modify: `README.md` (append a new section after the most recent
  existing entry)

- [ ] **Step 1: Read the current README's most recent section**

Read the end of `README.md` to find the most recently appended section
(the v17 entry, if this plan runs right after v17) and match its heading
style (`## vNN: <short title>`).

- [ ] **Step 2: Append the v18 section**

Add, after the last existing section:

```markdown
## v18: guided company-context setup

`/define-company` (the Claude Code command that fills in a new company's
`definitions/ontology/company.yaml`) is fully conversational — it assumes
the user is comfortable chatting with an AI agent in a terminal. This
dashboard's audience is non-technical people setting up their AI
company, so v18 adds a plain step-by-step wizard instead: business
domain, stakeholders, value flow, and biggest bottleneck, one screen at a
time, with a plain-language review before saving — no YAML, no terminal.

`/define-company` does two different things: asking those four
structured questions, and using the AI agent's own reasoning to *invent*
industry-specific `customer`/`org`/`product` domain entities. This slice
only does the first — the entity sections are copied unmodified from the
company's own `docs/templates/ontology-starter.yaml` (the same skeleton
v17 already scaffolds into every new company). Real AI-assisted entity
generation is deferred until v19 (connect an agent) exists, so it can use
an already-connected agent instead of this dashboard building its own
AI-calling infrastructure just for this.

The "Set up your company" button appears on any `command-set`-kind
agent's card that doesn't have a `company.yaml` yet — which in practice
today means a company just created via v17, since `ai-company-starter-main`
already has one. This is the first slice to add a real npm dependency
(`yaml`, for correct escaping of free-text answers into generated YAML)
rather than reusing what was already installed.

This is piece 2 of the roadmap toward a Fleece.ai-style onboarding
experience (v17: create a company; v19: connect an agent/integrations;
v20: guided command/workflow discovery — still just named, not designed).
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit` — expect no errors
Run: `npx vitest run` — expect all 214 tests passing
Run: `npm run build` — expect a clean production build

- [ ] **Step 4: Live visual + functional verification**

Start a dev server on an unused port. Using Playwright (or equivalent),
against a **disposable `/tmp` company created via v17's own "Add a
company" → create-from-template flow** — never write anywhere under the
real `ai-company-starter-main`, `plh-takeshi-agent`, or `plh-ops`:

1. Create a fresh disposable company under `/tmp` via the existing
   "Add a company" flow (same as v17's live check).
2. Confirm its card shows a "Set up your company" button (it has no
   `company.yaml` yet).
3. Open the wizard. Confirm "Next" is disabled until the current step's
   required fields are filled. Walk through all 4 question steps, add a
   second stakeholder on the stakeholders step and confirm both appear
   in the review step's summary, then reach the review screen and
   confirm every answer is reflected in plain language (not raw YAML).
4. Click "Save". Confirm the Sheet closes and the card's "Set up your
   company" button is now gone (re-fetch confirms `company.yaml` now
   exists).
5. On disk, confirm `definitions/ontology/company.yaml` is valid YAML
   (`python3 -c "import yaml, sys; yaml.safe_load(open(sys.argv[1]))"
   <path>` or equivalent) with the right `company_summary`/
   `stakeholders`/`value_flow`, and that `customer`/`org`/`product`
   match the company's own `docs/templates/ontology-starter.yaml`
   exactly.
6. Confirm `git -C <target> log --oneline` shows exactly one new commit
   on top of the create-from-template commit, with the message "Define
   company context via AI-Native control panel".
7. Remove the disposable company via the existing "Remove" button, then
   delete the `/tmp` directory.
8. Take one screenshot of the review step for the record.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document v18 guided company-context setup in README"
```
