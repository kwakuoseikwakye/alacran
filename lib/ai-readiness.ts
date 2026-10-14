"use server"

import { aiExecutorStatusesImpl } from "@/lib/connect/connect-status-impl"
import { readinessMap, type Readiness } from "@/lib/executor-readiness"

/** Loaded when Home's AI menu opens, not on every Home render: each status is a
 *  CLI probe, and a force-dynamic page would pay for five of them per visit.
 *  A failed probe answers with nothing rather than a redacted server error. */
export async function getAiReadiness(): Promise<Record<string, Readiness>> {
  try {
    return readinessMap(await aiExecutorStatusesImpl())
  } catch {
    return {}
  }
}
