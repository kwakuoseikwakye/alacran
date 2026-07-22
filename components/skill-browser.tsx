"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SkillEntry } from "@/lib/skills/types"
import type { SkillAgentResult } from "@/lib/get-all-skills"
import { getActivityDetail } from "@/lib/get-activity-detail"

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

  async function openEntry(entry: SkillEntry) {
    setSelected(entry)
    setDetail(null)
    setDetailError(null)
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
          <ScrollArea className="h-[80vh] pr-4">
            {detailError && <p className="text-destructive">{detailError}</p>}
            {!detailError && <pre className="whitespace-pre-wrap text-sm">{detail ?? "Loading…"}</pre>}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
