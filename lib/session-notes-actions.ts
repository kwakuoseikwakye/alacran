"use server"

import { getSessionNotesForAgent, setSessionNotesImpl } from "./session-notes-registry"
import { getSessionNoteStatus, type SessionNoteStatus } from "./terminal/session-note-status"

export async function getSessionNotes(agentId: string): Promise<boolean> {
  return getSessionNotesForAgent(agentId)
}

export async function setSessionNotes(
  agentId: string,
  autoWrite: boolean
): Promise<{ ok: true } | { ok: false; message: string }> {
  return setSessionNotesImpl(agentId, autoWrite)
}

/** What happened last time this company tried, or null if it never has. Read
 *  by the toggle so an unattended failure has somewhere to appear. */
export async function getLastSessionNoteOutcome(agentId: string): Promise<SessionNoteStatus | null> {
  return getSessionNoteStatus(agentId)
}
