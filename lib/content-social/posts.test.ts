import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parsePost, listPosts, isSafePostFileName, IMAGES_DIR } from "./posts"

const POST = `---
type: post
status: draft
channel: instagram
title: Brunch is back
suggested_time: 2026-09-27 10:00
canva_design_url: https://www.canva.com/design/abc
image_url: https://export.example/abc.png
image_status: ok
created: 2026-09-25
updated: 2026-09-25
---

## Caption
Our weekend brunch is back.

## Hashtags
#brunch #weekend

## Alt text
A plate of pancakes.
`

describe("parsePost", () => {
  it("reads frontmatter and the three sections", () => {
    const p = parsePost("2026-09-25-brunch.md", POST, "waiting")
    expect(p).toMatchObject({
      title: "Brunch is back", caption: "Our weekend brunch is back.", hashtags: "#brunch #weekend",
      altText: "A plate of pancakes.", suggestedTime: "2026-09-27 10:00", imageStatus: "ok",
      canvaDesignUrl: "https://www.canva.com/design/abc", relativePath: "notes/content/posts/2026-09-25-brunch.md",
      problems: [],
    })
  })

  it("parses a post with no frontmatter and no sections into a card that names what is missing", () => {
    const p = parsePost("x.md", "just some text", "waiting")
    expect(p.title).toBe("x")
    expect(p.caption).toBe("")
    expect(p.imageStatus).toBe("none")
    expect(p.problems).toEqual(["This post has no caption."])
  })

  it("treats an unknown image_status as none, and keeps a failure's reason", () => {
    expect(parsePost("a.md", POST.replace("image_status: ok", "image_status: weird"), "waiting").imageStatus).toBe("none")
    const failed = parsePost("a.md", POST.replace("image_status: ok", "image_status: failed\nimage_error: Canva needs you to sign in again."), "waiting")
    expect(failed).toMatchObject({ imageStatus: "failed", imageError: "Canva needs you to sign in again." })
  })

  it("parses status from YAML including quoted values", () => {
    const quoted = parsePost("a.md", POST.replace("status: draft", 'status: "published"'), "ready")
    expect(quoted.status).toBe("published")
  })

  it("parses status from YAML with trailing comments", () => {
    const withComment = parsePost("a.md", POST.replace("status: draft", "status: published # went live"), "ready")
    expect(withComment.status).toBe("published")
  })
})

describe("isSafePostFileName", () => {
  it.each(["2026-09-25-brunch.md", "a.md"])("accepts %s", (n) => expect(isSafePostFileName(n)).toBe(true))
  it.each(["../../HANDOFF.md", "a/b.md", ".hidden.md", "a.txt", ""])("refuses %s", (n) => expect(isSafePostFileName(n)).toBe(false))
})

describe("listPosts", () => {
  let root: string
  let record: string
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "posts-"))
    fs.mkdirSync(path.join(root, "notes/content/posts"), { recursive: true })
    record = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "posts-data-")), "make-posts.run.json")
  })
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  const write = (name: string, text: string) => fs.writeFileSync(path.join(root, "notes/content/posts", name), text)

  it("splits waiting (new in the pending run), ready, and posted", async () => {
    write("old-ready.md", POST)
    write("old-posted.md", POST.replace("status: draft", "status: published\nposted_on: 2026-09-20"))
    write("new.md", POST)
    fs.writeFileSync(record, JSON.stringify({ outputKind: "new-file-in-dir", outputPath: "notes/content/posts", before: ["old-ready.md", "old-posted.md"] }))
    const byName = Object.fromEntries((await listPosts(root, record)).map((p) => [p.fileName, p.state]))
    expect(byName).toEqual({ "new.md": "waiting", "old-ready.md": "ready", "old-posted.md": "posted" })
  })

  it("with no pending run, nothing is waiting", async () => {
    write("a.md", POST)
    expect((await listPosts(root, record)).map((p) => p.state)).toEqual(["ready"])
  })

  it("finds a saved local image by slug", async () => {
    write("2026-09-25-brunch.md", POST)
    fs.mkdirSync(path.join(root, IMAGES_DIR), { recursive: true })
    fs.writeFileSync(path.join(root, IMAGES_DIR, "2026-09-25-brunch.png"), "png")
    const [p] = await listPosts(root, record)
    expect(p.localImage).toBe("2026-09-25-brunch.png")
  })

  it("returns an empty list when the folder does not exist", async () => {
    fs.rmSync(path.join(root, "notes"), { recursive: true })
    expect(await listPosts(root, record)).toEqual([])
  })

  it("returns a card with error message for unreadable posts and continues listing", async () => {
    if (process.getuid?.() === 0) {
      // skip this test if running as root, can't test permission denial
      return
    }
    write("readable.md", POST)
    write("unreadable.md", POST)
    fs.chmodSync(path.join(root, "notes/content/posts/unreadable.md"), 0o000)
    try {
      const posts = await listPosts(root, record)
      expect(posts.length).toBe(2)
      const readable = posts.find((p) => p.fileName === "readable.md")
      const unreadable = posts.find((p) => p.fileName === "unreadable.md")
      expect(readable?.problems).toEqual([])
      expect(unreadable?.problems).toEqual(["This post couldn't be read."])
      expect(unreadable?.state).toBe("ready")
    } finally {
      fs.chmodSync(path.join(root, "notes/content/posts/unreadable.md"), 0o644)
    }
  })

  it("with run record lacking before array, nothing is waiting", async () => {
    write("a.md", POST)
    fs.writeFileSync(record, JSON.stringify({}))
    expect((await listPosts(root, record)).map((p) => p.state)).toEqual(["ready"])
  })
})
