import { describe, expect, it } from "vitest"
import { isUserActivity } from "./user-activity"
import type { SessionEvent } from "./session"

describe("isUserActivity", () => {
  const yes: SessionEvent[] = [
    { type: "message", role: "user", text: "hi" },
    { type: "tool", phase: "start", question: "q" },
  ]
  const no: SessionEvent[] = [
    { type: "message", role: "agent", text: "are you still there?" },
    { type: "mode", mode: "speaking" },
    { type: "mode", mode: "listening" },
    { type: "status", status: "connecting" },
    { type: "status", status: "connected" },
    { type: "status", status: "reconnecting" },
    { type: "status", status: "ended" },
    { type: "error", message: "x" },
    { type: "ended", reason: "user" },
    { type: "tool", phase: "done", question: "q" },
    { type: "tool", phase: "error", question: "q" },
  ]
  it.each(yes)("counts %j", (e) => expect(isUserActivity(e)).toBe(true))
  it.each(no)("ignores %j", (e) => expect(isUserActivity(e)).toBe(false))
})
