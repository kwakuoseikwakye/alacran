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

// `claude auth status` is a genuinely new async dependency of aiExecutorStatus
// (Claude Code is now the one executor whose login state is readable), so every
// fake exec that reports Claude Code installed needs it to answer too.
const CLAUDE_SIGNED_IN = JSON.stringify({ loggedIn: true, email: "dev@example.com", subscriptionType: "max" })

describe("getConnectStatusImpl", () => {
  it("reports both connected, with the Google account email in the detail", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
      if (command === "gog") return { stdout: GOG_CONNECTED }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(findExecutor(status, "claude-code").connected).toBe(true)
    expect(status.google.connected).toBe(true)
    expect(status.google.detail).toContain("user@example.com")
    expect(findExecutor(status, "claude-code").detail).toBe("Signed in as dev@example.com (max).")
  })

  it("separates installed-but-signed-out from not-installed for Claude Code", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "claude" && args[0] === "auth") return new Error("not logged in")
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
      if (command === "gog") return { stdout: GOG_CONNECTED }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    const claude = findExecutor(status, "claude-code")
    // Installed but signed out is NOT connected — it's the state where the UI
    // must offer Sign in rather than Install, which is why the flag exists.
    expect(claude.connected).toBe(false)
    expect(claude.needsSignIn).toBe(true)
    // Every other executor is only ever probed for presence, so it must not
    // acquire a sign-in state it can't actually detect.
    expect(findExecutor(status, "openai-codex").needsSignIn).toBeUndefined()
  })

  it("lists every stored account and pluralizes the detail when there's more than one", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
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
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
      if (command === "gog") return { stdout: GOG_CONNECTED }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(findExecutor(status, "claude-code").connected).toBe(false)
    expect(findExecutor(status, "claude-code").guidance.command).toContain("claude-code")
    // Every other tool still resolves independently.
    expect(status.google.connected).toBe(true)
  })

  it("does not report Claude Code connected just because something else on the PATH is named claude", async () => {
    // The reported bug: only the Claude desktop app was installed, and a
    // launcher shim for it (not Claude Code) already satisfied `which
    // claude`. Running it doesn't print the real CLI's version signature.
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "claude" && args[0] === "--version") return { stdout: "" }
      if (command === "gog") return { stdout: GOG_CONNECTED }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(findExecutor(status, "claude-code").connected).toBe(false)
    // This used to assert the guidance said "Fully quit and reopen." That
    // advice was wrong for the installs this app performs: PATH fixes the
    // DIRECTORY list at launch, but their contents are read at exec time, and
    // both `~/.local/bin` and `/opt/homebrew/bin` are already in COMMON_BINS.
    // The load-bearing contract now is that a missing binary offers an
    // Install button rather than a paragraph.
    expect(findExecutor(status, "claude-code").installId).toBe("claude-code")
    expect(findExecutor(status, "claude-code").guidance.steps.join(" ")).toContain("Press Re-check")
  })

  it("offers an install button only where there's a verified installer", async () => {
    const exec = fakeExec((command, _args) => {
      if (command === "which") return new Error("not found")
      if (command === "claude") return new Error("not found")
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(findExecutor(status, "claude-code").installId).toBe("claude-code")
    expect(status.google.installId).toBe("gog")
    expect(status.github.installId).toBe("gh")
    // Codex and Aider have no installer this project has ever verified, so
    // they must keep instructions instead of gaining a button that guesses.
    expect(findExecutor(status, "openai-codex").installId).toBeUndefined()
    expect(findExecutor(status, "aider").installId).toBeUndefined()
  })

  it("gives every registered AI executor its own card, not just Claude Code", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which" && args[0] === "agy") return new Error("not found")
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
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
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
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
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, "linux", noAgents)

    expect(status.google.guidance.command).toBeUndefined()
    expect(status.google.guidance.link).toBe("https://gogcli.sh")
    expect(status.github.guidance.command).toBeUndefined()
    expect(status.github.guidance.link).toBe("https://cli.github.com")
  })

  // These three cover the reported bug: every not-connected Google state used
  // to hand back the single command `gog auth setup`, which only PRINTS a plan
  // and connects nothing. The stage is what lets the card show the step the
  // user is actually on, and no stage may offer that command again.
  it("sends a user with no OAuth client to the client stage, not `gog auth setup`", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: "/usr/local/bin/x" }
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
      if (command === "gog")
        return { stdout: JSON.stringify({ account: { email: "", credentials_exists: false } }) }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(status.google.connected).toBe(false)
    expect(status.google.googleStage).toBe("client")
    expect(status.google.guidance.command).toBeUndefined()
  })

  // credentials_exists is file-backed and flips independently of `email`,
  // which reads back from the OS keyring — so this state is real, and it used
  // to be indistinguishable from "nothing set up at all".
  it("sends a user who already has an OAuth client to the account stage", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: "/usr/local/bin/x" }
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
      if (command === "gog")
        return { stdout: JSON.stringify({ account: { email: "", credentials_exists: true } }) }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(status.google.connected).toBe(false)
    expect(status.google.googleStage).toBe("account")
    expect(status.google.guidance.command).toBeUndefined()
  })

  it("does not crash on malformed gog JSON", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: "/usr/local/bin/x" }
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
      if (command === "gog") return { stdout: "not json {{{" }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    expect(status.google.connected).toBe(false)
    expect(status.google.googleStage).toBe("client")
  })

  it("marks a missing gog as the install stage", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which" && args[0] === "gog") return new Error("not found")
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
      if (command === "gh") return { stdout: "octocat\n" }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, "darwin", noAgents)

    expect(status.google.googleStage).toBe("install")
    expect(status.google.guidance.command).toBe("brew install gogcli")
  })

  it("reports GitHub signed in with the login name", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
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
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
      if (command === "gog")
        return { stdout: JSON.stringify({ account: { email: "a@b.c", credentials_exists: true } }) }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, "darwin", noAgents)

    expect(status.github.connected).toBe(false)
    expect(status.github.guidance.command).toBe("brew install gh")
  })

  it("guides `gh auth login` when gh is installed but unauthenticated", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: "/usr/local/bin/x" }
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
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
        { id: "legacy-pipeline", name: "Legacy Pipeline", rootPath: "/nonexistent", kind: "pipeline" },
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

describe("simple mode never hides an executor in use", () => {
  it("marks inUse for the executor a company is really assigned to", async () => {
    // The Connect page filters on this. Hiding a card for something you have
    // not started using is help; hiding one you already depend on is
    // concealment, and the user cannot even see it to change it back.
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "claude" && args[0] === "auth") return { stdout: CLAUDE_SIGNED_IN }
      if (command === "claude") return { stdout: "2.1.226 (Claude Code)" }
      if (command === "gog") return { stdout: GOG_CONNECTED }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, undefined, noAgents)

    // With no companies at all, nothing is in use.
    for (const e of status.aiExecutors) expect(e.inUse).toBeUndefined()
  })
})
