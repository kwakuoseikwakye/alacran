import { parse, stringify } from "yaml"

export type Stakeholder = { role: string; position: string }

export type CompanyOntologyAnswers = {
  domain: string
  employeeCount?: number
  stakeholders: Stakeholder[]
  valueFlow: { input: string; transform: string; output: string }
  bottleneck: string
}

export function buildCompanyOntology(
  companyName: string,
  answers: CompanyOntologyAnswers,
  ontologyStarterYamlContent: string,
  todayDate: string = new Date().toISOString().slice(0, 10)
): string {
  const template = parse(ontologyStarterYamlContent) as {
    customer?: unknown
    org?: unknown
    product?: unknown
  }

  const companySummary: Record<string, unknown> = {
    name: companyName,
    domain: answers.domain,
  }
  if (answers.employeeCount !== undefined) {
    companySummary.employee_count = answers.employeeCount
  }
  companySummary.primary_bottleneck = answers.bottleneck

  const output = {
    version: 1,
    schema_version: `${todayDate}-company`,
    template_origin: "docs/templates/ontology-starter.yaml",
    status: "draft",
    company_summary: companySummary,
    stakeholders: answers.stakeholders,
    value_flow: answers.valueFlow,
    customer: template.customer,
    org: template.org,
    product: template.product,
  }

  return stringify(output)
}
