import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  calculateRunway,
  readRunwayRecord,
  exportRecommendationsToCsv,
  exportRecommendationsToTsv,
} from "./runway"
import type { FinancesRecommendation } from "./recommendations"

describe("runway metrics and calculations", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "alacran-runway-test-"))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("calculates runway and assigns health color", () => {
    const healthy = calculateRunway(150000, 10000)
    expect(healthy.runwayMonths).toBe(15)
    expect(healthy.healthColor).toBe("emerald")
    expect(healthy.healthLabel).toBe("15 months (Strong)")

    const caution = calculateRunway(80000, 10000)
    expect(caution.runwayMonths).toBe(8)
    expect(caution.healthColor).toBe("amber")
    expect(caution.healthLabel).toBe("8 months (Caution)")

    const critical = calculateRunway(30000, 10000)
    expect(critical.runwayMonths).toBe(3)
    expect(critical.healthColor).toBe("coral")
    expect(critical.healthLabel).toBe("3 months (Critical)")
  })

  it("handles zero or negative burn gracefully", () => {
    const zeroBurn = calculateRunway(50000, 0)
    expect(zeroBurn.runwayMonths).toBe(999)
    expect(zeroBurn.healthColor).toBe("emerald")
    expect(zeroBurn.healthLabel).toContain("Infinite")

    const negativeBurn = calculateRunway(50000, -5000)
    expect(negativeBurn.runwayMonths).toBe(999)
    expect(negativeBurn.healthColor).toBe("emerald")
    expect(negativeBurn.healthLabel).toContain("Infinite")
  })

  it("reads runway record from file or falls back to sensible defaults", async () => {
    const emptyRunway = await readRunwayRecord(tmpDir)
    expect(emptyRunway.cashBalance).toBe(0)
    expect(emptyRunway.monthlyBurn).toBe(0)
    expect(emptyRunway.runwayMonths).toBe(0)
    expect(emptyRunway.healthLabel).toBe("No runway data logged yet")

    const runwayFile = path.join(tmpDir, "records", "finances", "runway.yaml")
    await fs.mkdir(path.dirname(runwayFile), { recursive: true })
    await fs.writeFile(
      runwayFile,
      `schema_version: 1
cash_balance: 120000
monthly_burn: 12000
currency: USD
realized_savings_monthly: 200
realized_savings_annual: 2400`
    )

    const loaded = await readRunwayRecord(tmpDir)
    expect(loaded.cashBalance).toBe(120000)
    expect(loaded.monthlyBurn).toBe(12000)
    expect(loaded.runwayMonths).toBe(10)
    expect(loaded.currency).toBe("USD")
    expect(loaded.healthColor).toBe("amber")
    expect(loaded.realizedSavingsMonthly).toBe(200)
    expect(loaded.realizedSavingsAnnual).toBe(2400)
  })

  it("handles invalid YAML in runway record gracefully", async () => {
    const runwayFile = path.join(tmpDir, "records", "finances", "runway.yaml")
    await fs.mkdir(path.dirname(runwayFile), { recursive: true })
    await fs.writeFile(runwayFile, ": invalid: yaml: [")

    const loaded = await readRunwayRecord(tmpDir)
    expect(loaded.cashBalance).toBe(0)
    expect(loaded.monthlyBurn).toBe(0)
    expect(loaded.healthLabel).toBe("Invalid runway record")
  })

  it("exports recommendations to CSV with formula injection sanitization", () => {
    const mockRecs: FinancesRecommendation[] = [
      {
        id: "1",
        date: "2026-09-27",
        title: "=cmd|' /C calc'!A0",
        vendor: "Figma",
        category: "Software",
        actionType: "downgrade",
        potentialSavingsMonthly: 45,
        currency: "USD",
        status: "pending",
        priority: "high",
        finding: "Test",
        actionPlan: "Test",
        draftPitch: "Test",
        fileName: "test.md",
        filePath: "test.md",
        vendorUrl: "https://figma.com",
      },
      {
        id: "2",
        date: "2026-09-27",
        title: "+SUM(1,2)",
        vendor: "-RiskyVendor",
        category: "Infrastructure",
        actionType: "cancel",
        potentialSavingsMonthly: 120,
        currency: "USD",
        status: "approved",
        priority: "medium",
        finding: "Test 2",
        actionPlan: "Test 2",
        draftPitch: "Test 2",
        fileName: "test2.md",
        filePath: "test2.md",
      },
      {
        id: "3",
        date: "2026-09-27",
        title: "@admin",
        vendor: "\tTabbedVendor",
        category: "General",
        actionType: "optimize",
        potentialSavingsMonthly: 10,
        currency: "USD",
        status: "realized",
        priority: "low",
        finding: "Test 3",
        actionPlan: "Test 3",
        draftPitch: "Test 3",
        fileName: "test3.md",
        filePath: "test3.md",
      },
    ]

    const csv = exportRecommendationsToCsv(mockRecs)
    expect(csv).toContain("Vendor,Title,Action,Monthly Savings,Status,Priority,URL")
    // Formula neutralized with leading quote for =, +, -, @, and \t
    expect(csv).toContain("\"'=cmd|' /C calc'!A0\"")
    expect(csv).toContain("\"'+SUM(1,2)\"")
    expect(csv).toContain("\"'-RiskyVendor\"")
    expect(csv).toContain("\"'@admin\"")
    expect(csv).toContain("\"'\tTabbedVendor\"")
  })

  it("exports recommendations to TSV", () => {
    const mockRecs: FinancesRecommendation[] = [
      {
        id: "1",
        date: "2026-09-27",
        title: "Downsize seats",
        vendor: "Slack",
        category: "Software",
        actionType: "downgrade",
        potentialSavingsMonthly: 50,
        currency: "USD",
        status: "pending",
        priority: "high",
        finding: "Test",
        actionPlan: "Test",
        draftPitch: "Test",
        fileName: "test.md",
        filePath: "test.md",
        vendorUrl: "https://slack.com",
      },
    ]

    const tsv = exportRecommendationsToTsv(mockRecs)
    const lines = tsv.split("\n")
    expect(lines[0]).toBe("Vendor\tTitle\tAction\tMonthly Savings\tStatus\tPriority\tURL")
    expect(lines[1]).toBe("Slack\tDownsize seats\tdowngrade\t50\tpending\thigh\thttps://slack.com")
  })

  it("exports recommendations to TSV with formula sanitization and newline/tab stripping", () => {
    const mockRecs: FinancesRecommendation[] = [
      {
        id: "1",
        date: "2026-09-27",
        title: "=cmd|' /C calc'!A0",
        vendor: "Figma",
        category: "Software",
        actionType: "downgrade",
        potentialSavingsMonthly: 45,
        currency: "USD",
        status: "pending",
        priority: "high",
        finding: "Test",
        actionPlan: "Test",
        draftPitch: "Test",
        fileName: "test.md",
        filePath: "test.md",
      },
      {
        id: "2",
        date: "2026-09-27",
        title: "+SUM(1,2)",
        vendor: "-RiskyVendor",
        category: "Infrastructure",
        actionType: "cancel",
        potentialSavingsMonthly: 120,
        currency: "USD",
        status: "approved",
        priority: "medium",
        finding: "Test 2",
        actionPlan: "Test 2",
        draftPitch: "Test 2",
        fileName: "test2.md",
        filePath: "test2.md",
      },
      {
        id: "3",
        date: "2026-09-27",
        title: "@admin",
        vendor: "\tTabbedVendor",
        category: "General",
        actionType: "optimize",
        potentialSavingsMonthly: 10,
        currency: "USD",
        status: "realized",
        priority: "low",
        finding: "Test 3",
        actionPlan: "Test 3",
        draftPitch: "Test 3",
        fileName: "test3.md",
        filePath: "test3.md",
      },
      {
        id: "4",
        date: "2026-09-27",
        title: "Multi\nLine\r\nHeading",
        vendor: "Tab\tSeparated\tVendor",
        category: "General",
        actionType: "optimize",
        potentialSavingsMonthly: 25,
        currency: "USD",
        status: "pending",
        priority: "low",
        finding: "Test 4",
        actionPlan: "Test 4",
        draftPitch: "Test 4",
        fileName: "test4.md",
        filePath: "test4.md",
      },
    ]

    const tsv = exportRecommendationsToTsv(mockRecs)
    const lines = tsv.split("\n")

    // 1 header + 4 rows = 5 lines total (no lines broken by newlines)
    expect(lines).toHaveLength(5)

    // Formula neutralized with leading quote
    expect(tsv).toContain("'=cmd|' /C calc'!A0")
    expect(tsv).toContain("'+SUM(1,2)")
    expect(tsv).toContain("'-RiskyVendor")
    expect(tsv).toContain("'@admin")
    expect(tsv).toContain("' TabbedVendor")

    // Embedded tabs and newlines sanitized to spaces so every line has exactly 7 columns
    for (const line of lines) {
      const cols = line.split("\t")
      expect(cols).toHaveLength(7)
    }

    expect(lines[4]).toContain("Multi Line Heading")
    expect(lines[4]).toContain("Tab Separated Vendor")
  })

  it("handles non-finite values safely in calculateRunway and readRunwayRecord", async () => {
    const nanCash = calculateRunway(Number.NaN, 10000)
    expect(nanCash.runwayMonths).toBe(0)
    expect(nanCash.healthColor).toBe("coral")

    const nanBurn = calculateRunway(100000, Number.NaN)
    expect(nanBurn.runwayMonths).toBe(999)
    expect(nanBurn.healthColor).toBe("emerald")

    const runwayFile = path.join(tmpDir, "records", "finances", "runway.yaml")
    await fs.mkdir(path.dirname(runwayFile), { recursive: true })
    await fs.writeFile(
      runwayFile,
      `schema_version: 1
cash_balance: "$150,000"
monthly_burn: "15,000"
currency: USD
realized_savings_monthly: "$500"`
    )

    const loaded = await readRunwayRecord(tmpDir)
    expect(loaded.cashBalance).toBe(150000)
    expect(loaded.monthlyBurn).toBe(15000)
    expect(loaded.runwayMonths).toBe(10)
    expect(loaded.realizedSavingsMonthly).toBe(500)
    expect(loaded.realizedSavingsAnnual).toBe(6000)
  })
})
