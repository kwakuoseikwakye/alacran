import { describe, it, expect, vi, beforeEach } from "vitest"

const listPendingReviews = vi.fn()
const guidePendingCount = vi.fn()

vi.mock("@/lib/company-commands/pending-reviews", () => ({
  listPendingReviews: (...args: unknown[]) => listPendingReviews(...args),
}))
vi.mock("@/lib/guide/observe", () => ({
  guidePendingCount: (...args: unknown[]) => guidePendingCount(...args),
}))
const openFlagCount = vi.fn(async () => 0)
vi.mock("@/lib/jobs/view", () => ({
  openFlagCount: () => openFlagCount(),
}))

import { countWaitingApprovals } from "./pending-approvals"

const agent = { id: "acme", name: "Acme", rootPath: "/companies/acme", kind: "command-set" as const }
const review = (commandId: string) => ({ agentId: "acme", commandId })

beforeEach(() => {
  listPendingReviews.mockReset()
  guidePendingCount.mockReset()
})

describe("countWaitingApprovals", () => {
  it("counts a waiting guide update when no command review is waiting", async () => {
    listPendingReviews.mockResolvedValue([])
    guidePendingCount.mockResolvedValue(1)
    expect(await countWaitingApprovals(agent)).toBe(1)
  })

  it("counts command reviews alone when the guide is current", async () => {
    listPendingReviews.mockResolvedValue([review("digest"), review("retro")])
    guidePendingCount.mockResolvedValue(0)
    expect(await countWaitingApprovals(agent)).toBe(2)
  })

  it("adds the guide update to the command reviews", async () => {
    listPendingReviews.mockResolvedValue([review("digest"), review("retro")])
    guidePendingCount.mockResolvedValue(1)
    expect(await countWaitingApprovals(agent)).toBe(3)
  })

  it("adds what unattended jobs flagged for a person", async () => {
    listPendingReviews.mockResolvedValue([review("digest")])
    guidePendingCount.mockResolvedValue(0)
    openFlagCount.mockResolvedValueOnce(2)
    expect(await countWaitingApprovals(agent)).toBe(3)
  })

  it("is 0 when nothing at all is waiting", async () => {
    listPendingReviews.mockResolvedValue([])
    guidePendingCount.mockResolvedValue(0)
    expect(await countWaitingApprovals(agent)).toBe(0)
  })

  it("is null, never 0, when the command reviews cannot be listed, so nobody is told nothing is waiting", async () => {
    listPendingReviews.mockRejectedValue(new Error("disk gone"))
    guidePendingCount.mockResolvedValue(1)
    expect(await countWaitingApprovals(agent)).toBeNull()
  })

  it("asks about that one company only", async () => {
    listPendingReviews.mockResolvedValue([])
    guidePendingCount.mockResolvedValue(0)
    await countWaitingApprovals(agent)
    expect(listPendingReviews).toHaveBeenCalledWith([agent])
    expect(guidePendingCount).toHaveBeenCalledWith("acme")
  })
})
