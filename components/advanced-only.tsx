"use client"

import { useEffect, useState, type ReactNode } from "react"
import { ADVANCED_MODE_EVENT, ADVANCED_MODE_KEY } from "@/lib/advanced-mode"

/**
 * Advanced mode is ON unless the user has explicitly turned it off.
 *
 * It shipped OFF by default in v71-v72, on the reasoning that a new surface
 * should be hidden from the simple mode and opt in. That reasoning produced a
 * real cost the other way: a fresh install hid the Network map, the terminal
 * escape hatch, MCP connectors, and the executor picker from someone who had
 * no idea a toggle existed, and v72 is itself a slice spent undoing "features
 * were removed" reports caused by it. Absent means on; only a stored "0" is
 * off, so the setting still persists in both directions.
 */
export function readAdvancedMode(): boolean {
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(ADVANCED_MODE_KEY) !== "0"
  } catch {
    // Same defensive shape as the theme script: a locked-down browser that
    // throws on localStorage must not take the page down with it.
    return true
  }
}

export function setAdvancedMode(on: boolean): void {
  try {
    window.localStorage.setItem(ADVANCED_MODE_KEY, on ? "1" : "0")
  } catch {
    /* ignore — the toggle just won't persist */
  }
  window.dispatchEvent(new Event(ADVANCED_MODE_EVENT))
}

/**
 * Whether to show the surfaces that assume terminal literacy.
 *
 * Starts OFF on the server and on the first client render, then corrects in
 * an effect — reading localStorage during render would mismatch hydration.
 * Off, not `readAdvancedMode`'s default: since v174 seeds every fresh install
 * to simple mode, the people this app is for are the ones in simple mode, and
 * starting on showed them Terminal and Diagnostics until hydration finished.
 * Starting off means any flicker is one frame of less, never of more.
 */
export function useAdvancedMode(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const sync = () => setOn(readAdvancedMode())
    sync()
    window.addEventListener(ADVANCED_MODE_EVENT, sync)
    // Covers a second window/tab of the same app.
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(ADVANCED_MODE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])
  return on
}

/** Wrapper so server components can gate a subtree without becoming client
 *  components themselves — app/page.tsx and AgentCard are both server-side. */
export function AdvancedOnly({ children }: { children: ReactNode }) {
  return useAdvancedMode() ? <>{children}</> : null
}
