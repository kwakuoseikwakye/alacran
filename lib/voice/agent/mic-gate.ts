/**
 * Who holds the microphone: the one place that decides whether it is muted, so the hook's
 * connect, reconnect, mute button and push-to-talk paths cannot disagree about it.
 */
export function createMicGate(deps: {
  /** Pushes the state to the live conversation (a no-op before one exists). */
  mute: (muted: boolean) => void
  /** Mirrors the state into the UI. */
  onMuted: (muted: boolean) => void
  /** The user did something that proves they are there (resets the silence timer). */
  touch: () => void
  pushToTalk: () => boolean
}) {
  let muted = false
  const set = (next: boolean) => {
    muted = next
    deps.onMuted(next)
    deps.mute(next)
  }
  return {
    /** A new call: with push-to-talk the mic starts closed, otherwise open. */
    reset(): void {
      muted = deps.pushToTalk()
      deps.onMuted(muted)
    },
    /** The call ended: nothing carries over. */
    clear(): void {
      muted = false
      deps.onMuted(false)
    },
    /** Every (re)connection starts a fresh, unmuted conversation: close it again if it should be closed. */
    onConnected(): void {
      if (muted) deps.mute(true)
    },
    toggle(): void {
      set(!muted)
    },
    /** Push-to-talk press (true) or release (false). Ignored when push-to-talk is off. */
    talk(on: boolean): void {
      if (!deps.pushToTalk()) return
      if (on) deps.touch()
      set(!on)
    },
    /** The preference was flipped during a call. */
    syncPreference(): void {
      set(deps.pushToTalk())
    },
    isMuted: () => muted,
  }
}

/** Elements that own the Space key themselves; the Space mic switch must not steal it from them. */
export const SPACE_OWNERS = 'input, textarea, button, select, a, [role="tab"], [role="button"], [contenteditable]'

/**
 * Space may wake the assistant only when focus is inside it: with the dock open, Space elsewhere in the
 * app scrolls or presses things, and every waking costs ElevenLabs minutes. Once awake, Space talks from anywhere.
 */
export function spaceMayWake(connected: boolean, insideAssistant: boolean): boolean {
  return connected || insideAssistant
}
