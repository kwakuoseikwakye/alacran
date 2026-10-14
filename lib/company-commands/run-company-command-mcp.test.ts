import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { AI_EXECUTORS } from "../ai-executors"
import { COMPANY_COMMANDS } from "./registry"

let root: string
let dataDir: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "run-company-command-mcp-test-"))
  dataDir = await mkdtemp(path.join(tmpdir(), "run-company-command-mcp-data-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
  vi.doUnmock("../config")
  vi.doUnmock("./registry")
  vi.resetModules()
})

function fakeSpawn(calls: { command: string; args: string[]; options: unknown }[]) {
  return (command: string, args: string[], options: unknown) => {
    calls.push({ command, args, options })
    return { unref: () => {}, on: () => {} }
  }
}

describe("runCompanyCommandImpl with mcpTools", () => {
  it("refuses a command with mcpTools on an executor that can't support MCP allowlists, before the lock or any prefetch", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    // Find digest command and add mcpTools to it for this test
    const digestCmd = COMPANY_COMMANDS.find((c) => c.id === "digest")!
    const cmdWithMcp = { ...digestCmd, mcpTools: ["mcp__x__a"] }
    vi.doMock("./registry", () => ({
      getCompanyCommand: (id: string) => (id === "digest" ? cmdWithMcp : undefined),
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir,
      async () => AI_EXECUTORS.kiro
    )

    expect(result.started).toBe(false)
    expect(result.message).toContain("needs Claude Code for now")
    expect(calls).toHaveLength(0)
  })

  it("runs a command with mcpTools on Claude Code, appending the tools to --allowedTools", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    // Find digest command and add mcpTools to it for this test
    const digestCmd = COMPANY_COMMANDS.find((c) => c.id === "digest")!
    const cmdWithMcp = { ...digestCmd, mcpTools: ["mcp__x__a"] }
    vi.doMock("./registry", () => ({
      getCompanyCommand: (id: string) => (id === "digest" ? cmdWithMcp : undefined),
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir,
      async () => AI_EXECUTORS["claude-code"]
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("claude")
    const argsStr = calls[0].args.join(" ")
    expect(argsStr).toContain("--allowedTools")
    const allowedToolsIndex = calls[0].args.indexOf("--allowedTools")
    const toolsArg = calls[0].args[allowedToolsIndex + 1]
    expect(toolsArg).toContain(",mcp__x__a")
  })
})
