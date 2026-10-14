"use server"

import { saveCompanyInboxImpl } from "./save-company-inbox-impl"

export async function saveCompanyInbox(
  agentId: string,
  slot: number | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  return saveCompanyInboxImpl(agentId, slot)
}
