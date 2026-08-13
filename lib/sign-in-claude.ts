"use server"

import { signInClaudeImpl, type SignInResult } from "./sign-in-claude-impl"

/**
 * Opens a Terminal running `claude auth login`. Public boundary takes only
 * the email (a real domain parameter); the spawn/exec/platform seams stay on
 * the impl, per the zero-extra-parameter Server Action rule.
 */
export async function signInClaude(email: string): Promise<SignInResult> {
  return signInClaudeImpl(email)
}
