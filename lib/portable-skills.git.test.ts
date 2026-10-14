import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./get-effective-agents", () => ({ getEffectiveAgents: vi.fn() }))

import { getEffectiveAgents } from "./get-effective-agents"
import { addPortableSkillsImpl } from "./portable-skills"

// Real git, real files: portable-skills.test.ts fakes git, so it cannot see what git really does with a
// pathspec for a file that was never committed, or for a folder the repo ignores.
const sandbox = mkdtempSync(path.join(os.tmpdir(), "portable-skills-git-"))
afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

const CMD = (name: string) => `---\nname: ${name}\ndescription: A ${name}.\n---\nBody\n`
let n = 0
let root = ""

const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" }).toString()
function write(rel: string, text: string) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  writeFileSync(path.join(root, rel), text)
}

beforeEach(() => {
  root = path.join(sandbox, `repo-${n++}`)
  mkdirSync(root, { recursive: true })
  git("init", "-q")
  git("config", "user.name", "Test")
  git("config", "user.email", "test@example.invalid")
  git("config", "commit.gpgsign", "false")
  vi.mocked(getEffectiveAgents).mockResolvedValue([{ id: "acme", name: "Acme", rootPath: root, kind: "command-set" }] as never)
})

describe("addPortableSkillsImpl against real git", () => {
  it("commits the move even when one command was never committed", async () => {
    write("README.md", "x")
    write(".claude/commands/tracked.md", CMD("tracked"))
    git("add", "-A")
    git("commit", "-q", "-m", "start")
    write(".claude/commands/fresh.md", CMD("fresh")) // never committed

    const result = await addPortableSkillsImpl("acme", sandbox)

    expect(result).toMatchObject({ ok: true, committed: true })
    expect(git("log", "--format=%s", "-1").trim()).toBe("Move commands to .agents/skills so every AI can run them")
    // --no-renames: git would otherwise show the removed command as a rename into the shared folder.
    const files = git("show", "--name-only", "--no-renames", "--format=", "HEAD").split("\n").filter(Boolean)
    expect(files).toEqual(expect.arrayContaining([".agents/skills/tracked/SKILL.md", ".agents/skills/fresh/SKILL.md", ".claude/commands/tracked.md"]))
    expect(git("status", "--short").trim()).toBe("")
  })

  it("commits the shared folder even when the repo ignores .claude/", async () => {
    write(".gitignore", ".claude/\n")
    write("README.md", "x")
    git("add", "-A")
    git("commit", "-q", "-m", "start")
    write(".claude/commands/a.md", CMD("a")) // ignored, so never tracked

    const result = await addPortableSkillsImpl("acme", sandbox)

    expect(result).toMatchObject({ ok: true, committed: true })
    const files = git("show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean)
    expect(files).toContain(".agents/skills/a/SKILL.md")
    expect(files.some((file) => file.startsWith(".claude/"))).toBe(false)
  })

  it("says it could not commit, instead of claiming success, when there is no repo at all", async () => {
    rmSync(path.join(root, ".git"), { recursive: true, force: true })
    write(".claude/commands/a.md", CMD("a"))

    const result = await addPortableSkillsImpl("acme", sandbox)

    expect(result).toMatchObject({ ok: true, committed: false })
  })
})
