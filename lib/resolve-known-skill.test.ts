import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, mkdir, rm, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "resolve-known-skill-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

async function mockAgents() {
  vi.doMock("./config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./config")>()
    return {
      ...actual,
      AGENTS: [{ id: "email-pipeline-agent", name: "Email Pipeline Agent", rootPath: root, kind: "pipeline" }],
    }
  })
}

describe("resolveKnownSkillPath", () => {
  it("resolves a known skill file", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "---\nname: plh-dev-team\ndescription: x\n---\n")

    const { resolveKnownSkillPath } = await import("./resolve-known-skill")
    const result = await resolveKnownSkillPath(skillFile)

    expect(result).toEqual({
      ok: true,
      realPath: await realpath(skillFile),
      agentRootPath: await realpath(root),
    })
  })

  it("reports outside-root for a path outside any configured agent root", async () => {
    await mockAgents()
    const { resolveKnownSkillPath } = await import("./resolve-known-skill")
    const result = await resolveKnownSkillPath(path.join(tmpdir(), "outside.md"))

    expect(result).toEqual({ ok: false, reason: "outside-root" })
  })

  it("reports not-a-known-skill for a path inside an agent root that isn't a scanned entry", async () => {
    await mockAgents()
    await mkdir(path.join(root, "bin"), { recursive: true })
    const notASkill = path.join(root, "bin", "poll.sh")
    await writeFile(notASkill, "#!/bin/bash\n")

    const { resolveKnownSkillPath } = await import("./resolve-known-skill")
    const result = await resolveKnownSkillPath(notASkill)

    expect(result).toEqual({ ok: false, reason: "not-a-known-skill" })
  })
})
