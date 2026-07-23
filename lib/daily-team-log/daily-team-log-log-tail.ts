"use server"

import { readFile } from "node:fs/promises"
import { DAILY_TEAM_LOG_LOG_PATH } from "./paths"
import { tailLines } from "../log-tail"

const MAX_TAIL_LINES = 200

export async function getDailyTeamLogLogTail(): Promise<{ tail: string }> {
  try {
    const content = await readFile(DAILY_TEAM_LOG_LOG_PATH, "utf-8")
    return { tail: tailLines(content.replace(/\n$/, ""), MAX_TAIL_LINES) }
  } catch {
    return { tail: "" }
  }
}
