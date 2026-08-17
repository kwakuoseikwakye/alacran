import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { parseVendoredTag, getVendoredSkillsUpdate } from "./vendored-skills"

describe("parseVendoredTag", () => {
  it("reads the Tag line the sync script writes", () => {
    expect(parseVendoredTag("# Vendored\n\nSource: x\nTag: v2.10.0\nVendored by: y\n")).toBe("v2.10.0")
  })

  it("returns null when there is no Tag line", () => {
    expect(parseVendoredTag("# Some skill\n\nNothing stamped here.\n")).toBeNull()
  })

  it("does not match a Tag mentioned mid-line", () => {
    expect(parseVendoredTag("The Tag: v1.0.0 is written by the script\n")).toBeNull()
  })
})

describe("getVendoredSkillsUpdate", () => {
  let base: string
  let packsRoot: string
  let company: string

  async function writeCompanyTag(tag: string) {
    const dir = path.join(company, ".claude", "skills")
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, "UPSTREAM.md"), `Tag: ${tag}\n`, "utf-8")
  }

  beforeEach(async () => {
    base = await mkdtemp(path.join(tmpdir(), "vendored-skills-"))
    packsRoot = path.join(base, "packs")
    company = path.join(base, "company")
    await mkdir(path.join(packsRoot, "marketing", ".claude", "skills"), { recursive: true })
    await writeFile(
      path.join(packsRoot, "marketing", ".claude", "skills", "UPSTREAM.md"),
      "Tag: v2.10.0\n",
      "utf-8"
    )
    // Marker command: what identifies this as a marketing-pack company.
    await mkdir(path.join(company, ".claude", "commands"), { recursive: true })
    await writeFile(path.join(company, ".claude", "commands", "draft-campaign.md"), "x", "utf-8")
  })

  afterEach(async () => {
    await rm(base, { recursive: true, force: true })
  })

  it("offers the update to a company scaffolded before vendored skills existed", async () => {
    expect(await getVendoredSkillsUpdate(company, packsRoot)).toEqual({
      packDirName: "marketing",
      installedTag: null,
      bundledTag: "v2.10.0",
    })
  })

  it("offers the update when the company's tag is behind", async () => {
    await writeCompanyTag("v2.9.0")
    expect(await getVendoredSkillsUpdate(company, packsRoot)).toEqual({
      packDirName: "marketing",
      installedTag: "v2.9.0",
      bundledTag: "v2.10.0",
    })
  })

  it("offers nothing when the company is already on the bundled tag", async () => {
    await writeCompanyTag("v2.10.0")
    expect(await getVendoredSkillsUpdate(company, packsRoot)).toBeNull()
  })

  it("offers nothing to a company from a pack that vendors no skills", async () => {
    await rm(path.join(company, ".claude", "commands", "draft-campaign.md"))
    await writeFile(path.join(company, ".claude", "commands", "follow-up-lead.md"), "x", "utf-8")
    expect(await getVendoredSkillsUpdate(company, packsRoot)).toBeNull()
  })

  it("offers nothing when the app's own copy is unstamped", async () => {
    await rm(path.join(packsRoot, "marketing", ".claude", "skills", "UPSTREAM.md"))
    expect(await getVendoredSkillsUpdate(company, packsRoot)).toBeNull()
  })

  it("recognises the real bundled marketing pack", async () => {
    const real = path.join(process.cwd(), "templates", "packs")
    const update = await getVendoredSkillsUpdate(company, real)
    expect(update?.packDirName).toBe("marketing")
    expect(update?.bundledTag).toMatch(/^v\d+\.\d+\.\d+$/)
  })
})
