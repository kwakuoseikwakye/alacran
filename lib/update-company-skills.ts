"use server"

import path from "node:path"
import { updateCompanySkillsImpl } from "./update-company-skills-impl"

const PACKS_ROOT = path.join(process.cwd(), "templates", "packs")

export async function updateCompanySkills(
  agentId: string
): Promise<{ ok: true; tag: string; skipped: string[] } | { ok: false; message: string }> {
  return updateCompanySkillsImpl(agentId, PACKS_ROOT)
}
