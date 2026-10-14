import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { buildBrainViewModel } from "./adapter"

describe("buildBrainViewModel with real file grounding", () => {
  it("builds knowledge graph incorporating real file categories", () => {
    const model = buildBrainViewModel({
      companyRoot: process.cwd(),
      definitionsNodes: [
        { name: "company.yaml", path: "definitions/ontology/company.yaml", kind: "file", content: "domain: test" }
      ],
      decisions: [
        { slug: "2026-09-12-theme", title: "Theme Decision", companyId: "test", date: "2026-09-12" }
      ],
      records: [
        { name: "metrics.yaml", path: "records/metrics.yaml", content: "arr: 50000" }
      ]
    })
    expect(model.graph).toBeDefined()
    expect(model.graph.nodes.length).toBeGreaterThan(0)

    // Verify definitions node exists
    const defNode = model.graph.nodes.find((n) => n.id === "def:definitions/ontology/company.yaml")
    expect(defNode).toBeDefined()
    expect(defNode?.label).toBe("company.yaml")
    expect(defNode?.kind).toBe("definition")
    expect(defNode?.path).toBe("definitions/ontology/company.yaml")

    // Verify decision node exists
    const decNode = model.graph.nodes.find((n) => n.id === "decision:2026-09-12-theme")
    expect(decNode).toBeDefined()
    expect(decNode?.label).toBe("Theme Decision")
    expect(decNode?.kind).toBe("decision")

    // Verify record node exists
    const recNode = model.graph.nodes.find((n) => n.id === "record:records/metrics.yaml")
    expect(recNode).toBeDefined()
    expect(recNode?.label).toBe("metrics.yaml")
    expect(recNode?.kind).toBe("record")

    // Verify memory core is populated with real file pages rather than demo placeholder titles
    expect(model.memory).toBeDefined()
    const memoryPageIds = model.memory.nodes.map((n) => n.id)
    expect(memoryPageIds.some((id) => id.includes("company.yaml"))).toBe(true)
    expect(memoryPageIds.some((id) => id.includes("2026-09-12-theme"))).toBe(true)
    expect(memoryPageIds.some((id) => id.includes("metrics.yaml"))).toBe(true)
  })

  it("reads real files from companyRoot on disk if definitions/decisions not explicitly passed", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "alacran-brain-test-"))
    try {
      // Create definitions/
      const defDir = path.join(tmpDir, "definitions")
      fs.mkdirSync(defDir, { recursive: true })
      fs.writeFileSync(path.join(defDir, "company.yaml"), "name: Disk Test Co\n", "utf8")

      // Create docs/decisions/
      const decDir = path.join(tmpDir, "docs", "decisions")
      fs.mkdirSync(decDir, { recursive: true })
      fs.writeFileSync(
        path.join(decDir, "2026-09-13-architecture.md"),
        "# Decision: Architecture Grounding\n\n## What We Did\nGround knowledge in git files.\n",
        "utf8"
      )

      // Create records/
      const recDir = path.join(tmpDir, "records")
      fs.mkdirSync(recDir, { recursive: true })
      fs.writeFileSync(path.join(recDir, "run-log.yaml"), "status: ok\n", "utf8")

      // Create notes/
      const notesDir = path.join(tmpDir, "notes")
      fs.mkdirSync(notesDir, { recursive: true })
      fs.writeFileSync(path.join(notesDir, "inbox.md"), "captured thought\n", "utf8")

      const model = buildBrainViewModel({ companyRoot: tmpDir })

      const defNode = model.graph.nodes.find((n) => n.path === "definitions/company.yaml")
      expect(defNode).toBeDefined()
      expect(defNode?.kind).toBe("definition")

      const decNode = model.graph.nodes.find((n) => n.id === "decision:2026-09-13-architecture")
      expect(decNode).toBeDefined()
      expect(decNode?.label).toBe("Architecture Grounding")

      const recNode = model.graph.nodes.find((n) => n.path === "records/run-log.yaml")
      expect(recNode).toBeDefined()
      expect(recNode?.kind).toBe("record")

      const noteNode = model.graph.nodes.find((n) => n.path === "notes/inbox.md")
      expect(noteNode).toBeDefined()
      expect(noteNode?.kind).toBe("note")

      // Memory graph contains pages from the disk files
      const memIds = model.memory.nodes.map((n) => n.id)
      expect(memIds.some((id) => id.includes("company.yaml"))).toBe(true)
      expect(memIds.some((id) => id.includes("2026-09-13-architecture"))).toBe(true)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("falls back to demoMemoryGraph when no real files exist", () => {
    const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), "alacran-brain-empty-"))
    try {
      const model = buildBrainViewModel({ companyRoot: emptyTmp })
      expect(model.memory).toBeDefined()
      expect(model.memory.nodes.length).toBeGreaterThan(0)
      // Demo memory contains sales playbooks
      expect(model.memory.nodes.some((n) => n.folder === "Sales Playbooks")).toBe(true)
    } finally {
      fs.rmSync(emptyTmp, { recursive: true, force: true })
    }
  })
})
