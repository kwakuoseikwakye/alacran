import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ago } from "@/lib/os/ago"
import { describeHomeLine } from "@/lib/os/memory-health/describe"
import type { MemoryHealth } from "@/lib/os/memory-health/types"
import { pickForCard, thisWeek, weekSummary, type MemoryItem } from "@/lib/os/memory-items"

/**
 * What Alacrán knows about this company, this week: what was newly saved to its
 * memory, said as statements rather than file names, with a way into the full
 * list. Only this week's items show, so a quiet week says so instead of
 * dressing old items up as new. Reuses Recent's styling (native-recent).
 */
export function MemoryCard({ companyId, items, now = new Date(), health }: { companyId: string; items: MemoryItem[]; now?: Date; health?: MemoryHealth }) {
  const week = thisWeek(items, now)
  const summary = weekSummary(week)
  const healthLine = health ? describeHomeLine(health) : null
  return (
    <section className="native-recent" aria-labelledby="memory-title">
      <div className="native-section-head">
        <h2 id="memory-title">What Alacrán knows</h2>
        <span>Your company&apos;s memory</span>
      </div>
      {items.length === 0 ? (
        <p>Nothing saved yet. When you approve something Alacrán drafted, it shows up here.</p>
      ) : summary ? (
        <>
          <p>This week: {summary}</p>
          {pickForCard(week).map((item) => (
            <p key={item.path}>{item.statement || item.title} · {ago(item.changedAt, now)}</p>
          ))}
        </>
      ) : (
        <p>Nothing new this week. Alacrán remembers {items.length} {items.length === 1 ? "thing" : "things"}.</p>
      )}
      {healthLine && (
        <p>
          <Link href={`/c/${companyId}/brain`}>{healthLine}</Link>
        </p>
      )}
      <Link href={`/c/${companyId}/brain`}>
        <span>See everything Alacrán knows</span>
        <ArrowRight aria-hidden />
      </Link>
    </section>
  )
}
