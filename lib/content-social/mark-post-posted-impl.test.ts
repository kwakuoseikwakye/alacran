import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { parse } from "yaml"
import { markPostPostedImpl } from "./mark-post-posted-impl"

const POST = `---\ntype: post\nstatus: draft\nchannel: instagram\ntitle: Brunch is back\n---\n\n## Caption\nHi\n`
let root: string
let record: string
const git = (...args: string[]) => execFileSync("git", args, { cwd: root }).toString()

describe("markPostPostedImpl", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "posted-"))
    record = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "posted-data-")), "make-posts.run.json")
    git("init", "-q")
    git("config", "user.email", "t@t"); git("config", "user.name", "t")
    fs.mkdirSync(path.join(root, "notes/content/posts"), { recursive: true })
    fs.writeFileSync(path.join(root, "notes/content/posts/a.md"), POST)
    git("add", "."); git("commit", "-qm", "seed")
  })
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  it("marks the post published, records it in the content list, and commits both", async () => {
    const r = await markPostPostedImpl(root, "a.md", "2026-09-26", record)
    expect(r).toEqual({ ok: true, message: "Marked as posted." })
    const text = fs.readFileSync(path.join(root, "notes/content/posts/a.md"), "utf-8")
    expect(text).toMatch(/^status: published$/m)
    expect(text).toMatch(/^posted_on: 2026-09-26$/m)
    expect(text).toContain("## Caption\nHi")
    const items = parse(fs.readFileSync(path.join(root, "records/content/items.yaml"), "utf-8"))
    expect(items.records).toEqual([{ id: "post-a", title: "Brunch is back", status: "published", type: "post", channel: "instagram", author: "agent", publish_date: "2026-09-26", summary: "notes/content/posts/a.md" }])
    expect(git("status", "--porcelain")).toBe("")
  })

  it("changes nothing the second time", async () => {
    await markPostPostedImpl(root, "a.md", "2026-09-26", record)
    const log = git("log", "--oneline")
    expect(await markPostPostedImpl(root, "a.md", "2026-09-27", record)).toEqual({ ok: true, message: "Already marked as posted." })
    expect(git("log", "--oneline")).toBe(log)
  })

  it("refuses a post that is still waiting for approval", async () => {
    fs.writeFileSync(path.join(root, "notes/content/posts/new.md"), POST)
    fs.writeFileSync(record, JSON.stringify({ outputKind: "new-file-in-dir", outputPath: "notes/content/posts", before: ["a.md"] }))
    const r = await markPostPostedImpl(root, "new.md", "2026-09-26", record)
    expect(r).toEqual({ ok: false, message: "Approve this post before marking it as posted." })
  })

  it("refuses to touch an invalid items.yaml", async () => {
    fs.mkdirSync(path.join(root, "records/content"), { recursive: true })
    fs.writeFileSync(path.join(root, "records/content/items.yaml"), "records: not-a-list\n")
    const r = await markPostPostedImpl(root, "a.md", "2026-09-26", record)
    expect(r.ok).toBe(false)
    expect(fs.readFileSync(path.join(root, "records/content/items.yaml"), "utf-8")).toBe("records: not-a-list\n")
    expect(fs.readFileSync(path.join(root, "notes/content/posts/a.md"), "utf-8")).toBe(POST)
  })

  it("refuses an unsafe file name", async () => {
    expect((await markPostPostedImpl(root, "../x.md", "2026-09-26", record)).ok).toBe(false)
  })

  it("returns already-posted when status is quoted 'published' in frontmatter with entry", async () => {
    // Test that parsePost correctly reads status and the "already posted" decision uses it
    const quotedPost = `---\ntype: post\nstatus: "published"\nchannel: instagram\ntitle: Test\n---\n\n## Caption\nTest\n`
    fs.writeFileSync(path.join(root, "notes/content/posts/quoted.md"), quotedPost)
    // Pre-create items.yaml entry to test the self-repair case
    fs.mkdirSync(path.join(root, "records/content"), { recursive: true })
    fs.writeFileSync(path.join(root, "records/content/items.yaml"), "schema_version: 1\nrecords:\n  - id: post-quoted\n    title: Test\n    status: published\n    type: post\n    channel: instagram\n    author: agent\n    publish_date: '2026-09-20'\n    summary: notes/content/posts/quoted.md\n")
    const git2 = (...args: string[]) => execFileSync("git", args, { cwd: root }).toString()
    git2("add", "."); git2("commit", "-qm", "add quoted with entry")
    const log = git2("log", "--oneline")
    const r = await markPostPostedImpl(root, "quoted.md", "2026-09-26", record)
    expect(r).toEqual({ ok: true, message: "Already marked as posted." })
    expect(git2("log", "--oneline")).toBe(log)
  })

  it("repairs a published post with missing content list entry", async () => {
    // Post file already says published, but items.yaml has no entry
    const publishedPost = `---\ntype: post\nstatus: published\nchannel: instagram\ntitle: Brunch is back\nposted_on: 2026-09-20\n---\n\n## Caption\nHi\n`
    fs.writeFileSync(path.join(root, "notes/content/posts/a.md"), publishedPost)
    git("add", "."); git("commit", "-qm", "mark published")
    const log = git("log", "--oneline")
    const r = await markPostPostedImpl(root, "a.md", "2026-09-26", record)
    expect(r).toEqual({ ok: true, message: "Marked as posted." })
    const items = parse(fs.readFileSync(path.join(root, "records/content/items.yaml"), "utf-8"))
    expect(items.records).toEqual([{ id: "post-a", title: "Brunch is back", status: "published", type: "post", channel: "instagram", author: "agent", publish_date: "2026-09-20", summary: "notes/content/posts/a.md" }])
    const postText = fs.readFileSync(path.join(root, "notes/content/posts/a.md"), "utf-8")
    expect(postText).toBe(publishedPost)
    expect(git("log", "--oneline")).not.toBe(log)
  })

  it("makes exactly one commit touching both files", async () => {
    const head = git("rev-parse", "HEAD").trim()
    await markPostPostedImpl(root, "a.md", "2026-09-26", record)
    expect(git("rev-list", "--count", `${head}..HEAD`).trim()).toBe("1")
    expect(git("show", "--name-only", "--format=", "HEAD").trim().split("\n").sort()).toEqual(["notes/content/posts/a.md", "records/content/items.yaml"])
  })

  it("commits a post left published but uncommitted by an interrupted mark", async () => {
    await markPostPostedImpl(root, "a.md", "2026-09-26", record)
    // Simulate the half-state: roll the post's commit back but keep its content on disk.
    const done = fs.readFileSync(path.join(root, "notes/content/posts/a.md"), "utf-8")
    git("checkout", "HEAD~1", "--", "notes/content/posts/a.md")
    git("commit", "-qm", "undo post only", "--", "notes/content/posts/a.md")
    fs.writeFileSync(path.join(root, "notes/content/posts/a.md"), done)
    const r = await markPostPostedImpl(root, "a.md", "2026-09-26", record)
    expect(r).toEqual({ ok: true, message: "Marked as posted." })
    expect(git("status", "--porcelain")).toBe("")
  })

  it("recovers on a same-day retry when only the content list got committed", async () => {
    await markPostPostedImpl(root, "a.md", "2026-09-26", record)
    git("checkout", "HEAD~1", "--", "notes/content/posts/a.md")
    git("commit", "-qm", "undo post only", "--", "notes/content/posts/a.md")
    const r = await markPostPostedImpl(root, "a.md", "2026-09-26", record)
    expect(r).toEqual({ ok: true, message: "Marked as posted." })
    expect(fs.readFileSync(path.join(root, "notes/content/posts/a.md"), "utf-8")).toMatch(/^status: published$/m)
    expect(git("status", "--porcelain")).toBe("")
  })
})

