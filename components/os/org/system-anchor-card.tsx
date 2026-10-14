import Link from "next/link"
import type React from "react"
import { ArrowUpRight } from "lucide-react"

export type SystemAnchorCardProps = {
  href: string
  title: string
  caption: string
  count?: string | number
  icon: React.ReactNode
  className?: string
}

export function SystemAnchorCard({
  href,
  title,
  caption,
  count,
  icon,
  className = "",
}: SystemAnchorCardProps) {
  return (
    <Link
      href={href}
      className={`group flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-4 shadow-sm transition-all duration-150 hover:border-os-border-strong hover:bg-os-surface2 ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded border border-os-border/80 bg-os-surface2 text-os-accent group-hover:border-os-border-strong">
              {icon}
            </div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-os-dim">
              System Anchor
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {count !== undefined && (
              <span className="rounded bg-os-surface3 px-2 py-0.5 font-mono text-[11px] font-semibold text-os-text border border-os-border">
                {count}
              </span>
            )}
            <ArrowUpRight className="size-3.5 text-os-dim opacity-0 transition-opacity duration-150 group-hover:opacity-100 flex-shrink-0" />
          </div>
        </div>

        <div className="space-y-0.5">
          <h3 className="font-display text-sm font-semibold tracking-tight text-os-text group-hover:text-os-accent transition-colors">
            {title}
          </h3>
          <p className="line-clamp-2 leading-relaxed text-[11px] text-os-text-2">
            {caption}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-os-border/50 flex items-center justify-between text-xs text-os-dim">
        <span className="font-mono text-[10px] uppercase tracking-wider text-os-dim">Explore</span>
        <span className="font-mono text-[10px] text-os-accent group-hover:underline inline-flex items-center gap-0.5">
          Open Surface &rarr;
        </span>
      </div>
    </Link>
  )
}
