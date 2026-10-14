"use server"

import { saveGoogleAccountsImpl } from "./save-google-accounts-impl"

export async function saveGoogleAccounts(
  agentId: string,
  accounts: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  return saveGoogleAccountsImpl(agentId, accounts)
}
