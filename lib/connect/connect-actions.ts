"use server"

import { getConnectStatusImpl } from "./connect-status-impl"
import { clearExecMemo } from "../exec-memo"
import type { ConnectStatus } from "./connect-status-impl"

export async function getConnectStatus(): Promise<ConnectStatus> {
  return getConnectStatusImpl()
}

/**
 * What the Re-check button calls. Same status, but it first drops the probe
 * memo so the underlying `which`/`gog auth`/`gh` calls really run again —
 * "the user just changed something in their terminal" is the one moment a
 * cached answer is the wrong answer.
 *
 * Separate action rather than a `force` parameter on getConnectStatus, per the
 * zero-extra-parameter Server Action rule (same shape as v51's
 * checkForUpdatesNow next to the throttled banner check).
 */
export async function recheckConnectStatus(): Promise<ConnectStatus> {
  clearExecMemo()
  return getConnectStatusImpl()
}
