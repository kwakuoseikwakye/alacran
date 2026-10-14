import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

export function StatTile({
  href,
  label,
  value,
  unit,
  foot,
  valueClass = "",
  alert = false,
}: {
  href: string
  label: string
  value: React.ReactNode
  unit: string
  foot?: React.ReactNode
  valueClass?: string
  alert?: boolean
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col justify-between rounded-lg border bg-os-surface px-[18px] py-4 transition-all duration-150 hover:border-os-border-strong hover:bg-os-surface2 ${
        alert ? "border-os-warn/40 hover:border-os-warn" : "border-os-border"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.26em] text-os-dim truncate">
          {label}
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 text-os-dim opacity-0 transition-opacity duration-150 group-hover:opacity-100 flex-shrink-0" />
      </div>

      <div className="my-3 flex items-baseline gap-1.5 flex-wrap">
        <span
          className={`text-[26px] font-mono font-semibold tracking-[-0.02em] leading-none ${
            alert ? "text-os-warn" : "text-os-text"
          } ${valueClass}`}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-os-dim font-normal">{unit}</span>}
      </div>

      {foot && (
        <div className="mt-auto flex items-center justify-between text-xs pt-1 border-t border-os-border/40 min-h-[26px]">
          {foot}
        </div>
      )}
    </Link>
  )
}
