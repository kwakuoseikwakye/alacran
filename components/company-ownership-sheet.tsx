"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { CopyButton } from "@/components/copy-button"
import { getCompanyOwnership } from "@/lib/ownership/ownership-actions"
import type { CompanyOwnership } from "@/lib/ownership/get-company-ownership-impl"

const AI_EXECUTOR_LABEL: Record<string, string> = {
  "claude-code": "Claude Code",
  "openai-codex": "OpenAI Codex CLI",
  aider: "Aider",
}

export function CompanyOwnershipSheet({ agentId, companyName }: { agentId: string; companyName: string }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [ownership, setOwnership] = useState<CompanyOwnership | null>(null)

  async function handleOpen() {
    setPending(true)
    const result = await getCompanyOwnership(agentId)
    setPending(false)
    setOwnership(result)
    setOpen(true)
  }

  return (
    <>
      <Button size="sm" variant="outline" className="w-full" onClick={handleOpen} disabled={pending}>
        {pending ? "Loading…" : "View ownership"}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>What {companyName} uses, and where it lives</SheetTitle>
            <SheetDescription>What stays on this machine, and what leaves it.</SheetDescription>
          </SheetHeader>
          {ownership && !ownership.ok && (
            <p className="px-4 text-sm text-destructive">Unable to load: {ownership.message}</p>
          )}
          {ownership && ownership.ok && (
            <div className="space-y-4 px-4 pb-4 text-sm">
              <section className="space-y-1.5">
                <h3 className="font-medium">Data location</h3>
                <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2">
                  <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-pre">
                    {ownership.rootPath}
                  </code>
                  <CopyButton text={ownership.rootPath} />
                </div>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-medium">AI provider</h3>
                <p className="text-muted-foreground">
                  {AI_EXECUTOR_LABEL[ownership.aiExecutorId] ?? ownership.aiExecutorId}
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-medium">Integrations</h3>
                <p className="text-muted-foreground">{ownership.integrationStatus}</p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-medium">Backup destination</h3>
                <p className="text-muted-foreground">
                  {ownership.remoteUrl ?? "Not backed up yet — nothing leaves this machine."}
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-medium">External network access</h3>
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                  {ownership.networkAccess.map((entry) => (
                    <li key={entry.label}>{entry.label}</li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
