import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { readDefinitions, revisionOf, DEFINITIONS_REL } from "./definitions"

const dirs: string[] = []
function company(yamlText?: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "defs-"))
  dirs.push(dir)
  if (yamlText !== undefined) {
    fs.mkdirSync(path.join(dir, "definitions"), { recursive: true })
    fs.writeFileSync(path.join(dir, DEFINITIONS_REL), yamlText)
  }
  return dir
}
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }) })

const good = `# kept\ndepartments:\n  - slug: legal\n    name: Legal\n    purpose: Contracts.\n    color: "#0369a1"\nother: 1\n`

describe("readDefinitions", () => {
  it("a missing file means no custom departments", () => {
    const r = readDefinitions(company())
    expect(r).toMatchObject({ ok: true, departments: [], text: null, revision: "absent" })
  })
  it("parses entries and exposes the revision of the exact bytes", () => {
    const r = readDefinitions(company(good))
    expect(r.ok && r.departments).toEqual([{ slug: "legal", name: "Legal", purpose: "Contracts.", color: "#0369a1" }])
    expect(r.revision).toBe(revisionOf(good))
  })
  it("an empty or comment-only file is valid and empty", () => {
    expect(readDefinitions(company("# nothing yet\n"))).toMatchObject({ ok: true, departments: [] })
    expect(readDefinitions(company("departments:\n"))).toMatchObject({ ok: true, departments: [] })
  })
  it.each([
    ["not yaml", "departments: [\n"],
    ["wrong shape", "departments: nope\n"],
    ["reserved slug", "departments:\n  - {slug: finances, name: F, purpose: p, color: '#0369a1'}\n"],
    ["app-owned slug", "departments:\n  - {slug: roadmap, name: R, purpose: p, color: '#0369a1'}\n"],
    ["bad slug", "departments:\n  - {slug: Legal Dept, name: L, purpose: p, color: '#0369a1'}\n"],
    ["bad colour", "departments:\n  - {slug: legal, name: L, purpose: p, color: blue}\n"],
    ["duplicate slug", "departments:\n  - {slug: legal, name: L, purpose: p, color: '#0369a1'}\n  - {slug: legal, name: M, purpose: p, color: '#0369a1'}\n"],
  ])("a malformed file (%s) is an error, never an empty list", (_label, text) => {
    const r = readDefinitions(company(text))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("definitions/departments.yaml")
  })
})
