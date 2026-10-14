import Link from "next/link"

export type BrainView = "list" | "map"

const VIEWS: { id: BrainView; label: string }[] = [
  { id: "list", label: "List" },
  { id: "map", label: "Map" },
]

/** Plain server-rendered links, so the view lives in the URL and needs no client state. */
export function BrainViewSwitch({ companyId, active }: { companyId: string; active: BrainView }) {
  return (
    <nav aria-label="Brain view" className="mb-4 flex gap-2">
      {VIEWS.map(({ id, label }) => (
        <Link
          key={id}
          href={id === "list" ? `/c/${companyId}/brain` : `/c/${companyId}/brain?view=${id}`}
          aria-current={id === active ? "page" : undefined}
          className={`rounded-md border border-os-border px-3 py-1 text-sm ${id === active ? "bg-os-surface2 font-semibold text-os-text" : "text-os-muted"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
