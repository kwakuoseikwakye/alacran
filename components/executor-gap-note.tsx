"use client"

import { useEffect, useState } from "react"
import { getExecutorGapNote } from "@/lib/executor-gap-actions"
import type { Need } from "@/lib/executor-capabilities"

/** A one-line note on a function this company's AI can't perform. Renders
 *  nothing when it can, and nothing until the answer arrives. */
export function ExecutorGapNote({ agentId, need }: { agentId: string; need: Need }) {
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void getExecutorGapNote(agentId, need).then((next) => {
      if (live) setNote(next)
    })
    return () => {
      live = false
    }
  }, [agentId, need])
  if (!note) return null
  return <p className="executor-gap-note">{note}</p>
}
