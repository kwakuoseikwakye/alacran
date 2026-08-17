import { describe, it, expect } from "vitest"
import { summarizeNetworkAccess } from "./summarize-network-access"

describe("summarizeNetworkAccess", () => {
  it("includes only the AI executor line when nothing else is configured", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "claude-code", hasIntegration: false, remoteUrl: null })
    expect(result).toEqual(["Anthropic (Claude Code) — your own account"])
  })

  it("labels the OpenAI Codex executor", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "openai-codex", hasIntegration: false, remoteUrl: null })
    expect(result).toEqual(["OpenAI (Codex CLI) — your own account"])
  })

  it("labels the Google Antigravity executor", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "google-antigravity", hasIntegration: false, remoteUrl: null })
    expect(result).toEqual(["Google (Antigravity CLI) — your own account"])
  })

  it("gives Aider a non-committal line rather than claiming certainty about its backend", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "aider", hasIntegration: false, remoteUrl: null })
    expect(result).toEqual([
      "Depends on your own Aider model config (OpenAI, Anthropic, or a local model) — not visible to this app",
    ])
  })

  it("adds the Google line when an integration is connected", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "claude-code", hasIntegration: true, remoteUrl: null })
    expect(result).toEqual([
      "Anthropic (Claude Code) — your own account",
      "Google, via gog — your own account",
    ])
  })

  it("adds the GitHub line when a backup remote is configured", () => {
    const result = summarizeNetworkAccess({
      aiExecutorId: "claude-code",
      hasIntegration: false,
      remoteUrl: "git@github.com:me/acme.git",
    })
    expect(result).toEqual([
      "Anthropic (Claude Code) — your own account",
      "GitHub — your own private repository",
    ])
  })

  it("includes all three lines when everything is configured", () => {
    const result = summarizeNetworkAccess({
      aiExecutorId: "openai-codex",
      hasIntegration: true,
      remoteUrl: "git@github.com:me/acme.git",
    })
    expect(result).toEqual([
      "OpenAI (Codex CLI) — your own account",
      "Google, via gog — your own account",
      "GitHub — your own private repository",
    ])
  })

  it("lists every wired MCP server, which is real external network access", () => {
    const result = summarizeNetworkAccess({
      aiExecutorId: "claude-code",
      hasIntegration: false,
      remoteUrl: null,
      mcpServers: [
        { name: "canva", url: "https://mcp.canva.com/mcp" },
        { name: "figma", url: "https://mcp.figma.com/mcp" },
      ],
    })
    expect(result).toEqual([
      "Anthropic (Claude Code) — your own account",
      "canva (MCP) — https://mcp.canva.com/mcp, signed in with your own account",
      "figma (MCP) — https://mcp.figma.com/mcp, signed in with your own account",
    ])
  })

  it("is byte-identical to its pre-MCP output when no servers are wired", () => {
    const base = { aiExecutorId: "claude-code" as const, hasIntegration: true, remoteUrl: "git@github.com:me/a.git" }
    expect(summarizeNetworkAccess({ ...base, mcpServers: [] })).toEqual(summarizeNetworkAccess(base))
    expect(summarizeNetworkAccess({ ...base, mcpServers: undefined })).toEqual(summarizeNetworkAccess(base))
  })
})
