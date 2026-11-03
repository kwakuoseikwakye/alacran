import { describe, it, expect, afterEach } from "vitest"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"
import { getCompanyDepartments } from "./registry"
import type { Ontology } from "@/lib/os/ontology/schema"

const dirs: string[] = []
const mk = (prefix: string) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); dirs.push(d); return d }
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }) })

describe("getCompanyDepartments", () => {
  it("returns the 5 core application departments by default", () => {
    const depts = getCompanyDepartments()
    expect(depts.length).toBe(5)
    expect(depts.map((d) => d.slug)).toEqual(["funnel", "comms", "content", "social", "finances"])
  })

  it("discovers additional departmental subfolders under records/", () => {
    const tmpDir = mk("dept-test-")
    const recordsDir = path.join(tmpDir, "records")
    fs.mkdirSync(path.join(recordsDir, "workflows"), { recursive: true })
    fs.mkdirSync(path.join(recordsDir, "support"), { recursive: true })
    fs.writeFileSync(path.join(recordsDir, "support", "tickets.yaml"), "records: []")

    const depts = getCompanyDepartments(tmpDir)
    const slugs = depts.map((d) => d.slug)

    expect(slugs).toContain("workflows")
    expect(slugs).toContain("support")

    const supportDept = depts.find((d) => d.slug === "support")!
    expect(supportDept.name).toBe("Support")
    expect(supportDept.recordsCount).toBe(1)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("maps ontology roles to corresponding departments", () => {
    const mockOntology: Ontology = {
      customer: { segments: [], acquisition: [] },
      product: { offerings: [], value_flow: [] },
      org: {
        roles: [
          { id: "finance-lead", name: "Head of Finance", owns: "Accounting and Stripe ledger" },
          { id: "content-writer", name: "Content Specialist", owns: "Blog and newsletters" },
        ],
        decisions: [],
      },
    }

    const depts = getCompanyDepartments(undefined, mockOntology)
    const finances = depts.find((d) => d.slug === "finances")!
    const content = depts.find((d) => d.slug === "content")!

    expect(finances.roles.some((r) => r.id === "finance-lead")).toBe(true)
    expect(content.roles.some((r) => r.id === "content-writer")).toBe(true)
  })
})

import { getCompanyDepartmentsDetailed, showsOnRecords } from "./registry"

function writeDefs(root: string, text: string) {
  fs.mkdirSync(path.join(root, "definitions"), { recursive: true })
  fs.writeFileSync(path.join(root, "definitions", "departments.yaml"), text)
}
const legal = `departments:\n  - {slug: legal, name: Legal Affairs, purpose: Contracts., color: "#0369a1"}\n`

describe("custom departments in the registry", () => {
  it("a definition with no folder yet is a custom department after the built-ins", () => {
    const root = mk("reg-")
    writeDefs(root, legal)
    const { departments } = getCompanyDepartmentsDetailed(root)
    expect(departments.map((d) => d.slug)).toEqual(["funnel", "comms", "content", "social", "finances", "legal"])
    expect(departments.at(-1)).toMatchObject({ name: "Legal Affairs", color: "#0369a1", tagline: "Contracts.", purpose: "Contracts.", source: "custom", recordsCount: 0 })
  })
  it("the definition wins over the discovered folder's label and colour, and counts the folder's files", () => {
    const root = mk("reg-")
    writeDefs(root, legal)
    fs.mkdirSync(path.join(root, "records", "legal"), { recursive: true })
    fs.writeFileSync(path.join(root, "records", "legal", "a.md"), "x")
    fs.writeFileSync(path.join(root, "records", "legal", ".hidden"), "x")
    const d = getCompanyDepartmentsDetailed(root).departments.find((x) => x.slug === "legal")!
    expect(d).toMatchObject({ name: "Legal Affairs", source: "custom", recordsCount: 1 })
  })
  it("discovered folders stay discovered; workflows and roadmap are app-owned; company and hidden folders never appear", () => {
    const root = mk("reg-")
    for (const f of ["support", "workflows", "roadmap", "company", ".archive"]) fs.mkdirSync(path.join(root, "records", f), { recursive: true })
    const by = Object.fromEntries(getCompanyDepartmentsDetailed(root).departments.map((d) => [d.slug, d.source]))
    expect(by).toMatchObject({ support: "discovered", workflows: "app", roadmap: "app", funnel: "built-in" })
    expect(by).not.toHaveProperty("company")
    expect(by).not.toHaveProperty(".archive")
  })
  it("AC11: records/actions is the app's Actions log, shown and opened on Records; other app folders are not", () => {
    const root = mk("reg-")
    for (const f of ["actions", "workflows", "support"]) fs.mkdirSync(path.join(root, "records", f), { recursive: true })
    const all = getCompanyDepartmentsDetailed(root).departments
    const actions = all.find((d) => d.slug === "actions")!
    expect(actions).toMatchObject({ source: "app", name: "Actions", tagline: "What your AI and jobs did outside the company, one line each." })
    expect(all.filter(showsOnRecords).map((d) => d.slug)).toEqual(["actions", "support"])
    expect(showsOnRecords({ source: "custom", slug: "legal" })).toBe(true)
    expect(showsOnRecords({ source: "app", slug: "roadmap" })).toBe(false)
    expect(showsOnRecords({ source: "built-in", slug: "funnel" })).toBe(false)
  })
  it("a malformed definitions file is reported and ignored; built-ins and discovered folders still show", () => {
    const root = mk("reg-")
    writeDefs(root, "departments: [\n")
    fs.mkdirSync(path.join(root, "records", "support"), { recursive: true })
    const r = getCompanyDepartmentsDetailed(root)
    expect(r.definitionsError).toContain("definitions/departments.yaml")
    expect(r.departments.map((d) => d.slug)).toEqual(["funnel", "comms", "content", "social", "finances", "support"])
  })
  it("a definition can't override a built-in (reserved slugs fail validation, so the file is malformed)", () => {
    const root = mk("reg-")
    writeDefs(root, `departments:\n  - {slug: finances, name: Mine, purpose: p, color: "#0369a1"}\n`)
    const r = getCompanyDepartmentsDetailed(root)
    expect(r.definitionsError).not.toBeNull()
    expect(r.departments.find((d) => d.slug === "finances")!.name).toBe("Finances")
  })
  it("ontology roles can land in a custom department", () => {
    const root = mk("reg-")
    writeDefs(root, legal)
    const ontology = { customer: { segments: [], acquisition: [] }, product: { offerings: [], value_flow: [] }, org: { roles: [{ id: "counsel", name: "Counsel", owns: "legal reviews" }], decisions: [] } } as Ontology
    expect(getCompanyDepartmentsDetailed(root, ontology).departments.find((d) => d.slug === "legal")!.roles).toHaveLength(1)
  })
})
