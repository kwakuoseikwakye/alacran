import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

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
  for (const name of await readdir(path.join(src, ".claude", "skills"))) {
    if (name === "UPSTREAM.md") continue
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
    const stamp = path.join(root, ".claude", "skills", packStampName("software-engineering"))
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
