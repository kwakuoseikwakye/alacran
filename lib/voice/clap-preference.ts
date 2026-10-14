import { useEffect, useState } from "react"

/**
 * Whether the Assistant may wait for a double clap — Preferences › Voice, under "Use the microphone".
 *
 * Off unless turned on, and only ever effective while the microphone switch is on too. Waiting for a
 * clap means holding the microphone open while the Assistant is idle, which is the one thing the
 * microphone switch exists to prevent by default, so it is its own explicit choice. Nothing is
 * recorded or sent anywhere: the stream is only measured for loudness (see use-clap-wake.ts).
 *
 * Per machine in localStorage, like the microphone switch.
 */
export const CLAP_WAKE_KEY = "alacran-voice-clap"
/** Fired when the switch flips, so an open assistant follows without a reload. */
export const CLAP_WAKE_EVENT = "alacran-voice-clap-change"

export function readClapWake(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(CLAP_WAKE_KEY) === "1"
  } catch {
    return false
  }
}

export function setClapWake(on: boolean): void {
  try {
    window.localStorage.setItem(CLAP_WAKE_KEY, on ? "1" : "0")
  } catch {
    /* the switch just won't persist */
  }
  window.dispatchEvent(new Event(CLAP_WAKE_EVENT))
}

/** Starts off on the server and first render, then corrects in an effect. */
export function useClapWake(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const sync = () => setOn(readClapWake())
    sync()
    window.addEventListener(CLAP_WAKE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CLAP_WAKE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])
  return on
}
