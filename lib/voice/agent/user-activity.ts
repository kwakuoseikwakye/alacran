import type { SessionEvent } from "./session"

/**
 * Only the user keeps a call alive. The agent re-prompts a silent user ("are you still there?"),
 * which produces agent messages and mode events, so those must not reset the silence timer.
 */
export function isUserActivity(event: SessionEvent): boolean {
  return (event.type === "message" && event.role === "user") || (event.type === "tool" && event.phase === "start")
}
