import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { readMcpPool, addToMcpPool } from "./mcp-pool"
import { MCP_PRESETS } from "./mcp-presets"

let file: string
beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pool-")), "mcp-pool.json")
})
afterEach(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }))

describe("mcp pool", () => {
  it("seeds from the presets when no file exists yet", async () => {
    const pool = await readMcpPool(file)
    expect(pool.map((s) => s.name).sort()).toEqual(MCP_PRESETS.map((p) => p.name).sort())
  })

  it("keeps an added server across reads", async () => {
    await addToMcpPool({ name: "acme", url: "https://mcp.acme.com/mcp" }, file)
    expect((await readMcpPool(file)).some((s) => s.name === "acme")).toBe(true)
  })

  it("rejects an unsafe name", async () => {
    const r = await addToMcpPool({ name: "bad name!", url: "https://mcp.acme.com/mcp" }, file)
    expect(r.ok).toBe(false)
  })

  it("rejects a non-https url", async () => {
    const r = await addToMcpPool({ name: "acme", url: "http://mcp.acme.com/mcp" }, file)
    expect(r.ok).toBe(false)
  })

  it("replaces rather than duplicates a name already in the pool", async () => {
    await addToMcpPool({ name: "acme", url: "https://mcp.acme.com/mcp" }, file)
    await addToMcpPool({ name: "acme", url: "https://mcp.acme.dev/mcp" }, file)
    const acme = (await readMcpPool(file)).filter((s) => s.name === "acme")
    expect(acme).toHaveLength(1)
    expect(acme[0].url).toBe("https://mcp.acme.dev/mcp")
  })

  it("survives a corrupt file by falling back to the presets", async () => {
    fs.writeFileSync(file, "{ not json")
    expect((await readMcpPool(file)).length).toBe(MCP_PRESETS.length)
  })

  it("returns empty array when file contains valid empty array", async () => {
    fs.writeFileSync(file, JSON.stringify([]))
    expect(await readMcpPool(file)).toEqual([])
  })

  it("returns empty array when all entries in file are invalid", async () => {
    fs.writeFileSync(file, JSON.stringify([
      { name: "bad name!", url: "https://example.com" },
      { name: "nohttps", url: "http://example.com" },
      { name: "invalid!", url: "http://insecure.com" }
    ]))
    expect(await readMcpPool(file)).toEqual([])
  })
})
