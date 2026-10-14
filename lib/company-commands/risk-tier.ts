/**
 * Risk-Tier Classification for Smart Gate Approvals (AGENTS.md §6).
 *
 * Classifies pending command results into 3 risk tiers:
 * - Low ("Low risk"): Additive session notes, digests, orientation updates,
 *   or retrospectives that do not mutate core definitions, contracts, or money.
 *   Safe for one-click batch approval.
 * - Medium ("Medium risk"): Operational records mutations (e.g. leads, content,
 *   social accounts) or modifications to existing working notes.
 * - High ("High risk"): Changes touching money (records/finances/),
 *   contracts or binding ADRs (docs/decisions/), core company ontology
 *   (definitions/ontology/company.yaml), content wipe/deletion, or any run
 *   with stray file modifications outside its expected output scope.
 */

import { parseProposedFacts } from "./fact-changes"

export type RiskLevel = "low" | "medium" | "high"

export interface ReviewRiskContext {
  commandId: string
  outputPath: string
  oldText: string
  newText: string
  extraFiles?: string[]
  strays?: string[] | null
  /** Repo paths the run changed inside its command's `alsoWrites` lanes; they decide the tier too. */
  ownedPaths?: string[]
}

export interface RiskAssessment {
  level: RiskLevel
  label: string
  reason: string
  isSafe: boolean
}

/**
 * Classifies the risk tier of a pending review.
 */
export function classifyRisk(context: ReviewRiskContext): RiskAssessment {
  const { commandId, outputPath, oldText, newText, strays, ownedPaths } = context
  const paths = [outputPath, ...(ownedPaths ?? [])]

  // 1. Critical: Strays outside declared output scope
  if (strays && strays.length > 0) {
    return {
      level: "high",
      label: "High risk",
      reason: `Also changed ${strays.length} file${strays.length === 1 ? "" : "s"} it wasn't asked to touch`,
      isSafe: false,
    }
  }

  // 2. High Risk: Financial Records (§6 Money row)
  if (
    outputPath.startsWith("records/finances/") ||
    outputPath.includes("/finances/") ||
    commandId === "sync-finances"
  ) {
    return {
      level: "high",
      label: "High risk",
      reason: "Changes your money records",
      isSafe: false,
    }
  }

  // 3. High Risk: Company Ontology and Core Definitions (§2 & §3)
  if (paths.some((p) => p.startsWith("definitions/") || p.endsWith("company.yaml")) || commandId === "refresh") {
    return {
      level: "high",
      label: "High risk",
      reason: "Changes the core facts about your company",
      isSafe: false,
    }
  }

  // 4. High Risk: Architectural & Business Decisions / ADRs (§6 Contracts row)
  if (paths.some((p) => p.startsWith("docs/decisions/")) || commandId === "decision") {
    return {
      level: "high",
      label: "High risk",
      reason: "Records a decision or an agreement",
      isSafe: false,
    }
  }

  // 5. High Risk: Irreversible Destructive Operations (§6 Irreversible operations)
  // Check if file is being emptied or truncated significantly
  if (oldText.trim().length > 0 && newText.trim().length === 0) {
    return {
      level: "high",
      label: "High risk",
      reason: "Empties or deletes what was already written",
      isSafe: false,
    }
  }

  // 5b. Medium Risk: a delegated task whose stray files are UNKNOWN.
  // `strays` is null when git could not be read (at delegation, at review, or for a record with no
  // `beforeDirty`), and absent when the caller never asked. Unknown is not "nothing strayed". A
  // delegated agent is unscoped and exists to change things, so its summary may only be one-click
  // approvable once we have actually checked what else it touched.
  if (commandId === "delegate-task" && strays == null) {
    return {
      level: "medium",
      label: "Medium risk",
      reason: "Couldn't check whether your agent changed anything else",
      isSafe: false,
    }
  }

  // 5c. Medium Risk: a session note that proposes fact changes (readable or not). Batch approval
  // would save the note and silently skip the proposals, with no later screen to apply them, so it
  // is never "safe": the owner reviews it on its own.
  if (
    (commandId === "session-note" || outputPath.startsWith("notes/company/sessions/")) &&
    parseProposedFacts(newText).state !== "none"
  ) {
    return {
      level: "medium",
      label: "Medium risk",
      reason: "Suggests changes to your company facts",
      isSafe: false,
    }
  }

  // 6. Low Risk: Additive Session Notes
  if (
    commandId === "session-note" ||
    outputPath.startsWith("notes/company/sessions/")
  ) {
    return {
      level: "low",
      label: "Low risk",
      reason: "Adds a session summary to your notes",
      isSafe: true,
    }
  }

  // 7. Low Risk: Weekly / Periodic Digests
  if (
    commandId === "digest" ||
    outputPath.startsWith("notes/company/digests/")
  ) {
    return {
      level: "low",
      label: "Low risk",
      reason: "A regular summary in your notes",
      isSafe: true,
    }
  }

  // 8. Low Risk: Company Orientation Working Notes
  if (
    commandId === "orientation" ||
    outputPath.startsWith("notes/company/orientation")
  ) {
    return {
      level: "low",
      label: "Low risk",
      reason: "Getting-started notes about your company",
      isSafe: true,
    }
  }

  // 9. Low Risk: Retrospectives
  if (
    commandId === "retro" ||
    outputPath.startsWith("docs/retros/")
  ) {
    return {
      level: "low",
      label: "Low risk",
      reason: "A look back at past work",
      isSafe: true,
    }
  }

  // 10. Medium Risk: Operational Records (Funnel, Content, Social, Workflows)
  if (outputPath.startsWith("records/")) {
    return {
      level: "medium",
      label: "Medium risk",
      reason: "Changes your department records (leads, money or content)",
      isSafe: false,
    }
  }

  // 11. Low Risk fallback for any new note created in notes/
  if (outputPath.startsWith("notes/") && oldText.trim().length === 0) {
    return {
      level: "low",
      label: "Low risk",
      reason: "Adds a new working note",
      isSafe: true,
    }
  }

  // 12. Medium Risk fallback for general file updates
  return {
    level: "medium",
    label: "Medium risk",
    reason: "Changes something already written",
    isSafe: false,
  }
}
