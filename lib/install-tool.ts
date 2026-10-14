"use server"

import { installToolImpl, type InstallableId, type InstallResult } from "./install-tool-impl"

/**
 * Install one of the tools this app depends on, from a button.
 *
 * Public boundary takes only the tool id — the `execFn`/`platform` seams live
 * on the impl, per the zero-extra-parameter Server Action rule.
 */
export async function installTool(id: InstallableId): Promise<InstallResult> {
  return installToolImpl(id)
}
