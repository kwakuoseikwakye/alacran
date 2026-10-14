// Test-only helper: imported only by *.test.ts files.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

export const dirs: string[] = []
export function cleanup() { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }) }

/** A real git repo with an identity, one commit, and helpers. */
export function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guide-repo-"))
  dirs.push(dir)
  const git = (...a: string[]) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" })
  git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t")
  fs.writeFileSync(path.join(dir, "README.md"), "x"); git("add", "."); git("commit", "-qm", "init")
  const write = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text) }
  const read = (rel: string) => fs.readFileSync(path.join(dir, rel), "utf8")
  const commitAll = (msg = "c") => { git("add", "-A"); git("commit", "-qm", msg) }
  return { dir, git, write, read, commitAll }
}
