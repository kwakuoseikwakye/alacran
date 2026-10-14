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
    // The skills now live in the folder every agent reads, with Claude Code's copy generated from it.
    const shared = path.join(companyRoot, ".agents", "skills")
    expect(await readFile(path.join(shared, "copywriting", "SKILL.md"), "utf-8")).toBe("new copywriting\n")
    expect(await readFile(path.join(shared, "cro", "SKILL.md"), "utf-8")).toBe("new cro\n")
    const mirror = await readFile(path.join(companyRoot, ".claude", "skills", "copywriting", "SKILL.md"), "utf-8")
    expect(mirror).toContain("new copywriting")
    expect(mirror).toContain("generated from .agents/skills/copywriting")
    expect(await exists(path.join(companyRoot, ".kiro", "skills", "cro", "SKILL.md"))).toBe(true)
    // Under the pack's own name, so a company holding two packs keeps two independent tags, and in a
    // folder no agent reads as skills.
    expect(await readFile(path.join(companyRoot, ".agents", "vendored", packStampName("marketing")), "utf-8")).toContain("Tag: v2.10.0")
    // The legacy shared stamp is left alone, not migrated or deleted.
    expect(await readFile(path.join(companyRoot, ".claude", "skills", "UPSTREAM.md"), "utf-8")).toContain("Tag: v2.9.0")
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
    const shared = path.join(".agents", "skills")
    for (const call of [add, commit]) {
      expect(call?.args).toContain(path.join(shared, "copywriting"))
      expect(call?.args).toContain(path.join(shared, "cro"))
      expect(call?.args).toContain(path.join(".agents", "vendored", packStampName("marketing")))
      expect(call?.args).not.toContain(path.join(".claude", "skills", "my-own-skill"))
      expect(call?.args).not.toContain(shared)
      expect(call?.args).not.toContain(path.join(".claude", "skills"))
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
      await readFile(path.join(companyRoot, ".agents", "skills", "copywriting", "SKILL.md"), "utf-8")
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
      // The non-colliding one still lands, in the shared folder.
      expect(await readFile(path.join(companyRoot, ".agents", "skills", "cro", "SKILL.md"), "utf-8")).toBe(
        "new cro\n"
      )
      // And the name the user holds is not written there either, so no copy of ours can shadow theirs.
      expect(await exists(path.join(companyRoot, ".agents", "skills", "copywriting"))).toBe(false)
    })

    it("does not stamp a partial install, so the skipped name can never become app-owned", async () => {
      const updateCompanySkillsImpl = await loadImpl()

      await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

      expect(await exists(path.join(companyRoot, ".claude", "skills", packStampName("marketing")))).toBe(false)
      expect(await exists(path.join(companyRoot, ".agents", "vendored", packStampName("marketing")))).toBe(false)
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

  // The pack's skills now ship in the shared layout: `.agents/skills`, stamp outside every skills folder.
  describe("with the pack's skills in the shared layout", () => {
    const shared = () => path.join(companyRoot, ".agents", "skills")
    beforeEach(async () => {
      const pack = path.join(packsRoot, "marketing")
      await rm(path.join(pack, ".claude", "skills"), { recursive: true, force: true })
      await write(path.join(pack, ".agents", "skills", "copywriting", "SKILL.md"), "new copywriting\n")
      await write(path.join(pack, ".agents", "skills", "cro", "SKILL.md"), "new cro\n")
      await write(path.join(pack, ".agents", "vendored", packStampName("marketing")), "Tag: v2.10.0\n")
    })

    /** A company already on the bundled tag whose skills still sit where only Claude Code reads. */
    async function currentButNotMoved() {
      const co = path.join(companyRoot, ".claude", "skills")
      await write(path.join(co, "UPSTREAM.md"), "Tag: v2.10.0\n")
      await write(path.join(co, "copywriting", "SKILL.md"), "new copywriting\n")
      await write(path.join(co, "cro", "SKILL.md"), "new cro\n")
    }

    it("offers a move when the tag is current but the skills are still only in .claude/skills", async () => {
      await currentButNotMoved()
      await loadImpl()
      const { getVendoredSkillsUpdate } = await import("./vendored-skills")
      expect(await getVendoredSkillsUpdate(companyRoot, packsRoot)).toEqual({
        packDirName: "marketing",
        installedTag: "v2.10.0",
        bundledTag: "v2.10.0",
        movesLocation: true,
      })
    })

    it("moves them: shared copy, generated Claude Code and Kiro copies, new stamp, nothing else touched", async () => {
      await currentButNotMoved()
      const updateCompanySkillsImpl = await loadImpl()

      const result = await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

      expect(result).toEqual({ ok: true, tag: "v2.10.0", skipped: [] })
      expect(await readFile(path.join(shared(), "cro", "SKILL.md"), "utf-8")).toBe("new cro\n")
      expect(await readFile(path.join(companyRoot, ".claude", "skills", "cro", "SKILL.md"), "utf-8")).toContain(
        "generated from .agents/skills/cro"
      )
      expect(await exists(path.join(companyRoot, ".kiro", "skills", "cro", "SKILL.md"))).toBe(true)
      expect(await readFile(path.join(companyRoot, ".agents", "vendored", packStampName("marketing")), "utf-8")).toContain("v2.10.0")
      expect(await readFile(path.join(companyRoot, ".claude", "skills", "my-own-skill", "SKILL.md"), "utf-8")).toBe(
        "hand-written, do not touch\n"
      )
      const { getVendoredSkillsUpdate } = await import("./vendored-skills")
      // Done: nothing left to offer.
      expect(await getVendoredSkillsUpdate(companyRoot, packsRoot)).toBeNull()
    })

    it("keeps an old copy somebody edited by hand instead of moving it, and does not stamp", async () => {
      await currentButNotMoved()
      await write(path.join(companyRoot, ".claude", "skills", "cro", "SKILL.md"), "EDITED cro\n")
      const updateCompanySkillsImpl = await loadImpl()

      const result = await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

      expect(result).toEqual({ ok: true, tag: "v2.10.0", skipped: ["cro"] })
      expect(await readFile(path.join(companyRoot, ".claude", "skills", "cro", "SKILL.md"), "utf-8")).toBe("EDITED cro\n")
      expect(await exists(path.join(shared(), "cro"))).toBe(false)
      expect(await exists(path.join(shared(), "copywriting", "SKILL.md"))).toBe(true)
      expect(await exists(path.join(companyRoot, ".agents", "vendored", packStampName("marketing")))).toBe(false)
    })

    it("replaces the old app-owned copies on a newer tag and moves them in the same step", async () => {
      const updateCompanySkillsImpl = await loadImpl()

      const result = await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

      expect(result).toEqual({ ok: true, tag: "v2.10.0", skipped: [] })
      expect(await readFile(path.join(shared(), "copywriting", "SKILL.md"), "utf-8")).toBe("new copywriting\n")
      expect(await readFile(path.join(companyRoot, ".claude", "skills", "copywriting", "SKILL.md"), "utf-8")).toContain("new copywriting")
      // Dropped upstream: still lingers, as before.
      expect(await exists(path.join(companyRoot, ".claude", "skills", "paywalls"))).toBe(true)
    })

    it("never overwrites a Claude Code copy that somebody edited after the move", async () => {
      await currentButNotMoved()
      const updateCompanySkillsImpl = await loadImpl()
      await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)
      const mirror = path.join(companyRoot, ".claude", "skills", "cro", "SKILL.md")
      await writeFile(mirror, `${await readFile(mirror, "utf-8")}my note\n`, "utf-8")
      // A newer pack tag arrives.
      await write(path.join(packsRoot, "marketing", ".agents", "skills", "cro", "SKILL.md"), "newer cro\n")
      await write(path.join(packsRoot, "marketing", ".agents", "vendored", packStampName("marketing")), "Tag: v2.11.0\n")

      const result = await updateCompanySkillsImpl("co", packsRoot, fakeExecFn)

      expect(result).toEqual({ ok: true, tag: "v2.11.0", skipped: [] })
      expect(await readFile(path.join(shared(), "cro", "SKILL.md"), "utf-8")).toBe("newer cro\n")
      expect(await readFile(mirror, "utf-8")).toContain("my note")
    })
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
