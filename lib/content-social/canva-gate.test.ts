import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { CANVA_GATED_TOOLS } from "./canva-tools"

const template = (p: string) => fs.readFileSync(path.join(process.cwd(), "templates/company-starter", p), "utf-8")

// CANVA_GATED_TOOLS is empty until step zero is run (v199 Task 0b); the loop becomes live then. The company template's verify.py has no connector-gate check (only the parent repo's does), so this pins settings.json only.
describe("Canva's gated tools are denied in the company template", () => {
  it("settings.json deny list contains every one", () => {
    const deny: string[] = JSON.parse(template(".claude/settings.json")).permissions.deny
    expect(Array.isArray(deny)).toBe(true)
    for (const tool of CANVA_GATED_TOOLS) expect(deny, tool).toContain(tool)
  })
})
