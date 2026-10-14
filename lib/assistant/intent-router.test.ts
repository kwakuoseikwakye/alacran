import { describe, expect, it } from "vitest"
import { detectFocalCompanies } from "./intent-router"
import type { CompanyContext } from "./gather-all-companies"

const mockContext = (id: string, name: string): CompanyContext => ({
  id,
  name,
  kind: "command-set",
  source: "summary",
  text: "Description",
  truncated: false,
})

describe("detectFocalCompanies", () => {
  const contexts = [
    mockContext("acme", "Acme Bakery Co"),
    mockContext("alacran", "Alacran App"),
    mockContext("beta-corp", "Beta Corporation"),
  ]

  it("identifies a specific company by id or casual name", () => {
    const res1 = detectFocalCompanies("What did we decide in Acme?", contexts)
    expect(res1.focalCompanyIds).toEqual(["acme"])
    expect(res1.isBroadQuery).toBe(false)

    const res2 = detectFocalCompanies("Show me Alacran's latest progress", contexts)
    expect(res2.focalCompanyIds).toEqual(["alacran"])
    expect(res2.isBroadQuery).toBe(false)
  })

  it("identifies multiple specific companies when asked comparatively", () => {
    const res = detectFocalCompanies("Compare Acme and Beta Corp tech stacks", contexts)
    expect(res.focalCompanyIds).toContain("acme")
    expect(res.focalCompanyIds).toContain("beta-corp")
  })

  it("classifies broad queries across all companies correctly", () => {
    const res1 = detectFocalCompanies("What ran overnight across all companies?", contexts)
    expect(res1.isBroadQuery).toBe(true)

    const res2 = detectFocalCompanies("Give me a morning briefing", contexts)
    expect(res2.isBroadQuery).toBe(true)

    const res3 = detectFocalCompanies("Which company has pending reviews?", contexts)
    expect(res3.isBroadQuery).toBe(true)
  })

  it("defaults to broad query on generic questions without company names", () => {
    const res = detectFocalCompanies("What are we building next?", contexts)
    expect(res.focalCompanyIds).toEqual([])
    expect(res.isBroadQuery).toBe(true)
  })

  it("handles empty questions gracefully", () => {
    const res = detectFocalCompanies("", contexts)
    expect(res.focalCompanyIds).toEqual([])
    expect(res.isBroadQuery).toBe(true)
  })
})
