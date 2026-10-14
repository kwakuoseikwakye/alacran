import { vi, afterEach, beforeEach, describe, expect, it } from "vitest"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { defaultExecFile } from "../default-exec-file"
import { commitRunWorktree, createRunWorktree, hasUnsavedChanges, removeRunWorktree } from "./worktree"

// Every test here drives real git (worktrees, commits, merges). Alone they take
// well under a second; in the full suite, ~300 files run in parallel and git
// I/O can outlast vitest's 5s default. The limit is raised, not the assertions.
vi.setConfig({ testTimeout: 20_000 })

let dir: string
let repo: string
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf-8" })

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "run-worktree-"))
  repo = path.join(dir, "company")
  execFileSync("git", ["init", "-q", "-b", "master", repo])
  writeFileSync(path.join(repo, "notes.md"), "v1\n")
  git(repo, "add", "-A")
  git(repo, "commit", "-q", "-m", "init")
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("run worktrees", () => {
  it("creates a worktree on its own branch from the last commit", async () => {
    const wt = path.join(dir, "runs", "r1")
    await createRunWorktree(repo, "alacran/agent/r1", wt, defaultExecFile)
    expect(readFileSync(path.join(wt, "notes.md"), "utf-8")).toBe("v1\n")
    expect(git(wt, "branch", "--show-current").trim()).toBe("alacran/agent/r1")
  })

  it("commits what the agent changed on its branch and reports how many files", async () => {
    const wt = path.join(dir, "runs", "r1")
    const createdAgain = async (_wt: string) => createRunWorktree(repo, "alacran/agent/r1", wt, defaultExecFile)
    const { gitDir, baseSha } = await createdAgain(wt)
    writeFileSync(path.join(wt, "notes.md"), "v2\n")
    writeFileSync(path.join(wt, "new.md"), "hi\n")
    expect(await commitRunWorktree(wt, gitDir, baseSha, "Tidy notes", defaultExecFile)).toBe(2)
    expect(git(wt, "log", "-1", "--format=%s").trim()).toBe("Agent: Tidy notes")
    expect(git(repo, "log", "-1", "--format=%s", "master").trim()).toBe("init") // the company is untouched
  })

  it("commits nothing, and says so, when nothing changed", async () => {
    const wt = path.join(dir, "runs", "r1")
    const { gitDir, baseSha } = await createRunWorktree(repo, "alacran/agent/r1", wt, defaultExecFile)
    expect(await commitRunWorktree(wt, gitDir, baseSha, "Nothing", defaultExecFile)).toBe(0)
  })

  it("sees unsaved edits in the company folder", async () => {
    expect(await hasUnsavedChanges(repo, defaultExecFile)).toBe(false)
    writeFileSync(path.join(repo, "notes.md"), "edited\n")
    expect(await hasUnsavedChanges(repo, defaultExecFile)).toBe(true)
  })

  it("counts every file the branch changed since the run began, not only this commit", async () => {
    const wt = path.join(dir, "runs", "r1")
    const { gitDir, baseSha } = await createRunWorktree(repo, "alacran/agent/r1", wt, defaultExecFile)
    writeFileSync(path.join(wt, "notes.md"), "v2\n")
    expect(await commitRunWorktree(wt, gitDir, baseSha, "First", defaultExecFile)).toBe(1)
    expect(await commitRunWorktree(wt, gitDir, baseSha, "Again, nothing new", defaultExecFile)).toBe(1)
  })

  it("commits to the run's own branch even when the agent rewrote the worktree's .git file", async () => {
    const wt = path.join(dir, "runs", "r1")
    const { gitDir, baseSha } = await createRunWorktree(repo, "alacran/agent/r1", wt, defaultExecFile)
    writeFileSync(path.join(wt, ".git"), `gitdir: ${path.join(repo, ".git")}\n`) // aim it at the company itself
    writeFileSync(path.join(wt, "notes.md"), "v2\n")
    await commitRunWorktree(wt, gitDir, baseSha, "Escape", defaultExecFile)
    expect(git(repo, "log", "-1", "--format=%s", "master").trim()).toBe("init")
    expect(git(repo, "log", "-1", "--format=%s", "alacran/agent/r1").trim()).toBe("Agent: Escape")
  })

  it("never runs a hook, even one the company's own config points into the worktree", async () => {
    git(repo, "config", "core.hooksPath", ".husky")
    const wt = path.join(dir, "runs", "r1")
    const { gitDir, baseSha } = await createRunWorktree(repo, "alacran/agent/r1", wt, defaultExecFile)
    const marker = path.join(dir, "hook-ran")
    mkdirSync(path.join(wt, ".husky"), { recursive: true })
    for (const hook of ["pre-commit", "commit-msg", "post-commit"]) {
      writeFileSync(path.join(wt, ".husky", hook), `#!/bin/sh\ntouch "${marker}"\n`)
      chmodSync(path.join(wt, ".husky", hook), 0o755)
    }
    writeFileSync(path.join(wt, "notes.md"), "v2\n")
    await commitRunWorktree(wt, gitDir, baseSha, "Hooked", defaultExecFile)
    expect(existsSync(marker)).toBe(false)
  })

  it("cleaning up after a keep runs no hook, even one merged in from the agent's files", async () => {
    const marker = path.join(dir, "hook-ran")
    mkdirSync(path.join(repo, ".husky"))
    writeFileSync(path.join(repo, ".husky", "reference-transaction"), `#!/bin/sh\ntouch "${marker}"\n`)
    chmodSync(path.join(repo, ".husky", "reference-transaction"), 0o755)
    git(repo, "config", "core.hooksPath", ".husky")
    const wt = path.join(dir, "runs", "r1")
    await createRunWorktree(repo, "alacran/agent/r1", wt, defaultExecFile)
    rmSync(marker, { force: true }) // creating the branch may have fired it; only cleanup is under test
    await removeRunWorktree(repo, wt, "alacran/agent/r1", defaultExecFile)
    expect(existsSync(marker)).toBe(false)
  })
})

