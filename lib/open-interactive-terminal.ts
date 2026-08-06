"use server"

import { openInteractiveTerminalImpl, type OpenTerminalResult } from "./open-interactive-terminal-impl"

export async function openInteractiveTerminal(agentId: string): Promise<OpenTerminalResult> {
  return openInteractiveTerminalImpl(agentId)
}
