"use server"

import { discardOwnedChangesImpl } from "./discard-owned-changes-impl"

export async function discardOwnedChanges(
  commandId: string,
  agentId: string,
  expectedOwned?: { path: string; newText: string }[]
): Promise<{ discarded: boolean; message: string }> {
  return discardOwnedChangesImpl(commandId, agentId, undefined, undefined, expectedOwned)
}
