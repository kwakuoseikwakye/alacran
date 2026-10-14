"use server"

import { saveCompanyCredentialImpl } from "./save-company-credential-impl"

export async function saveCompanyCredential(agentId: string, key: string, value: string) {
  return saveCompanyCredentialImpl(agentId, key, value)
}
