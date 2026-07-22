"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
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
import { DiffView } from "@/components/diff-view"
import { getSkillHistory, getSkillRevision } from "@/lib/skill-history"
import { saveSkillContent } from "@/lib/save-skill-content"
import type { SkillCommit } from "@/lib/skill-history-impl"

export function SkillHistory({
  path,
  currentContent,
  onReverted,
}: {
  path: string
  currentContent: string | null
  onReverted: (newContent: string) => void
}) {
  const [commits, setCommits] = useState<SkillCommit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [oldContent, setOldContent] = useState("")
  const [newContent, setNewContent] = useState("")
  const [diffLoading, setDiffLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [revertMessage, setRevertMessage] = useState<string | null>(null)
  const selectRequestRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    selectRequestRef.current++
    setCommits(null)
    setError(null)
    setSelectedIndex(null)
    setRevertMessage(null)
    async function load() {
      const result = await getSkillHistory(path)
      if (cancelled) return
      if (!result.ok) {
        setError(result.message)
      } else {
        setCommits(result.commits)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [path])

  async function selectCommit(index: number) {
    if (!commits) return
    const requestId = ++selectRequestRef.current
    setSelectedIndex(index)
    setDiffLoading(true)
    setRevertMessage(null)
    const commit = commits[index]
    const olderCommit = commits[index + 1]

    const [newResult, oldResult] = await Promise.all([
      getSkillRevision(path, commit.sha),
      olderCommit ? getSkillRevision(path, olderCommit.sha) : Promise.resolve({ ok: true, content: "", message: "" }),
    ])
    if (requestId !== selectRequestRef.current) return
    setDiffLoading(false)
    setNewContent(newResult.ok ? newResult.content : "")
    setOldContent(oldResult.ok ? oldResult.content : "")
  }

  async function handleConfirmRevert() {
    setReverting(true)
    const result = await saveSkillContent(path, newContent)
    setReverting(false)
    setConfirmOpen(false)
    setRevertMessage(result.message)
    if (result.saved) {
      onReverted(newContent)
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!commits) return <p className="text-sm text-muted-foreground">Loading history…</p>
  if (commits.length === 0) {
    return <p className="text-sm text-muted-foreground">No commit history for this file yet.</p>
  }

  const canRevert =
    selectedIndex !== null && !diffLoading && !reverting && currentContent !== null && currentContent !== newContent

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {commits.map((commit, index) => (
          <button
            key={commit.sha}
            onClick={() => selectCommit(index)}
            className={`block w-full rounded p-2 text-left text-sm ${selectedIndex === index ? "bg-muted" : ""}`}
          >
            <span className="font-mono text-xs text-muted-foreground">{commit.sha.slice(0, 7)}</span>{" "}
            <span className="text-xs text-muted-foreground">{new Date(commit.date).toLocaleString()}</span>
            <p>{commit.message}</p>
          </button>
        ))}
      </div>
      {selectedIndex !== null && (
        <div className="space-y-2 border-t pt-2">
          {diffLoading ? (
            <p className="text-sm text-muted-foreground">Loading diff…</p>
          ) : (
            <DiffView oldText={oldContent} newText={newContent} />
          )}
          <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)} disabled={!canRevert}>
            Revert to this version
          </Button>
          {revertMessage && <p className="text-xs text-muted-foreground">{revertMessage}</p>}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to this version?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="max-h-[60vh] overflow-y-auto">
                {currentContent !== null && <DiffView oldText={currentContent} newText={newContent} />}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRevert}>Confirm &amp; commit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
