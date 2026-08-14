"use server"

import { installRepairImpl, type RepairResult } from "./install-repair-impl"
import type { InstallableId } from "./install-tool-impl"

/**
 * Ask Claude Code to fix a failed install. Only ever reached from a button
 * the user pressed after seeing the failure — never automatically, and never
 * as the first attempt.
 */
export async function installRepair(id: InstallableId, failureLog: string): Promise<RepairResult> {
  return installRepairImpl(id, failureLog)
}
