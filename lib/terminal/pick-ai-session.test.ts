import { describe, expect, it } from "vitest"
import { pickLiveAiSession } from "./pick-ai-session"
import type { SessionSummary } from "./sessions"

const s = (id: string, kind: SessionSummary["kind"], startedAt: number): SessionSummary => ({ id, kind, label: id, startedAt })

describe("pickLiveAiSession", () => {
  it("picks the most recently started ai session", () => {
    expect(pickLiveAiSession([s("a", "ai", 1), s("b", "ai", 5), s("c", "ai", 3)])?.id).toBe("b")
  })
  it("ignores shell and run sessions entirely", () => {
    expect(pickLiveAiSession([s("sh", "shell", 9), s("run", "run", 8)])).toBeUndefined()
    expect(pickLiveAiSession([s("sh", "shell", 9), s("a", "ai", 1)])?.id).toBe("a")
  })
  it("returns undefined for no sessions", () => {
    expect(pickLiveAiSession([])).toBeUndefined()
  })
})
