"use client"

import { useState, useEffect } from "react"
import { DiffView } from "@/components/diff-view"
import { getSkillHistory, getSkillRevision } from "@/lib/skill-history"
import type { SkillCommit } from "@/lib/skill-history-impl"

export function SkillHistory({ path }: { path: string }) {
  const [commits, setCommits] = useState<SkillCommit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [oldContent, setOldContent] = useState("")
  const [newContent, setNewContent] = useState("")
  const [diffLoading, setDiffLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCommits(null)
    setError(null)
    setSelectedIndex(null)
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
    setSelectedIndex(index)
    setDiffLoading(true)
    const commit = commits[index]
    const olderCommit = commits[index + 1]

    const [newResult, oldResult] = await Promise.all([
      getSkillRevision(path, commit.sha),
      olderCommit ? getSkillRevision(path, olderCommit.sha) : Promise.resolve({ ok: true, content: "", message: "" }),
    ])
    setDiffLoading(false)
    setNewContent(newResult.ok ? newResult.content : "")
    setOldContent(oldResult.ok ? oldResult.content : "")
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!commits) return <p className="text-sm text-muted-foreground">Loading history…</p>
  if (commits.length === 0) {
    return <p className="text-sm text-muted-foreground">No commit history for this file yet.</p>
  }

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
        <div className="border-t pt-2">
          {diffLoading ? (
            <p className="text-sm text-muted-foreground">Loading diff…</p>
          ) : (
            <DiffView oldText={oldContent} newText={newContent} />
          )}
        </div>
      )}
    </div>
  )
}
