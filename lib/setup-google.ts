"use server"

import { setupGoogleImpl, type SetupGoogleResult } from "./setup-google-impl"

/** Public boundary takes only the address to connect; the spawn/exec/platform
 *  seams stay on the impl, per the zero-extra-parameter Server Action rule. */
export async function setupGoogle(email: string): Promise<SetupGoogleResult> {
  return setupGoogleImpl(email)
}
