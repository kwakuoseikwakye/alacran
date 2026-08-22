"use server"

import { openChromeAccountCheckImpl, setupGoogleImpl, type SetupGoogleResult } from "./setup-google-impl"
import { CLAUDE_EXTENSION_PAGE } from "./chrome-profiles"
import { readClaudeAuthStatus } from "./claude-auth-status"

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

/**
 * Opens claude.ai/chrome in the SAME Chrome profile the setup will use, and
 * reports which Claude account that extension has to be signed in as.
 *
 * This is the link in the chain nothing could check and nobody had written
 * down: the extension pairs by Claude ACCOUNT, so a profile with the extension
 * installed but signed in as a different Claude account reports no connected
 * browser at all — which is exactly what a failed run showed.
 */
export async function openChromePairing(
  email: string
): Promise<{ opened: boolean; profile: string | null; claudeAccount: string | null }> {
  const [{ opened, profile }, auth] = await Promise.all([
    openChromeAccountCheckImpl(email, undefined, undefined, undefined, CLAUDE_EXTENSION_PAGE),
    readClaudeAuthStatus(),
  ])
  return { opened, profile, claudeAccount: auth.loggedIn ? (auth.email ?? null) : null }
}
