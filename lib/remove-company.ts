"use server"

import { removeCompanyImpl } from "./companies-registry"

export async function removeCompany(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  return removeCompanyImpl(id)
}
