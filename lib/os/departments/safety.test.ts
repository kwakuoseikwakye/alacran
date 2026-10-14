import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { contained, dirtyPaths, trackedUnder } from "./safety"
import { defaultExecFile } from "@/lib/default-exec-file"
import type { ExecFileFn } from "@/lib/git-commit-file"

const dirs: string[] = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "safe-")); dirs.push(d); return d }
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }) })

describe("contained", () => {
  it("accepts existing and not-yet-existing paths inside the root", async () => {
    const root = tmp()
    fs.mkdirSync(path.join(root, "records"))
    expect(await contained(root, path.join(root, "records"))).toBe(true)
    expect(await contained(root, path.join(root, "records", "new", "deep", "file.md"))).toBe(true)
  })
  it("rejects a symlinked folder that points outside, even for files that don't exist yet", async () => {
    const root = tmp(); const outside = tmp()
    fs.mkdirSync(path.join(root, "records"))
    fs.symlinkSync(outside, path.join(root, "records", "legal"))
    expect(await contained(root, path.join(root, "records", "legal"))).toBe(false)
    expect(await contained(root, path.join(root, "records", "legal", "x.md"))).toBe(false)
  })
  it("rejects .. escapes", async () => {
    const root = tmp()
    expect(await contained(root, path.join(root, "..", "elsewhere"))).toBe(false)
  })
  it("rejects dangling symlinks", async () => {
    const root = tmp(); const outside = tmp()
    fs.mkdirSync(path.join(root, "records"))
    fs.symlinkSync(path.join(outside, "nonexistent"), path.join(root, "records", "dangling"))
    expect(await contained(root, path.join(root, "records", "dangling"))).toBe(false)
    expect(await contained(root, path.join(root, "records", "dangling", "x.md"))).toBe(false)
  })
  it("rejects .. after a symlink", async () => {
    const root = tmp(); const outside = tmp()
    fs.mkdirSync(path.join(root, "records"))
    fs.symlinkSync(outside, path.join(root, "records", "lnk"))
    // Build target with raw .. (not normalized by path.join)
    const rawTarget = root + path.sep + "records" + path.sep + "lnk" + path.sep + ".." + path.sep + "x.md"
    expect(await contained(root, rawTarget)).toBe(false)
  })
  it("rejects prefix-collision sibling", async () => {
    const parent = tmp()
    const root = path.join(parent, "root")
    const evil = path.join(parent, "root-evil")
    fs.mkdirSync(root)
    fs.mkdirSync(evil)
    expect(await contained(root, evil)).toBe(false)
    expect(await contained(root, path.join(evil, "x.md"))).toBe(false)
  })
  it("accepts symlinked root dir with contained paths", async () => {
    const realRoot = tmp()
    const linkParent = tmp()
    const linkRoot = path.join(linkParent, "link-root")
    fs.mkdirSync(path.join(realRoot, "records"))
    fs.symlinkSync(realRoot, linkRoot)
    expect(await contained(linkRoot, path.join(linkRoot, "records"))).toBe(true)
    expect(await contained(linkRoot, path.join(linkRoot, "records", "x.md"))).toBe(true)
  })
})

describe("git helpers", () => {
  function repo() {
    const dir = tmp()
    const git = (...a: string[]) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" })
    git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t")
    fs.mkdirSync(path.join(dir, "records", "legal"), { recursive: true })
    fs.writeFileSync(path.join(dir, "records", "legal", "a.md"), "a")
    git("add", "."); git("commit", "-qm", "init")
    return { dir, git }
  }
  it("dirtyPaths sees edits and untracked files only under the asked paths", async () => {
    const { dir } = repo()
    fs.writeFileSync(path.join(dir, "elsewhere.txt"), "x")
    expect(await dirtyPaths(dir, ["records/legal"], defaultExecFile)).toEqual([])
    fs.writeFileSync(path.join(dir, "records", "legal", "a.md"), "changed")
    fs.writeFileSync(path.join(dir, "records", "legal", "new.md"), "n")
    expect((await dirtyPaths(dir, ["records/legal"], defaultExecFile)).length).toBe(2)
  })
  it("dirtyPaths is empty (not a throw) when git can't answer", async () => {
    expect(await dirtyPaths(tmp(), ["x"], defaultExecFile)).toEqual([])
  })
  it("dirtyPaths passes --no-optional-locks first (a global git option, so it must precede the subcommand)", async () => {
    const calls: Array<[string, string[]]> = []
    const exec: ExecFileFn = async (command, args) => { calls.push([command, args]); return { stdout: "", stderr: "" } }
    await dirtyPaths("/the/root", ["AGENTS.md"], exec)
    expect(calls).toEqual([["git", ["--no-optional-locks", "-C", "/the/root", "status", "--porcelain", "--untracked-files=all", "--", "AGENTS.md"]]])
  })
  it("dirtyPaths leaves .git/index byte-for-byte alone even when stat data is stale", async () => {
    // Render-time callers run this every 15 seconds. Plain `git status` refreshes stale stat data and rewrites
    // .git/index (taking index.lock), which can fail an agent's `git add`/`git commit` in the same repo.
    const { dir } = repo()
    const file = path.join(dir, "records", "legal", "a.md")
    const stale = new Date("2001-09-09T01:46:40Z")
    fs.utimesSync(file, stale, stale) // same bytes, different mtime: the index entry no longer matches the stat data
    const index = path.join(dir, ".git", "index")
    const before = fs.readFileSync(index)
    expect(await dirtyPaths(dir, ["records/legal/a.md"], defaultExecFile)).toEqual([])
    expect(fs.readFileSync(index).equals(before)).toBe(true)
  })
  it("trackedUnder", async () => {
    const { dir } = repo()
    expect(await trackedUnder(dir, "records/legal", defaultExecFile)).toBe(true)
    expect(await trackedUnder(dir, "records/none", defaultExecFile)).toBe(false)
  })
})
