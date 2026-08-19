"use server"

import path from "node:path"
import { adoptFolderImpl } from "./adopt-folder-impl"
import type { RegisteredCompany } from "./companies-registry"

const BUNDLED_TEMPLATE_PATH = path.join(process.cwd(), "templates", "company-starter")

export async function adoptFolder(
  name: string,
  rootPath: string
): Promise<{ ok: true; company: RegisteredCompany; added: string[] } | { ok: false; message: string }> {
  return adoptFolderImpl(name, rootPath, BUNDLED_TEMPLATE_PATH)
}
