import { parse } from "yaml"
import type { CompanyOntologyAnswers, Stakeholder } from "./build-company-ontology"

export type ParseCompanyOntologyResult =
  | { ok: true; answers: CompanyOntologyAnswers }
  | { ok: false; message: string }

/**
 * The reverse of buildCompanyOntology — reads a saved company.yaml back into
 * wizard-editable answers, so the setup wizard can double as an editor.
 * Tolerant of a hand-edited file missing stakeholders/value_flow: those
 * fields degrade to their wizard-empty defaults rather than failing outright,
 * since a human editing the YAML directly shouldn't brick the in-app editor.
 */
export function parseCompanyOntology(yamlContent: string): ParseCompanyOntologyResult {
  let doc: unknown
  try {
    doc = parse(yamlContent)
  } catch {
    return { ok: false, message: "Could not parse company.yaml as YAML" }
  }

  if (typeof doc !== "object" || doc === null) {
    return { ok: false, message: "company.yaml is not a valid ontology document" }
  }

  const record = doc as Record<string, unknown>
  const summary = record.company_summary
  if (typeof summary !== "object" || summary === null) {
    return { ok: false, message: "company.yaml has no company_summary section" }
  }
  const summaryRecord = summary as Record<string, unknown>

  const domain = typeof summaryRecord.domain === "string" ? summaryRecord.domain : ""
  const employeeCount = typeof summaryRecord.employee_count === "number" ? summaryRecord.employee_count : undefined
  const bottleneck = typeof summaryRecord.primary_bottleneck === "string" ? summaryRecord.primary_bottleneck : ""

  const stakeholders: Stakeholder[] = Array.isArray(record.stakeholders)
    ? record.stakeholders
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => ({
          role: typeof s.role === "string" ? s.role : "",
          position: typeof s.position === "string" ? s.position : "",
        }))
    : []

  const rawValueFlow = record.value_flow
  const valueFlowRecord =
    typeof rawValueFlow === "object" && rawValueFlow !== null ? (rawValueFlow as Record<string, unknown>) : {}
  const valueFlow = {
    input: typeof valueFlowRecord.input === "string" ? valueFlowRecord.input : "",
    transform: typeof valueFlowRecord.transform === "string" ? valueFlowRecord.transform : "",
    output: typeof valueFlowRecord.output === "string" ? valueFlowRecord.output : "",
  }

  return {
    ok: true,
    answers: { domain, employeeCount, stakeholders, valueFlow, bottleneck },
  }
}
