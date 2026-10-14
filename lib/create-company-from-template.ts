"use server"

import path from "node:path"
import { createCompanyFromTemplateImpl } from "./create-company-from-template-impl"
import type { RegisteredCompany } from "./companies-registry"
import { getCompanyStarterPack, DEFAULT_COMPANY_STARTER_PACK_ID } from "./company-starter-packs"
import { resolveTemplatesDir, validateCompanyPath } from "./template-paths"

export async function createCompanyFromTemplate(
  name: string,
  rootPath: string,
  packId: string = DEFAULT_COMPANY_STARTER_PACK_ID
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  const pathValidation = validateCompanyPath(rootPath)
  if (!pathValidation.ok) {
    return { ok: false, message: pathValidation.error }
  }

  let templatesDir: string
  try {
    templatesDir = resolveTemplatesDir()
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }

  const BUNDLED_TEMPLATE_PATH = path.join(templatesDir, "company-starter")
  const PACKS_ROOT = path.join(templatesDir, "packs")

  const pack = getCompanyStarterPack(packId)
  const packSourcePath = pack.dirName ? path.join(PACKS_ROOT, pack.dirName) : undefined
  return createCompanyFromTemplateImpl(name, pathValidation.normalizedPath, BUNDLED_TEMPLATE_PATH, packSourcePath)
}
