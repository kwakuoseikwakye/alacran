import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { prepareRevision } from "./revision"
import { getCompanyCommand } from "./registry"
import { getCompanyCommandResultImpl } from "./company-command-result-impl"

let root: string
let data: string
const command = getCompanyCommand("digest")!
const outputPath = "notes/company/digests/draft.md"
const record = JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: command.outputPath, before: ["older.md"], beforeDirty: [] })
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ux-revision-"))
  data = path.join(root, "run-data")
  await mkdir(data)
  await mkdir(path.join(root, command.outputPath), { recursive: true })
  await writeFile(path.join(root, outputPath), "Original proposal")
  await writeFile(path.join(data, "digest.run.json"), record)
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe("proposal revisions", () => {
  it("archives the proposal and keeps the original approval baseline after edits", async () => {
    const prepared = await prepareRevision(command, { feedback: "Correct the date", outputPath, expectedText: "Original proposal" }, data, root)
    expect(prepared.editScopePattern).toBe(outputPath)
    expect(prepared.prompt).toContain("Correct the date")
    expect(await readFile(path.join(data, "digest.run.json"), "utf-8")).toBe(record)
    const archives = await readdir(path.join(data, "revisions"))
    const previous = JSON.parse(await readFile(path.join(data, "revisions", archives[0]), "utf-8"))
    expect(previous.proposal).toBe("Original proposal")
    await writeFile(path.join(root, outputPath), "Revised proposal")
    const result = await getCompanyCommandResultImpl("digest", data, root, undefined, false)
    expect(result).toMatchObject({ changed: true, oldText: "", newText: "Revised proposal" })
  })
  it("logs one 'revised' outcome with the trimmed feedback and no file contents; a refused revision logs none", async () => {
    await expect(prepareRevision(command, { feedback: " ", outputPath, expectedText: "Original proposal" }, data, root)).rejects.toThrow()
    expect(await readdir(data)).not.toContain("outcomes.jsonl")
    await prepareRevision(command, { feedback: "  Correct the date  ", outputPath, expectedText: "Original proposal" }, data, root)
    const raw = await readFile(path.join(data, "outcomes.jsonl"), "utf-8")
    const lines = raw.trimEnd().split("\n").map((l) => JSON.parse(l))
    expect(lines).toMatchObject([{ command: "digest", outcome: "revised", feedback: "Correct the date" }])
    expect(raw).not.toContain("Original proposal")
  })
  it("rejects stale feedback without writing a history entry", async () => {
    await expect(prepareRevision(command, { feedback: "Fix it", outputPath, expectedText: "An older draft" }, data, root)).rejects.toThrow("has changed")
    expect(await readdir(data)).toEqual(["digest.run.json"])
  })
  it("rejects an altered output location before archiving or reading it as a proposal", async () => {
    await writeFile(path.join(data, "digest.run.json"), JSON.stringify({ outputPath: "../outside", outputKind: "new-file-in-dir" }))
    await expect(prepareRevision(command, { feedback: "Fix it", outputPath, expectedText: "Original proposal" }, data, root)).rejects.toThrow("location is invalid")
  })
  it("rejects a symlink outside the allowed output directory", async () => {
    await writeFile(path.join(root, "outside.md"), "Outside")
    await symlink(path.join(root, "outside.md"), path.join(root, command.outputPath, "link.md"))
    await expect(prepareRevision(command, { feedback: "Fix it", outputPath: `${command.outputPath}/link.md`, expectedText: "Outside" }, data, root)).rejects.toThrow("outside")
  })
  it("requires meaningful bounded feedback", async () => {
    for (const feedback of [" ", "x".repeat(4001)]) {
      await expect(prepareRevision(command, { feedback, outputPath, expectedText: "Original proposal" }, data, root)).rejects.toThrow("4,000")
    }
  })
  it("revises any waiting post, not just the first, and scopes the edit to that one file", async () => {
    const posts = getCompanyCommand("make-posts")!
    await mkdir(path.join(root, posts.outputPath), { recursive: true })
    for (const name of ["a.md", "b.md", "c.md", "old.md"]) await writeFile(path.join(root, posts.outputPath, name), `Post ${name}`)
    await writeFile(path.join(root, posts.outputPath, ".DS_Store"), "")
    await writeFile(path.join(data, "make-posts.run.json"), JSON.stringify({ commandId: "make-posts", outputKind: "new-file-in-dir", outputPath: posts.outputPath, before: ["old.md"], beforeDirty: [] }))
    const b = `${posts.outputPath}/b.md`
    const prepared = await prepareRevision(posts, { feedback: "Shorter", outputPath: b, expectedText: "Post b.md" }, data, root)
    expect(prepared.editScopePattern).toBe(b)
    expect(prepared.prompt).toContain(b)
    expect(prepared.prompt).not.toContain("a.md")
    await expect(prepareRevision(posts, { feedback: "Shorter", outputPath: `${posts.outputPath}/old.md`, expectedText: "Post old.md" }, data, root)).rejects.toThrow("has changed")
    await expect(prepareRevision(posts, { feedback: "Shorter", outputPath: `${posts.outputPath}/.DS_Store`, expectedText: "" }, data, root)).rejects.toThrow("has changed")
    await mkdir(path.join(root, posts.outputPath, "sub"))
    await writeFile(path.join(root, posts.outputPath, "sub", "x.md"), "Nested")
    await expect(prepareRevision(posts, { feedback: "Shorter", outputPath: `${posts.outputPath}/sub/x.md`, expectedText: "Nested" }, data, root)).rejects.toThrow()
    await expect(prepareRevision(posts, { feedback: "Shorter", outputPath: b, expectedText: "stale" }, data, root)).rejects.toThrow("has changed")
  })
})
