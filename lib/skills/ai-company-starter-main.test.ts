import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { aiCompanyStarterMainSkillsAdapter } from "./ai-company-starter-main"
import type { Agent } from "../adapters/types"

let root: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ai-company-skills-test-"))
  agent = { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("aiCompanyStarterMainSkillsAdapter", () => {
  it("combines .claude/skills and .claude/commands into one list", async () => {
    await mkdir(path.join(root, ".claude", "skills", "piro"), { recursive: true })
    await writeFile(
      path.join(root, ".claude", "skills", "piro", "SKILL.md"),
      "---\nname: piro\ndescription: Generates specs.\n---\n"
    )
    await mkdir(path.join(root, ".claude", "commands"), { recursive: true })
    await writeFile(
      path.join(root, ".claude", "commands", "verify.md"),
      "---\nname: verify\ndescription: Runs verification.\n---\n"
    )

    const entries = await aiCompanyStarterMainSkillsAdapter(agent)

    expect(entries).toHaveLength(2)
    expect(entries.find((e) => e.kind === "skill")).toMatchObject({ name: "piro" })
    expect(entries.find((e) => e.kind === "command")).toMatchObject({ name: "verify" })
  })

  it("returns an empty array when neither directory exists", async () => {
    const entries = await aiCompanyStarterMainSkillsAdapter(agent)
    expect(entries).toEqual([])
  })
})
