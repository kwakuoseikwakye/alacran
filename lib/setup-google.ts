"use server"

import { openChromeAccountCheckImpl, setupGoogleImpl, type SetupGoogleResult } from "./setup-google-impl"

/** Public boundary takes only the address to connect; the spawn/exec/platform
 *  seams stay on the impl, per the zero-extra-parameter Server Action rule. */
export async function setupGoogle(email: string, serviceIds: string[]): Promise<SetupGoogleResult> {
  return setupGoogleImpl(email, serviceIds)
}

/** Opens Chrome at Google's account page so the user can confirm which
 *  account they're signed in as before the agent starts — in the PROFILE
 *  signed in as `email`, where this machine has one. A machine with several
 *  profiles otherwise shows whichever Chrome used last, which is an account
 *  the user never asked about. */
export async function openChromeAccountCheck(email: string): Promise<{ opened: boolean; profile: string | null }> {
  return openChromeAccountCheckImpl(email)
}
