import { describe, it, expect } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { listChangedPaths, parsePorcelainZ, straysOutside, isOwnedPath, ownedChanges, listChangedPathsAt } from "./repo-changes"

// execFile + argument arrays, never a shell string: no shell is spawned,
// so nothing here can be shell-injected by a path or filename.
const run = promisify(execFile)
const realExec = async (file: string, args: string[], options: { cwd: string }) =>
  run(file, args, { cwd: options.cwd })

async function repo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "repo-changes-"))
  await run("git", ["init", "-q", "."], { cwd: dir })
  await mkdir(path.join(dir, "notes/company/digests"), { recursive: true })
  await writeFile(path.join(dir, "README.md"), "hi\n", "utf-8")
  await run("git", ["add", "-A"], { cwd: dir })
  await run(
    "git",
    ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"],
    { cwd: dir }
  )
  return dir
}

describe("parsePorcelainZ", () => {
  it("reads NUL-separated records", () => {
    expect(parsePorcelainZ("?? STRAY.md\0 M notes/a.md\0")).toEqual(["STRAY.md", "notes/a.md"])
  })

  /** Measured against real git: a rename emits the NEW path in the record and
   *  the ORIGINAL as its own following field. Parsed wrong, that original is
   *  read as a status record and every later path shifts by one. */
  it("consumes a rename's second field instead of parsing it as a record", () => {
    expect(parsePorcelainZ("RM new.md\0old.md\0?? STRAY.md\0")).toEqual(["new.md", "old.md", "STRAY.md"])
  })

  it("survives a filename containing a space — the reason -z exists", () => {
    expect(parsePorcelainZ("?? a file.md\0")).toEqual(["a file.md"])
  })

  it("ignores the trailing empty field after the last NUL", () => {
    expect(parsePorcelainZ("?? a.md\0")).toHaveLength(1)
    expect(parsePorcelainZ("")).toEqual([])
  })
})

describe("straysOutside", () => {
  it("says nothing when the run wrote only where it was supposed to", () => {
    expect(straysOutside([], ["notes/company/digests/x.md"], "notes/company/digests")).toEqual([])
  })

  it("names a write outside the output path", () => {
    expect(straysOutside([], ["notes/company/digests/x.md", "HACKED.md"], "notes/company/digests")).toEqual([
      "HACKED.md",
    ])
  })

  /** The user's own uncommitted work is not the agent's doing, and reporting it
   *  would make the warning meaningless on any repo with work in progress. */
  it("ignores files that were already dirty before the run", () => {
    expect(straysOutside(["my-draft.md"], ["my-draft.md", "notes/company/digests/x.md"], "notes/company/digests")).toEqual(
      []
    )
  })

  it("does not treat a sibling with the same prefix as inside the scope", () => {
    expect(straysOutside([], ["notes/company/digests-old/x.md"], "notes/company/digests")).toEqual([
      "notes/company/digests-old/x.md",
    ])
  })

  it("handles a known-file command, where the output path is the file itself", () => {
    expect(straysOutside([], ["definitions/ontology/company.yaml"], "definitions/ontology/company.yaml")).toEqual([])
    expect(straysOutside([], ["definitions/ontology/other.yaml"], "definitions/ontology/company.yaml")).toEqual([
      "definitions/ontology/other.yaml",
    ])
  })
})

describe("listChangedPaths against real git", () => {
  it("lists an in-scope write and an out-of-scope write, and straysOutside separates them", async () => {
    const dir = await repo()
    try {
      const before = await listChangedPaths(dir, realExec)
      expect(before).toEqual([])

      await writeFile(path.join(dir, "notes/company/digests/INSIDE.md"), "in\n", "utf-8")
      await writeFile(path.join(dir, "STRAY.md"), "out\n", "utf-8")

      const after = await listChangedPaths(dir, realExec)
      expect(after).toContain("notes/company/digests/INSIDE.md")
      expect(after).toContain("STRAY.md")
      expect(straysOutside(before, after, "notes/company/digests")).toEqual(["STRAY.md"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  /**
   * The regression -uall exists to prevent. On a company whose `notes/` is not
   * committed, plain porcelain collapses the write to `?? notes/`, which does
   * not start with the output path — so the run's OWN output gets reported as
   * a stray write, on every fresh company. Without -uall this test fails.
   */
  it("does not report a run's own output as a stray when the folder is untracked", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repo-changes-fresh-"))
    try {
      await run("git", ["init", "-q", "."], { cwd: dir })
      await writeFile(path.join(dir, "README.md"), "hi\n", "utf-8")
      await run("git", ["add", "README.md"], { cwd: dir })
      await run("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: dir })

      const before = await listChangedPaths(dir, realExec)
      await mkdir(path.join(dir, "notes/company/digests"), { recursive: true })
      await writeFile(path.join(dir, "notes/company/digests/x.md"), "in\n", "utf-8")

      const after = await listChangedPaths(dir, realExec)
      expect(straysOutside(before, after, "notes/company/digests")).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("reports both halves of a rename that moved a file out of scope", async () => {
    const dir = await repo()
    try {
      await writeFile(path.join(dir, "notes/company/digests/a.md"), "a\n", "utf-8")
      await run("git", ["add", "-A"], { cwd: dir })
      await run("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "add"], { cwd: dir })

      const before = await listChangedPaths(dir, realExec)
      await run("git", ["mv", "notes/company/digests/a.md", "MOVED.md"], { cwd: dir })

      const after = await listChangedPaths(dir, realExec)
      const strays = straysOutside(before, after, "notes/company/digests")
      expect(strays).toContain("MOVED.md")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("isOwnedPath", () => {
  const owned = ["definitions/ontology/company.yaml", "docs/decisions/"]
  it("matches an exact file and anything inside a directory entry", () => {
    expect(isOwnedPath("definitions/ontology/company.yaml", owned)).toBe(true)
    expect(isOwnedPath("docs/decisions/2026-10-14-x.md", owned)).toBe(true)
  })
  it("does not match a sibling that only shares a prefix", () => {
    expect(isOwnedPath("docs/decisions-old/x.md", owned)).toBe(false)
    expect(isOwnedPath("definitions/ontology/company.yaml.bak", owned)).toBe(false)
  })
})

describe("ownedChanges", () => {
  const owned = ["definitions/ontology/company.yaml", "docs/decisions/"]
  it("returns owned paths the run changed, sorted", () => {
    expect(ownedChanges([], ["docs/decisions/b.md", "definitions/ontology/company.yaml", "README.md"], owned))
      .toEqual(["definitions/ontology/company.yaml", "docs/decisions/b.md"])
  })
  it("excludes owned paths that were already dirty before the run (the owner's own edits)", () => {
    expect(ownedChanges(["definitions/ontology/company.yaml"], ["definitions/ontology/company.yaml"], owned)).toEqual([])
  })
})

describe("straysOutside with alsoWrites", () => {
  it("does not report owned paths as strays", () => {
    const strays = straysOutside([], ["notes/company/sessions/a.md", "definitions/ontology/company.yaml", "x.txt"],
      "notes/company/sessions", ["definitions/ontology/company.yaml"])
    expect(strays).toEqual(["x.txt"])
  })
  it("behaves exactly as before when alsoWrites is omitted", () => {
    expect(straysOutside([], ["definitions/ontology/company.yaml"], "notes/company/sessions"))
      .toEqual(["definitions/ontology/company.yaml"])
  })
})

describe("listChangedPathsAt", () => {
  it("runs git with -C so an exec function without cwd still reads the right repo", async () => {
    const calls: string[][] = []
    const paths = await listChangedPathsAt("/repo", async (_c, args) => { calls.push(args); return { stdout: " M a.txt\0" } })
    expect(calls[0]).toEqual(["-C", "/repo", "status", "--porcelain", "-z", "-uall"])
    expect(paths).toEqual(["a.txt"])
  })
})
