/**
 * The spending section's words and shape (v251), kept apart from lib/jobs/cost.ts because the Jobs
 * board is a client component and cost.ts reads files. Exported so a test can hold the copy to AC7:
 * the limit is never promised as a hard stop.
 */
/** Dollars to the cent. A cost above zero that would round to "$0.00" says so instead: "$0.00" is only ever a true zero. */
export const usd = (n: number) => (n > 0 && n < 0.01 ? "under $0.01" : `$${n.toFixed(2)}`)

/** What's been spent, said against the limit so that a reached limit never reads as "$0.04 of a $0.04 limit" for $0.0423. */
export function spentAgainst(spent: number, limit: number | null): string {
  if (limit === null || spent === limit || usd(spent) !== usd(limit)) return usd(spent)
  return `${spent > limit ? "just over" : "just under"} ${usd(limit)}`
}

/** The section's headline, split so the figure can be set in bold. */
export function spendingHeadline(view: Pick<SpendingView, "monthUsd" | "unknownRuns" | "limit">): { before: string; figure: string; after: string } {
  const limit = view.limit.ok ? view.limit.usd : null
  const of = limit === null ? "" : ` of a ${usd(limit)} limit`
  if (view.monthUsd === 0 && view.unknownRuns > 0) return { before: "No cost Alacrán could see yet this month", figure: "", after: limit === null ? "." : `. The limit is ${usd(limit)}.` }
  const figure = spentAgainst(view.monthUsd, limit)
  return /^[a-z]/.test(figure)
    ? { before: "", figure: figure[0].toUpperCase() + figure.slice(1), after: ` so far this month${of}.` }
    : { before: "About ", figure, after: ` so far this month${of}.` }
}

/** One job's month: never "$0.00" for runs whose cost wasn't seen. */
export function jobMonthWords(job: { monthUsd: number; runs: number; knownRuns: number }): string {
  if (job.knownRuns === 0) return "cost not known this month"
  const unknown = job.runs - job.knownRuns
  const known = `${usd(job.monthUsd)} this month`
  return unknown === 0 ? known : `${known}, plus ${unknown} ${unknown === 1 ? "run" : "runs"} with cost not known`
}

export const SPENDING_COPY = {
  estimate: "Estimated, from what the AI tool reports. On a subscription you may not be charged this.",
  scope: "Counts company commands (scheduled or started by you) and automatic session notes.",
  noLimit: "Set a limit to stop scheduled runs and session notes once this month's estimate reaches it.",
  softLimit:
    "This limit can be passed. Runs already going are allowed to finish, cost is only known once a run ends, and runs whose cost isn't known aren't counted. When it's reached, Alacrán stops starting scheduled runs and session notes on its own; you can still press Run. A scheduled run it skipped starts again at its next daily time once the limit is raised or the month turns.",
  scripts: "run no AI, so they aren't counted. Alacrán can't see what a script itself spends.",
} as const

export type SpendingView = {
  monthUsd: number
  unknownRuns: number
  jobs: { job: string; label: string; monthUsd: number; lastCostUsd: number | null; lastAt: string; runs: number; knownRuns: number }[]
  limit: { ok: true; usd: number | null } | { ok: false; reason: string }
  reached: boolean
}
