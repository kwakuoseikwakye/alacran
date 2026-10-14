import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import yaml from "yaml"
import { TEMPLATE_MANIFEST } from "../../company-template-manifest"

const RECORD_FILES = [
  "finances/transactions.yaml",
  "funnel/leads.yaml",
  "social/accounts.yaml",
  "content/items.yaml",
  "workflows/processes.yaml",
  "roadmap/milestones.yaml",
]

describe("Starter Department Records", () => {
  it("includes 'records' in TEMPLATE_MANIFEST", () => {
    expect(TEMPLATE_MANIFEST).toContain("records")
  })

  for (const relPath of RECORD_FILES) {
    it(`seeds valid record file '${relPath}'`, () => {
      const fullPath = path.join(process.cwd(), "templates", "company-starter", "records", relPath)
      expect(fs.existsSync(fullPath), `Missing template record file: ${relPath}`).toBe(true)
      const raw = fs.readFileSync(fullPath, "utf-8")
      const parsed = yaml.parse(raw) as { records?: unknown[] }
      expect(parsed).toBeDefined()
      expect(Array.isArray(parsed.records)).toBe(true)
    })
  }
})
