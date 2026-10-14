"use server"

import { getCompanyOntologyImpl } from "./get-company-ontology-impl"
import type { ParseCompanyOntologyResult } from "./parse-company-ontology"

export async function getCompanyOntology(agentId: string): Promise<ParseCompanyOntologyResult> {
  return getCompanyOntologyImpl(agentId)
}
