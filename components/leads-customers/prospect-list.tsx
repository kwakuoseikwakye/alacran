import React from "react"
import type { Prospect } from "@/lib/leads-customers/prospects"
import { ProspectCard } from "./prospect-card"

export function ProspectList({
  prospects,
  agentId,
  empty,
}: {
  prospects: Prospect[]
  agentId: string
  empty: string
}) {
  if (prospects.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-3">{empty}</p>
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {prospects.map((p) => (
        <ProspectCard key={p.fileName} prospect={p} agentId={agentId} />
      ))}
    </div>
  )
}
