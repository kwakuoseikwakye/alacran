"use server"

import {
  beginOutlookSignIn,
  ensureOutlookLauncher,
  pollOutlookSignIn,
  signOutOutlook,
  type SignInPoll,
  type SignInStart,
} from "./outlook"
import { clearExecMemo } from "../exec-memo"

/**
 * Sign-in for Outlook, driven from the Connected tools page. Each returns a
 * plain result rather than throwing: a thrown error in a server action reaches
 * the page as Next's redacted production digest, which says nothing a person
 * can act on.
 */

/** Starts a sign-in. The launcher is put on the PATH here, so by the time the
 *  person is connected every AI can already run `alacran-outlook`. */
export async function startOutlookSignIn(): Promise<SignInStart> {
  await ensureOutlookLauncher()
  return beginOutlookSignIn()
}

export async function checkOutlookSignIn(deviceCode: string): Promise<SignInPoll> {
  const result = await pollOutlookSignIn(deviceCode)
  if (result.status === "ok") clearExecMemo()
  return result
}

export async function disconnectOutlook(): Promise<{ ok: boolean }> {
  const ok = await signOutOutlook()
  clearExecMemo()
  return { ok }
}
