import { describe, expect, it } from "vitest"
import { commandFileNameOf } from "./command-file-name"

describe("commandFileNameOf", () => {
  it("reads a flat command", () => {
    expect(commandFileNameOf("/co/.claude/commands/digest.md")).toBe("digest.md")
  })
  it("reads a command that moved to the shared folder", () => {
    expect(commandFileNameOf("/co/.agents/skills/digest/SKILL.md")).toBe("digest.md")
  })
  it("reads either shape with Windows separators", () => {
    expect(commandFileNameOf("C:\\co\\.agents\\skills\\digest\\SKILL.md")).toBe("digest.md")
  })
  it("does not treat anything else as a command", () => {
    expect(commandFileNameOf("/co/.claude/skills/digest/SKILL.md")).toBeUndefined()
    expect(commandFileNameOf("/co/.agents/skills/digest/references/notes.md")).toBeUndefined()
    expect(commandFileNameOf("/co/notes/commands.md")).toBeUndefined()
  })
})
