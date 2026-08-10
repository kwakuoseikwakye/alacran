"use server"

import { openInteractiveTerminalImpl, type OpenTerminalResult } from "./open-interactive-terminal-impl"
import { HELP_INTRO_PROMPT } from "./help-intro-prompt"

export async function openInteractiveTerminalWithHelp(agentId: string): Promise<OpenTerminalResult> {
  return openInteractiveTerminalImpl(agentId, undefined, undefined, undefined, undefined, undefined, undefined, HELP_INTRO_PROMPT)
}
