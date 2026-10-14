import { describe, expect, it } from "vitest"
import { invocationFor, invocationSentence } from "./invocation"

describe("invocationFor", () => {
  it("gives each agent the form it actually accepts", () => {
    expect(invocationFor("claude-code", "verify")).toBe("/verify")
    expect(invocationFor("kiro", "verify")).toBe("/verify")
    expect(invocationFor("google-antigravity", "verify")).toBe("/verify")
    expect(invocationFor("kimi", "verify")).toBe("/skill:verify")
    expect(invocationFor("codex", "verify")).toBe("$verify")
  })
})

describe("invocationSentence", () => {
  it("tells Codex people plainly that it has no custom slash commands", () => {
    expect(invocationSentence("codex")).toBe("In Codex, run one by writing its name after a dollar sign, like $name (Codex has no custom slash commands).")
  })
  it("gives the others their typed form", () => {
    expect(invocationSentence("kimi")).toBe("Run one by typing /skill:name.")
    expect(invocationSentence("claude-code")).toBe("Run one by typing /name.")
  })
})
