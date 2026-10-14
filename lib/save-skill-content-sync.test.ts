import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

vi.mock("./resolve-known-skill", () => ({ resolveWritableSkillPath: vi.fn() }))

import { resolveWritableSkillPath } from "./resolve-known-skill"
import { saveSkillContentImpl } from "./save-skill-content-impl"

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "save-shared-"))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function put(rel: string, text: string) {
  const file = path.join(root, ...rel.split("/"))
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text)
  return file
}
const allow = (realPath: string) =>
  vi.mocked(resolveWritableSkillPath).mockResolvedValue({ ok: true, realPath, agentRootPath: root })

describe("saveSkillContentImpl on a shared skill", () => {
  it("regenerates each agent's copy and commits the copies with the edit", async () => {
    const file = await put(".agents/skills/probe/SKILL.md", "---\nname: probe\n---\nold\n")
    allow(file)
    const calls: string[][] = []

    const result = await saveSkillContentImpl(file, "---\nname: probe\n---\nnew\n", async (_c, args) => (calls.push(args), { stdout: "", stderr: "" }))

    expect(result.saved).toBe(true)
    expect(await readFile(path.join(root, ".claude/skills/probe/SKILL.md"), "utf-8")).toContain("new")
    const added = calls.find((args) => args.includes("add"))!
    for (const expected of [".agents/skills/probe/SKILL.md", ".claude/skills/probe", ".kiro/skills/probe", ".agents/mirror.json"]) {
      expect(added).toContain(expected)
    }
  })

  it("still saves and commits the edit when git refuses the generated copies (a repo that ignores .claude or .kiro)", async () => {
    const file = await put(".agents/skills/probe/SKILL.md", "---\nname: probe\n---\nold\n")
    allow(file)
    const committed: string[][] = []
    const execFn = async (_c: string, args: string[]) => {
      // What `git add` does with an ignored path: it fails, and nothing is committed.
      if (args.includes("add") && args.some((arg) => arg.startsWith(".kiro/") || arg.startsWith(".claude/"))) throw new Error("paths are ignored")
      if (args.includes("commit")) committed.push(args)
      return { stdout: "", stderr: "" }
    }

    const result = await saveSkillContentImpl(file, "---\nname: probe\n---\nnew\n", execFn)

    expect(result).toEqual({ saved: true, message: "Saved and committed" })
    expect(committed).toHaveLength(1)
    expect(committed[0]).toContain(".agents/skills/probe/SKILL.md")
    expect(await readFile(path.join(root, ".claude/skills/probe/SKILL.md"), "utf-8")).toContain("new")
  })

  it("does not create the shared folder when a skill outside it is edited", async () => {
    const file = await put(".claude/skills/other/SKILL.md", "---\nname: other\n---\nold\n")
    allow(file)

    await saveSkillContentImpl(file, "---\nname: other\n---\nnew\n", async () => ({ stdout: "", stderr: "" }))

    await expect(stat(path.join(root, ".agents"))).rejects.toThrow()
  })
})
