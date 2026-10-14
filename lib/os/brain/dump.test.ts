import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { describe, it, expect } from "vitest"
import { slugifyTitle, writeBrainDump, ingestBrainDump, appendInboxCapture } from "./dump"

describe("Brain Dump Library", () => {
  it("slugifyTitle cleans titles safely", () => {
    expect(slugifyTitle("Hello World! 123")).toBe("hello-world-123")
    expect(slugifyTitle("")).toBe("untitled")
    expect(slugifyTitle("Launchpad Cohort - Update #2")).toBe("launchpad-cohort-update-2")
  })

  it("writeBrainDump writes valid markdown into memory folder", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-dump-test-"))
    try {
      const res = writeBrainDump(
        {
          text: "Discussed new go-to-market strategy for launchpad cohort.",
          title: "GTM Strategy",
          folder: "inbox",
          tags: ["launchpad"],
        },
        tmpDir
      )

      expect(res.relPath).toMatch(/^inbox\/\d{4}-\d{2}-\d{2}-gtm-strategy\.md$/)
      const fullPath = path.join(tmpDir, res.relPath)
      expect(fs.existsSync(fullPath)).toBe(true)

      const content = fs.readFileSync(fullPath, "utf8")
      expect(content).toContain("# GTM Strategy")
      expect(content).toContain("tags: [launchpad]")
      expect(content).toContain("Discussed new go-to-market strategy")
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("ingestBrainDump handles optional capture hook gracefully", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-dump-test-"))
    try {
      const res = await ingestBrainDump(
        {
          text: "A quick thought for product roadmap.",
          folder: "ideas",
          tags: ["vantage"],
        },
        {
          storePath: tmpDir,
          capture: async () => ({ ok: true, slug: "custom-slug-123" }),
        }
      )

      expect(res.embedded).toBe(true)
      expect(res.slug).toBe("custom-slug-123")
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("appendInboxCapture appends text with ISO timestamp to notes/inbox.md", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-inbox-test-"))
    try {
      const res1 = appendInboxCapture({
        text: "First capture thought",
        title: "Initial thought",
        companyRoot: tmpDir,
        tags: ["vantage"],
      })

      expect(res1.ok).toBe(true)
      expect(res1.relPath).toBe("notes/inbox.md")
      expect(res1.timestamp).toBeDefined()

      const inboxFile = path.join(tmpDir, "notes", "inbox.md")
      expect(fs.existsSync(inboxFile)).toBe(true)

      const content1 = fs.readFileSync(inboxFile, "utf8")
      expect(content1).toContain("# Inbox")
      expect(content1).toContain("## [")
      expect(content1).toContain("Initial thought")
      expect(content1).toContain("First capture thought")
      expect(content1).toContain("(tags: vantage)")

      // Append a second thought
      const res2 = appendInboxCapture({
        text: "Second capture without title",
        companyRoot: tmpDir,
      })

      expect(res2.ok).toBe(true)
      const content2 = fs.readFileSync(inboxFile, "utf8")
      expect(content2).toContain("First capture thought")
      expect(content2).toContain("Second capture without title")
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
