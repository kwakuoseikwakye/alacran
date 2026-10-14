/** The owner pays ElevenLabs by the minute, so a call that nobody is using must end by itself. */
/**
 * "Silence" means: no message or typed input from the user, and no tool lookup started, for this long.
 * The agent talking (including "are you still there?") does not count as activity.
 */
export const SILENCE_LIMIT_MS = 120_000
export const DEFAULT_MAX_CALL_MINUTES = 10

export function callShouldEnd(i: {
  startedAt: number
  lastActivityAt: number
  now: number
  maxMinutes: number
}): "silence" | "max-length" | null {
  if (i.now - i.startedAt >= i.maxMinutes * 60_000) return "max-length"
  if (i.now - i.lastActivityAt >= SILENCE_LIMIT_MS) return "silence"
  return null
}
