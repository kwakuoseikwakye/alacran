"use client"

import { useEffect, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DiffView } from "@/components/diff-view"
import { StrayFilesNotice } from "@/components/stray-files-notice"
import { getCompanyCommandResult } from "@/lib/company-commands/company-command-result"
import { commitCompanyCommandResult } from "@/lib/company-commands/commit-company-command-result"
import type { CompanyCommandResult } from "@/lib/company-commands/company-command-result-impl"
import type { LifecycleCard } from "@/lib/os/brain/lifecycle"

/**
 * The only place in Release 1 that writes to a company folder, and it is
 * gated: promoting shows the diff and a confirmation, and writes only after
 * that confirmation. Cancelling the confirmation writes nothing at all —
 * "reject" in the AGENTS.md §6 sense is simply not confirming.
 *
 * This does NOT open a second approval path. `commitCompanyCommandResult` and
 * `getCompanyCommandResult` are the exact server actions
 * `components/company-command-runner.tsx` already calls for every other
 * command's approve flow (grepped for them per the brief) — a claim card's
 * `label` is the same `commandId` that flow already knows how to read and
 * commit.
 */
export function ReviewRail({ claims, companyId }: { claims: LifecycleCard[]; companyId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [promoted, setPromoted] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<CompanyCommandResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const visible = claims.filter((c) => !promoted.has(c.id))
  const selected = visible.find((c) => c.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) {
      setResult(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setMessage(null)
    // `selected.label` is the claim's commandId (see lib/os/brain/lifecycle.ts).
    getCompanyCommandResult(selected.label, companyId)
      .then((r) => {
        if (!cancelled) setResult(r)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected, companyId])

  async function handleConfirmPromote() {
    if (!selected || !result || !result.changed) return
    setCommitting(true)
    const response = await commitCompanyCommandResult(selected.label, result.outputPath, companyId)
    setCommitting(false)
    setConfirmOpen(false)
    setMessage(response.message)
    if (response.committed) {
      setPromoted((prev) => new Set(prev).add(selected.id))
      setSelectedId(null)
    }
  }

  return (
    <div className="brain-review-rail">
      <header className="brain-review-rail-head">
        <p className="eyebrow">Awaiting promotion</p>
        <span className="brain-review-rail-count">{visible.length}</span>
      </header>

      {visible.length === 0 ? (
        <p className="brain-empty">Nothing waiting on you.</p>
      ) : (
        <ul className="brain-review-rail-list">
          {visible.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="brain-review-rail-item"
                aria-current={selected?.id === c.id ? "true" : undefined}
                onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
              >
                <span className="brain-review-rail-item-label">/{c.label}</span>
                <span className="brain-review-rail-detail">{c.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="brain-review-rail-diff">
          {loading && <p className="brain-empty">Loading diff…</p>}
          {!loading && result && !result.changed && <p className="brain-empty">{result.message}</p>}
          {!loading && result && result.changed && (
            <>
              <p className="brain-review-rail-path">{result.outputPath}</p>
              <StrayFilesNotice strays={result.strays} />
              <DiffView oldText={result.oldText} newText={result.newText} />
              {result.extraFiles.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Also created (not shown): {result.extraFiles.join(", ")}
                </p>
              )}
              <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={committing}>
                Promote to definitions/
              </Button>
            </>
          )}
          {message && <p className="brain-empty">{message}</p>}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Promote this into definitions/?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {/* The disclosure belongs HERE as much as beside the diff: this
                    dialog is the moment consent is actually given, and §6 says
                    name what would change before waiting. Approving against a
                    partial picture is the failure this prevents. */}
                {result && <StrayFilesNotice strays={result.strays} />}
                {result && result.changed && <DiffView oldText={result.oldText} newText={result.newText} />}
                {result && result.changed && result.extraFiles.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Also created (not shown): {result.extraFiles.join(", ")}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPromote} disabled={committing}>
              Promote &amp; commit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
