import { describe, it, expect } from "vitest"
import { greetingFor, plainActivityTitle } from "./home-copy"

describe("Home copy", () => {
  it("greets by the hour instead of always saying morning", () => {
    expect(greetingFor(8)).toBe("Good morning.")
    expect(greetingFor(12)).toBe("Good afternoon.")
    expect(greetingFor(23)).toBe("Good evening.")
    expect(greetingFor(2)).toBe("Good evening.")
  })

  it("strips conventional-commit prefixes from activity titles", () => {
    expect(plainActivityTitle("chore: update download links for v0.75.0")).toBe("Update download links for v0.75.0")
    expect(plainActivityTitle("fix(landing): direct downloads")).toBe("Direct downloads")
    expect(plainActivityTitle("Eito: 2026-09-24 — Daily Report")).toBe("Eito: 2026-09-24 — Daily Report")
  })
})
