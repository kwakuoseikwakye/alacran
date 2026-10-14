import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { listDepartmentRecords, readDepartmentRecord } from "./records"

const dirs: string[] = []
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }) })
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "recs-")); dirs.push(root)
  const dir = path.join(root, "records", "legal"); fs.mkdirSync(dir, { recursive: true })
  return { root, dir }
}

describe("listDepartmentRecords", () => {
  it("lists Markdown records newest first with title and updated date, and other files by name only", async () => {
    const { root, dir } = setup()
    fs.writeFileSync(path.join(dir, "a.md"), "---\ntitle: Older\nupdated: 2026-09-01T00:00:00.000Z\n---\n\nbody")
    fs.writeFileSync(path.join(dir, "b.md"), "---\ntitle: Newer\nupdated: 2026-10-01T00:00:00.000Z\n---\n\nbody")
    fs.writeFileSync(path.join(dir, "sheet.csv"), "a,b")
    fs.writeFileSync(path.join(dir, ".gitkeep"), "")
    // sheet.csv has today's mtime, so it sorts first; the two Markdown records keep their order.
    const list = await listDepartmentRecords(root, "legal")
    expect(list.filter((r) => r.kind === "markdown").map((r) => [r.file, r.title])).toEqual([["b.md", "Newer"], ["a.md", "Older"]])
    expect(list.find((r) => r.kind === "other")).toMatchObject({ file: "sheet.csv", title: "sheet.csv" })
    expect(list.map((r) => r.file)).not.toContain(".gitkeep")
  })
  it("a Markdown file with no frontmatter falls back to its name and mtime", async () => {
    const { root, dir } = setup()
    fs.writeFileSync(path.join(dir, "plain.md"), "just text")
    const [r] = await listDepartmentRecords(root, "legal")
    expect(r).toMatchObject({ file: "plain.md", title: "plain.md", kind: "markdown" })
    expect(Number.isNaN(Date.parse(r.updated))).toBe(false)
  })
  it("returns nothing for a missing folder or a symlink out of the company", async () => {
    const { root } = setup()
    expect(await listDepartmentRecords(root, "missing")).toEqual([])
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "o-")); dirs.push(outside)
    fs.writeFileSync(path.join(outside, "x.md"), "x")
    fs.symlinkSync(outside, path.join(root, "records", "evil"))
    expect(await listDepartmentRecords(root, "evil")).toEqual([])
  })
})

describe("readDepartmentRecord", () => {
  it("returns title, updated and the raw body", async () => {
    const { root, dir } = setup()
    fs.writeFileSync(path.join(dir, "a.md"), "---\ntitle: T\nupdated: 2026-10-01T00:00:00.000Z\n---\n\nHello <b>x</b>\n")
    expect(await readDepartmentRecord(root, "legal", "a.md")).toEqual({ title: "T", updated: "2026-10-01T00:00:00.000Z", body: "Hello <b>x</b>" })
  })
  it("refuses path tricks, non-Markdown files and symlinks out of the company", async () => {
    const { root, dir } = setup()
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "o-")); dirs.push(outside)
    fs.writeFileSync(path.join(outside, "secret.md"), "OUTSIDE-SECRET")
    fs.writeFileSync(path.join(root, "secret.md"), "OUTSIDE-SECRET") // real file where ../../secret.md resolves
    {
      fs.writeFileSync(path.join(dir, "sheet.csv"), "a,b")
      fs.symlinkSync(path.join(outside, "secret.md"), path.join(dir, "x.md"))
      expect(await readDepartmentRecord(root, "legal", "../../secret.md")).toBeNull()
      expect(await readDepartmentRecord(root, "legal", "sheet.csv")).toBeNull()
      expect(await readDepartmentRecord(root, "legal", "x.md")).toBeNull()
      // Dirent.isFile() is false for a symlink, so the listing skips it
      const list = await listDepartmentRecords(root, "legal")
      expect(list.map((r) => r.file)).not.toContain("x.md")
      expect(JSON.stringify(list)).not.toContain("OUTSIDE-SECRET")
    }
  })
})
