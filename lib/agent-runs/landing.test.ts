import { vi, afterEach, beforeEach, describe, expect, it } from "vitest"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { defaultExecFile } from "../default-exec-file"
import { commitRunWorktree, createRunWorktree } from "./worktree"
import { conflictsWith, listIgnoredFiles, listRunChanges, mergeRunBranch, withRootLock } from "./landing"

// Every test here drives real git (worktrees, commits, merges). Alone they take
// well under a second; in the full suite, ~300 files run in parallel and git
// I/O can outlast vitest's 5s default. The limit is raised, not the assertions.
vi.setConfig({ testTimeout: 20_000 })

let dir: string
let repo: string
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf-8" })

/** A company, and a run that edited notes.md and added new.md on its branch. */
async function finishedRun() {
  const wt = path.join(dir, "runs", "r1")
  const made = await createRunWorktree(repo, "alacran/agent/r1", wt, defaultExecFile)
  writeFileSync(path.join(wt, "notes.md"), "agent\n")
  writeFileSync(path.join(wt, "new.md"), "added\n")
  await commitRunWorktree(wt, made.gitDir, made.baseSha, "Tidy", defaultExecFile)
  return { wt, ...made, branch: "alacran/agent/r1", title: "Tidy" }
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "landing-"))
  repo = path.join(dir, "company")
  execFileSync("git", ["init", "-q", "-b", "master", repo])
  writeFileSync(path.join(repo, "notes.md"), "v1\n")
  git(repo, "add", "-A")
  git(repo, "commit", "-q", "-m", "init")
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("landing a run", () => {
  it("lists what the run changed since it began", async () => {
    const run = await finishedRun()
    expect(await listRunChanges(run, defaultExecFile)).toEqual([
      { status: "A", path: "new.md" },
      { status: "M", path: "notes.md" },
    ])
  })

  it("finds no conflict, then merges the branch into the company with a keep commit", async () => {
    const run = await finishedRun()
    expect(await conflictsWith(repo, run.branch, defaultExecFile)).toEqual([])
    expect(await mergeRunBranch(repo, run, defaultExecFile)).toEqual({ ok: true })
    expect(readFileSync(path.join(repo, "notes.md"), "utf-8")).toBe("agent\n")
    expect(git(repo, "log", "-1", "--format=%s").trim()).toBe("Keep agent run: Tidy")
  })

  it("reports a conflict without touching the company", async () => {
    const run = await finishedRun()
    writeFileSync(path.join(repo, "notes.md"), "company\n")
    git(repo, "commit", "-qam", "company edit")
    const before = git(repo, "rev-parse", "HEAD")
    const outcome = await mergeRunBranch(repo, run, defaultExecFile)
    expect(outcome).toMatchObject({ ok: false, reason: "conflict", files: ["notes.md"] })
    expect(git(repo, "rev-parse", "HEAD")).toBe(before)
    expect(existsSync(path.join(repo, ".git", "MERGE_HEAD"))).toBe(false)
    expect(git(repo, "status", "--porcelain").trim()).toBe("")
  })

  it("refuses when unsaved edits would be overwritten, and leaves them as they were", async () => {
    const run = await finishedRun()
    writeFileSync(path.join(repo, "notes.md"), "my unsaved words\n")
    const outcome = await mergeRunBranch(repo, run, defaultExecFile)
    expect(outcome).toMatchObject({ ok: false, reason: "unsaved", files: ["notes.md"] })
    expect(readFileSync(path.join(repo, "notes.md"), "utf-8")).toBe("my unsaved words\n")
  })

  it("merging runs no hook the agent wrote", async () => {
    git(repo, "config", "core.hooksPath", ".husky")
    const wt = path.join(dir, "runs", "r1")
    const made = await createRunWorktree(repo, "alacran/agent/r1", wt, defaultExecFile)
    const marker = path.join(dir, "hook-ran")
    mkdirSync(path.join(wt, ".husky"))
    for (const hook of ["pre-merge-commit", "commit-msg", "post-merge"]) {
      writeFileSync(path.join(wt, ".husky", hook), `#!/bin/sh\ntouch "${marker}"\n`)
      chmodSync(path.join(wt, ".husky", hook), 0o755)
    }
    await commitRunWorktree(wt, made.gitDir, made.baseSha, "Hooks", defaultExecFile)
    expect(await mergeRunBranch(repo, { branch: "alacran/agent/r1", title: "Hooks", baseSha: made.baseSha }, defaultExecFile)).toEqual({ ok: true })
    expect(existsSync(marker)).toBe(false)
  })

  it("runs one landing per company folder at a time", async () => {
    const order: string[] = []
    let release!: () => void
    const first = withRootLock(repo, () => new Promise<void>((r) => (release = () => (order.push("first"), r()))))
    const second = withRootLock(repo, async () => void order.push("second"))
    await new Promise((r) => setTimeout(r, 10))
    expect(order).toEqual([])
    release()
    await Promise.all([first, second])
    expect(order).toEqual(["first", "second"])
  })

  /** Never half-merged: no MERGE_HEAD, nothing staged or conflicted, HEAD either untouched or the keep commit. */
  const expectWhole = (before: string) => {
    expect(existsSync(path.join(repo, ".git", "MERGE_HEAD"))).toBe(false)
    const head = git(repo, "rev-parse", "HEAD")
    if (head !== before) expect(git(repo, "log", "-1", "--format=%s").trim()).toMatch(/^Keep agent run:/)
  }

  it("with merge.autostash on, still refuses over unsaved edits — never stashes them away", async () => {
    git(repo, "config", "merge.autostash", "true")
    const run = await finishedRun()
    writeFileSync(path.join(repo, "notes.md"), "my unsaved words\n")
    const before = git(repo, "rev-parse", "HEAD")
    expect(await mergeRunBranch(repo, run, defaultExecFile)).toMatchObject({ ok: false, reason: "unsaved" })
    expect(readFileSync(path.join(repo, "notes.md"), "utf-8")).toBe("my unsaved words\n")
    expect(git(repo, "stash", "list").trim()).toBe("")
    expectWhole(before)
  })

  it("a keep commit that can't be made (signing fails) leaves the company exactly as it was", async () => {
    const run = await finishedRun()
    git(repo, "config", "commit.gpgSign", "true")
    git(repo, "config", "gpg.program", "false")
    const before = git(repo, "rev-parse", "HEAD")
    const outcome = await mergeRunBranch(repo, run, defaultExecFile)
    expectWhole(before)
    if (!outcome.ok) {
      expect(git(repo, "rev-parse", "HEAD")).toBe(before)
      expect(git(repo, "status", "--porcelain").trim()).toBe("")
    }
  })

  it("refuses to keep into a branch that doesn't hold the commit the run started from", async () => {
    writeFileSync(path.join(repo, "m.md"), "master only\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "m1")
    const run = await finishedRun() // based on m1
    git(repo, "checkout", "-q", "-b", "feature", "HEAD~1") // lacks m1
    const before = git(repo, "rev-parse", "HEAD")
    expect(await mergeRunBranch(repo, run, defaultExecFile)).toMatchObject({ ok: false, reason: "moved" })
    expect(git(repo, "rev-parse", "HEAD")).toBe(before)
  })

  it("refuses to keep while the company folder isn't on a branch", async () => {
    const run = await finishedRun()
    git(repo, "checkout", "-q", "--detach")
    expect(await mergeRunBranch(repo, run, defaultExecFile)).toMatchObject({ ok: false, reason: "moved" })
  })

  it("lists the ignored files an agent made, which a keep or discard would otherwise delete unseen", async () => {
    writeFileSync(path.join(repo, ".gitignore"), "state/*\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "ignore state")
    const run = await finishedRun()
    mkdirSync(path.join(run.wt, "state"), { recursive: true })
    writeFileSync(path.join(run.wt, "state", "out.txt"), "generated\n")
    expect(await listIgnoredFiles({ gitDir: run.gitDir, worktreePath: run.wt }, defaultExecFile)).toEqual(["state/out.txt"])
  })

  it("names files the way people wrote them, accents and all", async () => {
    const wt = path.join(dir, "runs", "r1")
    const made = await createRunWorktree(repo, "alacran/agent/r1", wt, defaultExecFile)
    writeFileSync(path.join(wt, "notas-reunión.md"), "hola\n")
    await commitRunWorktree(wt, made.gitDir, made.baseSha, "Notas", defaultExecFile)
    expect(await listRunChanges({ ...made, branch: "alacran/agent/r1" }, defaultExecFile)).toEqual([
      { status: "A", path: "notas-reunión.md" },
    ])
  })

  it("lists what the run's own branch holds, even if the worktree was switched to another branch", async () => {
    const run = await finishedRun()
    git(run.wt, "checkout", "-q", "-b", "elsewhere")
    writeFileSync(path.join(run.wt, "stray.md"), "not the agent's\n")
    git(run.wt, "add", "-A")
    git(run.wt, "commit", "-qm", "stray")
    const paths = (await listRunChanges(run, defaultExecFile)).map((c) => c.path)
    expect(paths).not.toContain("stray.md")
    expect(paths).toContain("notes.md")
  })
})

