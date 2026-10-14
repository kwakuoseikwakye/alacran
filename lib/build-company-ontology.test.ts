import { describe, it, expect } from "vitest"
import { parse } from "yaml"
import { readFileSync } from "node:fs"
import path from "node:path"
import { buildCompanyOntology } from "./build-company-ontology"
import type { CompanyOntologyAnswers } from "./build-company-ontology"

const FIXTURE_TEMPLATE = `
version: 1
schema_version: "template"
customer:
  domain: customer
  entities:
    - id: customer.account
      type: account
org:
  domain: org
  entities: []
product:
  domain: product
  entities: []
`

function baseAnswers(): CompanyOntologyAnswers {
  return {
    domain: "We help small shops manage inventory.",
    employeeCount: 3,
    stakeholders: [{ role: "Shop owner", position: "Pays for the service" }],
    valueFlow: { input: "Sales data", transform: "Forecast restocking needs", output: "Reorder alerts" },
    bottleneck: "Manually checking stock levels every morning.",
  }
}

describe("buildCompanyOntology", () => {
  it("produces valid, parseable YAML with the expected structure", () => {
    const yamlText = buildCompanyOntology("Second Co", baseAnswers(), FIXTURE_TEMPLATE, "2026-07-27")
    const parsed = parse(yamlText)

    expect(parsed.version).toBe(1)
    expect(parsed.schema_version).toBe("2026-07-27-company")
    expect(parsed.template_origin).toBe("docs/templates/ontology-starter.yaml")
    expect(parsed.status).toBe("draft")
    expect(parsed.company_summary).toEqual({
      name: "Second Co",
      domain: "We help small shops manage inventory.",
      employee_count: 3,
      primary_bottleneck: "Manually checking stock levels every morning.",
    })
    expect(parsed.stakeholders).toEqual([{ role: "Shop owner", position: "Pays for the service" }])
    expect(parsed.value_flow).toEqual({
      input: "Sales data",
      transform: "Forecast restocking needs",
      output: "Reorder alerts",
    })
  })

  it("copies customer/org/product from the template verbatim", () => {
    const yamlText = buildCompanyOntology("Second Co", baseAnswers(), FIXTURE_TEMPLATE, "2026-07-27")
    const parsed = parse(yamlText)

    expect(parsed.customer).toEqual({ domain: "customer", entities: [{ id: "customer.account", type: "account" }] })
    expect(parsed.org).toEqual({ domain: "org", entities: [] })
    expect(parsed.product).toEqual({ domain: "product", entities: [] })
  })

  it("omits employee_count entirely when not provided", () => {
    const answers = { ...baseAnswers(), employeeCount: undefined }
    const yamlText = buildCompanyOntology("Second Co", answers, FIXTURE_TEMPLATE, "2026-07-27")
    const parsed = parse(yamlText)

    expect(parsed.company_summary.employee_count).toBeUndefined()
    expect("employee_count" in parsed.company_summary).toBe(false)
  })

  it("handles multiple stakeholders", () => {
    const answers = {
      ...baseAnswers(),
      stakeholders: [
        { role: "Shop owner", position: "Pays for the service" },
        { role: "Warehouse staff", position: "Executes reorders" },
      ],
    }
    const yamlText = buildCompanyOntology("Second Co", answers, FIXTURE_TEMPLATE, "2026-07-27")
    const parsed = parse(yamlText)

    expect(parsed.stakeholders).toHaveLength(2)
    expect(parsed.stakeholders[1]).toEqual({ role: "Warehouse staff", position: "Executes reorders" })
  })

  it("round-trips free text containing YAML-special characters correctly", () => {
    const answers = {
      ...baseAnswers(),
      domain: `We handle "urgent" requests: same-day, when needed.`,
    }
    const yamlText = buildCompanyOntology("Second Co", answers, FIXTURE_TEMPLATE, "2026-07-27")
    const parsed = parse(yamlText)

    expect(parsed.company_summary.domain).toBe(`We handle "urgent" requests: same-day, when needed.`)
  })
})

/**
 * The bundled template is a hard dependency of saveCompanyOntologyImpl, not a
 * doc: buildCompanyOntology PARSES it. v67 rewrote it with `<<TODO: hint>>`
 * placeholders, and a `: ` inside an unquoted scalar is a nested mapping to
 * YAML — so every company scaffolded from it could never finish setup, while
 * every test here stayed green against a synthetic template string.
 *
 * This reads the REAL file, which is the only thing that catches that drift
 * (the same rule v56 established for TEMPLATE_MANIFEST).
 */
describe("the real bundled ontology-starter.yaml", () => {
  const bundled = path.join(process.cwd(), "templates", "company-starter", "docs", "templates", "ontology-starter.yaml")

  it("is valid YAML, so the setup wizard can build from it", () => {
    expect(() => parse(readFileSync(bundled, "utf-8"))).not.toThrow()
  })

  it("carries the three domains buildCompanyOntology copies through", () => {
    const result = parse(readFileSync(bundled, "utf-8")) as Record<string, unknown>
    expect(result.customer).toBeTruthy()
    expect(result.org).toBeTruthy()
    expect(result.product).toBeTruthy()
  })

  it("survives a whole real save, placeholders intact and re-readable", () => {
    const yaml = buildCompanyOntology(
      "Repro Co",
      {
        domain: "We triage inbound issues.",
        stakeholders: [{ role: "Maintainer", position: "Runs the repos" }],
        valueFlow: { input: "an issue", transform: "triage", output: "a briefing" },
        bottleneck: "Deciding which repo an issue belongs to.",
      },
      readFileSync(bundled, "utf-8"),
      "2026-08-21"
    )
    // The output must itself be parseable — it is what every reader in the app,
    // and parseCompanyOntology's edit round-trip, loads next.
    const round = parse(yaml) as Record<string, unknown>
    expect(round.company_summary).toMatchObject({ name: "Repro Co" })
    // A placeholder must come through as the STRING it is, never as the nested
    // mapping YAML would make of `<<TODO: hint>>` left unquoted.
    const segments = (round.customer as { segments: { id: unknown }[] }).segments
    expect(typeof segments[0].id).toBe("string")
  })
})
