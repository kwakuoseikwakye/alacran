import { ago } from "@/lib/os/ago"
import { thisWeek, type MemoryItem, type MemoryKind } from "@/lib/os/memory-items"

const SECTIONS: { kind: MemoryKind; heading: string; empty: string }[] = [
  { kind: "fact", heading: "Facts", empty: "Facts about your business show up here once you describe it." },
  { kind: "decision", heading: "Decisions", empty: "Decisions you record show up here." },
  { kind: "note", heading: "Notes", empty: "Notes from your work sessions show up here." },
]

/**
 * Everything Alacrán knows, as plain statements in three groups. Items arrive
 * newest first and keep that order within a group. Text only: file viewing
 * lives in Files.
 */
export function MemoryList({ items, now = new Date() }: { items: MemoryItem[]; now?: Date }) {
  const fresh = new Set(thisWeek(items, now).map((item) => item.path))
  return (
    <div className="space-y-8">
      {SECTIONS.map(({ kind, heading, empty }) => {
        const rows = items.filter((item) => item.kind === kind)
        return (
          <section key={kind} aria-labelledby={`memory-${kind}`}>
            <h2 id={`memory-${kind}`} className="text-[15px] font-semibold text-os-text">{heading}</h2>
            {rows.length ? (
              <ul className="mt-2 divide-y divide-os-border">
                {rows.map((item) => (
                  <li key={item.path} className="py-3">
                    <p className="text-sm font-medium text-os-text">
                      {item.title}
                      {fresh.has(item.path) && (
                        <span className="ml-2 rounded-full border border-os-border px-2 py-0.5 text-xs font-normal text-os-muted">New this week</span>
                      )}
                    </p>
                    {item.statement && item.statement !== item.title && <p className="mt-0.5 text-sm text-os-muted">{item.statement}</p>}
                    <p className="mt-0.5 text-xs text-os-dim">{ago(item.changedAt, now)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-os-muted">{empty}</p>
            )}
          </section>
        )
      })}
    </div>
  )
}
