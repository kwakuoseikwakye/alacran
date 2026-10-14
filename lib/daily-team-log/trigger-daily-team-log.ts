"use server"

import { triggerDailyTeamLogImpl } from "./trigger-daily-team-log-impl"
import { DAILY_TEAM_LOG_LOCK_PATH, DAILY_TEAM_LOG_LOG_PATH } from "./paths"
import os from "node:os"
import path from "node:path"

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".claude", "daily-team-log", "config.json")

export async function triggerDailyTeamLog(): Promise<{ started: boolean; message: string }> {
  return triggerDailyTeamLogImpl(DEFAULT_CONFIG_PATH, DAILY_TEAM_LOG_LOCK_PATH, DAILY_TEAM_LOG_LOG_PATH)
}
