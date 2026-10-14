import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it, vi } from "vitest"
import { MAX_PREFERENCE_BYTES, MAX_PREFERENCE_LINES, buildPreferencesBlock } from "./block"

const sandbox = mkdtempSync(path.join(os.tmpdir(), "pref-block-"))
afterAll(() => rmSync(sandbox, { recursive: true, force: true }))
let n = 0
/** A fresh company root; `text` (when given) is written to definitions/preferences.md. */
const rootWith = (text?: string) => {
  const r = path.join(sandbox, `r${n++}`)
  mkdirSync(path.join(r, "definitions"), { recursive: true })
  if (text !== undefined) writeFileSync(path.join(r, "definitions/preferences.md"), text)
  return r
}
const read = (text: string) => rootWith(text)
const FILE = "# Owner preferences\n\nWritten from the owner's own change requests, after they approved each line. Delete a line to stop it applying.\n\n"

describe("buildPreferencesBlock", () => {
  it("is empty for a missing, empty or prose-only file", async () => {
    expect(await buildPreferencesBlock(rootWith())).toBe("")
    expect(await buildPreferencesBlock(read(""))).toBe("")
    expect(await buildPreferencesBlock(read(FILE))).toBe("")
  })
  it("returns the bullet lines under a plain heading, without the evidence parenthetical", async () => {
    const text = FILE + `- Keep replies short, with one clear question. (3 revisions: "too long", "cut this down", "just ask the one question")\n- Sign off with the owner's first name only.\n`
    const block = await buildPreferencesBlock(read(text))
    expect(block).toContain("Owner preferences")
    expect(block).toContain("- Keep replies short, with one clear question.")
    expect(block).toContain("- Sign off with the owner's first name only.")
    expect(block).not.toContain("too long")
    expect(block).not.toContain("3 revisions")
  })
  it("handles CRLF and * bullets", async () => {
    const block = await buildPreferencesBlock(read("# P\r\n\r\n* Be brief.\r\n- Be kind.\r\n"))
    expect(block).toContain("- Be brief.")
    expect(block).toContain("- Be kind.")
  })
  it("caps at 40 lines and about 4 KB", async () => {
    const many = Array.from({ length: 80 }, (_, i) => `- Preference number ${i}.`).join("\n")
    const lines = (await buildPreferencesBlock(read(many))).split("\n").filter((l) => l.startsWith("- "))
    expect(lines).toHaveLength(MAX_PREFERENCE_LINES)
    const long = Array.from({ length: 30 }, (_, i) => `- ${"word ".repeat(60)}${i}`).join("\n")
    const block = await buildPreferencesBlock(read(long))
    expect(Buffer.byteLength(block)).toBeLessThanOrEqual(MAX_PREFERENCE_BYTES + 400) // the heading and notice add a little
    expect(block.split("\n").filter((l) => l.startsWith("- ")).length).toBeLessThan(30)
  })
  it("is empty for a symlink, even one pointing at a real preferences file", async () => {
    const target = path.join(rootWith("- Be brief.\n"), "definitions/preferences.md")
    const r = rootWith()
    symlinkSync(target, path.join(r, "definitions/preferences.md"))
    expect(await buildPreferencesBlock(r)).toBe("")
  })
  it("is empty for a file over 64 KB and fine just under it", async () => {
    expect(await buildPreferencesBlock(read("- Be brief.\n" + "x".repeat(70_000)))).toBe("")
    expect(await buildPreferencesBlock(read("- Be brief.\n" + "x".repeat(60_000)))).toContain("- Be brief.")
  })
  it("states that preferences never override a gate or the company's facts", async () => {
    expect(await buildPreferencesBlock(read("- Be brief.\n"))).toContain("never override a gate")
  })

  describe("while a learn-preferences review is pending", () => {
    const pendingRoot = (working: string) => {
      const r = rootWith(working)
      const d = path.join(r, "data")
      mkdirSync(d)
      writeFileSync(
        path.join(d, "learn-preferences.run.json"),
        JSON.stringify({ commandId: "learn-preferences", outputKind: "known-file", outputPath: "definitions/preferences.md", before: "- Be kind.\n", beforeDirty: [] })
      )
      return { r, d }
    }
    const committed = (text: string | Error) => vi.fn(async () => { if (text instanceof Error) throw text; return { stdout: text, stderr: "" } })

    it("reads the committed file, not the proposed working-tree one", async () => {
      const { r, d } = pendingRoot("- Be kind.\n- Proposed line.\n")
      const execFn = committed("- Be kind.\n")
      const block = await buildPreferencesBlock(r, { dataDir: d, execFn })
      expect(block).toContain("- Be kind.")
      expect(block).not.toContain("Proposed line")
      expect(execFn).toHaveBeenCalledWith("git", ["-C", r, "--no-optional-locks", "show", "HEAD:./definitions/preferences.md"], { cwd: r })
    })
    it("is empty when the file is not committed yet, or the committed text is over 64 KB", async () => {
      const { r, d } = pendingRoot("- Proposed line.\n")
      expect(await buildPreferencesBlock(r, { dataDir: d, execFn: committed(new Error("exists on disk, but not in HEAD")) })).toBe("")
      expect(await buildPreferencesBlock(r, { dataDir: d, execFn: committed("- x\n" + "y".repeat(70_000)) })).toBe("")
    })
    it("reads the working file again once the record is gone (approved)", async () => {
      const { r, d } = pendingRoot("- Be kind.\n- Proposed line.\n")
      rmSync(path.join(d, "learn-preferences.run.json"))
      expect(await buildPreferencesBlock(r, { dataDir: d, execFn: committed("- Be kind.\n") })).toContain("Proposed line")
    })
    it("a lingering record from a run that changed nothing does not count as pending", async () => {
      const r = rootWith("- Be kind.\n")
      const d = path.join(r, "data")
      mkdirSync(d)
      writeFileSync(path.join(d, "learn-preferences.run.json"), JSON.stringify({ commandId: "learn-preferences", outputKind: "known-file", outputPath: "definitions/preferences.md", before: "- Be kind.\n", beforeDirty: [] }))
      const execFn = committed(new Error("must not be called"))
      expect(await buildPreferencesBlock(r, { dataDir: d, execFn })).toContain("- Be kind.")
    })
  })
})
