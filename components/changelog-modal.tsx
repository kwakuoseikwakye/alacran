"use client"

import { useEffect, useState, useMemo } from "react"
import {
  Sparkles,
  ArrowUpCircle,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Search,
  Calendar,
  ChevronRight,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RELEASE_PAGE_URL } from "@/lib/updates/fetch-latest-release-impl"
import { desktopUpdater, type DesktopUpdater } from "@/lib/updates/desktop-updater"
import { performUpdate, restartApp, getChangelogFeed } from "@/lib/updates/update-actions"
import { waitForServerThenReload } from "@/lib/updates/wait-for-server-then-reload"
import { ALACRAN_OPEN_CHANGELOG_EVENT, type OpenChangelogDetail } from "@/lib/updates/changelog-event"
import type { ChangelogFeed, ChangelogCategory } from "@/lib/updates/changelog-feed"
import { CommandLine } from "@/components/copy-button"

type UpdatePhase = "idle" | "updating" | "restarting" | "error"

export function ChangelogModal({
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  initialFeed,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  initialFeed?: ChangelogFeed
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen
  const setIsOpen = (next: boolean) => {
    if (isControlled) {
      setControlledOpen?.(next)
    } else {
      setInternalOpen(next)
    }
  }

  const [feed, setFeed] = useState<ChangelogFeed | null>(initialFeed ?? null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<"all" | ChangelogCategory>("all")
  const [phase, setPhase] = useState<UpdatePhase>("idle")
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<{ message: string; manualCommand?: string } | null>(null)
  const [desktop, setDesktop] = useState<DesktopUpdater | null>(null)

  useEffect(() => {
    setDesktop(desktopUpdater())
  }, [])

  // Listen to global open event
  useEffect(() => {
    function handleOpenEvent(e: Event) {
      const custom = e as CustomEvent<OpenChangelogDetail>
      setIsOpen(true)
      if (custom.detail?.initialTab) {
        setSelectedCategory(custom.detail.initialTab)
      }
    }

    window.addEventListener(ALACRAN_OPEN_CHANGELOG_EVENT, handleOpenEvent)
    return () => window.removeEventListener(ALACRAN_OPEN_CHANGELOG_EVENT, handleOpenEvent)
  }, [setIsOpen])

  // Fetch changelog feed when opened if not loaded
  useEffect(() => {
    if (isOpen && !feed && !loading) {
      setLoading(true)
      getChangelogFeed()
        .then((data) => setFeed(data))
        .catch(() => {
          // Fallback to fetch API if server action fails
          fetch("/api/changelog")
            .then((res) => res.json())
            .then((data) => setFeed(data))
            .catch(() => setFeed(null))
        })
        .finally(() => setLoading(false))
    }
  }, [isOpen, feed, loading])

  async function handleUpdateAndRestart() {
    setPhase("updating")
    setError(null)

    if (desktop) {
      const stop = desktop.onProgress(setPercent)
      const outcome = await desktop.install()
      stop()
      if (!outcome.ok) {
        setPhase("error")
        setError({ message: outcome.error ?? "The update could not be downloaded." })
        return
      }
      setPhase("restarting")
      return
    }

    const outcome = await performUpdate()
    if (!outcome.ok) {
      setPhase("error")
      setError({ message: outcome.message, manualCommand: outcome.manualCommand })
      return
    }
    setPhase("restarting")
    void restartApp()
    void waitForServerThenReload()
  }

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (!feed?.entries) return []
    return feed.entries.filter((entry) => {
      const matchesCategory =
        selectedCategory === "all" || entry.category === selectedCategory
      if (!matchesCategory) return false

      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        (entry.version ?? "").toLowerCase().includes(q) ||
        entry.title.toLowerCase().includes(q) ||
        entry.highlights.some((h) => h.toLowerCase().includes(q))
      )
    })
  }, [feed?.entries, selectedCategory, searchQuery])

  const categoryCounts = useMemo(() => {
    const counts = { all: 0, feature: 0, improvement: 0, fix: 0 }
    if (!feed?.entries) return counts
    counts.all = feed.entries.length
    for (const e of feed.entries) {
      counts[e.category] = (counts[e.category] || 0) + 1
    }
    return counts
  }, [feed?.entries])

  const canInstall = feed?.canAutoUpdate || Boolean(desktop)
  const currentVer = feed?.currentVersion ?? "..."
  const latestVer = feed?.latestVersion ?? currentVer
  const hasUpdate = feed?.hasUpdate ?? false

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        className="max-w-2xl bg-os-surface border border-os-border text-os-text p-0 gap-0 overflow-hidden shadow-2xl backdrop-blur-xl"
        data-testid="changelog-modal"
      >
        {/* Top subtle glow accent line */}
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-primary to-sky-500" />

        {/* Dialog Header */}
        <DialogHeader className="p-6 pb-4 border-b border-os-border">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
                <Sparkles className="size-4.5 animate-pulse" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight text-os-text flex items-center gap-2">
                  What&apos;s New in Alacrán
                </DialogTitle>
                <DialogDescription className="text-xs text-os-muted">
                  Updates, feature highlights, and improvements.
                </DialogDescription>
              </div>
            </div>

            {/* Version comparison badge */}
            <div className="mr-8 flex items-center gap-1.5 text-xs font-mono">
              <span className="rounded-md border border-os-border bg-os-surface2 px-2 py-0.5 text-os-muted">
                v{currentVer}
              </span>
              {hasUpdate && (
                <>
                  <ChevronRight className="size-3 text-muted-foreground" />
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
                    v{latestVer}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Search and Category Filter Strip */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search updates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border/50 bg-background/50 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedCategory === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                All ({categoryCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory("feature")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedCategory === "feature"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                Features ({categoryCounts.feature})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory("improvement")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedCategory === "improvement"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                Improvements ({categoryCounts.improvement})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory("fix")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedCategory === "fix"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                Fixes ({categoryCounts.fix})
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body - Scrollable Timeline */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[50vh] overscroll-contain">
          {loading && !feed && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <RefreshCw className="size-5 animate-spin text-primary" />
              <p className="text-xs">Loading updates...</p>
            </div>
          )}

          {/* GitHub Release Notes Banner if available */}
          {feed?.releaseNotes?.body && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-primary flex items-center gap-1.5">
                  <ArrowUpCircle className="size-3.5" />
                  GitHub Release: {feed.releaseNotes.name || feed.releaseNotes.tagName}
                </span>
                {feed.releaseNotes.publishedAt && (
                  <span className="text-muted-foreground text-[11px]">
                    {new Date(feed.releaseNotes.publishedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                {feed.releaseNotes.body}
              </div>
            </div>
          )}

          {filteredEntries.length === 0 && !loading && (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {searchQuery.trim()
                ? `No updates found matching \u201C${searchQuery}\u201D.`
                : "No updates to show yet."}
            </div>
          )}

          {/* Timeline of Slices */}
          <div className="space-y-3.5">
            {filteredEntries.map((item) => (
              <div
                key={item.id}
                className="group relative rounded-xl border border-os-border bg-os-surface2/40 hover:bg-os-surface2/70 p-4 transition-all duration-150 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {item.version && (
                      <span className="font-mono text-xs font-bold text-os-text px-2 py-0.5 rounded-md bg-os-surface2 border border-os-border">
                        v{item.version}
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-medium uppercase tracking-wider ${
                        item.category === "feature"
                          ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                          : item.category === "fix"
                          ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
                          : "border-sky-500/30 text-sky-400 bg-sky-500/10"
                      }`}
                    >
                      {item.category}
                    </Badge>
                  </div>

                  {item.date && (
                    <span className="flex items-center gap-1 text-[11px] text-os-muted font-mono">
                      <Calendar className="size-3" />
                      {item.date}
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-semibold text-os-text group-hover:text-os-accent transition-colors">
                  {item.title}
                </h4>

                {item.highlights && item.highlights.length > 0 && (
                  <ul className="space-y-1.5 pt-1 text-xs text-os-muted border-t border-os-border">
                    {item.highlights.map((highlight, i) => (
                      <li key={i} className="flex items-start gap-2 leading-snug">
                        <CheckCircle2 className="size-3 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="border-t border-os-border bg-os-surface2/60 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Status feedback & progress */}
          <div className="text-xs text-os-muted flex-1 w-full sm:w-auto">
            {phase === "restarting" ? (
              <span className="text-emerald-400 font-medium animate-pulse">
                Update installed! Restarting Alacrán…
              </span>
            ) : phase === "updating" ? (
              <div className="flex items-center gap-2">
                <RefreshCw className="size-3.5 animate-spin text-primary" />
                <span>
                  {percent !== null
                    ? `Downloading & installing ${percent}%…`
                    : "Downloading & installing update…"}
                </span>
              </div>
            ) : phase === "error" && error ? (
              <div className="space-y-1 text-destructive">
                <span>{error.message}</span>
                {error.manualCommand && <CommandLine command={error.manualCommand} />}
              </div>
            ) : hasUpdate ? (
              <span className="text-os-text">
                Version <strong className="text-emerald-400 font-mono">v{latestVer}</strong> is available to install.
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                You are on the latest version ({currentVer}).
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <a
              href={RELEASE_PAGE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
            >
              GitHub releases <ExternalLink className="size-3" />
            </a>

            {hasUpdate && canInstall ? (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleUpdateAndRestart()}
                disabled={phase === "updating" || phase === "restarting"}
                className="bg-primary text-primary-foreground font-semibold shadow-md hover:bg-primary/90"
              >
                {phase === "updating" ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                    Updating…
                  </>
                ) : (
                  <>
                    <ArrowUpCircle className="size-3.5 mr-1.5" />
                    Update &amp; Restart
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="border-white/10 hover:bg-white/5"
              >
                Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
