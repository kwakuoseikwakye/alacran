"use server"

import path from "node:path"
import { adoptFolderImpl } from "./adopt-folder-impl"
import type { RegisteredCompany } from "./companies-registry"
import { resolveTemplatesDir, validateCompanyPath } from "./template-paths"

export async function adoptFolder(
  name: string,
  rootPath: string
): Promise<{ ok: true; company: RegisteredCompany; added: string[] } | { ok: false; message: string }> {
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
  return adoptFolderImpl(name, pathValidation.normalizedPath, BUNDLED_TEMPLATE_PATH)
}
