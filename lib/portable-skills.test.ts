import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

vi.mock("./get-effective-agents", () => ({ getEffectiveAgents: vi.fn() }))

import { getEffectiveAgents } from "./get-effective-agents"
import { addPortableSkillsImpl, commandToSkillMarkdown, needsPortableSkills, planPortableSkills, previewPortableSkillsImpl } from "./portable-skills"
import { syncAgentSkills } from "./skills/sync-agent-skills"

let root: string
let packs: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "portable-skills-"))
  packs = await mkdtemp(path.join(tmpdir(), "portable-packs-"))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(packs, { recursive: true, force: true })
})

async function put(rel: string, text: string) {
  const file = path.join(root, ...rel.split("/"))
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text)
}
async function putPack(rel: string, text: string) {
  const file = path.join(packs, ...rel.split("/"))
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text)
}
const get = (rel: string) => readFile(path.join(root, ...rel.split("/")), "utf-8")
const exists = (rel: string) => stat(path.join(root, ...rel.split("/"))).then(() => true, () => false)
const CMD = "---\nname: verify\ndescription: Runs the checks.\n---\n# /verify\nRun it.\n"

describe("commandToSkillMarkdown", () => {
  it("leaves a command that already has a name and description byte for byte", () => {
    expect(commandToSkillMarkdown("verify", CMD)).toBe(CMD)
  })
  it("adds the name and description a skill needs when a command has only other keys", () => {
    expect(commandToSkillMarkdown("hire", "---\nworkflow: people\n---\n# Hire someone\nSteps\n")).toBe(
      '---\nname: hire\ndescription: "Hire someone"\nworkflow: people\n---\n# Hire someone\nSteps\n'
    )
  })
  it("adds a whole frontmatter block to a command that has none", () => {
    expect(commandToSkillMarkdown("note", "Write it down.\n")).toBe('---\nname: note\ndescription: "The note command"\n---\n\nWrite it down.\n')
  })
})

describe("planPortableSkills", () => {
  it("plans to move commands and a user's own skill, and to leave app-owned ones", async () => {
    await put(".claude/commands/verify.md", CMD)
    await put(".claude/skills/mine/SKILL.md", "---\nname: mine\n---\n")
    await put(".claude/skills/daily-team-log/SKILL.md", "---\nname: daily-team-log\n---\n")

    const plan = await planPortableSkills(root, packs)

    expect(plan.copyCommands).toEqual(["verify"])
    expect(plan.copySkills).toEqual(["mine"])
    expect(plan.leftInPlace).toEqual(["daily-team-log"])
    expect(plan.removeLegacy).toEqual([".claude/commands/verify.md", ".claude/skills/mine"])
    expect(plan.clashes).toEqual([])
  })

  it("leaves a vendored pack skill alone", async () => {
    // "marketing" is one of the packs lib/vendored-skills.ts knows; the company holds one of its
    // commands and carries its stamp, which is what makes its skills the app's rather than the user's.
    await putPack("marketing/.claude/commands/campaign.md", "x")
    await putPack("marketing/.claude/skills/copywriting/SKILL.md", "x")
    await put(".claude/commands/campaign.md", "---\nname: campaign\ndescription: d\n---\n")
    await put(".claude/skills/copywriting/SKILL.md", "---\nname: copywriting\ndescription: d\n---\n")
    await put(".claude/skills/UPSTREAM-marketing.md", "Tag: v1.0.0\n")

    const plan = await planPortableSkills(root, packs)

    expect(plan.leftInPlace).toEqual(["copywriting"])
    expect(plan.copySkills).toEqual([])
    expect(plan.copyCommands).toEqual(["campaign"])
  })

  it("does not treat its own generated mirrors as something to move", async () => {
    await put(".agents/skills/probe/SKILL.md", "---\nname: probe\n---\n")
    await syncAgentSkills(root)
    const plan = await planPortableSkills(root, packs)
    expect(plan).toEqual({ copyCommands: [], copySkills: [], removeLegacy: [], clashes: [], leftInPlace: [] })
  })

  it("reports a same-named shared skill with different content as a clash and leaves both", async () => {
    await put(".agents/skills/verify/SKILL.md", "something else")
    await put(".claude/commands/verify.md", CMD)
    const plan = await planPortableSkills(root, packs)
    expect(plan.clashes).toEqual(["verify"])
    expect(plan.copyCommands).toEqual([])
    expect(plan.removeLegacy).toEqual([])
  })

  it("finishes a move that stopped half way: identical shared copy, legacy file still there", async () => {
    await put(".agents/skills/verify/SKILL.md", CMD)
    await put(".claude/commands/verify.md", CMD)
    const plan = await planPortableSkills(root, packs)
    expect(plan.copyCommands).toEqual([])
    expect(plan.removeLegacy).toEqual([".claude/commands/verify.md"])
  })

  it("does not call a half-copied skill folder already moved: its other files are not safe to delete", async () => {
    await put(".claude/skills/mine/SKILL.md", "---\nname: mine\n---\nBody\n")
    await put(".claude/skills/mine/references/guide.md", "supporting file")
    await put(".agents/skills/mine/SKILL.md", "---\nname: mine\n---\nBody\n") // only SKILL.md arrived

    const plan = await planPortableSkills(root, packs)

    expect(plan.removeLegacy).toEqual([])
    expect(plan.clashes).toEqual(["mine"])
  })

  it("leaves a commands folder that links outside the company alone, and says so", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "portable-outside-"))
    try {
      await writeFile(path.join(outside, "shared.md"), CMD)
      await mkdir(path.join(root, ".claude"), { recursive: true })
      await symlink(outside, path.join(root, ".claude", "commands"))

      const plan = await planPortableSkills(root, packs)

      expect(plan).toEqual({ copyCommands: [], copySkills: [], removeLegacy: [], clashes: [], leftInPlace: [".claude/commands"] })
      expect(await needsPortableSkills(root, packs)).toBe(false)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})

describe("previewPortableSkillsImpl", () => {
  it("lists what would move and what would stay, and writes nothing", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([{ id: "acme", name: "Acme", rootPath: root, kind: "command-set" }] as never)
    await put(".claude/commands/verify.md", CMD)
    await put(".claude/skills/daily-team-log/SKILL.md", "---\nname: daily-team-log\n---\n")

    const preview = await previewPortableSkillsImpl("acme", packs)

    expect(preview).toEqual({ ok: true, move: ["verify"], keep: ["daily-team-log"] })
    expect(await exists(".agents")).toBe(false)
    expect(await exists(".claude/commands/verify.md")).toBe(true)
  })

  it("refuses an external folder", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([{ id: "acme", name: "Acme", rootPath: root, kind: "external" }] as never)
    expect(await previewPortableSkillsImpl("acme", packs)).toEqual({ ok: false, message: "This kind of folder has no commands to move" })
  })
})

describe("needsPortableSkills", () => {
  it("is true when a flat command exists, false for an empty company", async () => {
    expect(await needsPortableSkills(root, packs)).toBe(false)
    await put(".claude/commands/verify.md", CMD)
    expect(await needsPortableSkills(root, packs)).toBe(true)
  })

  it("is false when the only flat command clashes with a different shared skill: there is nothing the button could do", async () => {
    await put(".agents/skills/verify/SKILL.md", "something else")
    await put(".claude/commands/verify.md", CMD)
    expect(await needsPortableSkills(root, packs)).toBe(false)
  })
})

describe("addPortableSkillsImpl", () => {
  const AGENT = () => ({ id: "acme", name: "Acme", rootPath: root, kind: "command-set" as const })
  // `tracked` is what `git ls-files` would list: a removed path only goes into the commit when git knows it.
  const fakeGit = (tracked: string[] = []) => {
    const calls: string[][] = []
    return {
      calls,
      execFn: async (_c: string, args: string[]) => (calls.push(args), { stdout: args.includes("ls-files") ? tracked.join("\n") : "", stderr: "" }),
    }
  }

  it("moves commands and own skills, generates every agent's folder, removes the old files and commits once", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([AGENT()] as never)
    await put(".claude/commands/verify.md", CMD)
    await put(".claude/skills/mine/SKILL.md", "---\nname: mine\ndescription: Mine.\n---\nBody\n")
    await put(".claude/skills/mine/scripts/go.sh", "echo go\n")
    const { calls, execFn } = fakeGit([".claude/commands/verify.md", ".claude/skills/mine/SKILL.md", ".claude/skills/mine/scripts/go.sh"])

    const result = await addPortableSkillsImpl("acme", packs, execFn)

    expect(result).toEqual({ ok: true, moved: 2, kept: [], conflicts: [], committed: true })
    expect(await get(".agents/skills/verify/SKILL.md")).toBe(CMD)
    expect(await get(".agents/skills/mine/scripts/go.sh")).toBe("echo go\n")
    expect(await get(".claude/skills/verify/SKILL.md")).toContain("generated from .agents/skills/verify")
    expect(await get(".kiro/skills/mine/SKILL.md")).toContain("Body")
    expect(await exists(".claude/commands/verify.md")).toBe(false)
    expect(calls.filter((args) => args.includes("commit"))).toHaveLength(1)
    const added = calls.find((args) => args.includes("add"))!
    for (const expected of [".agents/skills", ".agents/mirror.json", ".claude/commands/verify.md", ".claude/skills/mine", ".claude/skills/verify", ".kiro/skills/verify"]) {
      expect(added).toContain(expected)
    }
  })

  it("is a no-op the second time", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([AGENT()] as never)
    await put(".claude/commands/verify.md", CMD)
    await addPortableSkillsImpl("acme", packs, fakeGit().execFn)
    const again = await addPortableSkillsImpl("acme", packs, fakeGit().execFn)
    expect(again).toEqual({ ok: false, message: "There is nothing to move in this company" })
  })

  it("keeps the move when the commit fails", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([AGENT()] as never)
    await put(".claude/commands/verify.md", CMD)
    const result = await addPortableSkillsImpl("acme", packs, async () => {
      throw new Error("pathspec did not match")
    })
    expect(result).toMatchObject({ ok: true, committed: false })
    expect(await exists(".agents/skills/verify/SKILL.md")).toBe(true)
  })

  it("removes no flat command until the other agents' folders have been generated", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([AGENT()] as never)
    await put(".claude/commands/verify.md", CMD)
    await put(".kiro", "a file where the folder should be") // makes the sync fail part-way

    const result = await addPortableSkillsImpl("acme", packs, fakeGit().execFn)

    expect(result.ok).toBe(false)
    expect(await exists(".claude/commands/verify.md")).toBe(true)
    expect(await exists(".agents/skills/verify/SKILL.md")).toBe(true)
  })

  it("keeps a flat command whose Claude Code copy could not be written, instead of leaving Claude without it", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([AGENT()] as never)
    const outside = await mkdtemp(path.join(tmpdir(), "portable-outside-"))
    try {
      await put(".claude/commands/verify.md", CMD)
      await symlink(outside, path.join(root, ".claude", "skills")) // sync refuses to write through this

      const result = await addPortableSkillsImpl("acme", packs, fakeGit().execFn)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.kept).toContain("verify")
      expect(await exists(".claude/commands/verify.md")).toBe(true)
      expect(await readdir(outside)).toEqual([])
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("removes nothing when a shared copy could not be written", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([AGENT()] as never)
    await put(".claude/commands/verify.md", CMD)
    await put(".agents", "a file where the folder should be")
    const result = await addPortableSkillsImpl("acme", packs, fakeGit().execFn)
    expect(result.ok).toBe(false)
    expect(await exists(".claude/commands/verify.md")).toBe(true)
  })

  it("refuses an unknown company and an external folder, and writes nothing", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([{ ...AGENT(), kind: "external" }] as never)
    await put(".claude/commands/verify.md", CMD)
    expect(await addPortableSkillsImpl("nope", packs)).toEqual({ ok: false, message: "Unknown company" })
    expect(await addPortableSkillsImpl("acme", packs)).toEqual({ ok: false, message: "This kind of folder has no commands to move" })
    expect(await readdir(root)).toEqual([".claude"])
  })
})
