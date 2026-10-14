"use client"

import Link from "next/link"
import { MessagesSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { CompanyCommandRunner } from "@/components/company-command-runner"
import { getCompanyCommand } from "@/lib/company-commands/registry"

export const CHECK_MESSAGES_BLURB =
  "Chat is where a company says the true things and then loses them. This reads the last day across every network you have connected in Beeper — WhatsApp, iMessage, Signal, Instagram, Telegram, Slack and the rest — and writes one note: what was discussed, what was actually decided, what nobody answered. It only reads; it never replies to anyone, and nothing is saved until you approve it."

/**
 * The card entry point for `check-messages`.
 *
 * v131 shipped the command with only a template `check-messages.md`, which was
 * a mistake this file exists to correct: template command files reach ONLY
 * companies scaffolded after they ship, and the workspace tree draws a Run
 * button by matching a real file to a registry entry — so for every company
 * that already existed, the whole feature was unreachable. Nothing rendered,
 * and the refusal that explains how to connect could never be read, because
 * reaching a refusal requires being able to run the command.
 *
 * Exactly the two-entry-points-for-two-populations fix `RefreshOntologyButton`
 * documents for the same cause. Costs a Sheet: `CompanyCommandRunner` already
 * owns the run button, the log tail, the diff, the approve step and the daily
 * schedule.
 */
export function CheckMessagesButton({ agentId }: { agentId: string }) {
  const command = getCompanyCommand("check-messages")
  if (!command) return null
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <MessagesSquare className="h-4 w-4" />
          What did the chats say
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>What did the chats say</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          <p className="text-xs text-muted-foreground">
            Reads the last 24 hours and writes one note into this company&rsquo;s folder.
          </p>
          {/* The connection is machine-wide, not per-company — there is nothing to
              wire up on this card, and saying so is the point: a user who came here
              looking for a per-company Beeper setting needs to be told it doesn't
              exist and sent to the one place it does. The Connect page is a real
              link, not prose naming it. */}
          <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Connecting is done once, for this computer</p>
            <p className="mt-1">
              There is no per-company setting — every company on this machine reads through the same
              Beeper connection.{" "}
              <Link href="/connect" className="text-primary underline underline-offset-4">
                Set it up on the Connect page
              </Link>
              : install{" "}
              <a href="https://www.beeper.com/" target="_blank" rel="noreferrer" className="underline">
                Beeper
              </a>
              , sign in to the chat apps you want read, then press Connect. No token is stored here or in
              this company&rsquo;s files.
            </p>
            <p className="mt-1">
              Beeper Desktop has to be running when this job runs. If it isn&rsquo;t connected, this says
              exactly what is missing instead of running.
            </p>
          </div>
          <CompanyCommandRunner command={command} agentId={agentId} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
