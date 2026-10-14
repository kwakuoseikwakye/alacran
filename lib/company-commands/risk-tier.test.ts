import { describe, it, expect } from "vitest"
import { classifyRisk } from "./risk-tier"

describe("classifyRisk", () => {
  it("classifies session notes as Low Risk / Safe", () => {
    const res = classifyRisk({
      commandId: "session-note",
      outputPath: "notes/company/sessions/2026-09-19-planning.md",
      oldText: "",
      newText: "# Session summary\nWorked on features.",
    })
    expect(res.level).toBe("low")
    expect(res.isSafe).toBe(true)
    expect(res.label).toBe("Low risk")
    expect(res.reason).toContain("session summary")
  })

  it("classifies weekly digests as Low Risk / Safe", () => {
    const res = classifyRisk({
      commandId: "digest",
      outputPath: "notes/company/digests/2026-09-19-digest.md",
      oldText: "",
      newText: "# Weekly Digest\nHighlights here.",
    })
    expect(res.level).toBe("low")
    expect(res.isSafe).toBe(true)
    expect(res.label).toBe("Low risk")
  })

  it("classifies orientation as Low Risk / Safe", () => {
    const res = classifyRisk({
      commandId: "orientation",
      outputPath: "notes/company/orientation.md",
      oldText: "old orientation",
      newText: "updated orientation",
    })
    expect(res.level).toBe("low")
    expect(res.isSafe).toBe(true)
  })

  it("classifies retrospectives as Low Risk / Safe", () => {
    const res = classifyRisk({
      commandId: "retro",
      outputPath: "docs/retros/2026-09-19-retro.md",
      oldText: "",
      newText: "# Retrospective\nWent well.",
    })
    expect(res.level).toBe("low")
    expect(res.isSafe).toBe(true)
  })

  it("classifies decision ADRs as High Risk / Governed (§6 Contracts)", () => {
    const res = classifyRisk({
      commandId: "decision",
      outputPath: "docs/decisions/2026-09-19-smart-gate.md",
      oldText: "",
      newText: "# Decision: Smart Gate\nReasoning here.",
    })
    expect(res.level).toBe("high")
    expect(res.isSafe).toBe(false)
    expect(res.label).toBe("High risk")
    expect(res.reason).toContain("agreement")
  })

  it("classifies company ontology changes as High Risk / Governed (§2 Definitions)", () => {
    const res = classifyRisk({
      commandId: "refresh",
      outputPath: "definitions/ontology/company.yaml",
      oldText: "name: Acme",
      newText: "name: Acme Corp",
    })
    expect(res.level).toBe("high")
    expect(res.isSafe).toBe(false)
    expect(res.label).toBe("High risk")
    expect(res.reason).toContain("core facts")
  })

  it("classifies financial records changes as High Risk / Governed (§6 Money)", () => {
    const res = classifyRisk({
      commandId: "sync-finances",
      outputPath: "records/finances/transactions.yaml",
      oldText: "transactions: []",
      newText: "transactions:\n  - id: t1\n    amount: 5000",
    })
    expect(res.level).toBe("high")
    expect(res.isSafe).toBe(false)
    expect(res.label).toBe("High risk")
    expect(res.reason).toContain("money")
  })

  it("classifies stray file modifications as High Risk / Governed", () => {
    const res = classifyRisk({
      commandId: "session-note",
      outputPath: "notes/company/sessions/2026-09-19-test.md",
      oldText: "",
      newText: "# Note",
      strays: ["definitions/ontology/company.yaml", "records/finances/transactions.yaml"],
    })
    expect(res.level).toBe("high")
    expect(res.isSafe).toBe(false)
    expect(res.reason).toContain("files it wasn't asked to touch")
  })

  it("classifies destructive content wipe as High Risk (§6 Irreversible operations)", () => {
    const res = classifyRisk({
      commandId: "custom",
      outputPath: "notes/some-note.md",
      oldText: "Some important notes that were written previously.",
      newText: "",
    })
    expect(res.level).toBe("high")
    expect(res.isSafe).toBe(false)
    expect(res.reason).toContain("Empties or deletes")
  })

  it("classifies operational record mutations as Medium Risk", () => {
    const res = classifyRisk({
      commandId: "sync-funnel",
      outputPath: "records/funnel/leads.yaml",
      oldText: "leads: []",
      newText: "leads:\n  - id: l1\n    name: Acme Lead",
    })
    expect(res.level).toBe("medium")
    expect(res.isSafe).toBe(false)
    expect(res.label).toBe("Medium risk")
    expect(res.reason).toContain("department records")
  })
  describe("a delegated task whose stray files could not be listed", () => {
    const delegated = {
      commandId: "delegate-task",
      outputPath: "notes/company/tasks/2026-10-08-draft-plan.md",
      oldText: "",
      newText: "# What I did",
    }

    it("is never one-click: an unknown stray list is not a clean one", () => {
      const res = classifyRisk({ ...delegated, strays: null })
      expect(res.level).toBe("medium")
      expect(res.isSafe).toBe(false)
      expect(res.reason).toBe("Couldn't check whether your agent changed anything else")
    })

    it("is the same when the caller supplied no stray list at all (absent is unknown, never none)", () => {
      const res = classifyRisk({ ...delegated })
      expect(res.level).toBe("medium")
      expect(res.isSafe).toBe(false)
    })

    it("is still a low-risk new note when the stray list is known to be empty", () => {
      const res = classifyRisk({ ...delegated, strays: [] })
      expect(res.level).toBe("low")
      expect(res.isSafe).toBe(true)
      expect(res.reason).toBe("Adds a new working note")
    })

    it("stays high risk when something did stray", () => {
      expect(classifyRisk({ ...delegated, strays: ["definitions/ontology/company.yaml"] }).level).toBe("high")
    })

    it("does not change any other command: unknown strays on a session note are still low risk", () => {
      const res = classifyRisk({
        commandId: "session-note",
        outputPath: "notes/company/sessions/2026-10-08-x.md",
        oldText: "",
        newText: "# Note",
        strays: null,
      })
      expect(res.level).toBe("low")
      expect(res.isSafe).toBe(true)
    })
  })
})

describe("classifyRisk with owned paths (v234)", () => {
  const note = {
    commandId: "session-note",
    outputPath: "notes/company/sessions/a.md",
    oldText: "",
    newText: "x",
  }

  it("classifies a session note that also changes company facts as High risk", () => {
    const r = classifyRisk({ ...note, ownedPaths: ["definitions/ontology/company.yaml"] })
    expect(r.level).toBe("high")
    expect(r.reason).toBe("Changes the core facts about your company")
  })

  it("classifies a session note that adds a decision as High risk", () => {
    const r = classifyRisk({ ...note, ownedPaths: ["docs/decisions/2026-10-14-x.md"] })
    expect(r.level).toBe("high")
    expect(r.reason).toBe("Records a decision or an agreement")
  })

  it("still classifies a plain session note as Low", () => {
    expect(classifyRisk(note).level).toBe("low")
  })

  it("classifies a note that proposes fact changes as Medium, never safe (v234 I5)", () => {
    const r = classifyRisk({ ...note, newText: "# S\n\n## Proposed fact changes\n- fact | pricing | fixed | was: hourly | \"q\"\n" })
    expect(r).toEqual({ level: "medium", label: "Medium risk", reason: "Suggests changes to your company facts", isSafe: false })
  })

  it("treats an unreadable proposed-facts section the same way", () => {
    const r = classifyRisk({ ...note, newText: "# S\n\n## Proposed fact changes\n- something improvised\n" })
    expect(r.isSafe).toBe(false)
    expect(r.reason).toBe("Suggests changes to your company facts")
  })

  it("classifies learn-preferences as High Risk / not safe", () => {
    const res = classifyRisk({ commandId: "learn-preferences", outputPath: "definitions/preferences.md", oldText: "", newText: "- x" })
    expect(res.level).toBe("high")
    expect(res.isSafe).toBe(false)
  })
})
