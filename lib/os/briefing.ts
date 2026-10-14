import type { CommsEntry } from "./comms/read"

export type BriefingLine = {
  id: string
  kind: "run" | "approval" | "comms" | "quiet"
  text: string
  href?: string
}

export type BriefingInput = {
  companyId: string
  runsToday: { commandId: string; ok: boolean }[]
  pendingReviews: number
  recentComms: CommsEntry[]
}

/**
 * Prose about what happened, ordered by what needs the user. Approvals lead
 * because they are the only lines that block someone; everything else is
 * reporting.
 *
 * The quiet line exists so an idle company says "nothing happened" rather than
 * rendering an empty box the user has to interpret. It is mutually exclusive
 * with real content — a briefing that says both is a bug.
 */
export function composeBriefing(input: BriefingInput): BriefingLine[] {
  const lines: BriefingLine[] = []

  if (input.pendingReviews > 0) {
    const plural = input.pendingReviews === 1 ? "change is" : "changes are"
    lines.push({
      id: "approval",
      kind: "approval",
      text: `${input.pendingReviews} ${plural} waiting for your review.`,
      href: `/c/${input.companyId}/tasks`,
    })
  }

  const failed = input.runsToday.filter((r) => !r.ok)
  const succeeded = input.runsToday.filter((r) => r.ok)

  if (succeeded.length > 0) {
    lines.push({
      id: "run-ok",
      kind: "run",
      text: `${succeeded.length} run${succeeded.length === 1 ? "" : "s"} finished cleanly today.`,
      href: `/c/${input.companyId}/activity`,
    })
  }

  if (failed.length > 0) {
    lines.push({
      id: "run-failed",
      kind: "run",
      text: `${failed.length} failed: ${failed.map((r) => r.commandId).join(", ")}.`,
      href: `/c/${input.companyId}/activity`,
    })
  }

  if (input.recentComms.length > 0) {
    lines.push({
      id: "comms",
      kind: "comms",
      text: `${input.recentComms.length} new item${input.recentComms.length === 1 ? "" : "s"} across your chats and inboxes.`,
      href: `/c/${input.companyId}/comms`,
    })
  }

  if (lines.length === 0) {
    lines.push({ id: "quiet", kind: "quiet", text: "Nothing has happened here since you last looked." })
  }

  return lines
}
