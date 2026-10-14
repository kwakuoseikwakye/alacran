"use server"

import { registerCompanyImpl } from "./companies-registry"
import type { RegisteredCompany } from "./companies-registry"

export async function registerCompany(
  name: string,
  rootPath: string,
  external = false
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  // `external` is a real domain choice (what this folder IS), not an injectable
  // seam, so it belongs on the public action — registryPath still does not.
  return registerCompanyImpl(name, rootPath, undefined, external ? "external" : undefined)
}
