import type React from "react"
import { User, ShieldCheck, Crown } from "lucide-react"

export type FounderCardProps = {
  title?: string
  name?: string
  scope?: string
  avatarUrl?: string | null
  className?: string
}

export function FounderCard({
  title = "Lead Operator / Founder",
  name = "Founder / Operator",
  scope = "Final approval gate, ontology ownership, banking & legal authority",
  avatarUrl,
  className = "",
}: FounderCardProps) {
  return (
    <div
      className={`flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-4 shadow-sm transition-all duration-150 hover:border-os-border-strong hover:bg-os-surface2 ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded border border-os-border/80 bg-os-surface2 text-os-accent overflow-hidden">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={name} className="size-full object-cover" />
              ) : (
                <User className="size-4" />
              )}
            </div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-os-dim">
              Human Governance
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded bg-os-surface3 border border-os-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-os-dim">
            <Crown className="size-2.5 text-os-accent" />
            Apex
          </span>
        </div>

        <div className="space-y-0.5">
          <h3 className="font-display text-sm font-semibold tracking-tight text-os-text truncate">
            {name}
          </h3>
          <p className="font-mono text-xs text-os-dim">{title}</p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-os-border/50">
        <div className="flex items-start gap-1.5 text-xs text-os-dim">
          <ShieldCheck className="size-3.5 text-os-accent flex-shrink-0 mt-0.5" />
          <p className="line-clamp-2 leading-relaxed text-[11px] text-os-text-2">
            <span className="font-mono text-[10px] uppercase text-os-dim mr-1">Scope:</span>
            {scope}
          </p>
        </div>
      </div>
    </div>
  )
}
