import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, writeFile, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { trustCompanyDirImpl, defaultClaudeConfigPath } from "./trust-company-dir"

let dir: string
let configPath: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "trust-dir-"))
  configPath = path.join(dir, ".claude.json")
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("trustCompanyDirImpl", () => {
  it("creates the entry when Claude Code has never run", async () => {
    expect(await trustCompanyDirImpl("/companies/acme", configPath)).toBe(true)
    const written = JSON.parse(await readFile(configPath, "utf-8"))
    expect(written.projects["/companies/acme"].hasTrustDialogAccepted).toBe(true)
  })

  it("keeps every other project and every other top-level key", async () => {
    // The real file is ~130KB holding dozens of projects and all of Claude
    // Code's own state. Losing any of it to gain one trust flag is the failure
    // that matters here.
    await writeFile(
      configPath,
      JSON.stringify({
        numStartups: 361,
        installMethod: "native",
        projects: {
          "/somewhere/else": { hasTrustDialogAccepted: true, mcpServers: { a: 1 } },
        },
      }),
      "utf-8"
    )

    expect(await trustCompanyDirImpl("/companies/acme", configPath)).toBe(true)

    const written = JSON.parse(await readFile(configPath, "utf-8"))
    expect(written.numStartups).toBe(361)
    expect(written.installMethod).toBe("native")
    expect(written.projects["/somewhere/else"]).toEqual({ hasTrustDialogAccepted: true, mcpServers: { a: 1 } })
    expect(written.projects["/companies/acme"].hasTrustDialogAccepted).toBe(true)
  })

  it("merges into an existing entry rather than replacing it", async () => {
    await writeFile(
      configPath,
      JSON.stringify({ projects: { "/companies/acme": { mcpServers: { notion: {} }, allowedTools: ["X"] } } }),
      "utf-8"
    )

    await trustCompanyDirImpl("/companies/acme", configPath)

    const entry = JSON.parse(await readFile(configPath, "utf-8")).projects["/companies/acme"]
    expect(entry.hasTrustDialogAccepted).toBe(true)
    expect(entry.mcpServers).toEqual({ notion: {} })
    expect(entry.allowedTools).toEqual(["X"])
  })

  it("refuses to overwrite a config file it could not parse", async () => {
    // Destroying the user's whole Claude Code state to save them one prompt is
    // never the right trade. Leave it exactly as found and give up.
    const corrupt = '{"projects": {"/x": truncated...'
    await writeFile(configPath, corrupt, "utf-8")

    expect(await trustCompanyDirImpl("/companies/acme", configPath)).toBe(false)
    expect(await readFile(configPath, "utf-8")).toBe(corrupt)
  })

  it("reports failure instead of throwing when the file cannot be written", async () => {
    // Best-effort by contract: the scaffold must never fail over this.
    const readonlyDir = await mkdtemp(path.join(tmpdir(), "trust-ro-"))
    const target = path.join(readonlyDir, ".claude.json")
    await writeFile(target, JSON.stringify({ projects: {} }), "utf-8")
    await chmod(readonlyDir, 0o500)

    await expect(trustCompanyDirImpl("/companies/acme", target)).resolves.toBe(false)

    await chmod(readonlyDir, 0o700)
    await rm(readonlyDir, { recursive: true, force: true })
  })

  it("is a no-op when the directory is already trusted", async () => {
    await writeFile(
      configPath,
      JSON.stringify({ projects: { "/companies/acme": { hasTrustDialogAccepted: true } } }),
      "utf-8"
    )
    const before = await readFile(configPath, "utf-8")

    expect(await trustCompanyDirImpl("/companies/acme", configPath)).toBe(true)
    expect(await readFile(configPath, "utf-8")).toBe(before)
  })

  it("resolves the path the same way Claude Code keys it", async () => {
    await trustCompanyDirImpl("/companies/acme/../acme", configPath)
    const written = JSON.parse(await readFile(configPath, "utf-8"))
    expect(Object.keys(written.projects)).toEqual(["/companies/acme"])
  })
})

describe("defaultClaudeConfigPath", () => {
  it("uses ~/.claude.json by default", () => {
    expect(defaultClaudeConfigPath({}, "/home/dev")).toBe("/home/dev/.claude.json")
  })

  it("follows CLAUDE_CONFIG_DIR when Claude Code has been relocated", () => {
    expect(defaultClaudeConfigPath({ CLAUDE_CONFIG_DIR: "/cfg" }, "/home/dev")).toBe("/cfg/.claude.json")
  })
})
