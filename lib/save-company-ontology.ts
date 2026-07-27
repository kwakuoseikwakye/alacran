"use server"

import { saveCompanyOntologyImpl } from "./save-company-ontology-impl"
import type { CompanyOntologyAnswers } from "./build-company-ontology"

export async function saveCompanyOntology(
  agentId: string,
  answers: CompanyOntologyAnswers
): Promise<{ ok: true } | { ok: false; message: string }> {
  return saveCompanyOntologyImpl(agentId, answers)
}
