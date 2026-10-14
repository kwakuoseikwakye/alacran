import React from "react"
import type { CommsInquiry } from "@/lib/comms/inquiries"
import { InquiryCard } from "./inquiry-card"

export function InquiryList({ inquiries, companyId, empty }: { inquiries: CommsInquiry[]; companyId: string; empty: string }) {
  if (inquiries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-os-border p-6 text-center text-sm text-muted-foreground bg-os-surface/40">
        {empty}
      </div>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {inquiries.map((inq) => (
        <InquiryCard key={inq.fileName} inquiry={inq} companyId={companyId} />
      ))}
    </div>
  )
}
