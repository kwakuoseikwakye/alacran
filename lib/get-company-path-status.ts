"use server"

import { getCompanyPathStatusImpl, type CompanyPathStatus } from "./companies-registry"

export async function getCompanyPathStatus(rootPath: string): Promise<CompanyPathStatus> {
  return getCompanyPathStatusImpl(rootPath)
}
