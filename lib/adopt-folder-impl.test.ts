import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir, homedir } from "node:os"
import path from "node:path"
import { adoptFolderImpl } from "./adopt-folder-impl"
import { listHomeFolders } from "./list-home-folders"

const TEMPLATE = path.join(process.cwd(), "templates", "company-starter")

let folder: string
let registry: string
let calls: string[][]
/** Stands in for git, and creates `.git` on init like the real thing does —
 *  registration checks for it, so a fake that skips it tests nothing. */
const fakeGit = async (_cmd: string, args: string[]) => {
  calls.push(args)
  if (args.includes("init")) await mkdir(path.join(folder, ".git"), { recursive: true })
  return { stdout: "", stderr: "" }
}

beforeEach(async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), "adopt-"))
  folder = path.join(tmp, "lucce")
  registry = path.join(tmp, "companies.json")
  // A folder someone already works in: their own README, their own command.
  await mkdir(path.join(folder, ".claude", "commands"), { recursive: true })
  await writeFile(path.join(folder, "README.md"), "MY OWN README", "utf-8")
  await writeFile(path.join(folder, ".claude", "commands", "my-thing.md"), "mine", "utf-8")
  await writeFile(path.join(folder, "automation.sh"), "echo hi", "utf-8")
  calls = []
})
afterEach(async () => {
  await rm(path.dirname(folder), { recursive: true, force: true })
})

describe("adoptFolderImpl", () => {
  it("adds the company files without touching the user's own, and registers with full features", async () => {
    const result = await adoptFolderImpl("Lucce", folder, TEMPLATE, registry, fakeGit)
    expect(result.ok).toBe(true)

    // Theirs, untouched.
    expect(await readFile(path.join(folder, "README.md"), "utf-8")).toBe("MY OWN README")
    expect(await readFile(path.join(folder, "automation.sh"), "utf-8")).toBe("echo hi")
    // Ours, added — including into a .claude/commands that already existed,
    // which a whole-directory skip would have left empty of app commands.
    expect(await readFile(path.join(folder, "CLAUDE.md"), "utf-8")).toContain("AGENTS.md")
    const commands = await readdir(path.join(folder, ".claude", "commands"))
    expect(commands).toContain("my-thing.md")
    expect(commands.length).toBeGreaterThan(1)
    expect(await readFile(path.join(folder, "HANDOFF.md"), "utf-8")).toContain("brand-new company")

    // No `kind`, so getEffectiveAgents maps it to command-set: the full set.
    const entries = JSON.parse(await readFile(registry, "utf-8"))
    expect(entries).toHaveLength(1)
    expect(entries[0].rootPath).toBe(folder)
    expect(entries[0].kind).toBeUndefined()
  })

  it("initialises a repo when the folder has none", async () => {
    await adoptFolderImpl("Lucce", folder, TEMPLATE, registry, fakeGit)
    expect(calls.map((a) => a[2])).toEqual(["init", "add", "commit"])
  })

  it("commits only what it added when the folder is already a repo", async () => {
    await mkdir(path.join(folder, ".git"), { recursive: true })
    const result = await adoptFolderImpl("Lucce", folder, TEMPLATE, registry, fakeGit)
    expect(result.ok).toBe(true)
    expect(calls.map((a) => a[2])).toEqual(["add", "commit"])
    // Pathspec-scoped: their uncommitted automation.sh cannot be swept in.
    for (const args of calls) expect(args).not.toContain("-A")
    expect(calls[0]).not.toContain("automation.sh")
  })

  it("refuses a folder that isn't there", async () => {
    const result = await adoptFolderImpl("Nope", path.join(folder, "missing"), TEMPLATE, registry, fakeGit)
    expect(result).toEqual({ ok: false, message: "That folder doesn't exist on this computer" })
  })
})

describe("listHomeFolders", () => {
  it("never lists outside the home directory", async () => {
    const escaped = await listHomeFolders("/etc")
    expect(escaped.dir).toBe(homedir())
    expect(escaped.parent).toBeNull()
    const traversal = await listHomeFolders(path.join(homedir(), "..", "..", "etc"))
    expect(traversal.dir).toBe(homedir())
  })
})
