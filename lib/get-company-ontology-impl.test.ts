import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "get-ontology-"))
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

describe("getCompanyOntologyImpl", () => {
  it("reads and parses an existing company.yaml", async () => {
    await mockAgents()
    await mkdir(path.join(root, "definitions", "ontology"), { recursive: true })
    await writeFile(
      path.join(root, "definitions", "ontology", "company.yaml"),
      "company_summary:\n  domain: A bakery\n  employee_count: 4\n  primary_bottleneck: Slow ovens\n" +
        "stakeholders:\n  - role: Baker\n    position: Runs the shop\n" +
        "value_flow:\n  input: Flour\n  transform: Bake it\n  output: Bread\n"
    )
    const { getCompanyOntologyImpl } = await import("./get-company-ontology-impl")

    const result = await getCompanyOntologyImpl("second-co")

    expect(result).toEqual({
      ok: true,
      answers: {
        domain: "A bakery",
        employeeCount: 4,
        stakeholders: [{ role: "Baker", position: "Runs the shop" }],
        valueFlow: { input: "Flour", transform: "Bake it", output: "Bread" },
        bottleneck: "Slow ovens",
      },
    })
  })

  it("returns ok:false when company.yaml doesn't exist yet", async () => {
    await mockAgents()
    const { getCompanyOntologyImpl } = await import("./get-company-ontology-impl")

    const result = await getCompanyOntologyImpl("second-co")

    expect(result.ok).toBe(false)
  })

  it("returns ok:false for an unknown agent id", async () => {
    await mockAgents()
    const { getCompanyOntologyImpl } = await import("./get-company-ontology-impl")

    const result = await getCompanyOntologyImpl("does-not-exist")

    expect(result).toEqual({ ok: false, message: "Unknown company" })
  })
})
