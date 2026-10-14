import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { withFileLock } from "@/lib/os/departments/safety"
import { lockKey } from "@/lib/os/departments/mutations"

const getEffectiveAgents = vi.fn()
vi.mock("./get-effective-agents", () => ({ getEffectiveAgents: () => getEffectiveAgents() }))

const { addCompanyPackImpl, listPackState } = await import("./add-company-pack")
const { getVendoredSkillsUpdate, packStampName } = await import("./vendored-skills")

const PACKS_ROOT = path.join(process.cwd(), "templates", "packs")
const MARKETING_TAG = "v2.10.0"
const SE_TAG = "v0.4.16"

let root: string

/** A company scaffolded from the marketing pack, as one really is on disk. */
async function marketingCompany({ legacyStamp = true } = {}) {
  await mkdir(path.join(root, ".claude", "commands"), { recursive: true })
  await mkdir(path.join(root, ".claude", "skills"), { recursive: true })
  const src = path.join(PACKS_ROOT, "marketing")
  for (const name of await readdir(path.join(src, ".claude", "commands"))) {
    await writeFile(path.join(root, ".claude", "commands", name), "x", "utf-8")
  }
  for (const name of await readdir(path.join(src, ".agents", "skills"))) {
    await mkdir(path.join(root, ".claude", "skills", name), { recursive: true })
  }
  if (legacyStamp) {
    await writeFile(path.join(root, ".claude", "skills", "UPSTREAM.md"), `Tag: ${MARKETING_TAG}\n`, "utf-8")
  }
  getEffectiveAgents.mockResolvedValue([{ id: "acme", rootPath: root, kind: "command-set" }])
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "add-pack-"))
  getEffectiveAgents.mockReset()
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("addCompanyPackImpl", () => {
  it("adds a second pack's commands and skills without disturbing the first", async () => {
    await marketingCompany()
    const result = await addCompanyPackImpl("acme", "software-engineering", PACKS_ROOT, async () => ({
      stdout: "",
      stderr: "",
    }))

    expect(result.ok).toBe(true)
    const commands = await readdir(path.join(root, ".claude", "commands"))
    expect(commands).toContain("plan-feature.md") // gained
    expect(commands).toContain("draft-campaign.md") // kept
    const skills = await readdir(path.join(root, ".claude", "skills"))
    expect(skills).toContain("test-master") // gained
    expect(skills).toContain("copywriting") // kept
  })

  it("takes the company's lock, so it waits for a department or guide change already in progress", async () => {
    await marketingCompany()
    let release!: () => void
    const holding = new Promise<void>((resolve) => { release = resolve })
    const held = withFileLock(lockKey(root), () => holding) // another writer is mid-flight: a department change, a guide approval
    let finished = false
    const adding = addCompanyPackImpl("acme", "software-engineering", PACKS_ROOT, async () => ({ stdout: "", stderr: "" })).then((r) => {
      finished = true
      return r
    })

    try {
      await new Promise((resolve) => setTimeout(resolve, 400))
      expect(finished).toBe(false)
      expect(await readdir(path.join(root, ".claude", "commands"))).not.toContain("plan-feature.md") // nothing copied while it waits
    } finally {
      release()
    }
    expect((await adding).ok).toBe(true)
    await held
    expect(await readdir(path.join(root, ".claude", "commands"))).toContain("plan-feature.md")
  })

  it("refreshes an existing operating guide and commits AGENTS.md with the pack", async () => {
    await marketingCompany()
    const { renderGuide } = await import("./guide/render")
    const { applyGuide } = await import("./guide/apply")
    const { readGuideInputs } = await import("./guide/inventory")
    const agreement = "# Agreement\n\nOwner rules.\n"
    const first = applyGuide(agreement, renderGuide((await readGuideInputs(root, PACKS_ROOT)).inputs), "append")
    if (!first.ok) throw new Error("setup")
    await writeFile(path.join(root, "AGENTS.md"), first.text, "utf-8")

    const calls: string[][] = []
    const exec = async (_cmd: string, args: string[]) => { calls.push(args); return { stdout: "", stderr: "" } }
    const result = await addCompanyPackImpl("acme", "software-engineering", PACKS_ROOT, exec)

    expect(result).toMatchObject({ ok: true, guide: { status: "updated" } })
    const text = await readFile(path.join(root, "AGENTS.md"), "utf-8")
    expect(text.startsWith(agreement)).toBe(true)
    expect(text).toContain("Software engineering")
    const commit = calls.find((a) => a.includes("commit"))!
    expect(commit.join(" ")).toContain("AGENTS.md")
  })
  it("leaves AGENTS.md alone for a company with no operating guide", async () => {
    await marketingCompany()
    await writeFile(path.join(root, "AGENTS.md"), "# Agreement\n", "utf-8")
    const result = await addCompanyPackImpl("acme", "software-engineering", PACKS_ROOT, async () => ({ stdout: "", stderr: "" }))
    expect(result).toMatchObject({ ok: true, guide: { status: "absent" } })
    expect(await readFile(path.join(root, "AGENTS.md"), "utf-8")).toBe("# Agreement\n")
  })
  it("a hand-edited guide never blocks the pack and is left as written", async () => {
    await marketingCompany()
    const { renderGuide } = await import("./guide/render")
    const { applyGuide } = await import("./guide/apply")
    const { readGuideInputs } = await import("./guide/inventory")
    const first = applyGuide("# A\n", renderGuide((await readGuideInputs(root, PACKS_ROOT)).inputs), "append")
    if (!first.ok) throw new Error("setup")
    const edited = first.text.replace("Read the company's", "Read my")
    await writeFile(path.join(root, "AGENTS.md"), edited, "utf-8")
    const result = await addCompanyPackImpl("acme", "software-engineering", PACKS_ROOT, async () => ({ stdout: "", stderr: "" }))
    expect(result).toMatchObject({ ok: true, guide: { status: "needs-attention", reason: "edited" } })
    expect(await readFile(path.join(root, "AGENTS.md"), "utf-8")).toBe(edited)
  })

  describe("in a company that already moved its commands to .agents/skills", () => {
    const fakeGit = async () => ({ stdout: "", stderr: "" })
    async function portableCompany() {
      await mkdir(path.join(root, ".agents", "skills", "verify"), { recursive: true })
      await writeFile(path.join(root, ".agents", "skills", "verify", "SKILL.md"), "---\nname: verify\ndescription: d\n---\n", "utf-8")
      getEffectiveAgents.mockResolvedValue([{ id: "acme", rootPath: root, kind: "command-set" }])
    }

    it("writes the pack's commands as shared skills with generated copies, not flat files", async () => {
      await portableCompany()
      const result = await addCompanyPackImpl("acme", "sales", PACKS_ROOT, fakeGit)

      expect(result.ok).toBe(true)
      for (const name of ["draft-proposal", "follow-up-lead", "pipeline-review"]) {
        expect(await readFile(path.join(root, ".agents", "skills", name, "SKILL.md"), "utf-8")).toMatch(/^---\nname: /)
        expect(await readFile(path.join(root, ".claude", "skills", name, "SKILL.md"), "utf-8")).toContain("generated from .agents/skills/" + name)
        expect(await readFile(path.join(root, ".kiro", "skills", name, "SKILL.md"), "utf-8")).toContain("generated from .agents/skills/" + name)
      }
      await expect(readdir(path.join(root, ".claude", "commands"))).rejects.toThrow()
    })

    it("never overwrites a shared skill the user has edited", async () => {
      await portableCompany()
      await mkdir(path.join(root, ".agents", "skills", "pipeline-review"), { recursive: true })
      await writeFile(path.join(root, ".agents", "skills", "pipeline-review", "SKILL.md"), "MINE", "utf-8")

      await addCompanyPackImpl("acme", "sales", PACKS_ROOT, fakeGit)

      expect(await readFile(path.join(root, ".agents", "skills", "pipeline-review", "SKILL.md"), "utf-8")).toBe("MINE")
    })

    it("does not re-add a command the company still holds as a flat file", async () => {
      await portableCompany()
      await mkdir(path.join(root, ".claude", "commands"), { recursive: true })
      await writeFile(path.join(root, ".claude", "commands", "pipeline-review.md"), "MINE", "utf-8")

      await addCompanyPackImpl("acme", "sales", PACKS_ROOT, fakeGit)

      await expect(readFile(path.join(root, ".agents", "skills", "pipeline-review", "SKILL.md"), "utf-8")).rejects.toThrow()
    })
  })

  it("never overwrites a command the user has edited", async () => {
    await marketingCompany()
    // Same filename the pack ships, with the user's own content in it.
    await writeFile(path.join(root, ".claude", "commands", "plan-feature.md"), "MINE", "utf-8")

    await addCompanyPackImpl("acme", "software-engineering", PACKS_ROOT, async () => ({ stdout: "", stderr: "" }))

    expect(await readFile(path.join(root, ".claude", "commands", "plan-feature.md"), "utf-8")).toBe("MINE")
  })

  it("never touches the company's own ontology", async () => {
    await marketingCompany()
    const ontology = path.join(root, "definitions", "ontology", "company.yaml")
    await mkdir(path.dirname(ontology), { recursive: true })
    await writeFile(ontology, "name: My Real Marketing Company\n", "utf-8")

    await addCompanyPackImpl("acme", "software-engineering", PACKS_ROOT, async () => ({ stdout: "", stderr: "" }))

    expect(await readFile(ontology, "utf-8")).toBe("name: My Real Marketing Company\n")
  })

  it("refuses an `external` folder", async () => {
    await marketingCompany()
    getEffectiveAgents.mockResolvedValue([{ id: "acme", rootPath: root, kind: "external" }])
    const result = await addCompanyPackImpl("acme", "software-engineering", PACKS_ROOT)
    expect(result.ok).toBe(false)
  })

  it("says so rather than committing nothing when the pack is already there", async () => {
    await marketingCompany()
    const result = await addCompanyPackImpl("acme", "marketing", PACKS_ROOT)
    expect(result).toEqual({ ok: false, message: expect.stringContaining("already has everything") })
  })
})

describe("a pack whose skills ship in the shared layout", () => {
  let packs: string
  const noGit = async () => ({ stdout: "", stderr: "" })
  async function put(file: string, text: string) {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, text, "utf-8")
  }
  beforeEach(async () => {
    packs = await mkdtemp(path.join(tmpdir(), "add-pack-shared-"))
    await put(path.join(packs, "marketing", ".claude", "commands", "draft-campaign.md"), "x")
    await put(path.join(packs, "marketing", ".agents", "skills", "copywriting", "SKILL.md"), "---\nname: copywriting\ndescription: d\n---\n")
    await put(path.join(packs, "marketing", ".agents", "skills", "cro", "SKILL.md"), "---\nname: cro\ndescription: d\n---\n")
    await put(path.join(packs, "marketing", ".agents", "vendored", packStampName("marketing")), "Tag: v9.9.9\n")
    getEffectiveAgents.mockResolvedValue([{ id: "acme", rootPath: root, kind: "command-set" }])
  })
  afterEach(async () => {
    await rm(packs, { recursive: true, force: true })
  })

  it("installs the skills shared, generates the other agents' copies and stamps outside the skills folders", async () => {
    const result = await addCompanyPackImpl("acme", "marketing", packs, noGit)

    expect(result.ok).toBe(true)
    for (const name of ["copywriting", "cro"]) {
      await readFile(path.join(root, ".agents", "skills", name, "SKILL.md"), "utf-8")
      expect(await readFile(path.join(root, ".claude", "skills", name, "SKILL.md"), "utf-8")).toContain(`generated from .agents/skills/${name}`)
      await readFile(path.join(root, ".kiro", "skills", name, "SKILL.md"), "utf-8")
    }
    expect(await readFile(path.join(root, ".agents", "vendored", packStampName("marketing")), "utf-8")).toContain("v9.9.9")
    await expect(readFile(path.join(root, ".claude", "skills", packStampName("marketing")), "utf-8")).rejects.toThrow()
  })

  it("does not add a skill beside one the company already holds in .claude/skills, and does not stamp", async () => {
    await put(path.join(root, ".claude", "skills", "cro", "SKILL.md"), "MINE")

    await addCompanyPackImpl("acme", "marketing", packs, noGit)

    expect(await readFile(path.join(root, ".claude", "skills", "cro", "SKILL.md"), "utf-8")).toBe("MINE")
    await expect(readFile(path.join(root, ".agents", "skills", "cro", "SKILL.md"), "utf-8")).rejects.toThrow()
    await readFile(path.join(root, ".agents", "skills", "copywriting", "SKILL.md"), "utf-8")
    // A stamp over a skipped skill would hand the user's own file to the next update.
    await expect(readFile(path.join(root, ".agents", "vendored", packStampName("marketing")), "utf-8")).rejects.toThrow()
  })
})

describe("the two-pack update flip-flop", () => {
  it("leaves both packs settled after an add — neither looks stale against the other's tag", async () => {
    await marketingCompany()
    // Before: one shared stamp, and marketing is up to date on it.
    expect(await getVendoredSkillsUpdate(root, PACKS_ROOT)).toBeNull()

    await addCompanyPackImpl("acme", "software-engineering", PACKS_ROOT, async () => ({ stdout: "", stderr: "" }))

    // The pack that was added carries its own stamp; the original still reads
    // the legacy one. With a single shared stamp this returned a
    // software-engineering update, whose install restamped the company and made
    // marketing look stale, forever.
    const stamp = path.join(root, ".agents", "vendored", packStampName("software-engineering"))
    expect(await readFile(stamp, "utf-8")).toContain(SE_TAG)
    expect(await readFile(path.join(root, ".claude", "skills", "UPSTREAM.md"), "utf-8")).toContain(MARKETING_TAG)
    expect(await getVendoredSkillsUpdate(root, PACKS_ROOT)).toBeNull()
  })

  it("still offers the update a hand-copied pack needs, once", async () => {
    // Files copied in by hand: commands and skills present, no stamp of their own.
    await marketingCompany()
    for (const name of await readdir(path.join(PACKS_ROOT, "software-engineering", ".claude", "commands"))) {
      await writeFile(path.join(root, ".claude", "commands", name), "x", "utf-8")
    }
    const update = await getVendoredSkillsUpdate(root, PACKS_ROOT)
    expect(update?.packDirName).toBe("software-engineering")
  })
})

describe("listPackState", () => {
  it("marks the company's own pack installed and the rest available", async () => {
    await marketingCompany()
    const state = await listPackState(root, PACKS_ROOT)
    expect(state.find((p) => p.id === "marketing")?.installed).toBe(true)
    expect(state.find((p) => p.id === "software-engineering")?.installed).toBe(false)
    // "General purpose" is the base skeleton, not an addable overlay.
    expect(state.find((p) => p.id === "general")).toBeUndefined()
  })
})
