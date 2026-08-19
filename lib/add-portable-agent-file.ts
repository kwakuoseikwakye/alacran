"use server"

import { addPortableAgentFileImpl } from "./portable-agent-file"

export async function addPortableAgentFile(
  agentId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  return addPortableAgentFileImpl(agentId)
}
