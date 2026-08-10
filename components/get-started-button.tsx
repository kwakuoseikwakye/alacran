"use client"

import { useState } from "react"
import { Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { openInteractiveTerminalWithHelp } from "@/lib/open-interactive-terminal-with-help"

export const GET_STARTED_BLURB =
  "Not sure what to do with this company? Your AI assistant reads everything you've set up here — the skills you built, how you defined the company — and tells you in plain language what it can actually help you do, then waits for you to answer."

/**
 * The direct answer to "I built the skills and defined the company, now
 * how do I actually use it?" — same real interactive session as "Open in
 * Terminal" (same executor, same unscoped access, same company directory),
 * just seeded with a first message instead of opening blank. Every
 * executor can't be seeded this way (see ai-executors.ts); when it can't,
 * this still opens the terminal, just without the intro — the returned
 * message says so.
 */
export function GetStartedButton({ agentId }: { agentId: string }) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleClick() {
    setPending(true)
    setMessage(null)
    const result = await openInteractiveTerminalWithHelp(agentId)
    setPending(false)
    setMessage(result.message)
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" className="w-full" onClick={handleClick} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {pending ? "Opening…" : "Get Started"}
      </Button>
      {message && !pending && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
