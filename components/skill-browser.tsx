"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SkillEntry } from "@/lib/skills/types"
import type { SkillAgentResult } from "@/lib/get-all-skills"
import { getActivityDetail } from "@/lib/get-activity-detail"
import { SkillEditor } from "@/components/skill-editor"
import { SkillHistory } from "@/components/skill-history"
import { COMPANY_COMMANDS } from "@/lib/company-commands/registry"
import { CompanyCommandRunner } from "@/components/company-command-runner"

const KIND_BADGE_CLASS: Record<SkillEntry["kind"], string> = {
  skill: "border-teal-500/30 bg-teal-500/10 text-teal-400",
  command: "border-blue-500/30 bg-blue-500/10 text-blue-400",
}

export function SkillBrowser({
  results,
  entries,
}: {
  results: SkillAgentResult[]
  entries: SkillEntry[]
}) {
  const [selected, setSelected] = useState<SkillEntry | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [view, setView] = useState<"content" | "history" | "run">("content")

  const selectedAgent = selected ? results.find((r) => r.agent.id === selected.agentId)?.agent : undefined
  const matchedCompanyCommand =
    selected && selectedAgent?.kind === "command-set"
      ? COMPANY_COMMANDS.find((c) => selected.path.endsWith(`/commands/${c.commandFileName}`))
      : undefined

  async function openEntry(entry: SkillEntry) {
    setSelected(entry)
    setDetail(null)
    setDetailError(null)
    setView("content")
    try {
      const content = await getActivityDetail(entry.path)
      setDetail(content)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <div className="space-y-6">
        {results.map((result) => {
          const owned = entries.filter((entry) => entry.agentId === result.agent.id)
          return (
          <div key={result.agent.id} className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2">
              <h2 className="font-display text-lg font-bold">{result.agent.name}</h2>
              <Badge variant="outline" className="border-border text-muted-foreground">
                {owned.length} available
              </Badge>
              {/* Every company scaffolded from the template already inherits
                  .claude/skills and .claude/commands, so there is nothing to install. */}
              <span className="text-xs text-muted-foreground">
                already installed in this company. Open one to read or run it
              </span>
            </div>
            {result.error && <p className="text-sm text-destructive">Source unavailable: {result.error}</p>}
            {!result.error && owned.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No skills or commands found in this company&apos;s <code>.claude/</code> folder.
              </p>
            )}
            {!result.error && (
              <div className="grid gap-3 sm:grid-cols-2">
                {entries
                  .filter((entry) => entry.agentId === result.agent.id)
                  .map((entry) => (
                    <Card key={entry.id} className="cursor-pointer" onClick={() => openEntry(entry)}>
                      <CardHeader className="p-3">
                        <CardTitle className="flex items-center justify-between text-sm font-medium">
                          <span>{entry.name}</span>
                          <Badge variant="outline" className={KIND_BADGE_CLASS[entry.kind]}>
                            {entry.kind}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
                        {entry.description || "No description."}
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </div>
          )
        })}
      </div>
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
          </SheetHeader>
          <div className="flex gap-2 px-4">
            <Button size="sm" variant={view === "content" ? "default" : "outline"} onClick={() => setView("content")}>
              Content
            </Button>
            <Button size="sm" variant={view === "history" ? "default" : "outline"} onClick={() => setView("history")}>
              History
            </Button>
            {matchedCompanyCommand && (
              <Button size="sm" variant={view === "run" ? "default" : "outline"} onClick={() => setView("run")}>
                Run
              </Button>
            )}
          </div>
          <ScrollArea className="h-[80vh] pr-4">
            {view === "content" && (
              <>
                {detailError && <p className="text-destructive">{detailError}</p>}
                {!detailError && detail !== null && selected && (
                  <SkillEditor path={selected.path} initialContent={detail} onSaved={(newContent) => setDetail(newContent)} />
                )}
                {!detailError && detail === null && <p>Loading…</p>}
              </>
            )}
            {view === "history" && selected && (
              <SkillHistory
                path={selected.path}
                currentContent={detail}
                onReverted={(newContent) => {
                  setDetail(newContent)
                  setView("content")
                }}
              />
            )}
            {view === "run" && matchedCompanyCommand && selected && (
              <CompanyCommandRunner command={matchedCompanyCommand} agentId={selected.agentId} />
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
