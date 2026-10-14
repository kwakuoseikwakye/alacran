"use server"

import { getCompanyOwnershipImpl } from "./get-company-ownership-impl"
import type { CompanyOwnership } from "./get-company-ownership-impl"

export async function getCompanyOwnership(agentId: string): Promise<CompanyOwnership> {
  return getCompanyOwnershipImpl(agentId)
}
