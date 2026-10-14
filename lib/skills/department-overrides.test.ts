import { describe, it, expect } from "vitest"
import { nextOverrides } from "./department-overrides"

describe("nextOverrides", () => {
  const path = "/co/.claude/skills/seo-audit/SKILL.md"

  it("records a move away from the derived department", () => {
    expect(nextOverrides({}, path, "Engineering", "Marketing")).toEqual({ [path]: "Engineering" })
  })

  it("drops the entry when the user files it back where it came from", () => {
    expect(nextOverrides({ [path]: "Engineering" }, path, "Marketing", "Marketing")).toEqual({})
  })

  it("never stores an override that merely agrees with today's default", () => {
    expect(nextOverrides({}, path, "Marketing", "Marketing")).toEqual({})
  })

  it("leaves other files alone", () => {
    const other = "/co/.claude/commands/digest.md"
    expect(nextOverrides({ [other]: "Engineering" }, path, "Sales", "Marketing")).toEqual({
      [other]: "Engineering",
      [path]: "Sales",
    })
  })
})
