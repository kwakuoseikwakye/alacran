import Link from "next/link"
import { ArrowRight, FileText } from "lucide-react"
import type { GuideChangeCounts } from "@/lib/guide/proposal"
import { reviewLabel, tagLabels } from "@/lib/guide/proposal-copy"

/**
 * Home's row for a stale guide: the same one-line strip every waiting approval gets, plus the colour-tagged
 * preview of what changed. It only links to Approvals, where the real card lives.
 */
export function GuideHomeRow({ companyId, counts }: { companyId: string; counts: GuideChangeCounts }) {
  return (
    <section className="native-home-focus guide-home-row" aria-label="Guide update">
      <FileText aria-hidden />
      <div>
        <h2>Your operating guide is out of date</h2>
        <p>Something changed outside Alacrán. Your AIs will keep working from the old guide until you update it.</p>
        <div className="guide-chips">
          {tagLabels(counts).map((tag) => (
            <span key={tag.kind} className={`guide-chip guide-chip--${tag.kind}`}>{tag.label}</span>
          ))}
        </div>
      </div>
      <Link href={`/c/${companyId}/tasks`} title="Opens the change list in Approvals. Nothing is written until you approve it.">{reviewLabel(counts)} <ArrowRight aria-hidden /></Link>
    </section>
  )
}
