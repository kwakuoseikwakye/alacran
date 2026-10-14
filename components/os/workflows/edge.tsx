import { ChevronRight } from "lucide-react"

export function Edge({ label }: { label?: string | null }) {
  return (
    <div className="min-w-[60px] shrink-0 flex flex-col items-center justify-center px-1 self-center">
      {label && (
        <span className="font-mono text-[9px] uppercase tracking-wide text-os-accent mb-1 truncate max-w-[90px] text-center">
          {label}
        </span>
      )}
      <div className="flex w-full items-center">
        <div className="h-px flex-1 bg-os-border" />
        <ChevronRight className="h-3.5 w-3.5 text-os-dim shrink-0 -ml-1" />
      </div>
    </div>
  )
}
