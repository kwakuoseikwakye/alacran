"use server"

import { applySessionFactsImpl } from "./apply-session-facts-impl"

export async function applySessionFacts(agentId: string, note: string, lines: string[]): Promise<{ started: boolean; message: string }> {
  return applySessionFactsImpl(agentId, note, lines)
}
