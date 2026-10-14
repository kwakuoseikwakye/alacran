import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-os-border bg-os-surface px-3 py-2 text-sm text-os-text shadow-xs transition-colors outline-none placeholder:text-os-dim focus-visible:border-os-accent focus-visible:ring-1 focus-visible:ring-os-accent disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-os-err",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
