"use server"

import path from "node:path"
import { createCompanyFromTemplateImpl } from "./create-company-from-template-impl"
import type { RegisteredCompany } from "./companies-registry"
import { getCompanyStarterPack, DEFAULT_COMPANY_STARTER_PACK_ID } from "./company-starter-packs"

const BUNDLED_TEMPLATE_PATH = path.join(process.cwd(), "templates", "company-starter")
const PACKS_ROOT = path.join(process.cwd(), "templates", "packs")

export async function createCompanyFromTemplate(
  name: string,
  rootPath: string,
  packId: string = DEFAULT_COMPANY_STARTER_PACK_ID
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  const pack = getCompanyStarterPack(packId)
  const packSourcePath = pack.dirName ? path.join(PACKS_ROOT, pack.dirName) : undefined
  return createCompanyFromTemplateImpl(name, rootPath, BUNDLED_TEMPLATE_PATH, packSourcePath)
}
