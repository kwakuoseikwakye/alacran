"use client"

import { useState } from "react"
import { TerminalSquare, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { openInteractiveTerminal } from "@/lib/open-interactive-terminal"

/**
 * The direct answer to "I defined my company, now what?" — opens a real,
 * unscoped interactive session of this company's configured AI executor,
 * cd'd into its own directory, so the user can ask it to build or edit
 * skills themselves. No prompt, no allowlist: this is the same thing as
 * cd-ing there and running the executor by hand, just without typing it.
 */
export function OpenTerminalButton({ agentId }: { agentId: string }) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleClick() {
    setPending(true)
    setMessage(null)
    const result = await openInteractiveTerminal(agentId)
    setPending(false)
    setMessage(result.message)
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" className="w-full" onClick={handleClick} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TerminalSquare className="h-4 w-4" />}
        {pending ? "Opening…" : "Open in Terminal"}
      </Button>
      {message && !pending && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
