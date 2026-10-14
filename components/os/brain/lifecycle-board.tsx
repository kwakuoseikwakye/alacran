import type { LifecycleCard, Stage } from "@/lib/os/brain/lifecycle"

const COLUMNS: { key: Stage; label: string; empty: string }[] = [
  { key: "source", label: "Source", empty: "No sweeps yet — run /check-messages, /check-inbox, or /check-notion." },
  { key: "signal", label: "Signal", empty: "No digests yet — run /digest." },
  { key: "claim", label: "Claim", empty: "Nothing awaiting promotion." },
  { key: "fact", label: "Fact", empty: "No ontology yet — run /define-company." },
  { key: "memory", label: "Memory", empty: "No decisions or summary recorded yet." },
]

/**
 * Five columns over `buildLifecycle`'s result. No state of its own — this is
 * the read-only picture of the gate; the review rail (Task 12) is where a
 * claim actually gets acted on.
 *
 * Empty is the common case here, not the edge case: this repo's own test data
 * has no notes/company/{messages,digests,...} at all, so Source and Signal are
 * routinely empty. Each column says what would fill it rather than showing
 * nothing.
 */
export function LifecycleBoard({ lifecycle }: { lifecycle: Record<Stage, LifecycleCard[]> }) {
  return (
    <div className="brain-lifecycle">
      {COLUMNS.map(({ key, label, empty }) => {
        const cards = lifecycle[key]
        return (
          <section key={key} className="brain-lifecycle-col" data-stage={key} aria-label={label}>
            <header className="brain-lifecycle-col-head">
              <span>{label}</span>
              {/* The claim column's count IS the promotion gate — it says how
                  many things are waiting on a human before this repository's
                  facts change. */}
              <span className="brain-lifecycle-count">{cards.length}</span>
            </header>
            {cards.length === 0 ? (
              <p className="brain-empty">{empty}</p>
            ) : (
              <ul className="brain-lifecycle-cards">
                {cards.map((c) => (
                  <li key={c.id} className="brain-lifecycle-card">
                    <p className="brain-lifecycle-card-label">{c.label}</p>
                    <p className="brain-lifecycle-card-detail">{c.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
