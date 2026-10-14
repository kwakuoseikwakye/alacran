import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { assertUnderTmp, buildMeasureCompany } from "./setup"

const dirs: string[] = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "guide-measure-")); dirs.push(d); return d }
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }) })

describe("assertUnderTmp", () => {
  it("accepts the temp dir and anything below it", async () => {
    await expect(assertUnderTmp(path.join(os.tmpdir(), "x", "y"))).resolves.toBeUndefined()
  })
  it("refuses the home directory, the repo and relative escapes", async () => {
    await expect(assertUnderTmp(os.homedir())).rejects.toThrow(/temp/i)
    await expect(assertUnderTmp(process.cwd())).rejects.toThrow(/temp/i)
    await expect(assertUnderTmp(path.join(os.tmpdir(), "..", "elsewhere"))).rejects.toThrow(/temp/i)
  })
})

describe("buildMeasureCompany", () => {
  it("refuses a parent outside the temp dir and creates nothing", async () => {
    const before = fs.readdirSync(os.homedir()).length
    await expect(buildMeasureCompany({ parent: os.homedir(), name: "nope", withGuide: true })).rejects.toThrow(/temp/i)
    expect(fs.readdirSync(os.homedir()).length).toBe(before)
  })
  it("builds a company with the Sales team, a department, shared skills and (optionally) the guide", async () => {
    const parent = tmp()
    const { root } = await buildMeasureCompany({ parent, name: "with", withGuide: true })
    const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")
    expect(agents).toContain("alacran:operating-guide:start")
    expect(agents).toContain("/follow-up-lead")
    expect(agents).toContain("Legal")
    expect(fs.existsSync(path.join(root, ".agents", "skills", "follow-up-lead", "SKILL.md"))).toBe(true)
    expect(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8")).toContain("@AGENTS.md")
    expect(execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" })).toBe("")
  })
  it("the control company is identical but has no guide block", async () => {
    const parent = tmp()
    const { root } = await buildMeasureCompany({ parent, name: "without", withGuide: false })
    expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).not.toContain("alacran:operating-guide")
    expect(fs.existsSync(path.join(root, ".agents", "skills", "follow-up-lead", "SKILL.md"))).toBe(true)
    expect(fs.existsSync(path.join(root, "definitions", "departments.yaml"))).toBe(true)
  })
  it("never touches the owner's registry or Claude trust file", async () => {
    const claude = path.join(os.homedir(), ".claude.json")
    const before = fs.existsSync(claude) ? fs.statSync(claude).mtimeMs : null
    await buildMeasureCompany({ parent: tmp(), name: "safe", withGuide: true })
    expect(fs.existsSync(claude) ? fs.statSync(claude).mtimeMs : null).toBe(before)
  })
})
