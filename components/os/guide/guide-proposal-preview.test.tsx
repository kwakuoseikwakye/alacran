import { describe, it, expect, vi, afterEach } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("@/lib/guide/actions", () => ({ approveGuideProposalAction: vi.fn(), dismissGuideProposalAction: vi.fn() }))
vi.mock("@/components/os/motion", () => ({ flyToApprovals: vi.fn(async () => {}) }))

import { GuideProposalPreview, previewActions } from "./guide-proposal-preview"
import { approveGuideProposalAction, dismissGuideProposalAction } from "@/lib/guide/actions"
import { describeApprove } from "@/lib/guide/proposal-copy"
import { sampleProposal } from "@/lib/guide/sample"

afterEach(() => vi.useRealTimers())

describe("GuideProposalPreview", () => {
  it("says it is sample content, shows the real card, and offers to bring it back", () => {
    const html = renderToStaticMarkup(React.createElement(GuideProposalPreview, { proposal: sampleProposal() })).replace(/&#x27;/g, "'")
    expect(html).toContain("Preview with sample content. Nothing here is saved.")
    expect(html).toContain("Your operating guide is out of date")
    expect(html).toContain("4 changes since your AIs last read it: 2 new, 1 reworded, 1 removed")
    expect(html).toContain("Update the guide")
    expect(html).toContain("Show the card again")
  })
})

describe("previewActions", () => {
  it("approving answers like a saved update, after a beat, and never reaches the real actions", async () => {
    vi.useFakeTimers()
    const actions = previewActions(vi.fn())
    const pending = actions.approve({ id: "x", baseBodyHash: "y" })
    await vi.advanceTimersByTimeAsync(1000)
    const res = await pending
    expect(res).toEqual({ ok: true, changed: true, committed: true })
    expect(describeApprove(res).effect).toBe("leave")
    expect(approveGuideProposalAction).not.toHaveBeenCalled()
  })

  it("Not now answers ok and never reaches the real actions", async () => {
    const actions = previewActions(vi.fn())
    expect(await actions.dismiss("x")).toEqual({ ok: true })
    expect(dismissGuideProposalAction).not.toHaveBeenCalled()
  })

  it("refresh takes the sample card away", () => {
    const gone = vi.fn()
    previewActions(gone).refresh()
    expect(gone).toHaveBeenCalledOnce()
  })
})
