import { readLeads, readTransactions, readContentItems } from "./records/read"
import { classifyRisk } from "../company-commands/risk-tier"
import type { PendingReview } from "../company-commands/pending-reviews"
import { getCompanyCommandResultImpl } from "../company-commands/company-command-result-impl"
import { getCompanyCommand } from "../company-commands/registry"
import { COMPANY_COMMANDS_DATA_DIR } from "../company-commands/paths"
import path from "node:path"

export interface ExecutiveBriefingMetrics {
  pendingReviewsCount: number
  safeReviewsCount: number
  governedReviewsCount: number
  leadsCount: number
  pipelineValue: number
  cashBalance: number
  contentCount: number
}

export interface ExecutiveBriefingData {
  companyId: string
  companyName: string
  dateFormatted: string
  headline: string
  summaryParagraph: string
  audioScript: string
  metrics: ExecutiveBriefingMetrics
  nextAction: {
    title: string
    detail: string
    href: string
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount)
}

function getFormattedDate(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date())
}

/**
 * Builds the Executive Morning Briefing synthesizing gate state,
 * operational metrics (pipeline, cash, content), and pre-flight health.
 */
export async function buildExecutiveBriefing(
  companyId: string,
  companyName: string,
  companyRoot: string,
  pendingReviews: PendingReview[] = [],
  dataRoot: string = COMPANY_COMMANDS_DATA_DIR
): Promise<ExecutiveBriefingData> {
  const dateFormatted = getFormattedDate()

  // 1. Ingest operational records
  const [leadsRes, txnRes, contentRes] = await Promise.all([
    readLeads(companyRoot).catch(() => ({ ok: false as const, records: [] })),
    readTransactions(companyRoot).catch(() => ({ ok: false as const, records: [] })),
    readContentItems(companyRoot).catch(() => ({ ok: false as const, records: [] })),
  ])

  const leads = leadsRes.records || []
  const transactions = txnRes.records || []
  const content = contentRes.records || []

  const pipelineValue = leads.reduce((acc, l) => acc + (typeof l.value === "number" ? l.value : 0), 0)
  const cashBalance = transactions.reduce(
    (acc, t) => acc + (t.type === "income" ? t.amount : -t.amount),
    0
  )

  // 2. Classify pending reviews into safe vs governed
  let safeReviewsCount = 0
  let governedReviewsCount = 0

  for (const review of pendingReviews) {
    const dataDir = path.join(dataRoot, review.agentId)
    try {
      const res = await getCompanyCommandResultImpl(
        review.commandId,
        dataDir,
        companyRoot,
        undefined,
        // Strays only for a command that declares `alsoWrites` (as pending-reviews does): without
        // that git read its owned files are invisible and a fact edit would be counted safe.
        !!getCompanyCommand(review.commandId)?.alsoWrites?.length
      )
      if (res.changed) {
        const risk = classifyRisk({
          commandId: review.commandId,
          outputPath: res.outputPath,
          oldText: res.oldText,
          newText: res.newText,
          extraFiles: res.extraFiles,
          strays: res.strays,
          ownedPaths: res.ownedFiles?.map((f) => f.path),
        })
        if (risk.isSafe) {
          safeReviewsCount++
        } else {
          governedReviewsCount++
        }
      }
    } catch {
      governedReviewsCount++
    }
  }

  const pendingReviewsCount = pendingReviews.length

  // 3. Formulate next best action
  let nextAction = {
    title: "Review the changes waiting for you",
    detail: "Keep or discard what Alacrán prepared before it becomes part of your records.",
    href: `/c/${companyId}/tasks`,
  }

  if (pendingReviewsCount === 0) {
    if (leads.length === 0) {
      nextAction = {
        title: "Add your first lead",
        detail: "Add someone who might buy from you, so Alacrán can keep track of them.",
        href: `/c/${companyId}/funnel`,
      }
    } else {
      nextAction = {
        title: "Tell Alacrán your top priority",
        detail: "Ask Alacrán to help you decide what matters most today.",
        href: `/c/${companyId}/ask`,
      }
    }
  }

  // 4. Synthesize written summary & spoken audio script
  const headline =
    pendingReviewsCount > 0
      ? `${pendingReviewsCount} change${pendingReviewsCount === 1 ? " is" : "s are"} waiting for your OK.`
      : "Nothing is waiting for you."

  // Plain words: this is read, and spoken, to someone who has never heard of
  // a "gate" or "pipeline value".
  const leadsLine =
    leads.length > 0
      ? `You have ${leads.length} lead${leads.length === 1 ? "" : "s"} worth ${formatCurrency(pipelineValue)} in total`
      : "You haven't added any leads yet"
  let summaryParagraph = "Good morning. "
  if (pendingReviewsCount > 0) {
    summaryParagraph += `${pendingReviewsCount} change${pendingReviewsCount === 1 ? " is" : "s are"} waiting for your OK${
      safeReviewsCount > 0 ? ` (${safeReviewsCount} routine, which you can keep in one go)` : ""
    }. `
  } else {
    summaryParagraph += "Nothing is waiting for your OK. "
  }
  summaryParagraph += `${leadsLine}, and your records show ${formatCurrency(cashBalance)} in cash. Suggested next step: ${nextAction.title.toLowerCase()}.`

  // Spoken script formatted for natural human speech synthesis
  const audioScript = `Good morning. Here is your briefing for ${companyName}. ${
    pendingReviewsCount > 0
      ? `You have ${pendingReviewsCount} ${pendingReviewsCount === 1 ? "change" : "changes"} waiting for your OK. ${
          safeReviewsCount > 0
            ? `${safeReviewsCount} of them ${safeReviewsCount === 1 ? "is" : "are"} routine, and you can keep them in one go.`
            : ""
        }`
      : "Nothing is waiting for your OK."
  } ${leadsLine}, and your records show ${formatCurrency(cashBalance)} in cash. A good next step: ${nextAction.title.toLowerCase()}.`

  return {
    companyId,
    companyName,
    dateFormatted,
    headline,
    summaryParagraph,
    audioScript,
    metrics: {
      pendingReviewsCount,
      safeReviewsCount,
      governedReviewsCount,
      leadsCount: leads.length,
      pipelineValue,
      cashBalance,
      contentCount: content.length,
    },
    nextAction,
  }
}
