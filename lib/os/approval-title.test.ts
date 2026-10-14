import { describe, it, expect } from "vitest"
import { approvalTitle } from "./approval-title"

describe("approvalTitle", () => {
  it("keeps the wording Approvals already used", () => {
    expect(approvalTitle("session-note")).toBe("Save session summary")
    expect(approvalTitle("digest")).toBe("Save your weekly summary")
    expect(approvalTitle("decision")).toBe("Save this decision")
    expect(approvalTitle("retro")).toBe("Save this retrospective")
    expect(approvalTitle("refresh")).toBe("Update your company profile")
  })

  it("names a passed-on task's summary in plain words", () => {
    expect(approvalTitle("delegate-task")).toBe("Save task summary")
  })

  it("names the two first-run drafts in plain words", () => {
    expect(approvalTitle("define-company")).toBe("Save your company profile")
    expect(approvalTitle("orientation")).toBe("Save your getting-started note")
  })

  it("falls back to a readable phrase for any other command", () => {
    expect(approvalTitle("sync-funnel")).toBe("Review sync funnel")
  })
})
