"use server"

import { batchCommitSafeReviewsImpl, type BatchReviewItem, type BatchCommitResult } from "./batch-approve-impl"
import { afterApproval } from "../os/preferences/outcome-hooks"

export type { BatchReviewItem, BatchCommitResult }

/**
 * Server action to batch-commit pending reviews classified as Tier 1 (Safe / Low Risk).
 */
export async function batchCommitSafeReviews(items: BatchReviewItem[]): Promise<BatchCommitResult> {
  // A person pressing Approve all safe: this counts as the first approval too.
  return batchCommitSafeReviewsImpl(items, undefined, undefined, afterApproval)
}
