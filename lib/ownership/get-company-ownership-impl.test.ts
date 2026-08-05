import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "../git-commit-file"

let root: string
let dataDir: string
let aiExecutorRegistryPath: string

function fakeExec(handler: (command: string, args: string[]) => unknown): ExecFileFn {
  return async (command, args) => {
    const result = handler(command, args)
    if (result instanceof Error) throw result
    const r = (result ?? {}) as { stdout?: string; stderr?: string }
    return { stdout: r.stdout ?? "", stderr: r.stderr ?? "" }
  }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ownership-company-"))
  dataDir = await mkdtemp(path.join(tmpdir(), "ownership-data-"))
  aiExecutorRegistryPath = path.join(dataDir, "ai-executors.json")
  vi.doMock("../get-effective-agents", () => ({
    getEffectiveAgents: async () => [{ id: "acme", name: "Acme Co", rootPath: root, kind: "command-set" }],
  }))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

describe("getCompanyOwnershipImpl", () => {
  it("rejects an unknown company", async () => {
    const { getCompanyOwnershipImpl } = await import("./get-company-ownership-impl")
    const exec = fakeExec(() => new Error("should not be called"))
    expect(await getCompanyOwnershipImpl("nope", exec, aiExecutorRegistryPath)).toEqual({
      ok: false,
      message: "Unknown company",
    })
  })

  it("composes a fresh company with no remote, no integration, default executor", async () => {
    const { getCompanyOwnershipImpl } = await import("./get-company-ownership-impl")
    const exec = fakeExec(() => new Error("fatal: No such remote 'origin'"))
    const result = await getCompanyOwnershipImpl("acme", exec, aiExecutorRegistryPath)
    expect(result).toEqual({
      ok: true,
      rootPath: root,
      remoteUrl: null,
      integrationStatus: "none configured yet",
      aiExecutorId: "claude-code",
      networkAccess: [{ label: "Anthropic (Claude Code) — your own account" }],
    })
  })

  it("reflects a configured backup remote and a non-default executor", async () => {
    await mkdir(path.dirname(aiExecutorRegistryPath), { recursive: true })
    await writeFile(
      aiExecutorRegistryPath,
      JSON.stringify([{ agentId: "acme", executorId: "openai-codex" }]),
      "utf-8"
    )
    const { getCompanyOwnershipImpl } = await import("./get-company-ownership-impl")
    const exec = fakeExec(() => ({ stdout: "git@github.com:me/acme.git\n" }))
    const result = await getCompanyOwnershipImpl("acme", exec, aiExecutorRegistryPath)
    expect(result).toEqual({
      ok: true,
      rootPath: root,
      remoteUrl: "git@github.com:me/acme.git",
      integrationStatus: "none configured yet",
      aiExecutorId: "openai-codex",
      networkAccess: [
        { label: "OpenAI (Codex CLI) — your own account" },
        { label: "GitHub — your own private repository" },
      ],
    })
  })

  it("falls back to the machine-wide Google connection when no per-company integration exists", async () => {
    const { getCompanyOwnershipImpl } = await import("./get-company-ownership-impl")
    const exec: ExecFileFn = async (command, args) => {
      if (command === "gog" && args[0] === "auth" && args[1] === "status") {
        return { stdout: JSON.stringify({ account: { email: "me@example.com", credentials_exists: true } }), stderr: "" }
      }
      if (command === "which") {
        return { stdout: `/usr/local/bin/${args[0]}\n`, stderr: "" }
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`)
    }
    const result = await getCompanyOwnershipImpl("acme", exec, aiExecutorRegistryPath)
    expect(result).toEqual({
      ok: true,
      rootPath: root,
      remoteUrl: null,
      integrationStatus:
        "Connected as me@example.com. (Google is connected on this machine — any company's commands can use it.)",
      aiExecutorId: "claude-code",
      networkAccess: [
        { label: "Anthropic (Claude Code) — your own account" },
        { label: "Google, via gog — your own account" },
      ],
    })
  })
})
