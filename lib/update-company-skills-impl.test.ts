import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "./git-commit-file"
import { packStampName } from "./vendored-skills"

let base: string
let packsRoot: string
let companyRoot: string
let execCalls: { command: string; args: string[] }[]

const fakeExecFn: ExecFileFn = async (command, args) => {
  execCalls.push({ command, args })
  return { stdout: "", stderr: "" }
}

async function write(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content, "utf-8")
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), "update-skills-"))
  packsRoot = path.join(base, "packs")
  companyRoot = path.join(base, "company")
  execCalls = []

  // What the app ships: two vendored skills at v2.10.0, plus the stamp.
  const packSkills = path.join(packsRoot, "marketing", ".claude", "skills")
  // The pack must ship the command the company is matched by: a pack is
  // identified by its own command files, not a hardcoded marker name.
  await mkdir(path.join(packsRoot, "marketing", ".claude", "commands"), { recursive: true })
  await writeFile(path.join(packsRoot, "marketing", ".claude", "commands", "draft-campaign.md"), "x", "utf-8")
  await write(path.join(packSkills, "UPSTREAM.md"), "Tag: v2.10.0\n")
  await write(path.join(packSkills, "copywriting", "SKILL.md"), "new copywriting\n")
  await write(path.join(packSkills, "cro", "SKILL.md"), "new cro\n")

  // The company: marketing-shaped, on an older tag, with its own work in the
  // same directory plus a skill upstream has since dropped.
  await write(path.join(companyRoot, ".claude", "commands", "draft-campaign.md"), "x")
  const coSkills = path.join(companyRoot, ".claude", "skills")
  await write(path.join(coSkills, "UPSTREAM.md"), "Tag: v2.9.0\n")
  await write(path.join(coSkills, "copywriting", "SKILL.md"), "old copywriting\n")
  await write(path.join(coSkills, "paywalls", "SKILL.md"), "dropped upstream\n")
  await write(path.join(coSkills, "my-own-skill", "SKILL.md"), "hand-written, do not touch\n")
  await write(path.join(coSkills, "daily-team-log", "gather.py"), "# installed by v20\n")
  await write(path.join(companyRoot, "definitions", "ontology", "company.yaml"), "name: mine\n")
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
  vi.resetModules()
})

async function loadImpl(kind: "command-set" | "external" = "command-set") {
  vi.doMock("./get-effective-agents", () => ({
    getEffectiveAgents: async () => [{ id: "co", name: "Co", rootPath: companyRoot, kind }],
  }))
  return (await import("./update-company-skills-impl")).updateCompanySkillsImpl
}

describe("updateCompanySkillsImpl", () => {
  it("replaces the vendored skills and the stamp", async () => {
    const updateCompanySkillsImpl = await loadImpl()

    const result = await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

    expect(result).toEqual({ ok: true, tag: "v2.10.0", skipped: [] })
    const coSkills = path.join(companyRoot, ".claude", "skills")
    expect(await readFile(path.join(coSkills, "copywriting", "SKILL.md"), "utf-8")).toBe("new copywriting\n")
    expect(await readFile(path.join(coSkills, "cro", "SKILL.md"), "utf-8")).toBe("new cro\n")
    // Under the pack's own name now, so a company holding two packs keeps two
    // independent tags instead of one standing in for both.
    expect(await readFile(path.join(coSkills, packStampName("marketing")), "utf-8")).toContain("Tag: v2.10.0")
    // The legacy shared stamp is left alone, not migrated or deleted.
    expect(await readFile(path.join(coSkills, "UPSTREAM.md"), "utf-8")).toContain("Tag: v2.9.0")
  })

  it("leaves the user's own skill, daily-team-log and their ontology untouched", async () => {
    const updateCompanySkillsImpl = await loadImpl()

    await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

    const coSkills = path.join(companyRoot, ".claude", "skills")
    expect(await readFile(path.join(coSkills, "my-own-skill", "SKILL.md"), "utf-8")).toBe(
      "hand-written, do not touch\n"
    )
    expect(await readFile(path.join(coSkills, "daily-team-log", "gather.py"), "utf-8")).toBe(
      "# installed by v20\n"
    )
    expect(await readFile(path.join(companyRoot, "definitions", "ontology", "company.yaml"), "utf-8")).toBe(
      "name: mine\n"
    )
  })

  it("keeps a vendored skill that upstream has since dropped rather than deleting it", async () => {
    const updateCompanySkillsImpl = await loadImpl()

    await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

    expect(await exists(path.join(companyRoot, ".claude", "skills", "paywalls"))).toBe(true)
  })

  it("commits exactly what it wrote, never the user's own skill", async () => {
    const updateCompanySkillsImpl = await loadImpl()

    await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

    const add = execCalls.find((c) => c.args.includes("add"))
    const commit = execCalls.find((c) => c.args.includes("commit"))
    const skills = path.join(".claude", "skills")
    for (const call of [add, commit]) {
      expect(call?.args).toContain(path.join(skills, "copywriting"))
      expect(call?.args).toContain(path.join(skills, "cro"))
      expect(call?.args).toContain(path.join(skills, packStampName("marketing")))
      expect(call?.args).not.toContain(path.join(skills, "my-own-skill"))
      expect(call?.args).not.toContain(skills)
    }
    expect(commit?.args).toContain("Update marketing skills to v2.10.0 via Alacrán")
  })

  it("still succeeds when the commit fails, since the files are already written", async () => {
    const updateCompanySkillsImpl = await loadImpl()
    const failingExec: ExecFileFn = async () => {
      throw new Error("not a git repository")
    }

    const result = await updateCompanySkillsImpl("co", packsRoot, failingExec)

    expect(result).toEqual({ ok: true, tag: "v2.10.0", skipped: [] })
    expect(
      await readFile(path.join(companyRoot, ".claude", "skills", "copywriting", "SKILL.md"), "utf-8")
    ).toBe("new copywriting\n")
  })

  // The two defects an adversarial review caught before this shipped.
  describe("an unstamped company (created before vendored skills existed)", () => {
    beforeEach(async () => {
      // No stamp: nothing in .claude/skills came from this app, and the user has
      // written their own skill under a name the pack also ships.
      await rm(path.join(companyRoot, ".claude", "skills", "UPSTREAM.md"))
      await write(path.join(companyRoot, ".claude", "skills", "copywriting", "SKILL.md"), "MY OWN copywriting\n")
    })

    it("never overwrites a same-named skill the user wrote, and says which it kept", async () => {
      const updateCompanySkillsImpl = await loadImpl()

      const result = await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

      expect(result).toEqual({ ok: true, tag: "v2.10.0", skipped: ["copywriting"] })
      expect(
        await readFile(path.join(companyRoot, ".claude", "skills", "copywriting", "SKILL.md"), "utf-8")
      ).toBe("MY OWN copywriting\n")
      // The non-colliding one still lands.
      expect(await readFile(path.join(companyRoot, ".claude", "skills", "cro", "SKILL.md"), "utf-8")).toBe(
        "new cro\n"
      )
    })

    it("does not stamp a partial install, so the skipped name can never become app-owned", async () => {
      const updateCompanySkillsImpl = await loadImpl()

      await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

      expect(await exists(path.join(companyRoot, ".claude", "skills", packStampName("marketing")))).toBe(false)
      const { getVendoredSkillsUpdate } = await import("./vendored-skills")
      // Still offered: the company genuinely does not have this version yet.
      expect((await getVendoredSkillsUpdate(companyRoot, packsRoot))?.installedTag).toBeNull()
    })
  })

  it("leaves the old tag in place when a copy fails partway, so the update stays retryable", async () => {
    // An unreadable source skill makes cp throw partway through the loop.
    // Without the stamp being written last, the company would be left claiming
    // v2.10.0 with old skill bodies — and the button, which compares only the
    // tag, would vanish and strand it there until upstream cut a new tag.
    const unreadable = path.join(packsRoot, "marketing", ".claude", "skills", "cro")
    await chmod(unreadable, 0o000)
    const updateCompanySkillsImpl = await loadImpl()

    try {
      const result = await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

      expect(result.ok).toBe(false)
      expect(await readFile(path.join(companyRoot, ".claude", "skills", "UPSTREAM.md"), "utf-8")).toContain(
        "Tag: v2.9.0"
      )
      const { getVendoredSkillsUpdate } = await import("./vendored-skills")
      expect((await getVendoredSkillsUpdate(companyRoot, packsRoot))?.installedTag).toBe("v2.9.0")
    } finally {
      await chmod(unreadable, 0o755)
    }
  })

  it("refuses a company that is already on the bundled tag", async () => {
    await write(path.join(companyRoot, ".claude", "skills", "UPSTREAM.md"), "Tag: v2.10.0\n")
    const updateCompanySkillsImpl = await loadImpl()

    const result = await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

    expect(result).toEqual({ ok: false, message: "This company is already up to date" })
    expect(execCalls).toEqual([])
  })

  it("refuses an external folder", async () => {
    const updateCompanySkillsImpl = await loadImpl("external")

    const result = await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

    expect(result).toEqual({ ok: false, message: "This kind of folder has no skills to update" })
    expect(execCalls).toEqual([])
  })

  it("refuses an unknown company", async () => {
    const updateCompanySkillsImpl = await loadImpl()

    const result = await updateCompanySkillsImpl("nope", packsRoot, fakeExecFn)

    expect(result).toEqual({ ok: false, message: "Unknown company" })
  })
})
