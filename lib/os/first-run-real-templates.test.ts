import { describe, it, expect } from "vitest"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseCompanyOntology } from "@/lib/parse-company-ontology"
import { profileAnsweredFrom } from "./first-run"

/**
 * The real bundled packs, not a hand-made stand-in: a synthetic `{ ok: false,
 * nothingSaved: true }` cannot notice the day a pack ships an ontology whose
 * shape the wizard's own parser reads as ANSWERED, which would tell every new
 * user of that pack to skip the questions (Review Focus 3).
 */
const PACKS_DIR = path.join(process.cwd(), "templates", "packs")
const packs = readdirSync(PACKS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

describe("profileAnsweredFrom on the real starter packs", () => {
  it("finds the packs the app ships", () => {
    expect(packs.length).toBeGreaterThan(0)
  })

  for (const pack of packs) {
    it(`${pack}: a company scaffolded from it has not answered the wizard yet`, () => {
      const file = path.join(PACKS_DIR, pack, "definitions", "ontology", "company.yaml")
      expect(existsSync(file), `${pack} ships no company.yaml`).toBe(true)
      expect(profileAnsweredFrom(parseCompanyOntology(readFileSync(file, "utf-8")))).toBe(false)
    })
  }
})
