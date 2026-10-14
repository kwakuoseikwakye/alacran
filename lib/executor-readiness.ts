import type { ToolStatus } from "@/lib/connect/connect-status-impl"

/** What a tile says about an AI: one of three words, never the raw detail. */
export type Readiness = "ready" | "needs-sign-in" | "not-installed"

export const READINESS_TEXT: Record<Readiness, string> = {
  ready: "Ready",
  "needs-sign-in": "Needs sign-in",
  "not-installed": "Not installed",
}

export function readinessOf(s: ToolStatus): Readiness {
  return s.connected ? "ready" : s.needsSignIn ? "needs-sign-in" : "not-installed"
}

export function readinessMap(list: ToolStatus[]): Record<string, Readiness> {
  return Object.fromEntries(list.map((s) => [s.id, readinessOf(s)]))
}
