import { describe, it, expect } from "vitest"
import { buildCompanyOntology } from "./build-company-ontology"
import { parseCompanyOntology } from "./parse-company-ontology"
import type { CompanyOntologyAnswers } from "./build-company-ontology"

const TEMPLATE = "customer:\n  domain: customer\norg:\n  domain: org\nproduct:\n  domain: product\n"

const ANSWERS: CompanyOntologyAnswers = {
  domain: "We help small shops manage inventory.",
  employeeCount: 3,
  stakeholders: [
    { role: "Shop owner", position: "Pays for the service" },
    { role: "Supplier", position: "Provides stock" },
  ],
  valueFlow: { input: "Sales data", transform: "Forecast restocking needs", output: "Reorder alerts" },
  bottleneck: "Manually checking stock levels every morning.",
}

describe("parseCompanyOntology", () => {
  it("round-trips everything buildCompanyOntology writes", () => {
    const yaml = buildCompanyOntology("Acme Co", ANSWERS, TEMPLATE)
    const parsed = parseCompanyOntology(yaml)
    expect(parsed).toEqual({ ok: true, answers: ANSWERS })
  })

  it("round-trips a company with no employeeCount", () => {
    const { employeeCount: _employeeCount, ...withoutCount } = ANSWERS
    const yaml = buildCompanyOntology("Acme Co", withoutCount, TEMPLATE)
    const parsed = parseCompanyOntology(yaml)
    expect(parsed).toEqual({ ok: true, answers: withoutCount })
  })

  it("returns ok:false for malformed YAML", () => {
    const parsed = parseCompanyOntology("not: [valid: yaml: at all")
    expect(parsed.ok).toBe(false)
  })

  it("returns ok:false when the expected shape is missing", () => {
    const parsed = parseCompanyOntology("version: 1\nsome_other_field: true\n")
    expect(parsed.ok).toBe(false)
  })

  it("tolerates a hand-edited file missing optional stakeholders/value_flow", () => {
    const yaml = "company_summary:\n  domain: A bakery\n  primary_bottleneck: Ovens are slow\n"
    const parsed = parseCompanyOntology(yaml)
    expect(parsed).toEqual({
      ok: true,
      answers: {
        domain: "A bakery",
        employeeCount: undefined,
        stakeholders: [],
        valueFlow: { input: "", transform: "", output: "" },
        bottleneck: "Ovens are slow",
      },
    })
  })
})
