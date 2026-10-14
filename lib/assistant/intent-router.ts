import type { CompanyContext } from "./gather-all-companies"

export type IntentRoutingResult = {
  /** The company IDs identified as the primary focus of the question. */
  focalCompanyIds: string[]
  /** True if the question is broad across all companies or no specific company was mentioned. */
  isBroadQuery: boolean
}

/**
 * Detects whether a user query is targeted at specific companies or is a broad
 * cross-company overview question.
 *
 * Used by Two-Tier Retrieval to provide deep focal context for targeted companies
 * while compressing non-targeted companies into compact Tier-1 pulses, staying
 * well below prompt size caps (< 60,000 chars) regardless of company count.
 */
export function detectFocalCompanies(
  question: string,
  contexts: CompanyContext[]
): IntentRoutingResult {
  const q = question.toLowerCase().trim()
  if (!q) {
    return { focalCompanyIds: [], isBroadQuery: true }
  }

  // Explicit keywords that request cross-company synthesis
  const broadKeywords = [
    "all companies",
    "every company",
    "across companies",
    "who is",
    "which company",
    "overnight",
    "standup",
    "morning briefing",
    "status across",
    "portfolio",
  ]
  const hasBroadKeyword = broadKeywords.some((kw) => q.includes(kw))

  const matchedIds: string[] = []

  for (const c of contexts) {
    const id = c.id.toLowerCase()
    const name = c.name.toLowerCase()
    // Strip common company suffix words to allow matching casual names ("Alacran", "Acme")
    const strippedName = name
      .replace(/\b(co|corp|corporation|inc|incorporated|llc|app|starter|main|team)\b/gi, "")
      .trim()

    const wordRegex = (term: string) =>
      new RegExp(`(?:^|\\W)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\W)`, "i")

    if (
      wordRegex(id).test(q) ||
      wordRegex(name).test(q) ||
      (strippedName.length >= 3 && wordRegex(strippedName).test(q))
    ) {
      matchedIds.push(c.id)
    }
  }

  return {
    focalCompanyIds: matchedIds,
    isBroadQuery: hasBroadKeyword || matchedIds.length === 0,
  }
}
