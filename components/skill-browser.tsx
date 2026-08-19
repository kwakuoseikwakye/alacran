"use client"

import { useRef, useState } from "react"
import { ChevronDown, ChevronRight, FileCode2, FileText, Folder, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import type { SkillEntry } from "@/lib/skills/types"
import type { SkillAgentResult } from "@/lib/get-all-skills"
import { getActivityDetail } from "@/lib/get-activity-detail"
import { SkillEditor } from "@/components/skill-editor"
import { SkillHistory } from "@/components/skill-history"
import { COMPANY_COMMANDS } from "@/lib/company-commands/registry"
import { CompanyCommandRunner } from "@/components/company-command-runner"

const KIND_LABEL: Record<SkillEntry["kind"], string> = { skill: "Skills", command: "Commands" }

/**
 * Two-pane file explorer: companies and their files on the left, the selected
 * file's content on the right.
 *
 * Replaces a grid of description cards — one per skill — which for a company
 * with 17 of them was several screens of prose with no hierarchy and nothing
 * to scan by. The tree makes the shape of a company visible (this is what a
 * company HAS) and moves the descriptions to where they're read, next to the
 * content.
 *
 * The detail pane is inline rather than a Sheet: a Sheet covers the tree, so
 * comparing two files meant closing and reopening. Below `md` the panes stack,
 * which is the same information in the one order that fits a phone.
 *
 * Every colour here is a real token. The previous version used `bg-shell`,
 * `bg-shell-2`, `border-line`, `text-bone` and `text-dune` — five tokens that
 * stopped existing when the palette changed, so those classes resolved to
 * nothing: transparent panels, and a bare `border` falling back to
 * currentColor, which is why the page read as broken rather than merely dense.
 */
export function SkillBrowser({
  results,
  entries,
  appManagedPaths = [],
  pendingKeys = [],
}: {
  results: SkillAgentResult[]
  entries: SkillEntry[]
  /** Skills the app installed and updates — read-only (see lib/vendored-skills.ts). */
  appManagedPaths?: string[]
  /** "<agentId>:<commandId>" for every run whose result is still unapproved. */
  pendingKeys?: string[]
}) {
  const appManaged = new Set(appManagedPaths)
  const pending = new Set(pendingKeys)
  const [selected, setSelected] = useState<SkillEntry | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [view, setView] = useState<"content" | "edit" | "history" | "run">("content")
  const [query, setQuery] = useState("")
  // Closed until asked. Every company was expanded by default, which for a
  // machine with a few of them was a wall of file rows to scroll past before
  // reaching the one you wanted — the shape of a company is what the folder row
  // and its count already say. Keyed by what's OPEN, so the empty default is
  // "all closed" rather than a lookup that has to remember to invert.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const detailRef = useRef<HTMLElement | null>(null)

  const selectedAgent = selected ? results.find((r) => r.agent.id === selected.agentId)?.agent : undefined
  const matchedCompanyCommand =
    selected && selectedAgent?.kind === "command-set"
      ? COMPANY_COMMANDS.find((c) => selected.path.endsWith(`/commands/${c.commandFileName}`))
      : undefined

  // Same filename match the Run tab uses to find a command's registry entry —
  // the tree only knows files, the pending list only knows command ids.
  function commandIdFor(entry: SkillEntry): string | undefined {
    return COMPANY_COMMANDS.find((c) => entry.path.endsWith(`/commands/${c.commandFileName}`))?.id
  }

  function hasPendingResult(entry: SkillEntry): boolean {
    const commandId = commandIdFor(entry)
    return commandId ? pending.has(`${entry.agentId}:${commandId}`) : false
  }

  const q = query.trim().toLowerCase()
  const visible = q
    ? entries.filter((e) => e.name.toLowerCase().includes(q) || (e.description ?? "").toLowerCase().includes(q))
    : entries

  async function openEntry(entry: SkillEntry) {
    setSelected(entry)
    // Below `md` the panes stack, so the file you just tapped opens off-screen
    // under a tree that can be 17 rows long. Desktop is unaffected: the pane is
    // already in view, and scrollIntoView on an in-view element is a no-op.
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    setDetail(null)
    setDetailError(null)
    setView("content")
    try {
      setDetail(await getActivityDetail(entry.path))
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err))
    }
  }

  const tab = (id: typeof view, label: string) => (
    <button
      key={id}
      onClick={() => setView(id)}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        view === id
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="grid gap-4 pb-12 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      {/* ---------------------------------------------------------- tree */}
      <aside className="rounded-xl border border-border bg-card/60">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-8 pl-7 text-xs"
              aria-label="Search skills and commands"
            />
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-1.5">
          {results.map((result) => {
            const owned = visible.filter((e) => e.agentId === result.agent.id)
            // A search that matches nothing in this company hides it entirely —
            // an empty folder is noise when you're looking for one file.
            if (q && owned.length === 0) return null
            // A search whose matches are hidden behind a closed folder is a
            // search that found nothing, so searching opens them.
            const isExpanded = !!expanded[result.agent.id] || q !== ""
            return (
              <div key={result.agent.id} className="mb-1">
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [result.agent.id]: !e[result.agent.id] }))}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold hover:bg-muted"
                >
                  {isExpanded ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{result.agent.name}</span>
                  <span className="shrink-0 text-[10px] font-normal text-muted-foreground">{owned.length}</span>
                </button>

                {isExpanded && (
                  <div className="ml-2 border-l border-border pl-1.5">
                    {result.error && (
                      <p className="px-2 py-1.5 text-[11px] text-destructive">Source unavailable: {result.error}</p>
                    )}
                    {!result.error && owned.length === 0 && (
                      <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Nothing installed yet.</p>
                    )}
                    {(["skill", "command"] as const).map((kind) => {
                      const ofKind = owned.filter((e) => e.kind === kind)
                      if (ofKind.length === 0) return null
                      return (
                        <div key={kind} className="mt-1">
                          <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            {KIND_LABEL[kind]}
                          </p>
                          {ofKind.map((entry) => {
                            const active = selected?.id === entry.id
                            return (
                              <button
                                key={entry.id}
                                onClick={() => openEntry(entry)}
                                title={entry.name}
                                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                  active
                                    ? "bg-primary/15 text-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                              >
                                {kind === "command" ? (
                                  <FileCode2 className="size-3.5 shrink-0" />
                                ) : (
                                  <FileText className="size-3.5 shrink-0" />
                                )}
                                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                                {hasPendingResult(entry) && (
                                  <span
                                    className="size-1.5 shrink-0 rounded-full bg-primary"
                                    title="A result is waiting for you to approve"
                                    aria-label="Result waiting for approval"
                                  />
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      {/* -------------------------------------------------------- detail */}
      <section ref={detailRef} className="min-w-0 scroll-mt-4 rounded-xl border border-border bg-card/60">
        {!selected ? (
          <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 p-8 text-center">
            <FileText className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Pick a file to read it</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Everything your companies can do lives here. Choose one on the left to read it, edit it, see its history,
              or run it.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="min-w-0 truncate font-display text-lg font-bold">{selected.name}</h2>
                  <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                    {selected.kind}
                  </Badge>
                </div>
                {selected.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{selected.description}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1 rounded-lg border border-border p-1">
                {tab("content", "Content")}
                {!appManaged.has(selected.path) && tab("edit", "Edit")}
                {tab("history", "History")}
                {matchedCompanyCommand && tab("run", "Run")}
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4">
              {appManaged.has(selected.path) && (
                <p className="mb-3 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                  Kept up to date by Alacrán — new versions arrive with app updates, so this one
                  isn&apos;t editable. Copy it to a new name if you want your own version.
                </p>
              )}
              {(view === "content" || view === "edit") && (
                <>
                  {detailError && <p className="text-sm text-destructive">{detailError}</p>}
                  {!detailError && detail !== null && (
                    <SkillEditor
                      path={selected.path}
                      initialContent={detail}
                      editing={view === "edit"}
                      onEditingChange={(editing) => setView(editing ? "edit" : "content")}
                      onSaved={(newContent) => setDetail(newContent)}
                    />
                  )}
                  {!detailError && detail === null && <p className="text-sm text-muted-foreground">Loading…</p>}
                </>
              )}
              {view === "history" && (
                <SkillHistory
                  path={selected.path}
                  currentContent={detail}
                  onReverted={(newContent) => {
                    setDetail(newContent)
                    setView("content")
                  }}
                />
              )}
              {view === "run" && matchedCompanyCommand && (
                <CompanyCommandRunner command={matchedCompanyCommand} agentId={selected.agentId} />
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
