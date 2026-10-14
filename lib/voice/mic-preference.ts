import { useEffect, useState } from "react"
import { desktopMic } from "./desktop-mic"

/**
 * Whether the Assistant may use the microphone at all — Preferences › Voice.
 *
 * Off unless the user has turned it on. The assistant is docked on every
 * company page, and with no switch it opened the microphone (and, in the mac
 * shell, asked macOS for it) on every visit whether or not anyone meant to
 * talk. Typing a question works either way.
 *
 * Per machine in localStorage, like advanced mode: nothing server-side reads
 * it, and the microphone is this machine's anyway.
 */
export const MIC_ENABLED_KEY = "alacran-voice-mic"
/** Fired when the switch flips, so an open assistant follows without a reload. */
export const MIC_ENABLED_EVENT = "alacran-voice-mic-change"

export function readMicEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(MIC_ENABLED_KEY) === "1"
  } catch {
    return false
  }
}

export function setMicEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(MIC_ENABLED_KEY, on ? "1" : "0")
  } catch {
    /* the switch just won't persist */
  }
  window.dispatchEvent(new Event(MIC_ENABLED_EVENT))
}

/** Starts off on the server and first render, then corrects in an effect. */
export function useMicEnabled(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const sync = () => setOn(readMicEnabled())
    sync()
    window.addEventListener(MIC_ENABLED_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(MIC_ENABLED_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])
  return on
}

/**
 * Asks for the microphone once, when the switch is turned on — never on
 * launch. In the mac shell macOS is asked through the bridge; everywhere else
 * (and in a shell too old to have `ask`) the browser's own prompt is, and the
 * stream is released straight away. Never throws: a refusal is an answer.
 */
export async function requestMicAccess(): Promise<"granted" | "denied"> {
  try {
    const ask = desktopMic()?.ask
    if (ask) {
      const { status } = await ask()
      if (status !== "granted") return "denied"
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => track.stop())
    return "granted"
  } catch {
    return "denied"
  }
}
