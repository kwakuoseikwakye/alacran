import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

let tmpCo: string
let tmpData: string
vi.mock("../get-effective-agents", () => ({ getEffectiveAgents: async () => [{ id: "acme", rootPath: tmpCo }] }))
const { discardCompanyCommandFileImpl } = await import("./discard-company-command-file-impl")

const posts = () => path.join(tmpCo, "notes/content/posts")
const record = (before: string[]) =>
  fs.writeFileSync(path.join(tmpData, "make-posts.run.json"), JSON.stringify({ outputKind: "new-file-in-dir", outputPath: "notes/content/posts", before }))

describe("discardCompanyCommandFileImpl", () => {
  beforeEach(() => {
    tmpCo = fs.mkdtempSync(path.join(os.tmpdir(), "discard-file-co-"))
    tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "discard-file-data-"))
    fs.mkdirSync(posts(), { recursive: true })
  })
  afterEach(() => {
    fs.rmSync(tmpCo, { recursive: true, force: true })
    fs.rmSync(tmpData, { recursive: true, force: true })
  })

  it("deletes one new post and keeps the run pending while others remain", async () => {
    fs.writeFileSync(path.join(posts(), "a.md"), "a")
    fs.writeFileSync(path.join(posts(), "b.md"), "b")
    record([])
    expect(await discardCompanyCommandFileImpl("make-posts", "acme", "a.md", tmpData)).toEqual({ discarded: true, message: "Discarded this post." })
    expect(fs.existsSync(path.join(posts(), "a.md"))).toBe(false)
    expect(fs.existsSync(path.join(posts(), "b.md"))).toBe(true)
    expect(fs.existsSync(path.join(tmpData, "make-posts.run.json"))).toBe(true)
  })

  it("clears the run when the last new post is discarded", async () => {
    fs.writeFileSync(path.join(posts(), "old.md"), "old")
    fs.writeFileSync(path.join(posts(), "a.md"), "a")
    record(["old.md"])
    await discardCompanyCommandFileImpl("make-posts", "acme", "a.md", tmpData)
    expect(fs.existsSync(path.join(tmpData, "make-posts.run.json"))).toBe(false)
    expect(fs.existsSync(path.join(posts(), "old.md"))).toBe(true)
  })

  it.each(["../../HANDOFF.md", "a/b.md", ".hidden.md"])("refuses the unsafe name %s", async (name) => {
    record([])
    const r = await discardCompanyCommandFileImpl("make-posts", "acme", name, tmpData)
    expect(r.discarded).toBe(false)
  })

  it("refuses a post that existed before the run (already saved)", async () => {
    fs.writeFileSync(path.join(posts(), "old.md"), "old")
    record(["old.md"])
    const r = await discardCompanyCommandFileImpl("make-posts", "acme", "old.md", tmpData)
    expect(r).toEqual({ discarded: false, message: "That post was already saved, so it can't be discarded here." })
    expect(fs.existsSync(path.join(posts(), "old.md"))).toBe(true)
  })

  it("refuses a command that is not a new-file-in-dir job", async () => {
    const r = await discardCompanyCommandFileImpl("sync-funnel", "acme", "a.md", tmpData)
    expect(r.discarded).toBe(false)
  })

  it("says so when nothing is waiting", async () => {
    const r = await discardCompanyCommandFileImpl("make-posts", "acme", "a.md", tmpData)
    expect(r).toEqual({ discarded: false, message: "There's nothing waiting to be discarded." })
  })

  it("refuses a symlink to a sibling file", async () => {
    fs.writeFileSync(path.join(posts(), "b.md"), "target")
    fs.symlinkSync("b.md", path.join(posts(), "a.md"))
    record([])
    const r = await discardCompanyCommandFileImpl("make-posts", "acme", "a.md", tmpData)
    expect(r.discarded).toBe(false)
    expect(fs.existsSync(path.join(posts(), "a.md"))).toBe(true)
    expect(fs.existsSync(path.join(posts(), "b.md"))).toBe(true)
  })

  it("clears the run despite a stray .DS_Store and a subfolder", async () => {
    fs.writeFileSync(path.join(posts(), "a.md"), "a")
    fs.writeFileSync(path.join(posts(), ".DS_Store"), "junk")
    fs.mkdirSync(path.join(posts(), "x/"), { recursive: true })
    record([])
    await discardCompanyCommandFileImpl("make-posts", "acme", "a.md", tmpData)
    expect(fs.existsSync(path.join(tmpData, "make-posts.run.json"))).toBe(false)
    expect(fs.existsSync(path.join(posts(), "a.md"))).toBe(false)
  })
})
