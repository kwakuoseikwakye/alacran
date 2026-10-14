import { describe, expect, it } from "vitest"
import { elapsed, riskyPaths, statusView } from "./run-view"

describe("riskyPaths", () => {
  it("picks out files that change what runs when a tool starts", () => {
    expect(
      riskyPaths([
        "notes/pricing.md",
        ".claude/settings.json",
        ".mcp.json",
        ".husky/pre-commit",
        "lefthook.yml",
        ".pre-commit-config.yaml",
        ".gitattributes",
        "docs/.husky-notes.md",
      ])
    ).toEqual([".claude/settings.json", ".mcp.json", ".husky/pre-commit", "lefthook.yml", ".pre-commit-config.yaml", ".gitattributes"])
  })
})

describe("statusView", () => {
  it("names every status in words, and driving wins", () => {
    expect(statusView("running", false)).toEqual({ word: "Working", tone: "working" })
    expect(statusView("needs-review", false)).toEqual({ word: "Needs your review", tone: "review" })
    expect(statusView("interrupted", false)).toEqual({ word: "Interrupted", tone: "review" })
    expect(statusView("failed", false)).toEqual({ word: "Stopped", tone: "stopped" })
    expect(statusView("no-changes", false)).toEqual({ word: "No changes", tone: "quiet" })
    expect(statusView("needs-review", true)).toEqual({ word: "You're driving", tone: "driving" })
  })
})

describe("elapsed", () => {
  const start = "2026-09-26T10:00:00.000Z"
  const at = (iso: string) => Date.parse(iso)
  it("says how long a run took, or has been going", () => {
    expect(elapsed(start, null, at("2026-09-26T10:00:40.000Z"))).toBe("under a minute")
    expect(elapsed(start, null, at("2026-09-26T10:04:10.000Z"))).toBe("4 min")
    expect(elapsed(start, "2026-09-26T11:05:00.000Z", at("2026-09-26T12:00:00.000Z"))).toBe("1 h 5 min")
  })
})

import { plainSummary, shouldNotify, shouldPollRuns } from "./run-view"

describe("plainSummary", () => {
  it("reads an agent's markdown as plain sentences", () => {
    expect(
      plainSummary("I added `Hello!` to **notes.md**.\n\nWhat I assumed:\n- **No AGENTS.md here.** I did the task as written.\n## Done")
    ).toBe("I added Hello! to notes.md. What I assumed: No AGENTS.md here. I did the task as written. Done")
    expect(plainSummary("See [the notes](notes/x.md) and __this__.")).toBe("See the notes and this.")
  })
})

describe("shouldNotify", () => {
  it("fires once, when a run the page saw working stops while the window is hidden", () => {
    expect(shouldNotify("running", "needs-review", true)).toBe(true)
    expect(shouldNotify("running", "failed", true)).toBe(true)
    expect(shouldNotify("running", "needs-review", false)).toBe(false) // the person is looking
    expect(shouldNotify(undefined, "needs-review", true)).toBe(false) // finished before the page loaded
    expect(shouldNotify("needs-review", "needs-review", true)).toBe(false)
  })
})

describe("shouldPollRuns", () => {
  // Stopping the poll while hidden would mean a run finishing in the
  // background is only seen once the person is back — too late to tell them.
  it("keeps polling in the background while a run is working, and only then", () => {
    const run = (status: "running" | "needs-review") => ({ status })
    expect(shouldPollRuns(false, [])).toBe(true)
    expect(shouldPollRuns(true, [run("running")])).toBe(true)
    expect(shouldPollRuns(true, [run("needs-review")])).toBe(false)
  })
})
