import type * as React from "react"

/** The latest finished reply, for screen readers. A new `version` re-announces identical text. */
export function AgentLiveRegion({ text, version }: { text: string; version?: number }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      <span key={version}>{text}</span>
    </div>
  )
}
