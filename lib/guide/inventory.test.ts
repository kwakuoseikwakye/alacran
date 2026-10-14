import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { COMPANY_STARTER_PACKS } from "@/lib/company-starter-packs"
import { readGuideInputs, TEAM_SUMMARY, teamSummary, departmentPurpose } from "./inventory"

const dirs: string[] = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "guide-inv-")); dirs.push(d); return d }
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }) })
const put = (root: string, rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), text)
}
const skill = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n\nBODY-SHOULD-NEVER-APPEAR\n`

function company() {
  const root = tmp()
  put(root, ".claude/commands/verify.md", skill("verify", "Run the company's checks."))
  put(root, ".agents/skills/own-skill/SKILL.md", skill("own-skill", "Something this company wrote."))
  // The Sales pack's command, moved to the shared folder as a real company has it.
  put(root, ".agents/skills/follow-up-lead/SKILL.md", skill("follow-up-lead", "Follow up with a lead."))
  const packs = tmp()
  put(packs, "sales/.claude/commands/follow-up-lead.md", skill("follow-up-lead", "Follow up with a lead."))
  put(packs, "sales/.claude/commands/draft-proposal.md", skill("draft-proposal", "Draft a proposal."))
  return { root, packs }
}

describe("readGuideInputs", () => {
  it("lists installed packs with their command names, and only the company's own commands", async () => {
    const { root, packs } = company()
    const { inputs, problem } = await readGuideInputs(root, packs)
    expect(problem).toBeNull()
    expect(inputs.teams).toEqual([
      expect.objectContaining({ id: "sales", label: "Sales", commands: ["draft-proposal", "follow-up-lead"] }),
    ])
    expect(inputs.commands.map((c) => c.name).sort()).toEqual(["own-skill", "verify"])
    expect(inputs.commands.find((c) => c.name === "verify")!.description).toBe("Run the company's checks.")
  })
  it("never reads a skill body into the inputs", async () => {
    const { root, packs } = company()
    expect(JSON.stringify(await readGuideInputs(root, packs))).not.toContain("BODY-SHOULD-NEVER-APPEAR")
  })
  it("a pack the company does not hold is not listed", async () => {
    const root = tmp(); const packs = tmp()
    put(packs, "sales/.claude/commands/follow-up-lead.md", skill("follow-up-lead", "x"))
    expect((await readGuideInputs(root, packs)).inputs.teams).toEqual([])
  })
  it("lists custom departments and built-ins with records; not empty built-ins, discovered or app-owned folders", async () => {
    const { root, packs } = company()
    put(root, "definitions/departments.yaml", "departments:\n  - {slug: legal, name: Legal Affairs, purpose: Contracts., color: \"#0369a1\"}\n")
    put(root, "records/funnel/leads.yaml", "records: []\n")
    put(root, "records/support/x.md", "x")
    put(root, "records/workflows/processes.yaml", "x")
    const { inputs } = await readGuideInputs(root, packs)
    expect(inputs.departments.map((d) => d.slug).sort()).toEqual(["funnel", "legal"])
    expect(inputs.departments.find((d) => d.slug === "legal")).toEqual({ slug: "legal", name: "Legal Affairs", purpose: "Contracts." })
  })
  it("reports a problem when definitions/departments.yaml is malformed, instead of guessing", async () => {
    const { root, packs } = company()
    put(root, "definitions/departments.yaml", "departments: [\n")
    const { problem } = await readGuideInputs(root, packs)
    expect(problem).toContain("definitions/departments.yaml")
  })
})

describe("team summaries and fallbacks", () => {
  it("every installable pack has a short, complete, one-line summary", () => {
    for (const p of COMPANY_STARTER_PACKS.filter((p) => p.dirName)) {
      const s = teamSummary(p.id, p.category)
      expect(Object.hasOwn(TEAM_SUMMARY, p.id), p.id).toBe(true)
      expect(s.length).toBeGreaterThan(0)
      expect(s.length).toBeLessThanOrEqual(100)
      expect(s.endsWith(".")).toBe(true)
    }
  })
  it("an unknown pack id (even a prototype key) falls back to '<category> team'", () => {
    expect(teamSummary("brand-new", "Finance")).toBe("Finance team")
    expect(teamSummary("constructor", "Finance")).toBe("Finance team")
  })
  it("an empty purpose falls back to the tagline", () => {
    expect(departmentPurpose({ purpose: "", tagline: "T" })).toBe("T")
    expect(departmentPurpose({ purpose: "P", tagline: "T" })).toBe("P")
    expect(departmentPurpose({ tagline: undefined })).toBe("")
  })
})
