"use client"

import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { CompanyCommandRunner } from "@/components/company-command-runner"
import { getCompanyCommand } from "@/lib/company-commands/registry"

export const REFRESH_ONTOLOGY_BLURB =
  "Your company info was true the day you wrote it. This reads what's happened since — the notes, decisions and retros you've added, plus anything you've connected — and shows you the specific lines it thinks are now out of date. Nothing is saved until you approve the change, and \"nothing needs updating\" is a normal answer."

/**
 * The upkeep half of the setup wizard. `define-company` writes the ontology
 * once; this is how it stays true afterwards, without anyone having to
 * remember what they typed months ago.
 *
 * Structurally identical to GetStartedButton's simple-mode branch, and for
 * the same reason: `CompanyCommandRunner` already owns the run button, the
 * log tail, the diff, the approve step and the daily schedule, so a second
 * entry point onto an existing registry command costs a Sheet and nothing
 * else. Rendered on the card rather than only in the Skills tree because
 * every company that already exists has an ontology and no `refresh.md` —
 * template files only reach companies scaffolded after they shipped.
 */
export function RefreshOntologyButton({ agentId }: { agentId: string }) {
  const command = getCompanyCommand("refresh")
  if (!command) return null
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <RefreshCw className="h-4 w-4" />
          Refresh company info
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>What&rsquo;s changed since you wrote this?</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <CompanyCommandRunner command={command} agentId={agentId} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
