export type AgentConnection = "idle" | "connecting" | "connected" | "reconnecting" | "ended"
export type AgentDisplay =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "checking"
  | "reconnecting"

/**
 * What the status pill shows. The SDK only reports "listening" or "speaking",
 * so "thinking" (the user finished, the agent has not started) and "checking"
 * (the ask_company tool is running) are derived here, in one place.
 */
export function deriveDisplay(i: {
  connection: AgentConnection
  mode: "listening" | "speaking"
  toolRunning: boolean
  awaitingReply: boolean
}): AgentDisplay {
  if (i.connection === "connecting") return "connecting"
  if (i.connection === "reconnecting") return "reconnecting"
  if (i.connection !== "connected") return "idle"
  if (i.toolRunning) return "checking"
  if (i.mode === "speaking") return "speaking"
  if (i.awaitingReply) return "thinking"
  return "listening"
}

/** The particle orb only knows four modes; checking and reconnecting reuse "thinking". */
export function orbMode(display: AgentDisplay): "idle" | "listening" | "thinking" | "speaking" {
  switch (display) {
    case "listening":
      return "listening"
    case "speaking":
      return "speaking"
    case "thinking":
    case "checking":
    case "reconnecting":
      return "thinking"
    default:
      return "idle"
  }
}
