import { AI_EXECUTORS } from "./ai-executors"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, readFile, writeFile, mkdir, access } from "node:fs/promises"
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

  // Kiro reads .kiro/settings/mcp.json, never Claude's .mcp.json — so a
  // company on Kiro saw no servers at all before this. Same `mcpServers` key
  // and same { type, url } entry, verified against kiro-cli 2.19.1's own
  // serde field names, so one extra path rather than one extra serializer.
  it("writes Kiro's copy at .kiro/settings/mcp.json with identical content", async () => {
    await mockAgents()
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    await saveMcpServersImpl("second-co", [{ name: "canva", url: "https://mcp.canva.com/mcp" }], fakeExecFn)

    const claude = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf-8"))
    const kiro = JSON.parse(await readFile(path.join(root, ".kiro", "settings", "mcp.json"), "utf-8"))
    expect(kiro).toEqual(claude)
    expect(kiro).toEqual({ mcpServers: { canva: { type: "http", url: "https://mcp.canva.com/mcp" } } })
  })

  // The .kiro/settings/ directory does not exist in a company that has never
  // run Kiro, so the write has to create it rather than ENOENT.
  it("creates .kiro/settings/ when it does not exist yet", async () => {
    await mockAgents()
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    expect(await exists(path.join(".kiro", "settings"))).toBe(false)
    const result = await saveMcpServersImpl("second-co", [{ name: "canva", url: "https://a.example/mcp" }], fakeExecFn)

    expect(result.ok).toBe(true)
    expect(await exists(path.join(".kiro", "settings", "mcp.json"))).toBe(true)
  })

  // Each file is read before it is rewritten, so a hand-added stdio server
  // survives in the file it was added to — and does NOT leak into the other.
  it("preserves each file's own unmanaged entries independently", async () => {
    await mockAgents()
    await writeFile(
      path.join(root, ".mcp.json"),
      JSON.stringify({ mcpServers: { "claude-stdio": { command: "npx", args: ["a"] } } })
    )
    await mkdir(path.join(root, ".kiro", "settings"), { recursive: true })
    await writeFile(
      path.join(root, ".kiro", "settings", "mcp.json"),
      JSON.stringify({ mcpServers: { "kiro-stdio": { command: "uvx", args: ["b"] } } })
    )
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    await saveMcpServersImpl("second-co", [{ name: "canva", url: "https://a.example/mcp" }], fakeExecFn)

    const claude = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf-8"))
    const kiro = JSON.parse(await readFile(path.join(root, ".kiro", "settings", "mcp.json"), "utf-8"))
    expect(Object.keys(claude.mcpServers).sort()).toEqual(["canva", "claude-stdio"])
    expect(Object.keys(kiro.mcpServers).sort()).toEqual(["canva", "kiro-stdio"])
  })

  // Deliberate: Kiro treats config that travels inside a repo as an injection
  // surface, so a cloned company must not arrive carrying MCP servers. Only
  // Claude's copy is committed.
  it("commits only Claude's copy, never .kiro/settings/mcp.json", async () => {
    await mockAgents()
    const { saveMcpServersImpl } = await import("./save-mcp-servers-impl")

    await saveMcpServersImpl("second-co", [{ name: "canva", url: "https://a.example/mcp" }], fakeExecFn)

    expect(execCalls.every((c) => !c.args.some((a) => a.includes(".kiro")))).toBe(true)
    expect(execCalls.some((c) => c.args.includes(".mcp.json"))).toBe(true)
  })
})

describe("mcpConfigPaths", () => {
  it("is derived from the registry, so it covers every executor that declares a path", async () => {
    const { mcpConfigPaths } = await import("./save-mcp-servers-impl")
    const declared = Object.values(AI_EXECUTORS)
      .map((e) => e.mcpConfigPath)
      .filter((p): p is string => p !== null)
    expect(new Set(mcpConfigPaths())).toEqual(new Set(declared))
  })

  it("contributes nothing for an executor measured to have no MCP config", async () => {
    // Kimi and Antigravity declare null, so they add no path — rather than a
    // guessed one that would be written and reported as success.
    const { mcpConfigPaths } = await import("./save-mcp-servers-impl")
    expect(mcpConfigPaths().every((p) => p.length > 0)).toBe(true)
    expect(mcpConfigPaths()).toHaveLength(2)
  })

  it("says whether any agent on this machine can read one at all", async () => {
    const { mcpConfigPaths, anyExecutorSupportsMcp } = await import("./save-mcp-servers-impl")
    expect(anyExecutorSupportsMcp()).toBe(mcpConfigPaths().length > 0)
  })
})
