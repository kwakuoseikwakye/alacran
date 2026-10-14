import { describe, it, expect, vi } from "vitest"

vi.mock("./batch-approve-impl", () => ({
  batchCommitSafeReviewsImpl: vi.fn(async () => ({ total: 0, committed: [], failed: [], message: "No reviews were processed." })),
}))

import { batchCommitSafeReviews } from "./batch-approve"
import { batchCommitSafeReviewsImpl } from "./batch-approve-impl"
import { afterApproval } from "../os/preferences/outcome-hooks"

describe("batchCommitSafeReviews (the server action behind Approve all safe)", () => {
  it("hands the impl the approval hook (log + first-run marker)", async () => {
    const items = [{ commandId: "digest", outputPath: "notes/company/digests/x.md", agentId: "acme" }]
    await batchCommitSafeReviews(items)
    expect(batchCommitSafeReviewsImpl).toHaveBeenCalledWith(items, undefined, undefined, afterApproval)
  })
})
