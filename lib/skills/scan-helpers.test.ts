import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { scanSkillsDir, scanCommandsDir } from "./scan-helpers"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "scan-helpers-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("scanSkillsDir", () => {
  it("returns one entry per subdirectory containing a SKILL.md, parsing its frontmatter", async () => {
    await mkdir(path.join(root, "piro"), { recursive: true })
    await writeFile(
      path.join(root, "piro", "SKILL.md"),
      "---\nname: piro\ndescription: Generates Kiro-compatible specs.\n---\n\n# piro\n"
    )

    const entries = await scanSkillsDir("ai-company-starter-main", root)

    expect(entries).toEqual([
      {
        id: path.join(root, "piro", "SKILL.md"),
        agentId: "ai-company-starter-main",
        kind: "skill",
        name: "piro",
        description: "Generates Kiro-compatible specs.",
        path: path.join(root, "piro", "SKILL.md"),
      },
    ])
  })

  it("falls back to the directory name when frontmatter is missing or has no name", async () => {
    await mkdir(path.join(root, "mystery-skill"), { recursive: true })
    await writeFile(path.join(root, "mystery-skill", "SKILL.md"), "# No frontmatter here\n")

    const entries = await scanSkillsDir("plh-ops", root)

    expect(entries).toEqual([
      {
        id: path.join(root, "mystery-skill", "SKILL.md"),
        agentId: "plh-ops",
        kind: "skill",
        name: "mystery-skill",
        description: "",
        path: path.join(root, "mystery-skill", "SKILL.md"),
      },
    ])
  })

  it("skips a subdirectory that has no SKILL.md at all, without dropping siblings", async () => {
    await mkdir(path.join(root, "piro", "scripts"), { recursive: true })
    await writeFile(path.join(root, "piro", "scripts", "validate.py"), "# not a skill\n")
    await writeFile(path.join(root, "piro", "SKILL.md"), "---\nname: piro\ndescription: x\n---\n")
    await mkdir(path.join(root, "not-a-skill"), { recursive: true })

    const entries = await scanSkillsDir("ai-company-starter-main", root)

    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe("piro")
  })

  it("returns an empty array when the skills directory doesn't exist", async () => {
    const entries = await scanSkillsDir("plh-takeshi-agent", path.join(root, "does-not-exist"))
    expect(entries).toEqual([])
  })
})

describe("scanCommandsDir", () => {
  it("returns one entry per .md file, using the filename (without extension) as fallback name", async () => {
    await mkdir(root, { recursive: true })
    await writeFile(
      path.join(root, "verify.md"),
      "---\nname: verify\ndescription: Runs verification.\n---\n\n# /verify\n"
    )
    await writeFile(path.join(root, "README.md"), "# Commands index\n")

    const entries = await scanCommandsDir("ai-company-starter-main", root)

    expect(entries).toHaveLength(2)
    const verify = entries.find((e) => e.path.endsWith("verify.md"))
    expect(verify).toMatchObject({ name: "verify", description: "Runs verification.", kind: "command" })
    const readme = entries.find((e) => e.path.endsWith("README.md"))
    expect(readme).toMatchObject({ name: "README", description: "" })
  })

  it("ignores non-markdown files", async () => {
    await mkdir(root, { recursive: true })
    await writeFile(path.join(root, "notes.txt"), "not a command\n")

    const entries = await scanCommandsDir("ai-company-starter-main", root)

    expect(entries).toEqual([])
  })

  it("returns an empty array when the commands directory doesn't exist", async () => {
    const entries = await scanCommandsDir("plh-ops", path.join(root, "does-not-exist"))
    expect(entries).toEqual([])
  })
})
