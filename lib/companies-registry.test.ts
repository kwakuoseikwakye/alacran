import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getRegisteredCompanies, registerCompanyImpl, removeCompanyImpl, getCompanyPathStatusImpl } from "./companies-registry"

let dataDir: string
let registryPath: string
let companyDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "companies-registry-data-"))
  registryPath = path.join(dataDir, "companies.json")
  companyDir = await mkdtemp(path.join(tmpdir(), "companies-registry-company-"))
  await mkdir(path.join(companyDir, ".git"))
  await mkdir(path.join(companyDir, ".claude"))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  await rm(companyDir, { recursive: true, force: true })
})

describe("companies-registry", () => {
  it("returns an empty list when the registry file doesn't exist", async () => {
    expect(await getRegisteredCompanies(registryPath)).toEqual([])
  })

  it("returns an empty list when the registry file is unparseable", async () => {
    const { writeFile } = await import("node:fs/promises")
    await writeFile(registryPath, "{ not json")
    expect(await getRegisteredCompanies(registryPath)).toEqual([])
  })

  it("registers a valid company and persists it", async () => {
    const result = await registerCompanyImpl("Second Co", companyDir, registryPath)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.company.name).toBe("Second Co")
    expect(result.company.rootPath).toBe(companyDir)
    expect(typeof result.company.id).toBe("string")
    expect(result.company.id.length).toBeGreaterThan(0)

    const companies = await getRegisteredCompanies(registryPath)
    expect(companies).toEqual([result.company])
  })

  it("rejects a blank name", async () => {
    const result = await registerCompanyImpl("   ", companyDir, registryPath)
    expect(result).toEqual({ ok: false, message: "Name is required" })
  })

  it("rejects a nonexistent path", async () => {
    const result = await registerCompanyImpl("X", path.join(tmpdir(), "does-not-exist-xyz"), registryPath)
    expect(result).toEqual({ ok: false, message: "Path does not exist or is not a directory" })
  })

  it("rejects a path missing .git", async () => {
    const noGit = await mkdtemp(path.join(tmpdir(), "companies-registry-nogit-"))
    await mkdir(path.join(noGit, ".claude"))
    try {
      const result = await registerCompanyImpl("X", noGit, registryPath)
      expect(result).toEqual({ ok: false, message: "Path is not a git repository (no .git found)" })
    } finally {
      await rm(noGit, { recursive: true, force: true })
    }
  })

  // The whole point of an external folder is that it follows none of this
  // app's conventions, so requiring a git repo would exclude most of them.
  it("registers an external folder that is not a git repository", async () => {
    const plain = await mkdtemp(path.join(tmpdir(), "companies-registry-plain-"))
    try {
      const result = await registerCompanyImpl("Some Project", plain, registryPath, "external")
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.company.kind).toBe("external")
    } finally {
      await rm(plain, { recursive: true, force: true })
    }
  })

  // Without `kind`, the same folder is a company — and companies really do
  // need git (backup, activity feed, commit-on-save).
  it("still requires git for a normal company", async () => {
    const plain = await mkdtemp(path.join(tmpdir(), "companies-registry-plain2-"))
    try {
      const result = await registerCompanyImpl("Some Project", plain, registryPath)
      expect(result).toEqual({ ok: false, message: "Path is not a git repository (no .git found)" })
    } finally {
      await rm(plain, { recursive: true, force: true })
    }
  })

  // An external folder must exist — registering one is never a create.
  it("rejects an external path that does not exist", async () => {
    const result = await registerCompanyImpl("Ghost", path.join(tmpdir(), "no-such-dir-xyz"), registryPath, "external")
    expect(result).toEqual({ ok: false, message: "Path does not exist or is not a directory" })
  })

  // A git repo with no `.claude` is a real, importable company —
  // A real agent can be exactly that shape. `.claude` is a Claude-Code
  // adapter artifact, not the portable core, and requiring it only blocked
  // legitimate imports.
  it("accepts a git repo with no .claude directory", async () => {
    const noClaude = await mkdtemp(path.join(tmpdir(), "companies-registry-noclaude-"))
    await mkdir(path.join(noClaude, ".git"))
    try {
      const result = await registerCompanyImpl("X", noClaude, registryPath)
      expect(result.ok).toBe(true)
    } finally {
      await rm(noClaude, { recursive: true, force: true })
    }
  })

  it("rejects registering the same rootPath twice", async () => {
    await registerCompanyImpl("First", companyDir, registryPath)
    const result = await registerCompanyImpl("Second", companyDir, registryPath)
    expect(result).toEqual({ ok: false, message: "This directory is already registered" })
  })

  it("removes a registered company", async () => {
    const registered = await registerCompanyImpl("Second Co", companyDir, registryPath)
    if (!registered.ok) throw new Error("setup failed")

    const result = await removeCompanyImpl(registered.company.id, registryPath)
    expect(result).toEqual({ ok: true })
    expect(await getRegisteredCompanies(registryPath)).toEqual([])
  })

  it("reports not-found when removing an unknown id", async () => {
    const result = await removeCompanyImpl("nonexistent-id", registryPath)
    expect(result).toEqual({ ok: false, message: "Not found" })
  })

  it("getCompanyPathStatusImpl returns 'exists' for a path that already exists", async () => {
    expect(await getCompanyPathStatusImpl(companyDir)).toBe("exists")
  })

  it("getCompanyPathStatusImpl returns 'creatable' when the path is missing but its parent exists", async () => {
    const missingChild = path.join(companyDir, "not-yet-created")
    expect(await getCompanyPathStatusImpl(missingChild)).toBe("creatable")
  })

  // This is the fresh-install shape: the suggested path is ~/Alacran/<company>
  // and ~/Alacran doesn't exist yet. Requiring the immediate parent made the
  // default path fail for every new user, and the UI then reported the
  // misleading "Path does not exist or is not a directory".
  it("getCompanyPathStatusImpl returns 'creatable' when intermediate directories are missing too", async () => {
    const deeplyMissing = path.join(companyDir, "missing-parent", "missing-child")
    expect(await getCompanyPathStatusImpl(deeplyMissing)).toBe("creatable")
  })

  it("getCompanyPathStatusImpl returns 'not-creatable' when an ancestor is a file, not a directory", async () => {
    // mkdir -p genuinely cannot create a directory underneath a file, so this
    // is what "not-creatable" is actually for.
    const filePath = path.join(companyDir, "a-file")
    await writeFile(filePath, "not a directory", "utf-8")
    expect(await getCompanyPathStatusImpl(path.join(filePath, "child"))).toBe("not-creatable")
  })
})
