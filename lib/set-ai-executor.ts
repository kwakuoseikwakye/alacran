"use server"

import { setAiExecutorImpl } from "./ai-executor-registry"

export async function setAiExecutor(
  agentId: string,
  executorId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  return setAiExecutorImpl(agentId, executorId)
}
