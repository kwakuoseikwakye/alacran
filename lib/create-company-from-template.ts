"use server"

import path from "node:path"
import { createCompanyFromTemplateImpl } from "./create-company-from-template-impl"
import type { RegisteredCompany } from "./companies-registry"

const BUNDLED_TEMPLATE_PATH = path.join(process.cwd(), "templates", "company-starter")

export async function createCompanyFromTemplate(
  name: string,
  rootPath: string
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  return createCompanyFromTemplateImpl(name, rootPath, BUNDLED_TEMPLATE_PATH)
}
