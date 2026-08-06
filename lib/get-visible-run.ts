"use server"

import { getVisibleRunForAgent } from "./visible-run-registry"

export async function getVisibleRun(agentId: string): Promise<boolean> {
  return getVisibleRunForAgent(agentId)
}
