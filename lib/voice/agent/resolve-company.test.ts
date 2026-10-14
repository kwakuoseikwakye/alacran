import { describe, expect, it } from "vitest"
import { resolveCompany } from "./resolve-company"

const companies = [
  { id: "acme", name: "Acme Studio" },
  { id: "beta", name: "Beta Labs" },
]
const ctx = (scope: string) => ({ scope, companies })

describe("resolveCompany", () => {
  it("uses the dock's company when none is named", () => {
    expect(resolveCompany(undefined, ctx("acme"))).toEqual({ ok: true, company: companies[0] })
  })
  it("a named company wins, ignoring case", () => {
    expect(resolveCompany("beta labs", ctx("acme"))).toEqual({ ok: true, company: companies[1] })
  })
  it("a named company that matches nothing lists the names and never falls back to the scope", () => {
    const out = resolveCompany("Beta", ctx("acme"))
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.text).toMatch(/which company/i)
      expect(out.text).toContain("Acme Studio")
      expect(out.text).toContain("Beta Labs")
    }
  })
  it("scope all with no name asks which company", () => {
    expect(resolveCompany("", ctx("all")).ok).toBe(false)
  })
  it("non-string names are treated as not named", () => {
    expect(resolveCompany(42, ctx("acme"))).toEqual({ ok: true, company: companies[0] })
  })
})
