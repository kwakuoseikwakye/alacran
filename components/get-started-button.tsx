"use client"

import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OPEN_TERMINAL_EVENT, type OpenTerminalDetail } from "@/lib/terminal-panel-event"
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
 * The direct answer to "I built the skills and defined the company, now how do
 * I actually use it?" — a real interactive session with the company's own
 * executor, seeded with a first message instead of opening blank.
 *
 * **It opens the terminal INSIDE the app, not one of the user's own windows.**
 * It used to shell out to `open -a Terminal`, which throws a non-technical user
 * into a bare OS window they did not ask for and cannot get back from — the
 * exact ejection v106 built the in-app dock to avoid, and the reason that dock
 * ships to everyone rather than hiding behind Advanced mode. The in-app
 * terminal's assistant tab is already the same thing: `buildAssistantLaunch`
 * seeds it with `buildGetStartedIntroPrompt`, the very prompt this button used
 * to send. So this now asks the workspace to open that, and the two paths
 * cannot describe the same company two different ways because they are one
 * path.
 */
export function GetStartedButton({
  agentId,
  variant = "default",
}: {
  agentId: string
  /** Drops to "outline" while a company still has a setup wizard above it —
   *  two solid buttons on one card is no hierarchy at all, which is the thing
   *  the three-tier layout exists to fix. */
  variant?: "default" | "outline"
}) {
  const advanced = useAdvancedMode()
  // Simple mode never opens a terminal. It runs the `orientation` command
  // through the machinery every other command already uses — agent writes a
  // note, user reads the diff, user approves. Same answer, delivered as
  // something a non-technical user can actually read and keep, instead of a
  // reply that scrolls away in a window they didn't ask for.
  if (!advanced) return <GetStartedRun agentId={agentId} variant={variant} />
  return <GetStartedTerminal agentId={agentId} variant={variant} />
}

function GetStartedRun({ agentId, variant }: { agentId: string; variant: "default" | "outline" }) {
  const command = getCompanyCommand("orientation")
  if (!command) return null
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant={variant} className="w-full">
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

function GetStartedTerminal({ agentId, variant }: { agentId: string; variant: "default" | "outline" }) {
  return (
    <Button
      size="sm"
      variant={variant}
      className="w-full"
      onClick={() =>
        // A DOM event because the workspace owns the terminal's open state and
        // AgentCard is rendered on the SERVER and handed to it as a node —
        // there is no prop to pass down. Same mechanism ADVANCED_MODE_EVENT
        // already uses to reach client components from outside their tree.
        window.dispatchEvent(
          new CustomEvent<OpenTerminalDetail>(OPEN_TERMINAL_EVENT, { detail: { agentId } })
        )
      }
    >
      <Sparkles className="h-4 w-4" />
      Get Started
    </Button>
  )
}
