/**
 * The mac shell's microphone escape hatch, when the page is running inside it.
 *
 * Why a shell call and not `navigator.permissions`: macOS files its answer
 * against the app bundle's code signature, and the desktop app is ad-hoc
 * signed — so an update, which replaces the whole bundle, leaves a stale
 * record behind. Anyone who installed Alacrán before the shell learned to ask
 * for the microphone is stuck there permanently: `getUserMedia` resolves with
 * a live-looking stream of pure silence, the meter reads zero, and nothing
 * anywhere reports an error. Only the main process can clear that record
 * (`tccutil reset`) and ask again — see the macOS shell's
 * wireMicrophoneReset.
 *
 * Runtime-only and absent everywhere else — browser, Linux shell, `next dev`
 * — the same shape as lib/updates/desktop-updater.ts, which is where the
 * `window.alacran` bridge is typed.
 */

/** macOS's own vocabulary, straight from `systemPreferences`. */
export type MicStatus = "granted" | "denied" | "restricted" | "not-determined" | "unknown"

export type DesktopMic = {
  /** Clears the filed decision, asks again, and answers with what stuck. */
  force: () => Promise<{ status: MicStatus }>
  /** Asks macOS once, without clearing anything. Absent in shells before 0.78. */
  ask?: () => Promise<{ status: MicStatus }>
}

export function desktopMic(): DesktopMic | null {
  if (typeof window === "undefined") return null
  return window.alacran?.mic ?? null
}

/**
 * What to tell the user after a reset. Three outcomes, three different next
 * steps — and the one that matters is the middle one: after a reset that did
 * NOT re-prompt, the app is absent from the Microphone list entirely, so
 * sending someone to System Settings is sending them to an empty page.
 */
export function micResetMessage(status: MicStatus): string {
  if (status === "granted") return "Microphone allowed. Press the core and speak."
  if (status === "not-determined") return "macOS didn't ask. Quit Alacrán, open it again, then press this once more."
  return "Still blocked. Allow Alacrán under Privacy & Security › Microphone, then quit and reopen it."
}
