import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { buildBuiltins } from "./builtin-agents"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "builtin-agents-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("buildBuiltins", () => {
  it("includes all 3 builtins when every dir exists", () => {
    const b = buildBuiltins(() => true)
    expect(b.agents.map((a) => a.id).sort()).toEqual([
      "ai-company-starter-main",
      "plh-ops",
      "email-pipeline-agent",
    ])
  })

  it("includes none when no dir exists", () => {
    const b = buildBuiltins(() => false)
    expect(b.agents).toEqual([])
    expect(b.adapters).toEqual({})
    expect(b.skillAdapters).toEqual({})
  })

  it("includes only the subset whose dirs exist", () => {
    const b = buildBuiltins((p) => p.endsWith("plh-ops"))
    expect(b.agents.map((a) => a.id)).toEqual(["plh-ops"])
    expect(Object.keys(b.adapters)).toEqual(["plh-ops"])
    expect(Object.keys(b.skillAdapters)).toEqual(["plh-ops"])
  })

  it("keeps adapter maps in sync with the agent list in every gate state (machine-independent drift guard)", () => {
    const gates: Array<(p: string) => boolean> = [
      () => true,
      () => false,
      (p) => p.includes("pipeline"),
    ]
    for (const exists of gates) {
      const b = buildBuiltins(exists)
      const ids = b.agents.map((a) => a.id).sort()
      expect(Object.keys(b.adapters).sort()).toEqual(ids)
      expect(Object.keys(b.skillAdapters).sort()).toEqual(ids)
    }
  })

  it("email-pipeline-agent's skillAdapter scans skills/ (not .claude/skills — it isn't a generic command-set agent)", async () => {
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    await writeFile(
      path.join(root, "skills", "plh-dev-team", "SKILL.md"),
      "---\nname: plh-dev-team\ndescription: Runs the dev team pipeline.\n---\n"
    )
    const agent = { id: "email-pipeline-agent", name: "Email Pipeline Agent", rootPath: root, kind: "pipeline" as const }

    const b = buildBuiltins(() => true)
    const entries = await b.skillAdapters["email-pipeline-agent"](agent)

    expect(entries).toEqual([
      {
        id: path.join(root, "skills", "plh-dev-team", "SKILL.md"),
        agentId: "email-pipeline-agent",
        kind: "skill",
        name: "plh-dev-team",
        description: "Runs the dev team pipeline.",
        path: path.join(root, "skills", "plh-dev-team", "SKILL.md"),
      },
    ])
  })

  it("plh-ops's skillAdapter scans workflow/", async () => {
    await mkdir(path.join(root, "workflow", "daily-team-log"), { recursive: true })
    await writeFile(
      path.join(root, "workflow", "daily-team-log", "SKILL.md"),
      "---\nname: daily-team-log\ndescription: Generates the daily report.\n---\n"
    )
    const agent = { id: "plh-ops", name: "PLH Ops", rootPath: root, kind: "report-log" as const }

    const b = buildBuiltins(() => true)
    const entries = await b.skillAdapters["plh-ops"](agent)

    expect(entries).toEqual([
      {
        id: path.join(root, "workflow", "daily-team-log", "SKILL.md"),
        agentId: "plh-ops",
        kind: "skill",
        name: "daily-team-log",
        description: "Generates the daily report.",
        path: path.join(root, "workflow", "daily-team-log", "SKILL.md"),
      },
    ])
  })

  it("both skillAdapters return an empty array when their scanned directory doesn't exist", async () => {
    const b = buildBuiltins(() => true)
    const pipelineAgent = { id: "email-pipeline-agent", name: "Email Pipeline Agent", rootPath: root, kind: "pipeline" as const }
    const opsAgent = { id: "plh-ops", name: "PLH Ops", rootPath: root, kind: "report-log" as const }

    expect(await b.skillAdapters["email-pipeline-agent"](pipelineAgent)).toEqual([])
    expect(await b.skillAdapters["plh-ops"](opsAgent)).toEqual([])
  })
})
