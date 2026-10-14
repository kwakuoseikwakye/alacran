"use server"

import { setVisibleRunImpl } from "./visible-run-registry"

export async function setVisibleRun(
  agentId: string,
  runVisibly: boolean
): Promise<{ ok: true } | { ok: false; message: string }> {
  return setVisibleRunImpl(agentId, runVisibly)
}
