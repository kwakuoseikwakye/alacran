import { describe, it, expect } from "vitest"
import {
  MCP_SERVERS_RELATIVE_PATH,
  isSafeServerName,
  isSafeServerUrl,
  readMcpServers,
  readMcpServersRaw,
  unmanagedEntries,
  type ReadFileFn,
} from "./mcp-servers-config"
import { MCP_PRESETS } from "./mcp-presets"

const missing: ReadFileFn = async () => {
  throw new Error("ENOENT")
}

function serving(content: string): ReadFileFn {
  return async (filePath) => {
    expect(filePath).toContain(MCP_SERVERS_RELATIVE_PATH)
    return content
  }
}

describe("isSafeServerName", () => {
  it("accepts plain names", () => {
    expect(isSafeServerName("canva")).toBe(true)
    expect(isSafeServerName("google-calendar")).toBe(true)
    expect(isSafeServerName("My_Tool2")).toBe(true)
  })

  it("rejects anything that could splice into a JSON key or an argv value", () => {
    expect(isSafeServerName("")).toBe(false)
    expect(isSafeServerName("bad name")).toBe(false)
    expect(isSafeServerName("'; rm -rf /")).toBe(false)
    expect(isSafeServerName("-leading-dash")).toBe(false)
    expect(isSafeServerName("has/slash")).toBe(false)
    expect(isSafeServerName("a".repeat(65))).toBe(false)
  })
})

describe("isSafeServerUrl", () => {
  it("accepts https only", () => {
    expect(isSafeServerUrl("https://mcp.canva.com/mcp")).toBe(true)
    expect(isSafeServerUrl("http://mcp.canva.com/mcp")).toBe(false)
    expect(isSafeServerUrl("http://localhost:3000/mcp")).toBe(false)
    expect(isSafeServerUrl("javascript:alert(1)")).toBe(false)
    expect(isSafeServerUrl("not-a-url")).toBe(false)
    expect(isSafeServerUrl("")).toBe(false)
  })
})

describe("readMcpServers", () => {
  it("resolves to nothing when the file is missing", async () => {
    expect(await readMcpServers("/co", missing)).toEqual([])
  })

  it("resolves to nothing rather than throwing on unparseable JSON", async () => {
    expect(await readMcpServers("/co", serving("{ not json"))).toEqual([])
  })

  it("resolves to nothing for a file with no usable mcpServers object", async () => {
    expect(await readMcpServers("/co", serving("{}"))).toEqual([])
    expect(await readMcpServers("/co", serving('{"mcpServers": []}'))).toEqual([])
    expect(await readMcpServers("/co", serving('{"mcpServers": null}'))).toEqual([])
    expect(await readMcpServers("/co", serving("null"))).toEqual([])
  })

  it("reads real http entries", async () => {
    const file = JSON.stringify({
      mcpServers: {
        canva: { type: "http", url: "https://mcp.canva.com/mcp" },
        figma: { type: "http", url: "https://mcp.figma.com/mcp" },
      },
    })
    expect(await readMcpServers("/co", serving(file))).toEqual([
      { name: "canva", url: "https://mcp.canva.com/mcp" },
      { name: "figma", url: "https://mcp.figma.com/mcp" },
    ])
  })

  it("drops entries this UI can't represent or shouldn't trust", async () => {
    const file = JSON.stringify({
      mcpServers: {
        canva: { type: "http", url: "https://mcp.canva.com/mcp" },
        local: { command: "npx", args: ["some-mcp"] },
        insecure: { type: "http", url: "http://mcp.example.com/mcp" },
        "bad name": { type: "http", url: "https://mcp.example.com/mcp" },
        nulled: null,
        stringy: "nope",
      },
    })
    expect(await readMcpServers("/co", serving(file))).toEqual([{ name: "canva", url: "https://mcp.canva.com/mcp" }])
  })
})

describe("unmanagedEntries", () => {
  it("keeps exactly what readMcpServers drops, so a save can't delete it", async () => {
    const file = JSON.stringify({
      mcpServers: {
        canva: { type: "http", url: "https://mcp.canva.com/mcp" },
        local: { command: "npx", args: ["some-mcp"] },
        insecure: { type: "http", url: "http://mcp.example.com/mcp" },
      },
    })
    const raw = await readMcpServersRaw("/co", serving(file))
    expect(unmanagedEntries(raw)).toEqual({
      local: { command: "npx", args: ["some-mcp"] },
      insecure: { type: "http", url: "http://mcp.example.com/mcp" },
    })
  })
})

describe("MCP_PRESETS", () => {
  // The presets are hand-maintained data copied off a real `claude mcp list`.
  // This is the check that a typo'd addition fails the suite instead of being
  // silently dropped by readMcpServers at runtime.
  it("every preset passes the same validation a user-typed value must pass", () => {
    for (const preset of MCP_PRESETS) {
      expect(isSafeServerName(preset.name), preset.name).toBe(true)
      expect(isSafeServerUrl(preset.url), preset.url).toBe(true)
      expect(preset.label.length).toBeGreaterThan(0)
    }
  })

  it("has no duplicate names", () => {
    const names = MCP_PRESETS.map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
