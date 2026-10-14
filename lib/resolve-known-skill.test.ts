import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, mkdir, rm, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { scanSkillsDir } from "./skills/scan-helpers"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "resolve-known-skill-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

// `./config`'s AGENTS/ADAPTERS/SKILL_ADAPTERS are all computed at module-load
// time from real ~/AI-Native/* directories (see lib/builtin-agents.ts) —
// mocking only AGENTS and spreading `...actual` for the rest silently
// inherits whatever those real directories resolve to on the machine running
// the suite. That happened to be non-empty on this repo's own dev machine,
// but is empty on a clean checkout/CI runner, so SKILL_ADAPTERS must be
// mocked explicitly too rather than relying on the real, existence-gated map.
async function mockAgents() {
  vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
  vi.doMock("./config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./config")>()
    return {
      ...actual,
      AGENTS: [{ id: "legacy-pipeline", name: "Legacy Pipeline", rootPath: root, kind: "pipeline" }],
      SKILL_ADAPTERS: { "legacy-pipeline": (agent: { id: string; rootPath: string }) => scanSkillsDir(agent.id, path.join(agent.rootPath, "skills")) },
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
