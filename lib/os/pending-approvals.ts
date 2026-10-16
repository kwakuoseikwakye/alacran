import type { Agent } from "@/lib/adapters/types"
import { listPendingReviews } from "@/lib/company-commands/pending-reviews"
import { guidePendingCount } from "@/lib/guide/observe"
import { openFlagCount } from "@/lib/jobs/view"

/**
 * How much of one company is waiting for the owner's OK in Approvals: command runs with changes nobody has approved,
 * a stale operating guide, and what unattended jobs flagged for a person (v240). `null` when the command reviews
 * cannot be listed, so a caller can say nothing rather than claim "nothing is waiting". It agrees with the sidebar
 * badge, which sums the same three things.
 */
export async function countWaitingApprovals(agent: Agent): Promise<number | null> {
  const reviews = await listPendingReviews([agent]).catch(() => null)
  return reviews === null ? null : reviews.length + (await guidePendingCount(agent.id)) + (await openFlagCount(agent.id))
}
