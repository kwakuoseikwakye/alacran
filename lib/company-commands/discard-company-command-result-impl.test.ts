import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

let tmpCo: string
let tmpData: string

vi.mock("../get-effective-agents", () => ({
  getEffectiveAgents: async () => [{ id: "acme", rootPath: tmpCo }],
}))

const { discardCompanyCommandResultImpl } = await import("./discard-company-command-result-impl")

function writeRunRecord(commandId: string, record: unknown) {
  fs.mkdirSync(tmpData, { recursive: true })
  fs.writeFileSync(path.join(tmpData, `${commandId}.run.json`), JSON.stringify(record))
}

describe("discardCompanyCommandResultImpl", () => {
  beforeEach(() => {
    tmpCo = fs.mkdtempSync(path.join(os.tmpdir(), "discard-co-"))
    tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "discard-data-"))
    fs.mkdirSync(path.join(tmpCo, "records", "funnel"), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpCo, { recursive: true, force: true })
    fs.rmSync(tmpData, { recursive: true, force: true })
  })

  it("puts a changed file back exactly as it was before the run", async () => {
    const file = path.join(tmpCo, "records", "funnel", "leads.yaml")
    fs.writeFileSync(file, "leads: []\n")
    writeRunRecord("sync-funnel", {
      outputKind: "known-file",
      outputPath: "records/funnel/leads.yaml",
      before: "leads: []\n",
    })
    fs.writeFileSync(file, "leads:\n  - id: kofi\n")

    const result = await discardCompanyCommandResultImpl("sync-funnel", "acme", tmpData)

    expect(result.discarded).toBe(true)
    expect(fs.readFileSync(file, "utf-8")).toBe("leads: []\n")
  })

  it("clears the pending review so the sidebar dot goes away", async () => {
    const file = path.join(tmpCo, "records", "funnel", "leads.yaml")
    fs.writeFileSync(file, "leads: []\n")
    writeRunRecord("sync-funnel", {
      outputKind: "known-file",
      outputPath: "records/funnel/leads.yaml",
      before: "leads: []\n",
    })
    fs.writeFileSync(file, "leads:\n  - id: kofi\n")

    await discardCompanyCommandResultImpl("sync-funnel", "acme", tmpData)

    expect(fs.existsSync(path.join(tmpData, "sync-funnel.run.json"))).toBe(false)
  })

  it("deletes a file the run created where there was none before", async () => {
    const file = path.join(tmpCo, "records", "funnel", "leads.yaml")
    writeRunRecord("sync-funnel", {
      outputKind: "known-file",
      outputPath: "records/funnel/leads.yaml",
      before: null,
    })
    fs.writeFileSync(file, "leads:\n  - id: kofi\n")

    await discardCompanyCommandResultImpl("sync-funnel", "acme", tmpData)

    expect(fs.existsSync(file)).toBe(false)
  })

  it("removes only the files a new-file run added, never one that was already there", async () => {
    const dir = path.join(tmpCo, "notes", "company", "digests")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "old.md"), "kept")
    writeRunRecord("digest", {
      outputKind: "new-file-in-dir",
      outputPath: "notes/company/digests",
      before: ["old.md"],
    })
    fs.writeFileSync(path.join(dir, "new.md"), "drafted")

    await discardCompanyCommandResultImpl("digest", "acme", tmpData)

    expect(fs.existsSync(path.join(dir, "new.md"))).toBe(false)
    expect(fs.readFileSync(path.join(dir, "old.md"), "utf-8")).toBe("kept")
  })

  it("refuses when the run also changed files it cannot put back, in a plain sentence with no file names", async () => {
    // `beforeDirty` records file NAMES, not contents, so a stray edit cannot be
    // reverted — only reported. Saying "Discarded" while those sit on disk is
    // the app claiming an undo it did not perform.
    const file = path.join(tmpCo, "records", "funnel", "leads.yaml")
    fs.writeFileSync(file, "leads: []\n")
    writeRunRecord("sync-funnel", {
      outputKind: "known-file",
      outputPath: "records/funnel/leads.yaml",
      before: "leads: []\n",
      beforeDirty: [],
    })
    fs.writeFileSync(file, "leads:\n  - id: kofi\n")

    const result = await discardCompanyCommandResultImpl("sync-funnel", "acme", tmpData, async () => ({
      stdout: " M records/funnel/leads.yaml\0 M HANDOFF.md\0",
      stderr: "",
    }))

    expect(result.discarded).toBe(false)
    expect(result.message).toBe("This run also changed other files, which Discard can't put back. Nothing was undone. Review those files yourself first.")
    expect(result.message).not.toContain("HANDOFF.md")
    // And it changed nothing, rather than half-undoing.
    expect(fs.readFileSync(file, "utf-8")).toBe("leads:\n  - id: kofi\n")
    expect(fs.existsSync(path.join(tmpData, "sync-funnel.run.json"))).toBe(true)
  })

  it("discards normally when the run stayed inside its own output", async () => {
    const file = path.join(tmpCo, "records", "funnel", "leads.yaml")
    fs.writeFileSync(file, "leads: []\n")
    writeRunRecord("sync-funnel", {
      outputKind: "known-file",
      outputPath: "records/funnel/leads.yaml",
      before: "leads: []\n",
      beforeDirty: [],
    })
    fs.writeFileSync(file, "leads:\n  - id: kofi\n")

    const result = await discardCompanyCommandResultImpl("sync-funnel", "acme", tmpData, async () => ({
      stdout: " M records/funnel/leads.yaml\0",
      stderr: "",
    }))

    expect(result.discarded).toBe(true)
    expect(fs.readFileSync(file, "utf-8")).toBe("leads: []\n")
  })

  it("refuses an unknown company rather than touching anything", async () => {
    const result = await discardCompanyCommandResultImpl("sync-funnel", "not-a-company", tmpData)
    expect(result.discarded).toBe(false)
  })

  it("refuses a command whose output path is not where that command writes", async () => {
    // Same containment rule the commit path enforces: a run record naming
    // HANDOFF.md must not let discard restore-or-delete it.
    fs.writeFileSync(path.join(tmpCo, "HANDOFF.md"), "real work")
    writeRunRecord("sync-funnel", {
      outputKind: "known-file",
      outputPath: "HANDOFF.md",
      before: null,
    })

    const result = await discardCompanyCommandResultImpl("sync-funnel", "acme", tmpData)

    expect(result.discarded).toBe(false)
    expect(fs.existsSync(path.join(tmpCo, "HANDOFF.md"))).toBe(true)
  })

  describe("afterDiscard", () => {
    const rec = { outputKind: "known-file", outputPath: "records/funnel/leads.yaml", before: "leads: []\n" }
    it("is called once with the data dir and command info after a successful discard", async () => {
      fs.writeFileSync(path.join(tmpCo, "records", "funnel", "leads.yaml"), "x")
      writeRunRecord("sync-funnel", rec)
      const afterDiscard = vi.fn(async () => {})
      const result = await discardCompanyCommandResultImpl("sync-funnel", "acme", tmpData, undefined, undefined, afterDiscard)
      expect(result.discarded).toBe(true)
      expect(afterDiscard).toHaveBeenCalledTimes(1)
      expect(afterDiscard).toHaveBeenCalledWith(tmpData, { commandId: "sync-funnel", outputKind: "known-file" })
    })
    it("is not called on a refusal", async () => {
      writeRunRecord("sync-funnel", { ...rec, outputPath: "HANDOFF.md", before: null })
      const afterDiscard = vi.fn(async () => {})
      const result = await discardCompanyCommandResultImpl("sync-funnel", "acme", tmpData, undefined, undefined, afterDiscard)
      expect(result.discarded).toBe(false)
      expect(afterDiscard).not.toHaveBeenCalled()
    })
    it("a throwing hook does not turn the discard into a failure", async () => {
      fs.writeFileSync(path.join(tmpCo, "records", "funnel", "leads.yaml"), "x")
      writeRunRecord("sync-funnel", rec)
      const result = await discardCompanyCommandResultImpl("sync-funnel", "acme", tmpData, undefined, undefined, async () => { throw new Error("boom") })
      expect(result.discarded).toBe(true)
    })
  })
})
