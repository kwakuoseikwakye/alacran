import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, readFile, writeFile, access } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "./git-commit-file"

let root: string
let execCalls: { command: string; args: string[] }[]

const fakeExecFn: ExecFileFn = async (command, args) => {
  execCalls.push({ command, args })
  return { stdout: "", stderr: "" }
}

const refusingExecFn: ExecFileFn = async () => {
  // What commitFile really does when `git add` refuses an ignored path.
  throw new Error("The following paths are ignored by one of your .gitignore files:\n.mcp.json")
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "save-mcp-servers-"))
  execCalls = []
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

async function mockAgents() {
  vi.doMock("./get-effective-agents", () => ({
    getEffectiveAgents: async () => [
      { id: "second-co", name: "Second Co", rootPath: root, kind: "command-set" },
      { id: "a-pipeline", name: "A Pipeline", rootPath: root, kind: "pipeline" },
    ],
  }))
}

async function written(): Promise<unknown> {
  return JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf-8"))
}

async function exists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(root, relativePath))
    return true
  } catch {
    return false
  }
}

describe("saveMcpServersImpl", () => {
  it("writes .mcp.json in Claude Code's own shape and commits it", async () => {
    await mockAgents()
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    const result = await saveMcpServersImpl(
      "second-co",
      [{ name: "canva", url: "https://mcp.canva.com/mcp" }],
      fakeExecFn
    )

    expect(result).toEqual({ ok: true, message: "Saved" })
    expect(await written()).toEqual({
      mcpServers: { canva: { type: "http", url: "https://mcp.canva.com/mcp" } },
    })
    expect(execCalls).toEqual([
      { command: "git", args: ["-C", root, "add", "--", ".mcp.json"] },
      {
        command: "git",
        args: ["-C", root, "commit", "-m", "Update MCP servers via AI-Native control panel", "--", ".mcp.json"],
      },
    ])
  })

  it("refuses an unknown company", async () => {
    await mockAgents()
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    const result = await saveMcpServersImpl("nope", [{ name: "canva", url: "https://mcp.canva.com/mcp" }], fakeExecFn)

    expect(result).toEqual({ ok: false, message: "Unknown company" })
    expect(await exists(".mcp.json")).toBe(false)
  })

  it("refuses a non-command-set agent", async () => {
    await mockAgents()
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    const result = await saveMcpServersImpl(
      "a-pipeline",
      [{ name: "canva", url: "https://mcp.canva.com/mcp" }],
      fakeExecFn
    )

    expect(result).toEqual({ ok: false, message: "Unknown company" })
    expect(await exists(".mcp.json")).toBe(false)
  })

  it("refuses an unsafe name without writing anything", async () => {
    await mockAgents()
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    const result = await saveMcpServersImpl(
      "second-co",
      [{ name: "'; rm -rf /", url: "https://mcp.canva.com/mcp" }],
      fakeExecFn
    )

    expect(result.ok).toBe(false)
    expect(await exists(".mcp.json")).toBe(false)
    expect(execCalls).toEqual([])
  })

  it("refuses a non-https URL without writing anything", async () => {
    await mockAgents()
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    const result = await saveMcpServersImpl("second-co", [{ name: "canva", url: "http://evil.test/mcp" }], fakeExecFn)

    expect(result).toEqual({ ok: false, message: `"http://evil.test/mcp" isn't an https:// address` })
    expect(await exists(".mcp.json")).toBe(false)
  })

  it("refuses names that differ only in case", async () => {
    await mockAgents()
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    const result = await saveMcpServersImpl(
      "second-co",
      [
        { name: "canva", url: "https://mcp.canva.com/mcp" },
        { name: "Canva", url: "https://mcp.canva.com/mcp" },
      ],
      fakeExecFn
    )

    expect(result).toEqual({ ok: false, message: `"Canva" is already added` })
    expect(await exists(".mcp.json")).toBe(false)
  })

  it("preserves a hand-added server this UI can't represent", async () => {
    await mockAgents()
    await writeFile(
      path.join(root, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          local: { command: "npx", args: ["some-mcp"] },
          canva: { type: "http", url: "https://mcp.canva.com/mcp" },
        },
      }),
      "utf-8"
    )
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    const result = await saveMcpServersImpl(
      "second-co",
      [{ name: "figma", url: "https://mcp.figma.com/mcp" }],
      fakeExecFn
    )

    expect(result.ok).toBe(true)
    // canva was managed by the UI and was dropped from the submitted list, so
    // it's gone. The stdio entry the UI never showed survives untouched.
    expect(await written()).toEqual({
      mcpServers: {
        local: { command: "npx", args: ["some-mcp"] },
        figma: { type: "http", url: "https://mcp.figma.com/mcp" },
      },
    })
  })

  it("keeps the file when the commit fails, and says so", async () => {
    await mockAgents()
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    const result = await saveMcpServersImpl(
      "second-co",
      [{ name: "canva", url: "https://mcp.canva.com/mcp" }],
      refusingExecFn
    )

    expect(result).toEqual({ ok: true, message: "Saved (not committed — this repo ignores .mcp.json)" })
    expect(await written()).toEqual({
      mcpServers: { canva: { type: "http", url: "https://mcp.canva.com/mcp" } },
    })
  })

  it("writes an empty object when the last server is removed", async () => {
    await mockAgents()
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    const result = await saveMcpServersImpl("second-co", [], fakeExecFn)

    expect(result.ok).toBe(true)
    expect(await written()).toEqual({ mcpServers: {} })
  })

  it("round-trips through readMcpServers on a real filesystem", async () => {
    await mockAgents()
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")
    const { readMcpServers } = await import("./mcp-servers-config")

    await saveMcpServersImpl(
      "second-co",
      [
        { name: "canva", url: "https://mcp.canva.com/mcp" },
        { name: "lovable", url: "https://mcp.lovable.dev" },
      ],
      fakeExecFn
    )

    expect(await readMcpServers(root)).toEqual([
      { name: "canva", url: "https://mcp.canva.com/mcp" },
      { name: "lovable", url: "https://mcp.lovable.dev" },
    ])
  })
})
