import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readdir, stat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string
let outside: string
let trash: string
const commits: string[][] = []

/** Never touches real git. Records what would have been committed. */
const execFn = async (_cmd: string, args: string[]) => {
  commits.push(args)
  return { stdout: "", stderr: "" }
}

async function load() {
  vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
  vi.doMock("./config", () => ({
    AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "command-set" }],
  }))
  return import("./file-ops-impl")
}

beforeEach(async () => {
  const base = await mkdtemp(path.join(tmpdir(), "file-ops-test-"))
  root = path.join(base, "company")
  outside = path.join(base, "elsewhere")
  trash = path.join(base, "trash")
  await mkdir(root, { recursive: true })
  await mkdir(outside, { recursive: true })
  commits.length = 0
})

afterEach(async () => {
  await rm(path.dirname(root), { recursive: true, force: true })
  vi.resetModules()
})

describe("createEntryImpl", () => {
  it("creates a file and commits it", async () => {
    const { createEntryImpl } = await load()
    const r = await createEntryImpl(root, "notes.md", "file", execFn)
    expect(r.ok).toBe(true)
    expect(await stat(path.join(root, "notes.md"))).toBeTruthy()
    expect(commits.some((c) => c.includes("notes.md"))).toBe(true)
  })

  it("creates a folder with a .gitkeep, because git does not track directories", async () => {
    const { createEntryImpl } = await load()
    const r = await createEntryImpl(root, "reports", "folder", execFn)
    expect(r.ok).toBe(true)
    expect(await readdir(path.join(root, "reports"))).toEqual([".gitkeep"])
  })

  // The security boundary. A name is not a path.
  it.each(["../escape", "a/b", "a\\b", "..", ".", "  "])("refuses the name %j", async (name) => {
    const { createEntryImpl } = await load()
    const r = await createEntryImpl(root, name, "file", execFn)
    expect(r.ok).toBe(false)
    expect(commits).toHaveLength(0)
  })

  it("refuses a parent outside every company root", async () => {
    const { createEntryImpl } = await load()
    const r = await createEntryImpl(outside, "notes.md", "file", execFn)
    expect(r.ok).toBe(false)
    await expect(stat(path.join(outside, "notes.md"))).rejects.toThrow()
  })

  it("refuses to clobber something that already exists", async () => {
    const { createEntryImpl } = await load()
    await writeFile(path.join(root, "notes.md"), "mine")
    const r = await createEntryImpl(root, "notes.md", "file", execFn)
    expect(r.ok).toBe(false)
    expect(await readdir(root)).toEqual(["notes.md"])
  })
})

describe("moveEntryImpl", () => {
  it("renames in place and commits both paths as one move", async () => {
    const { moveEntryImpl } = await load()
    await writeFile(path.join(root, "old.md"), "x")
    const r = await moveEntryImpl(path.join(root, "old.md"), "new.md", execFn)
    expect(r.ok).toBe(true)
    expect(await readdir(root)).toEqual(["new.md"])
    const add = commits.find((c) => c.includes("add"))
    expect(add).toContain("old.md")
    expect(add).toContain("new.md")
  })

  it("moves into a subfolder", async () => {
    const { moveEntryImpl } = await load()
    await mkdir(path.join(root, "docs"))
    await writeFile(path.join(root, "a.md"), "x")
    const r = await moveEntryImpl(path.join(root, "a.md"), "docs/a.md", execFn)
    expect(r.ok).toBe(true)
    expect(await readdir(path.join(root, "docs"))).toEqual(["a.md"])
  })

  it("refuses a destination that climbs out of the company", async () => {
    const { moveEntryImpl } = await load()
    await writeFile(path.join(root, "a.md"), "x")
    const r = await moveEntryImpl(path.join(root, "a.md"), "../elsewhere/a.md", execFn)
    expect(r.ok).toBe(false)
    expect(await readdir(root)).toEqual(["a.md"])
  })

  // The string check alone would pass this: the resolved path stays under the
  // root, but the parent is a symlink pointing out of it.
  it("refuses a destination whose parent symlinks outside the company", async () => {
    const { moveEntryImpl } = await load()
    await writeFile(path.join(root, "a.md"), "x")
    await symlink(outside, path.join(root, "escape"), "dir")
    const r = await moveEntryImpl(path.join(root, "a.md"), "escape/a.md", execFn)
    expect(r.ok).toBe(false)
    await expect(stat(path.join(outside, "a.md"))).rejects.toThrow()
  })

  it("refuses to overwrite an existing destination", async () => {
    const { moveEntryImpl } = await load()
    await writeFile(path.join(root, "a.md"), "a")
    await writeFile(path.join(root, "b.md"), "b")
    const r = await moveEntryImpl(path.join(root, "a.md"), "b.md", execFn)
    expect(r.ok).toBe(false)
    expect(await readdir(root)).toEqual(["a.md", "b.md"])
  })
})

describe("deleteEntryImpl", () => {
  it("moves into the trash rather than unlinking, and commits the removal", async () => {
    const { deleteEntryImpl } = await load()
    await writeFile(path.join(root, "gone.md"), "content")
    const r = await deleteEntryImpl(path.join(root, "gone.md"), execFn, trash, "STAMP")
    expect(r.ok).toBe(true)
    expect(await readdir(root)).toEqual([])
    // recoverable, which is the whole point
    expect(await readdir(trash)).toEqual(["STAMP-gone.md"])
    expect(commits.some((c) => c.includes("gone.md"))).toBe(true)
  })

  it("refuses to delete the company root itself", async () => {
    const { deleteEntryImpl } = await load()
    const r = await deleteEntryImpl(root, execFn, trash, "STAMP")
    expect(r.ok).toBe(false)
    expect(await stat(root)).toBeTruthy()
  })

  it("refuses a path outside every company root", async () => {
    const { deleteEntryImpl } = await load()
    await writeFile(path.join(outside, "safe.md"), "x")
    const r = await deleteEntryImpl(path.join(outside, "safe.md"), execFn, trash, "STAMP")
    expect(r.ok).toBe(false)
    expect(await stat(path.join(outside, "safe.md"))).toBeTruthy()
  })

  it("still trashes when the commit fails, because the file is already safe", async () => {
    const { deleteEntryImpl } = await load()
    await writeFile(path.join(root, "untracked.md"), "x")
    const failing = async () => {
      throw new Error("not a git repository")
    }
    const r = await deleteEntryImpl(path.join(root, "untracked.md"), failing, trash, "STAMP")
    expect(r.ok).toBe(true)
    expect(await readdir(trash)).toEqual(["STAMP-untracked.md"])
  })
})

describe("listFolderImpl", () => {
  it("lists folders first, then files, and hides the plumbing", async () => {
    const { listFolderImpl } = await load()
    await mkdir(path.join(root, ".git"))
    await mkdir(path.join(root, "node_modules"))
    await mkdir(path.join(root, "docs"))
    await writeFile(path.join(root, "AGENTS.md"), "x")
    const r = await listFolderImpl(root)
    expect("entries" in r && r.entries.map((e) => e.name)).toEqual(["docs", "AGENTS.md"])
  })

  it("refuses a folder outside every company root", async () => {
    const { listFolderImpl } = await load()
    const r = await listFolderImpl(outside)
    expect("error" in r).toBe(true)
  })
})
