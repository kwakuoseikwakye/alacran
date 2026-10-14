import React from "react"
import type { FinancesRecommendation } from "@/lib/finances/recommendations"
import { RecommendationCard } from "./recommendation-card"

export interface RecommendationListProps {
  recommendations?: FinancesRecommendation[]
  items?: FinancesRecommendation[]
  pending?: FinancesRecommendation[]
  approved?: FinancesRecommendation[]
  companyId: string
  empty?: string
}

export function RecommendationList({
  recommendations,
  items,
  pending,
  approved,
  companyId,
  empty,
}: RecommendationListProps) {
  const list =
    recommendations ??
    items ??
    (pending !== undefined && approved === undefined
      ? pending
      : approved !== undefined && pending === undefined
        ? approved
        : undefined)

  if (list !== undefined) {
    if (list.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-os-border p-6 text-center text-sm text-muted-foreground bg-os-surface/40">
          {empty ?? "No recommendations."}
        </div>
      )
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {list.map((rec) => (
          <RecommendationCard
            key={rec.fileName}
            recommendation={rec}
            companyId={companyId}
          />
        ))}
      </div>
    )
  }

  const pendingList = pending || []
  const approvedList = approved || []

  return (
    <div className="space-y-8">
      {/* Section 1: Waiting for you (Pending) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Waiting for you</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
            {pendingList.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Review these cost-reduction opportunities from the finance audit.
        </p>

        {pendingList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-os-border p-6 text-center text-sm text-muted-foreground bg-os-surface/40">
            {empty ?? "No recommendations pending review. Run a financial audit above to discover savings opportunities."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {pendingList.map((rec) => (
              <RecommendationCard
                key={rec.fileName}
                recommendation={rec}
                companyId={companyId}
              />
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Ready to act (Approved) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Ready to act</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            {approvedList.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Approved recommendations ready for outreach, plan changes, or cancellations.
        </p>

        {approvedList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-os-border p-6 text-center text-sm text-muted-foreground bg-os-surface/40">
            No approved recommendations waiting for action.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {approvedList.map((rec) => (
              <RecommendationCard
                key={rec.fileName}
                recommendation={rec}
                companyId={companyId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
