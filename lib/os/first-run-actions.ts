"use server"

import { dismissFirstRunGuideImpl } from "./first-run-impl"

export async function dismissFirstRunGuide(agentId: string): Promise<{ ok: boolean }> {
  return dismissFirstRunGuideImpl(agentId)
}
