import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { COMPANY_COMMANDS_DATA_DIR } from "../company-commands/paths"
import { dismissFirstRun } from "./first-run-state"

/**
 * The directory is built from the REGISTERED company's own id, never from the
 * string the caller sent, so a crafted id cannot point the write elsewhere.
 * Never throws: a bare re-export from a server action would turn any throw
 * into Next's redacted production digest.
 */
export async function dismissFirstRunGuideImpl(
  agentId: string,
  dataRoot: string = COMPANY_COMMANDS_DATA_DIR
): Promise<{ ok: boolean }> {
  try {
    const agent = (await getEffectiveAgents()).find((candidate) => candidate.id === agentId)
    if (!agent) return { ok: false }
    await dismissFirstRun(path.join(dataRoot, agent.id))
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
