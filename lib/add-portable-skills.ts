"use server"

import path from "node:path"
import { addPortableSkillsImpl, previewPortableSkillsImpl } from "./portable-skills"

const PACKS_ROOT = path.join(process.cwd(), "templates", "packs")

export async function addPortableSkills(
  agentId: string
): Promise<{ ok: true; moved: number; kept: string[]; conflicts: string[]; committed: boolean } | { ok: false; message: string }> {
  return addPortableSkillsImpl(agentId, PACKS_ROOT)
}

/** What the move would do, shown in the dialog before anyone agrees to it. Writes nothing. */
export async function previewPortableSkills(
  agentId: string
): Promise<{ ok: true; move: string[]; keep: string[] } | { ok: false; message: string }> {
  return previewPortableSkillsImpl(agentId, PACKS_ROOT)
}
