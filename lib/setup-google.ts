"use server"

import { openChromeAccountCheckImpl, setupGoogleImpl, type SetupGoogleResult } from "./setup-google-impl"

/** Public boundary takes only the address to connect; the spawn/exec/platform
 *  seams stay on the impl, per the zero-extra-parameter Server Action rule. */
export async function setupGoogle(email: string): Promise<SetupGoogleResult> {
  return setupGoogleImpl(email)
}

/** Opens Chrome at Google's account page so the user can confirm which
 *  account they're signed in as before the agent starts. */
export async function openChromeAccountCheck(): Promise<{ opened: boolean }> {
  return openChromeAccountCheckImpl()
}
