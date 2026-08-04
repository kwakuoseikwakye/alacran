"use server"

import { setScheduledJobImpl } from "./set-scheduled-job-impl"
import type { SetScheduledJobResult } from "./set-scheduled-job-impl"

export async function setScheduledJob(enabled: boolean): Promise<SetScheduledJobResult> {
  return setScheduledJobImpl(enabled)
}
