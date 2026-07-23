"use server"

import { saveSkillContentImpl } from "./save-skill-content-impl"

export async function saveSkillContent(
  filePath: string,
  newContent: string,
  customMessage?: string
): Promise<{ saved: boolean; message: string }> {
  return saveSkillContentImpl(filePath, newContent, undefined, customMessage)
}
