import { describe, it, expect } from "vitest"
import { exportProspectsToCsv, exportProspectsToTsv } from "./export-leads"
import type { Prospect } from "./prospects"

const mockProspect: Prospect = {
  id: "lead-1",
  fileName: "2026-09-27-acme.md",
  relativePath: "notes/funnel/prospects/2026-09-27-acme.md",
  state: "ready",
  name: "Jane Doe",
  role: "CTO",
  company: "Acme, Inc.",
  url: "https://acme.com",
  fitScore: 90,
  fitLevel: "high",
  estimatedValue: 10000,
  rationale: "Good fit",
  painPoints: "Slow sync",
  pitch: "Check out our solution",
  status: "approved",
  created: "2026-09-27",
  updated: "2026-09-27",
  problems: [],
}

describe("exportProspects", () => {
  it("exports correctly quoted CSV", () => {
    const csv = exportProspectsToCsv([mockProspect])
    expect(csv).toContain("Company,Contact Name,Role,Website,Fit Score,Value (USD),Status")
    expect(csv).toContain('"Acme, Inc.",Jane Doe,CTO,https://acme.com,90,10000,approved')
  })

  it("exports tab-separated TSV for clipboard pasting", () => {
    const tsv = exportProspectsToTsv([mockProspect])
    expect(tsv).toContain("Acme, Inc.\tJane Doe\tCTO\thttps://acme.com\t90\t10000\tapproved")
  })

  it("handles double quotes and newlines in CSV cells", () => {
    const prospectWithQuotes: Prospect = {
      ...mockProspect,
      company: 'Acme "Global" Inc.',
      name: "Jane\nDoe",
    }
    const csv = exportProspectsToCsv([prospectWithQuotes])
    expect(csv).toContain('"Acme ""Global"" Inc.","Jane\nDoe",CTO,https://acme.com,90,10000,approved')
  })

  it("sanitizes tabs and newlines in TSV rows", () => {
    const prospectWithTabs: Prospect = {
      ...mockProspect,
      company: "Acme\tCorp\nLLC",
      role: "VP\tEngineering",
    }
    const tsv = exportProspectsToTsv([prospectWithTabs])
    expect(tsv).toContain("Acme Corp LLC\tJane Doe\tVP Engineering\thttps://acme.com\t90\t10000\tapproved")
  })

  it("exports headers only when list is empty", () => {
    const csv = exportProspectsToCsv([])
    expect(csv).toBe("Company,Contact Name,Role,Website,Fit Score,Value (USD),Status")

    const tsv = exportProspectsToTsv([])
    expect(tsv).toBe("Company\tContact Name\tRole\tWebsite\tFit Score\tValue (USD)\tStatus")
  })

  it("neutralizes CSV formula injection payloads with a leading single quote", () => {
    const maliciousProspect: Prospect = {
      ...mockProspect,
      company: "=cmd|' /C calc'!A0",
      name: "@SUM(A1:B1)",
      role: "+1234",
      url: "-dangerousUrl",
      status: "\tscript",
    }
    const csv = exportProspectsToCsv([maliciousProspect])
    expect(csv).toContain("'=cmd|' /C calc'!A0")
    expect(csv).toContain("'@SUM(A1:B1)")
    expect(csv).toContain("'+1234")
    expect(csv).toContain("'-dangerousUrl")
    expect(csv).toContain("'\tscript")
  })

  it("quotes neutralized formula injection payloads that contain commas or newlines", () => {
    const maliciousProspectWithComma: Prospect = {
      ...mockProspect,
      company: "=SUM(A1, B1)",
    }
    const csv = exportProspectsToCsv([maliciousProspectWithComma])
    expect(csv).toContain("\"'=SUM(A1, B1)\"")
  })
})

