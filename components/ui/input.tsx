import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-os-border bg-os-surface px-3 py-1 text-sm text-os-text shadow-xs transition-colors outline-none placeholder:text-os-dim focus-visible:border-os-accent focus-visible:ring-1 focus-visible:ring-os-accent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-os-err",
        className
      )}
      {...props}
    />
  )
}

export { Input }
