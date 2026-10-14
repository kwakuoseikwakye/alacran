import type { EndReason } from "./session"

/** What the owner sees when the assistant stops listening by itself. It is an assistant, not a phone: never "call". */
export const END_NOTE: Record<EndReason, string | null> = {
  user: null,
  silence: "I stopped listening after 2 minutes of quiet. Press the mic to talk again.",
  "max-length": "We reached the longest conversation you set. Press the mic to carry on.",
  dropped: "The connection dropped and could not be restored. Your conversation is kept.",
  failed: null,
}

export const WAKE_FAILED = {
  mint: "I couldn't wake up. Check that Alacrán is still running, then try again.",
  start: "I couldn't wake up. Try again.",
}

/**
 * What the owner did while the assistant was still waking up: text they sent and whether the mic should be
 * on. Replayed once when the conversation exists; forgotten if waking fails.
 */
export function createWakeQueue() {
  let texts: string[] = []
  let talk = false
  return {
    queueText(t: string): void { texts.push(t) },
    /** A mic tap while waking: on, then off again on a second tap. Returns the new wish. */
    toggleTalk(): boolean { talk = !talk; return talk },
    drain(): { texts: string[]; talk: boolean } {
      const out = { texts, talk }
      texts = []
      talk = false
      return out
    },
    /** Forgets everything; returns how many typed texts were dropped unsent. */
    clear(): number {
      const dropped = texts.length
      texts = []
      talk = false
      return dropped
    },
  }
}
