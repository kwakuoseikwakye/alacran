"use server"

import { checkLaunchdJob } from "../adapters/launchd"
import type { LaunchdHealth } from "../adapters/launchd"
import { TAKESHI_AGENT_LAUNCHD_LABEL } from "../config"

export async function getScheduledJobStatus(): Promise<LaunchdHealth> {
  return checkLaunchdJob(TAKESHI_AGENT_LAUNCHD_LABEL)
}
