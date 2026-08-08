"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
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
  skill: "border-teal-500/30 bg-teal-500/10 text-teal-400 font-mono text-[10px] tracking-wider uppercase",
  command: "border-blue-500/30 bg-blue-500/10 text-blue-400 font-mono text-[10px] tracking-wider uppercase",
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
      <div className="space-y-12 pb-12">
        {results.map((result) => {
          const owned = entries.filter((entry) => entry.agentId === result.agent.id)
          return (
          <div key={result.agent.id} className="space-y-4">
            <div className="flex flex-col gap-2 rounded-xl bg-shell-2 p-4 border border-line">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-display text-xl font-bold text-bone">{result.agent.name}</h2>
                <Badge variant="outline" className="border-line bg-shell text-dune">
                  {owned.length} available
                </Badge>
              </div>
              <span className="text-xs font-mono text-dune">
                Installed in this workspace. Click to read or run.
              </span>
            </div>
            {result.error && <p className="text-sm text-red-500 font-mono">Source unavailable: {result.error}</p>}
            {!result.error && owned.length === 0 && (
              <p className="text-sm font-mono text-dune p-4 border border-line rounded-xl bg-shell/50">
                No skills or commands found in this company&apos;s <code>.claude/</code> folder.
              </p>
            )}
            {!result.error && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {entries
                  .filter((entry) => entry.agentId === result.agent.id)
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className="group flex cursor-pointer flex-col justify-between rounded-xl border border-line bg-shell p-5 transition-all hover:border-red-500/50 hover:bg-void hover:shadow-lg"
                      onClick={() => openEntry(entry)}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <h3 className="font-display text-sm font-semibold text-bone transition-colors group-hover:text-red-400">
                            {entry.name}
                          </h3>
                          <Badge variant="outline" className={KIND_BADGE_CLASS[entry.kind]}>
                            {entry.kind}
                          </Badge>
                        </div>
                        <p className="text-xs text-dune line-clamp-3 leading-relaxed">
                          {entry.description || "No description."}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
          )
        })}
      </div>
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl border-l border-glass-edge bg-void/80 backdrop-blur-2xl">
          <SheetHeader className="border-b border-line pb-4 mb-4">
            <SheetTitle className="font-display text-xl text-bone">{selected?.name}</SheetTitle>
          </SheetHeader>
          <div className="flex gap-2 px-1 mb-4">
            <button
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                view === "content" ? "bg-bone text-void" : "bg-shell border border-line text-bone hover:bg-shell-2"
              }`}
              onClick={() => setView("content")}
            >
              Content
            </button>
            <button
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                view === "history" ? "bg-bone text-void" : "bg-shell border border-line text-bone hover:bg-shell-2"
              }`}
              onClick={() => setView("history")}
            >
              History
            </button>
            {matchedCompanyCommand && (
              <button
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                  view === "run" ? "bg-red-500 text-white" : "bg-shell border border-line text-red-400 hover:bg-red-500/10"
                }`}
                onClick={() => setView("run")}
              >
                Run
              </button>
            )}
          </div>
          <ScrollArea className="h-[calc(100vh-140px)]">
            {view === "content" && (
              <>
                {detailError && <p className="text-red-500 text-sm font-mono px-1">{detailError}</p>}
                {!detailError && detail !== null && selected && (
                  <div className="px-1"><SkillEditor path={selected.path} initialContent={detail} onSaved={(newContent) => setDetail(newContent)} /></div>
                )}
                {!detailError && detail === null && <p className="px-1 text-dune font-mono text-sm">Loading…</p>}
              </>
            )}
            {view === "history" && selected && (
              <div className="px-1">
                <SkillHistory
                  path={selected.path}
                  currentContent={detail}
                  onReverted={(newContent) => {
                    setDetail(newContent)
                    setView("content")
                  }}
                />
              </div>
            )}
            {view === "run" && matchedCompanyCommand && selected && (
              <div className="px-1">
                <CompanyCommandRunner command={matchedCompanyCommand} agentId={selected.agentId} />
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
