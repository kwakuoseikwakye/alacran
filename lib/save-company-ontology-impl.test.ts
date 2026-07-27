import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { parse } from "yaml"
import type { ExecFileFn } from "./git-commit-file"
import type { CompanyOntologyAnswers } from "./build-company-ontology"

let root: string
let execCalls: { command: string; args: string[] }[]

const fakeExecFn: ExecFileFn = async (command, args) => {
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
