import { describe, it, expect } from "vitest"
import { approveButtonLabel, changesNoun, describeApprove, reviewLabel, summarySentence, tagLabels, totalChanges } from "./proposal-copy"

const counts = (n: number, r: number, d: number) => ({ new: n, reworded: r, removed: d })

describe("counts and labels", () => {
  it("adds the three counts and uses the singular for exactly one", () => {
    expect(totalChanges(counts(2, 1, 1))).toBe(4)
    expect(changesNoun(1)).toBe("1 change")
    expect(changesNoun(4)).toBe("4 changes")
    expect(reviewLabel(counts(2, 1, 1))).toBe("Review 4 changes")
    expect(reviewLabel(counts(0, 1, 0))).toBe("Review 1 change")
  })

  it("leaves a zero part out of the tags and the summary", () => {
    expect(tagLabels(counts(2, 0, 1))).toEqual([
      { kind: "new", label: "2 new" },
      { kind: "removed", label: "1 removed" },
    ])
    expect(summarySentence(counts(2, 1, 1))).toBe("4 changes since your AIs last read it: 2 new, 1 reworded, 1 removed")
    expect(summarySentence(counts(0, 1, 0))).toBe("1 change since your AIs last read it: 1 reworded")
  })
})

describe("describeApprove", () => {
  it("a saved and committed update leaves; an already-current guide leaves", () => {
    expect(describeApprove({ ok: true, changed: true, committed: true })).toMatchObject({ tone: "ok", effect: "leave" })
    expect(describeApprove({ ok: true, changed: false, committed: true })).toEqual({
      notice: "The guide is already up to date.",
      tone: "ok",
      effect: "leave",
    })
  })

  it("a saved but uncommitted update stays, with the plain history message", () => {
    const out = describeApprove({ ok: true, changed: true, committed: false, commitError: "Saved locally, but the history update failed: hook" })
    expect(out).toEqual({ notice: "Saved locally, but the history update failed: hook", tone: "error", effect: "stay" })
    expect(describeApprove({ ok: true, changed: true, committed: false }).notice).toBe("Saved locally, but the history update failed.")
  })

  it("a proposal that moved reloads with its own message; any other failure stays with the error", () => {
    const moved = describeApprove({ ok: false, code: "changed", error: "Things changed while you were reading. Here are the new changes." })
    expect(moved).toEqual({ notice: "Things changed while you were reading. Here are the new changes.", tone: "info", effect: "reload" })
    expect(describeApprove({ ok: false, code: "dirty", error: "AGENTS.md has changes." })).toEqual({
      notice: "AGENTS.md has changes.",
      tone: "error",
      effect: "stay",
    })
  })
})

describe("approveButtonLabel", () => {
  it("approve gives 'Updating…'", () => {
    expect(approveButtonLabel("approve")).toBe("Updating…")
  })

  it("dismiss and null give 'Update the guide'", () => {
    expect(approveButtonLabel("dismiss")).toBe("Update the guide")
    expect(approveButtonLabel(null)).toBe("Update the guide")
  })
})
