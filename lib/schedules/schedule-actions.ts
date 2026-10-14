"use server"

import { getScheduleStatusImpl, setScheduleImpl } from "./schedules-impl"
import type { LastRun } from "./schedules-impl"

export async function getScheduleStatus(
  agentId: string,
  commandId: string
): Promise<{ time: string | null; autoCommit: boolean; lastRun: LastRun | null }> {
  return getScheduleStatusImpl(agentId, commandId)
}

export async function setSchedule(
  agentId: string,
  commandId: string,
  time: string | null,
  autoCommit: boolean
): Promise<{ saved: boolean; message: string }> {
  return setScheduleImpl(agentId, commandId, time, autoCommit)
}
