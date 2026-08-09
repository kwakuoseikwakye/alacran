import { describe, it, expect } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getConnectStatusImpl, type ExecFileFn, type ToolStatus } from "./connect-status-impl"
import type { Agent } from "../adapters/types"

function findExecutor(status: { aiExecutors: ToolStatus[] }, id: string): ToolStatus {
  const found = status.aiExecutors.find((e) => e.id === id)
  if (!found) throw new Error(`no executor with id ${id}`)
  return found
}

// Real getEffectiveAgents() reads this machine's real registry + real
// ~/AI-Native/* dirs — every test here that doesn't specifically exercise
// Notion status must inject an empty list instead, or it'd silently read
// this dev machine's real companies (and their real .env files).
const noAgents = async (): Promise<Agent[]> => []

/** Build a fake ExecFileFn from a handler map keyed by "command arg0 arg1 ...". */
function fakeExec(handler: (command: string, args: string[]) => { stdout: string } | Error): ExecFileFn {
  return async (command, args) => {
    const res = handler(command, args)
    if (res instanceof Error) throw res
    return { stdout: res.stdout, stderr: "" }
  }
}

const GOG_CONNECTED = JSON.stringify({
  account: { email: "user@example.com", credentials_exists: true },
})

describe("getConnectStatusImpl", () => {
  it("reports both connected, with the Google account email in the detail", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "gog") return { stdout: GOG_CONNECTED }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(findExecutor(status, "claude-code").connected).toBe(true)
    expect(status.google.connected).toBe(true)
    expect(status.google.detail).toContain("user@example.com")
  })

  it("lists every stored account and pluralizes the detail when there's more than one", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "gog" && args[1] === "list")
        return { stdout: JSON.stringify({ accounts: [{ email: "user@example.com" }, { email: "second@example.com" }] }) }
      if (command === "gog") return { stdout: GOG_CONNECTED }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(status.google.accounts).toEqual(["user@example.com", "second@example.com"])
    expect(status.google.detail).toBe("Connected: user@example.com, second@example.com.")
  })

  it("marks Claude Code not connected with install guidance when the CLI is missing", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which" && args[0] === "claude") return new Error("not found")
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "gog") return { stdout: GOG_CONNECTED }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(findExecutor(status, "claude-code").connected).toBe(false)
    expect(findExecutor(status, "claude-code").guidance.command).toContain("claude-code")
    // Every other tool still resolves independently.
    expect(status.google.connected).toBe(true)
  })

  it("gives every registered AI executor its own card, not just Claude Code", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which" && args[0] === "agy") return new Error("not found")
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "gog") return { stdout: GOG_CONNECTED }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(status.aiExecutors.map((e) => ({ id: e.id, label: e.label, connected: e.connected }))).toEqual([
      { id: "claude-code", label: "Claude Code", connected: true },
      { id: "openai-codex", label: "OpenAI Codex CLI", connected: true },
      { id: "aider", label: "Aider (OpenAI, Anthropic, or a local/open-source model)", connected: true },
      { id: "google-antigravity", label: "Google Antigravity CLI", connected: false },
    ])
    // A missing executor gets its real install command/link, not Claude's.
    expect(findExecutor(status, "google-antigravity").guidance.command).toContain(
      "antigravity.google/cli/install.sh"
    )
  })

  it("marks Google not connected with a brew install command on macOS when gog is missing", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which" && args[0] === "gog") return new Error("not found")
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, "darwin", noAgents)

    expect(status.google.connected).toBe(false)
    expect(status.google.guidance.command).toContain("gog")
    expect(findExecutor(status, "claude-code").connected).toBe(true)
  })

  it("omits the macOS-only brew command on Linux, keeping the install link", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which" && (args[0] === "gog" || args[0] === "gh")) return new Error("not found")
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, "linux", noAgents)

    expect(status.google.guidance.command).toBeUndefined()
    expect(status.google.guidance.link).toBe("https://github.com/gogcli/gog")
    expect(status.github.guidance.command).toBeUndefined()
    expect(status.github.guidance.link).toBe("https://cli.github.com")
  })

  it("guides `gog auth setup` when gog is installed but no account is connected", async () => {
    const exec = fakeExec((command) => {
      if (command === "which") return { stdout: "/usr/local/bin/x" }
      if (command === "gog")
        return { stdout: JSON.stringify({ account: { email: "", credentials_exists: false } }) }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(status.google.connected).toBe(false)
    expect(status.google.guidance.command).toBe("gog auth setup")
  })

  it("does not crash on malformed gog JSON", async () => {
    const exec = fakeExec((command) => {
      if (command === "which") return { stdout: "/usr/local/bin/x" }
      if (command === "gog") return { stdout: "not json {{{" }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(status.google.connected).toBe(false)
    expect(status.google.guidance.command).toBe("gog auth setup")
  })

  it("reports GitHub signed in with the login name", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "gh") return { stdout: "octocat\n" }
      if (command === "gog")
        return { stdout: JSON.stringify({ account: { email: "a@b.c", credentials_exists: true } }) }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(status.github.connected).toBe(true)
    expect(status.github.detail).toContain("octocat")
  })

  it("guides installing gh with a brew command on macOS when the GitHub CLI is missing", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which" && args[0] === "gh") return new Error("not found")
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "gog")
        return { stdout: JSON.stringify({ account: { email: "a@b.c", credentials_exists: true } }) }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, "darwin", noAgents)

    expect(status.github.connected).toBe(false)
    expect(status.github.guidance.command).toBe("brew install gh")
  })

  it("guides `gh auth login` when gh is installed but unauthenticated", async () => {
    const exec = fakeExec((command) => {
      if (command === "which") return { stdout: "/usr/local/bin/x" }
      if (command === "gh") return new Error("gh: not authenticated")
      if (command === "gog")
        return { stdout: JSON.stringify({ account: { email: "a@b.c", credentials_exists: true } }) }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(status.github.connected).toBe(false)
    expect(status.github.guidance.command).toBe("gh auth login")
  })

  describe("notion", () => {
    const noopExec = fakeExec((command) => {
      if (command === "which") return new Error("not found")
      return new Error(`unexpected ${command}`)
    })

    it("reports each command-set company's real Notion connection independently, from its own .env", async () => {
      const connected = await mkdtemp(path.join(tmpdir(), "connect-notion-test-"))
      const disconnected = await mkdtemp(path.join(tmpdir(), "connect-notion-test-"))
      await writeFile(path.join(connected, ".env"), "NOTION_TOKEN=secret_real\n")
      try {
        const agents: Agent[] = [
          { id: "connected-co", name: "Connected Co", rootPath: connected, kind: "command-set" },
          { id: "disconnected-co", name: "Disconnected Co", rootPath: disconnected, kind: "command-set" },
        ]
        const status = await getConnectStatusImpl(noopExec, undefined, async () => agents)

        expect(status.notion.companies).toEqual([
          { agentId: "connected-co", companyName: "Connected Co", connected: true },
          { agentId: "disconnected-co", companyName: "Disconnected Co", connected: false },
        ])
      } finally {
        await rm(connected, { recursive: true, force: true })
        await rm(disconnected, { recursive: true, force: true })
      }
    })

    it("excludes pipeline/report-log built-ins — only command-set companies can run api-connect or check-notion", async () => {
      const agents: Agent[] = [
        { id: "email-pipeline-agent", name: "Email Pipeline Agent", rootPath: "/nonexistent", kind: "pipeline" },
        { id: "plh-ops", name: "PLH Ops", rootPath: "/nonexistent", kind: "report-log" },
      ]
      const status = await getConnectStatusImpl(noopExec, undefined, async () => agents)

      expect(status.notion.companies).toEqual([])
    })

    it("returns an empty list rather than throwing when there are no companies at all", async () => {
      const status = await getConnectStatusImpl(noopExec, undefined, noAgents)
      expect(status.notion.companies).toEqual([])
    })
  })
})
