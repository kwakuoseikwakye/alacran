import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "./git-commit-file"

let pipelineRoot: string
let reportLogRoot: string
let commandSetRoot: string
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

/** Every exec call getConnectStatusImpl/getCompanyRemoteImpl might make,
 *  answered as "nothing installed, no remote" unless a test overrides it. */
function baseExec(overrides: Partial<Record<string, (args: string[]) => unknown>> = {}): ExecFileFn {
  return fakeExec((command, args) => {
    if (command in overrides) return overrides[command]!(args)
    if (command === "which") return new Error("not found")
    if (command === "git") return new Error("fatal: No such remote 'origin'")
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`)
  })
}

beforeEach(async () => {
  pipelineRoot = await mkdtemp(path.join(tmpdir(), "netmap-pipeline-"))
  reportLogRoot = await mkdtemp(path.join(tmpdir(), "netmap-reportlog-"))
  commandSetRoot = await mkdtemp(path.join(tmpdir(), "netmap-cmdset-"))
  dataDir = await mkdtemp(path.join(tmpdir(), "netmap-data-"))
  aiExecutorRegistryPath = path.join(dataDir, "ai-executors.json")
  vi.doMock("./get-effective-agents", () => ({
    getEffectiveAgents: async () => [
      { id: "pipeline", name: "Owner", rootPath: pipelineRoot, kind: "pipeline" },
      { id: "ops", name: "Ops", rootPath: reportLogRoot, kind: "report-log" },
      { id: "acme", name: "Acme", rootPath: commandSetRoot, kind: "command-set" },
    ],
  }))
})

afterEach(async () => {
  await rm(pipelineRoot, { recursive: true, force: true })
  await rm(reportLogRoot, { recursive: true, force: true })
  await rm(commandSetRoot, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

describe("buildNetworkMap", () => {
  it("gives the pipeline agent only a Google edge, read from its own config.json", async () => {
    await writeFile(path.join(pipelineRoot, "config.json"), JSON.stringify({ account: "ops@acme.co" }))
    const { buildNetworkMap } = await import("./build-network-map")
    const map = await buildNetworkMap(baseExec(), aiExecutorRegistryPath)
    const pipeline = map.companies.find((c) => c.id === "pipeline")!
    expect(pipeline.aiExecutorId).toBeNull()
    expect(pipeline.edges).toEqual([{ service: "google", connected: true, detail: "Email connected (ops@acme.co)" }])
  })

  it("gives the report-log agent no edges at all — a genuinely isolated node", async () => {
    const { buildNetworkMap } = await import("./build-network-map")
    const map = await buildNetworkMap(baseExec(), aiExecutorRegistryPath)
    const ops = map.companies.find((c) => c.id === "ops")!
    expect(ops.edges).toEqual([])
    expect(ops.aiExecutorId).toBeNull()
  })

  it("gives a fresh command-set company all three service edges, disconnected by default", async () => {
    const { buildNetworkMap } = await import("./build-network-map")
    const map = await buildNetworkMap(baseExec(), aiExecutorRegistryPath)
    const acme = map.companies.find((c) => c.id === "acme")!
    expect(acme.aiExecutorId).toBe("claude-code")
    expect(acme.edges).toEqual([
      { service: "github", connected: false, detail: "Not backed up to GitHub yet" },
      { service: "google", connected: false, detail: "No Google account connected yet" },
      { service: "notion", connected: false, detail: "Notion not connected yet" },
    ])
    expect(map.executorsInUse).toEqual(["claude-code"])
  })

  it("marks a command-set company connected once it has a remote, an assigned Google account, and a Notion token", async () => {
    await mkdir(path.join(commandSetRoot, "definitions/integrations"), { recursive: true })
    await writeFile(
      path.join(commandSetRoot, "definitions/integrations/google.yaml"),
      "accounts:\n  - me@example.com\n"
    )
    await writeFile(path.join(commandSetRoot, ".env"), "NOTION_TOKEN=secret\n")
    const exec = baseExec({ git: () => ({ stdout: "git@github.com:me/acme.git\n" }) })
    const { buildNetworkMap } = await import("./build-network-map")
    const map = await buildNetworkMap(exec, aiExecutorRegistryPath)
    const acme = map.companies.find((c) => c.id === "acme")!
    expect(acme.edges).toEqual([
      { service: "github", connected: true, detail: "Backed up to git@github.com:me/acme.git" },
      { service: "google", connected: true, detail: "Assigned: me@example.com" },
      { service: "notion", connected: true, detail: "Notion connected" },
    ])
  })
})
