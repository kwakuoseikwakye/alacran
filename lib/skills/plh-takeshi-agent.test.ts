import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { plhTakeshiAgentSkillsAdapter } from "./plh-takeshi-agent"
import type { Agent } from "../adapters/types"

let root: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "plh-takeshi-skills-test-"))
  agent = { id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("plhTakeshiAgentSkillsAdapter", () => {
  it("scans the skills/ directory", async () => {
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    await writeFile(
      path.join(root, "skills", "plh-dev-team", "SKILL.md"),
      "---\nname: plh-dev-team\ndescription: Runs the dev team pipeline.\n---\n"
    )

    const entries = await plhTakeshiAgentSkillsAdapter(agent)

    expect(entries).toEqual([
      {
        id: path.join(root, "skills", "plh-dev-team", "SKILL.md"),
        agentId: "plh-takeshi-agent",
        kind: "skill",
        name: "plh-dev-team",
        description: "Runs the dev team pipeline.",
        path: path.join(root, "skills", "plh-dev-team", "SKILL.md"),
      },
    ])
  })

  it("returns an empty array when skills/ doesn't exist", async () => {
    const entries = await plhTakeshiAgentSkillsAdapter(agent)
    expect(entries).toEqual([])
  })
})
