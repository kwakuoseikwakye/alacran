import { describe, it, expect } from "vitest"
import { summarizeNetworkAccess } from "./summarize-network-access"

describe("summarizeNetworkAccess", () => {
  it("includes only the AI executor line when nothing else is configured", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "claude-code", hasIntegration: false, remoteUrl: null })
    expect(result).toEqual([{ label: "Anthropic (Claude Code) — your own account" }])
  })

  it("labels the OpenAI Codex executor", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "openai-codex", hasIntegration: false, remoteUrl: null })
    expect(result).toEqual([{ label: "OpenAI (Codex CLI) — your own account" }])
  })

  it("gives Aider a non-committal line rather than claiming certainty about its backend", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "aider", hasIntegration: false, remoteUrl: null })
    expect(result).toEqual([
      {
        label:
          "Depends on your own Aider model config (OpenAI, Anthropic, or a local model) — not visible to this app",
      },
    ])
  })

  it("adds the Google line when an integration is connected", () => {
    const result = summarizeNetworkAccess({ aiExecutorId: "claude-code", hasIntegration: true, remoteUrl: null })
    expect(result).toEqual([
      { label: "Anthropic (Claude Code) — your own account" },
      { label: "Google, via gog — your own account" },
    ])
  })

  it("adds the GitHub line when a backup remote is configured", () => {
    const result = summarizeNetworkAccess({
      aiExecutorId: "claude-code",
      hasIntegration: false,
      remoteUrl: "git@github.com:me/acme.git",
    })
    expect(result).toEqual([
      { label: "Anthropic (Claude Code) — your own account" },
      { label: "GitHub — your own private repository" },
    ])
  })

  it("includes all three lines when everything is configured", () => {
    const result = summarizeNetworkAccess({
      aiExecutorId: "openai-codex",
      hasIntegration: true,
      remoteUrl: "git@github.com:me/acme.git",
    })
    expect(result).toEqual([
      { label: "OpenAI (Codex CLI) — your own account" },
      { label: "Google, via gog — your own account" },
      { label: "GitHub — your own private repository" },
    ])
  })
})
