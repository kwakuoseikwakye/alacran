import type { ChangeKind, GuideChangeCounts, GuideChangeSection } from "./proposal"

/**
 * Plain-language copy for the guide proposal, shared by the Approvals card, the Home row and the Skills card so
 * the three can never disagree. Pure and import-type-only, so client components can use it.
 */

export const totalChanges = (counts: GuideChangeCounts): number => counts.new + counts.reworded + counts.removed

export const changesNoun = (n: number): string => (n === 1 ? "1 change" : `${n} changes`)

/** "Review 4 changes" / "Review 1 change". */
export const reviewLabel = (counts: GuideChangeCounts): string => `Review ${changesNoun(totalChanges(counts))}`

/** "2 new", "1 reworded", "1 removed": a part with a zero count is left out. */
export function tagLabels(counts: GuideChangeCounts): { kind: ChangeKind; label: string }[] {
  return (["new", "reworded", "removed"] as const).filter((kind) => counts[kind] > 0).map((kind) => ({ kind, label: `${counts[kind]} ${kind}` }))
}

/** "4 changes since your AIs last read it: 2 new, 1 reworded, 1 removed". */
export function summarySentence(counts: GuideChangeCounts): string {
  const parts = tagLabels(counts).map((tag) => tag.label).join(", ")
  return `${changesNoun(totalChanges(counts))} since your AIs last read it: ${parts}`
}

export const SECTION_TITLE: Record<GuideChangeSection, string> = {
  teams: "Teams",
  commands: "Commands",
  departments: "Departments",
  wording: "Guide wording",
}

export const KIND_LABEL: Record<ChangeKind, string> = { new: "New", reworded: "Reworded", removed: "Removed" }

export const DISMISSED_NOTICE = "Okay. Alacrán will ask again only if something else changes. You can review it any time from Skills."
export const FAILED_NOTICE = "The operating guide could not be updated."

type ApproveLike =
  | { ok: true; changed: boolean; committed: boolean; commitError?: string }
  | { ok: false; code: string; error: string }

/**
 * What the card does with an approve result. `leave`: the guide is up to date, fly the card away and refresh.
 * `reload`: the proposal moved under the owner, refresh to show the new one. `stay`: keep the card and its buttons.
 */
export function describeApprove(res: ApproveLike): { notice: string; tone: "ok" | "info" | "error"; effect: "leave" | "reload" | "stay" } {
  if (res.ok) {
    if (!res.changed) return { notice: "The guide is already up to date.", tone: "ok", effect: "leave" }
    if (!res.committed) return { notice: res.commitError ?? "Saved locally, but the history update failed.", tone: "error", effect: "stay" }
    return { notice: "Updated the guide. Your AIs will read the new version.", tone: "ok", effect: "leave" }
  }
  if (res.code === "changed") return { notice: res.error, tone: "info", effect: "reload" }
  return { notice: res.error, tone: "error", effect: "stay" }
}

/** The label for the Update button depends only on which action is in flight. "Updating…" only while approve is in flight. */
export const approveButtonLabel = (acting: "approve" | "dismiss" | null): string => (acting === "approve" ? "Updating…" : "Update the guide")
