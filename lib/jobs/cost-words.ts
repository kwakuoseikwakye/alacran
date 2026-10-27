/**
 * The spending section's words and shape (v251), kept apart from lib/jobs/cost.ts because the Jobs
 * board is a client component and cost.ts reads files. Exported so a test can hold the copy to AC7:
 * the limit is never promised as a hard stop.
 */
export const usd = (n: number) => `$${n.toFixed(2)}`

export const SPENDING_COPY = {
  estimate: "Estimated, from what the AI tool reports. On a subscription you may not be charged this.",
  scope: "Counts company commands (scheduled or started by you) and automatic session notes.",
  softLimit:
    "This limit can be passed. Runs already going are allowed to finish, cost is only known once a run ends, and runs whose cost isn't known aren't counted. When it's reached, Alacrán stops starting scheduled runs and session notes on its own; you can still press Run. A scheduled run it skipped starts again at its next daily time once the limit is raised or the month turns.",
  scripts: "run no AI, so they aren't counted. Alacrán can't see what a script itself spends.",
} as const

export type SpendingView = {
  monthUsd: number
  unknownRuns: number
  jobs: { job: string; label: string; monthUsd: number; lastCostUsd: number | null; lastAt: string; runs: number }[]
  limit: { ok: true; usd: number | null } | { ok: false; reason: string }
  reached: boolean
}
