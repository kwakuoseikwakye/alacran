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

  const matchedCompanyCommand =
    selected && selected.agentId === "ai-company-starter-main"
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
        {results.map((result) => (
          <div key={result.agent.id} className="space-y-2">
            <h2 className="font-medium">{result.agent.name}</h2>
            {result.error && <p className="text-sm text-destructive">Source unavailable: {result.error}</p>}
            {!result.error && (
              <div className="grid gap-3 sm:grid-cols-2">
                {entries
                  .filter((entry) => entry.agentId === result.agent.id)
                  .map((entry) => (
                    <Card key={entry.id} className="cursor-pointer" onClick={() => openEntry(entry)}>
                      <CardHeader className="p-3">
                        <CardTitle className="flex items-center justify-between text-sm font-medium">
                          <span>{entry.name}</span>
                          <Badge variant="outline">{entry.kind}</Badge>
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
        ))}
      </div>
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-xl">
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
            {view === "run" && matchedCompanyCommand && <CompanyCommandRunner command={matchedCompanyCommand} />}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
