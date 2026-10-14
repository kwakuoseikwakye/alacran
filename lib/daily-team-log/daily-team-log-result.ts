"use server"

import { getDailyTeamLogResultImpl } from "./daily-team-log-result-impl"
import type { DailyTeamLogResult } from "./daily-team-log-result-impl"
import { DAILY_TEAM_LOG_LOG_PATH } from "./paths"

export async function getDailyTeamLogResult(): Promise<DailyTeamLogResult> {
  return getDailyTeamLogResultImpl(DAILY_TEAM_LOG_LOG_PATH)
}
