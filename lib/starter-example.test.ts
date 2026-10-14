import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { isUntouchedStarterExample } from "./starter-example"

const templates = () => path.join(process.cwd(), "templates")
const leadershipExample = readFileSync(
  path.join(templates(), "packs", "leadership-team", "definitions", "ontology", "company.yaml"),
  "utf-8"
)

describe("isUntouchedStarterExample", () => {
  it("recognises a pack's example file, as copied into a new company", async () => {
    expect(await isUntouchedStarterExample(leadershipExample, templates)).toBe(true)
  })

  it("is false once anything in it has changed", async () => {
    expect(await isUntouchedStarterExample(leadershipExample + "\nbottleneck: Chasing invoices\n", templates)).toBe(false)
  })

  it("is false for an empty or missing file", async () => {
    expect(await isUntouchedStarterExample("", templates)).toBe(false)
  })
})
