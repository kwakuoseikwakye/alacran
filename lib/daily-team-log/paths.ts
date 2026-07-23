import path from "node:path"

export const DAILY_TEAM_LOG_DATA_DIR = path.join(process.cwd(), ".data", "daily-team-log")
export const DAILY_TEAM_LOG_LOCK_PATH = path.join(DAILY_TEAM_LOG_DATA_DIR, "run.lock")
export const DAILY_TEAM_LOG_LOG_PATH = path.join(DAILY_TEAM_LOG_DATA_DIR, "run.log")
