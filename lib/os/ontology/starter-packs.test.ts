import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import yaml from "yaml"
import { ontologySchema } from "./schema"

const PACKS = [
  "software-engineering",
  "sales",
  "marketing",
  "customer-support",
  "hr-people",
  "leadership-team",
]

describe("Starter Pack Ontologies", () => {
  for (const pack of PACKS) {
    it(`pack '${pack}' conforms to canonical ontologySchema`, () => {
      const filePath = path.join(
        process.cwd(),
        "templates",
        "packs",
        pack,
        "definitions",
        "ontology",
        "company.yaml"
      )
      const raw = fs.readFileSync(filePath, "utf-8")
      const parsed = yaml.parse(raw)
      const res = ontologySchema.safeParse(parsed)
      expect(res.success, `Pack ${pack} failed validation: ${JSON.stringify(res.error?.issues)}`).toBe(true)

      if (res.success) {
        expect(res.data.org.roles.length).toBeGreaterThanOrEqual(3)
        expect(res.data.org.decisions.length).toBeGreaterThanOrEqual(3)
        expect(res.data.customer.segments.length).toBeGreaterThanOrEqual(1)
        expect(res.data.product.offerings.length).toBeGreaterThanOrEqual(1)
        expect(res.data.product.value_flow.length).toBeGreaterThanOrEqual(2)
      }
    })
  }
})
