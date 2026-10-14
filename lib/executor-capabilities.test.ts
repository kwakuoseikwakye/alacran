import { describe, it, expect } from "vitest"
import { AI_EXECUTORS } from "./ai-executors"
import { cannotNote, type Need } from "./executor-capabilities"

const NEEDS: Need[] = ["outside-text", "revise", "opening-message", "resume", "sign-in", "mcp-servers"]

describe("cannotNote", () => {
  it("Claude Code can do every function, so it never carries a note", () => {
    for (const need of NEEDS) expect(cannotNote(AI_EXECUTORS["claude-code"], need)).toBeNull()
  })

  it("names the AI in every note, and keeps it to one short line", () => {
    for (const executor of Object.values(AI_EXECUTORS)) {
      for (const need of NEEDS) {
        const note = cannotNote(executor, need)
        if (note === null) continue
        expect(note).toContain(executor.label)
        expect(note.length).toBeLessThan(140)
      }
    }
  })

  it("follows the registry: an AI that can't be scoped can't run outside-text jobs", () => {
    expect(cannotNote(AI_EXECUTORS.kimi, "outside-text")).toMatch(/can't run this/)
    expect(cannotNote(AI_EXECUTORS.kiro, "outside-text")).toBeNull()
  })
})
