"use server"

import path from "node:path"
import { addCompanyPackImpl } from "./add-company-pack"

const PACKS_ROOT = path.join(process.cwd(), "templates", "packs")

export async function addCompanyPack(
  agentId: string,
  packId: string
): Promise<{ ok: true; added: string[] } | { ok: false; message: string }> {
  return addCompanyPackImpl(agentId, packId, PACKS_ROOT)
}
