import type { SessionSummary } from "./sessions"

/** Delegation types into the owner's agent, never a command line: only `ai` sessions qualify, the newest wins. */
export function pickLiveAiSession(sessions: SessionSummary[]): SessionSummary | undefined {
  return sessions.filter((s) => s.kind === "ai").sort((a, b) => b.startedAt - a.startedAt)[0]
}
