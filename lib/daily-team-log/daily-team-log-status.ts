"use server"

import { checkLockStatus } from "../file-lock"
import { DAILY_TEAM_LOG_LOCK_PATH } from "./paths"

export async function getDailyTeamLogStatus(): Promise<{ running: boolean }> {
  return checkLockStatus(DAILY_TEAM_LOG_LOCK_PATH)
}
