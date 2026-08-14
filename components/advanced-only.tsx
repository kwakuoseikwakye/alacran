"use client"

import { useEffect, useState, type ReactNode } from "react"
import { ADVANCED_MODE_EVENT, ADVANCED_MODE_KEY } from "@/lib/advanced-mode"

export function readAdvancedMode(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(ADVANCED_MODE_KEY) === "1"
  } catch {
    // Same defensive shape as the theme script: a locked-down browser that
    // throws on localStorage must not take the page down with it.
    return false
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
 * Default OFF, and that default is the point (v66's discipline applied to
 * audience instead of agent kind): a new feature is hidden from the simple
 * mode unless it opts in, rather than needing to be excluded one at a time
 * as someone remembers.
 *
 * Starts false on the server AND on the first client render, then corrects in
 * an effect — reading localStorage during render would mismatch hydration.
 * Hidden-then-shown is the right direction to be briefly wrong in; the
 * opposite would flash the advanced UI at exactly the user it's hidden from.
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
