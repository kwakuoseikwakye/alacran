import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { plhOpsSkillsAdapter } from "./plh-ops"
import type { Agent } from "../adapters/types"

let root: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "plh-ops-skills-test-"))
  agent = { id: "plh-ops", name: "PLH Ops", rootPath: root, kind: "report-log" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("plhOpsSkillsAdapter", () => {
  it("scans the workflow/ directory", async () => {
    await mkdir(path.join(root, "workflow", "daily-team-log"), { recursive: true })
    await writeFile(
      path.join(root, "workflow", "daily-team-log", "SKILL.md"),
      "---\nname: daily-team-log\ndescription: Generates the daily report.\n---\n"
    )

    const entries = await plhOpsSkillsAdapter(agent)

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

  it("returns an empty array when workflow/ doesn't exist", async () => {
    const entries = await plhOpsSkillsAdapter(agent)
    expect(entries).toEqual([])
  })
})
