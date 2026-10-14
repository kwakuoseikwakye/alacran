import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { EXECUTOR_COVERAGE } from "../executor-coverage"
import { updateCoverageFromReport } from "../../../scripts/update-guide-coverage.mjs"

const ROOT = process.cwd()

describe("coverage table/report consistency", () => {
  it("matches every measured table row to the dated JSON and Markdown evidence", () => {
    for (const [id, coverage] of Object.entries(EXECUTOR_COVERAGE)) {
      if (coverage.behaviour.verdict === "unverified") continue
      const evidence = coverage.behaviour.evidence!
      const jsonPath = path.join(ROOT, evidence.replace(/\.md$/, ".json"))
      const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"))
      const row = report.reports.find((item: { id: string }) => item.id === id)
      expect(row).toMatchObject({ verdict: coverage.behaviour.verdict, cliVersion: coverage.behaviour.cliVersion })
      expect(report.date).toBe(coverage.behaviour.measuredOn)
      expect(fs.existsSync(path.join(ROOT, evidence))).toBe(true)
    }
  })

  it("updates all selected behaviours deterministically and rejects mismatched evidence", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guide-table-sync-"))
    try {
      const date = "2000-10-04"
      const jsonPath = path.join(dir, `${date}-report.json`)
      const mdPath = path.join(dir, "report.md")
      const report = { date, reports: Object.keys(EXECUTOR_COVERAGE).map((id, index) => ({ id, cliVersion: index === 0 ? null : `${id} 1.2`, verdict: index === 0 ? "unverified" : "follows" })) }
      fs.writeFileSync(jsonPath, JSON.stringify(report))
      fs.writeFileSync(mdPath, `# Operating guide: executor coverage report\n\nMeasured ${date}.\n\n${report.reports.map((r) => `| ${r.id} | ${r.cliVersion ?? "not found"} | ${r.verdict} | ok |`).join("\n")}`)
      const evidenceDir = path.join(ROOT, "docs/guide-coverage")
      const stagedMd = path.join(evidenceDir, `${date}-report.md`)
      const stagedJson = path.join(evidenceDir, `${date}-report.json`)
      fs.mkdirSync(evidenceDir, { recursive: true })
      fs.copyFileSync(mdPath, stagedMd)
      fs.copyFileSync(jsonPath, stagedJson)
      try {
        const result = updateCoverageFromReport(stagedJson, stagedMd, fs.readFileSync(path.join(ROOT, "lib/guide/executor-coverage.ts"), "utf8"), false)
        expect(result.match(/behaviour: \{ verdict: "follows"/g)).toHaveLength(Object.keys(EXECUTOR_COVERAGE).length - 1)
        expect(result.match(/behaviour: UNVERIFIED/g)).toHaveLength(1)
        const wrong = { ...report, date: "2000-10-03" }
        fs.writeFileSync(jsonPath, JSON.stringify(wrong))
        expect(() => updateCoverageFromReport(jsonPath, stagedMd, "", false)).toThrow()
      } finally {
        fs.rmSync(stagedMd, { force: true })
        fs.rmSync(stagedJson, { force: true })
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })
})
