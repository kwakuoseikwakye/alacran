import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { genericCommandSetSkillAdapter } from "./generic-command-set"
import { syncAgentSkills } from "./sync-agent-skills"
import type { Agent } from "../adapters/types"

let root: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "generic-command-set-test-"))
  agent = { id: "some-company", name: "Some Company", rootPath: root, kind: "command-set" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("genericCommandSetSkillAdapter", () => {
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

    const entries = await genericCommandSetSkillAdapter(agent)

    expect(entries).toHaveLength(2)
    expect(entries.find((e) => e.kind === "skill")).toMatchObject({ name: "piro" })
    expect(entries.find((e) => e.kind === "command")).toMatchObject({ name: "verify" })
  })

  it("returns an empty array when neither directory exists", async () => {
    const entries = await genericCommandSetSkillAdapter(agent)
    expect(entries).toEqual([])
  })

  // Kiro's project-level skills live at .kiro/skills/<name>/SKILL.md. A Kiro
  // company's Skills page was empty before this, because only .claude was
  // scanned.
  it("includes .kiro/skills", async () => {
    await mkdir(path.join(root, ".kiro", "skills", "research-market"), { recursive: true })
    await writeFile(
      path.join(root, ".kiro", "skills", "research-market", "SKILL.md"),
      "---\nname: research-market\ndescription: Sizes a market.\n---\n"
    )

    const entries = await genericCommandSetSkillAdapter(agent)

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: "skill", name: "research-market" })
  })

  // The adapter does not dispatch on the company's executor, so a company
  // holding both must show both rather than one winning.
  it("combines .claude and .kiro skills for a company that has both", async () => {
    await mkdir(path.join(root, ".claude", "skills", "piro"), { recursive: true })
    await writeFile(path.join(root, ".claude", "skills", "piro", "SKILL.md"), "---\nname: piro\n---\n")
    await mkdir(path.join(root, ".kiro", "skills", "kiro-only"), { recursive: true })
    await writeFile(path.join(root, ".kiro", "skills", "kiro-only", "SKILL.md"), "---\nname: kiro-only\n---\n")

    const entries = await genericCommandSetSkillAdapter(agent)

    expect(entries.map((e) => e.name).sort()).toEqual(["kiro-only", "piro"])
  })

  it("lists .agents/skills, and shows a skill once when the agents' folders hold generated copies of it", async () => {
    await mkdir(path.join(root, ".agents", "skills", "probe"), { recursive: true })
    await writeFile(path.join(root, ".agents", "skills", "probe", "SKILL.md"), "---\nname: probe\ndescription: A probe.\n---\nBody\n")
    await syncAgentSkills(root)

    const entries = await genericCommandSetSkillAdapter(agent)

    expect(entries).toHaveLength(1)
    expect(entries[0].path).toBe(path.join(root, ".agents", "skills", "probe", "SKILL.md"))
  })

  it("still shows a hand-written skill of the same name, so a conflict is visible", async () => {
    await mkdir(path.join(root, ".agents", "skills", "probe"), { recursive: true })
    await writeFile(path.join(root, ".agents", "skills", "probe", "SKILL.md"), "---\nname: probe\n---\nshared\n")
    await mkdir(path.join(root, ".kiro", "skills", "probe"), { recursive: true })
    await writeFile(path.join(root, ".kiro", "skills", "probe", "SKILL.md"), "---\nname: probe\n---\nmine\n")
    await syncAgentSkills(root)

    const entries = await genericCommandSetSkillAdapter(agent)

    // The generated .claude copy is hidden; the shared one and the hand-written Kiro one remain.
    expect(entries.map((entry) => entry.path).sort()).toEqual(
      [
        path.join(root, ".agents", "skills", "probe", "SKILL.md"),
        path.join(root, ".kiro", "skills", "probe", "SKILL.md"),
      ].sort()
    )
  })
})
