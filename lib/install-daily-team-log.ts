"use server"

import { installDailyTeamLogImpl } from "./install-daily-team-log-impl"

export async function installDailyTeamLog(
  agentId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  return installDailyTeamLogImpl(agentId)
}
