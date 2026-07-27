"use server"

import { createCompanyFromTemplateImpl } from "./create-company-from-template-impl"
import type { RegisteredCompany } from "./companies-registry"
import { AGENTS } from "./config"

export async function createCompanyFromTemplate(
  name: string,
  rootPath: string
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  const templateAgent = AGENTS.find((a) => a.id === "ai-company-starter-main")
  if (!templateAgent) {
    return { ok: false, message: "Template source (ai-company-starter-main) is not configured" }
  }
  return createCompanyFromTemplateImpl(name, rootPath, templateAgent.rootPath)
}
