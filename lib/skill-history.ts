"use server"

import { getSkillHistoryImpl, getSkillRevisionImpl } from "./skill-history-impl"
import type { SkillHistoryResult, SkillRevisionResult } from "./skill-history-impl"

export async function getSkillHistory(filePath: string): Promise<SkillHistoryResult> {
  return getSkillHistoryImpl(filePath)
}

export async function getSkillRevision(filePath: string, sha: string): Promise<SkillRevisionResult> {
  return getSkillRevisionImpl(filePath, sha)
}
