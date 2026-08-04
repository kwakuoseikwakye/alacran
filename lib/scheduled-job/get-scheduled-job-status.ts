"use server"

import { checkLaunchdJob } from "../adapters/launchd"
import type { LaunchdHealth } from "../adapters/launchd"
import { PIPELINE_LAUNCHD_LABEL } from "../config"

export async function getScheduledJobStatus(): Promise<LaunchdHealth> {
  return checkLaunchdJob(PIPELINE_LAUNCHD_LABEL)
}
