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
