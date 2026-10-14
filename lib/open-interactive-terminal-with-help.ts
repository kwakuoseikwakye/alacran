"use server"

import { openInteractiveTerminalWithHelpImpl } from "./open-interactive-terminal-with-help-impl"
import type { OpenTerminalResult } from "./open-interactive-terminal-impl"

export async function openInteractiveTerminalWithHelp(agentId: string): Promise<OpenTerminalResult> {
  return openInteractiveTerminalWithHelpImpl(agentId)
}
