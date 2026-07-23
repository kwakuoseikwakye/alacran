"use server"

import { registerCompanyImpl } from "./companies-registry"
import type { RegisteredCompany } from "./companies-registry"

export async function registerCompany(
  name: string,
  rootPath: string
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  return registerCompanyImpl(name, rootPath)
}
