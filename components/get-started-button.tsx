"use client"

import { useState } from "react"
import { Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { openInteractiveTerminalWithHelp } from "@/lib/open-interactive-terminal-with-help"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { CompanyCommandRunner } from "@/components/company-command-runner"
import { getCompanyCommand } from "@/lib/company-commands/registry"
import { useAdvancedMode } from "@/components/advanced-only"

export const GET_STARTED_BLURB =
  "Not sure what to do with this company? Your AI assistant reads everything you've set up here — the skills you built, how you defined the company — and tells you in plain language what it can actually help you do, then waits for you to answer."

/** Simple mode's Get Started writes a note and shows you the change to
 *  approve — no session, nothing to type into. v39's invariant is that the
 *  guide never describes a button that isn't there; it also must not describe
 *  a button doing something it doesn't do in the mode the reader is in. */
export const GET_STARTED_RUN_BLURB =
  "Not sure what to do with this company? Your AI reads everything you've set up here — the skills you built, how you defined the company — and writes you a short plain-language note: what it can help with, and three things to try first. You see the note before it's saved, and nothing is kept unless you approve it."

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
  const advanced = useAdvancedMode()
  // Simple mode never opens a terminal. It runs the `orientation` command
  // through the machinery every other command already uses — agent writes a
  // note, user reads the diff, user approves. Same answer, delivered as
  // something a non-technical user can actually read and keep, instead of a
  // reply that scrolls away in a window they didn't ask for.
  if (!advanced) return <GetStartedRun agentId={agentId} />
  return <GetStartedTerminal agentId={agentId} />
}

function GetStartedRun({ agentId }: { agentId: string }) {
  const command = getCompanyCommand("orientation")
  if (!command) return null
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" className="w-full">
          <Sparkles className="h-4 w-4" />
          Get Started
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>What can I do here?</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <CompanyCommandRunner command={command} agentId={agentId} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function GetStartedTerminal({ agentId }: { agentId: string }) {
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
      <Button size="sm" className="w-full" onClick={handleClick} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {pending ? "Opening…" : "Get Started"}
      </Button>
      {message && !pending && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
