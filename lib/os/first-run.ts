import type { ParseCompanyOntologyResult } from "@/lib/parse-company-ontology"

/**
 * What Home leads with for one company, decided from facts read off disk on
 * every render — never from a browser flag, so a reload, a second browser or a
 * reinstall cannot disagree with itself.
 */
export type FirstRunStage = "connect-ai" | "describe" | "review" | "first-draft" | "done"

export type FirstRunInput = {
  aiConnected: boolean
  /** The wizard's answers are saved and describe the business (see profileAnsweredFrom). */
  profileAnswered: boolean
  /** Drafts waiting for the person's yes. */
  pendingCount: number
  /** A run is in flight for this company right now. */
  running: boolean
  /** ISO time of the first approved draft, from first-run.json. */
  firstSavedAt?: string
  /** ISO time the person hid the guide, from first-run.json. */
  dismissedAt?: string
}

/**
 * First match wins. `connect-ai` leaves the hero slot empty on purpose:
 * AiSetupCard already leads Home whenever the AI is not connected, in any
 * stage. `review` is checked before `describe` so a draft in flight or waiting
 * never sends someone back to the questions they just answered.
 */
export function firstRunStage(input: FirstRunInput): FirstRunStage {
  if (input.firstSavedAt || input.dismissedAt) return "done"
  if (!input.aiConnected) return "connect-ai"
  if (input.running || input.pendingCount > 0) return "review"
  if (!input.profileAnswered) return "describe"
  return "first-draft"
}

export function homeHeadline(stage: FirstRunStage, pendingCount: number): string {
  if (pendingCount > 0) return `${pendingCount === 1 ? "One thing needs" : `${pendingCount} things need`} your attention.`
  switch (stage) {
    case "connect-ai":
      return "One step left before Alacrán can work."
    case "describe":
      return "Let's set up your business."
    case "review":
      return "Alacrán is preparing your draft."
    case "first-draft":
      return "Ready when you are."
    case "done":
      return "Everything is clear."
  }
}

/** The stages in which Home shows its plain "needs your attention" rows; otherwise the first-run hero leads. */
export function attentionRowsShow(stage: FirstRunStage): boolean {
  return stage === "done" || stage === "connect-ai"
}

/**
 * Which of Home's two plain cards shows. A waiting approval is never hidden by
 * the guide's own state: it shows in the steady state and when the AI has
 * disconnected (the hero is absent then). While the hero leads it carries the
 * waiting item's title itself, so neither card shows.
 */
export function homeFocus(stage: FirstRunStage, pendingCount: number): "review" | "caught-up" | "none" {
  if (pendingCount > 0 && attentionRowsShow(stage)) return "review"
  if (pendingCount === 0 && stage === "done") return "caught-up"
  return "none"
}

/**
 * "Profile answered" is NOT "company.yaml exists": a starter pack ships an
 * example file, so it exists on day one. The wizard's own saved answers are the
 * signal — `nothingSaved` while the file is still just the example.
 */
export function profileAnsweredFrom(result: ParseCompanyOntologyResult): boolean {
  return result.ok && result.answers.domain.trim().length > 0
}

/**
 * A run this hero started (or saw start) has finished and left nothing to
 * review. Without saying so, the hero goes straight back to "Prepare my first
 * draft" and a person whose AI was busy, signed out or out of usage clicks the
 * same paid button again with no idea why nothing happened.
 */
export function runEndedEmpty(input: { attempted: boolean; stage: FirstRunStage; running: boolean; busy: boolean }): boolean {
  return input.attempted && input.stage === "first-draft" && !input.running && !input.busy
}

const SAVED_WINDOW_MS = 30 * 60_000

/**
 * Whether the first approval was recent enough to still say so. Stateless on
 * purpose: nothing has to be dismissed or cleared, and a stored time in the
 * future (a clock that moved) is treated as "not recent" rather than a banner
 * that never leaves.
 */
export function savedRecently(firstSavedAt: string | undefined, now: Date = new Date(), windowMs: number = SAVED_WINDOW_MS): boolean {
  if (!firstSavedAt) return false
  const saved = Date.parse(firstSavedAt)
  if (Number.isNaN(saved)) return false
  const age = now.getTime() - saved
  return age >= 0 && age <= windowMs
}
