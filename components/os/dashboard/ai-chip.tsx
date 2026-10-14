"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { AiExecutorPicker } from "@/components/ai-executor-picker"
import { getAiExecutor } from "@/lib/ai-executors"
import { getAiReadiness } from "@/lib/ai-readiness"
import type { Readiness } from "@/lib/executor-readiness"

/** Home's quick switch: says which AI is doing this company's work and opens
 *  the same tiles as Company profile. Readiness for the other AIs loads when
 *  the menu opens, not with the page. */
export function AiChip({
  agentId,
  currentExecutorId,
  currentReadiness,
}: {
  agentId: string
  currentExecutorId: string
  currentReadiness: Readiness
}) {
  const [open, setOpen] = useState(false)
  const [readiness, setReadiness] = useState<Record<string, Readiness> | undefined>()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    void getAiReadiness().then((r) => live && setReadiness(r))
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", away)
    document.addEventListener("keydown", esc)
    return () => {
      live = false
      document.removeEventListener("mousedown", away)
      document.removeEventListener("keydown", esc)
    }
  }, [open])

  return (
    <div className="ai-chip" ref={box}>
      <button
        type="button"
        className="ai-chip-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Choose which AI does the work for this company"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ai-chip-dot" data-state={currentReadiness} aria-hidden />
        Running on {getAiExecutor(currentExecutorId).label}
        <ChevronDown aria-hidden />
      </button>
      {open ? (
        <div className="ai-chip-pop" role="dialog" aria-label="Choose an AI for this company">
          <p>Which AI should do this company&apos;s work?</p>
          <AiExecutorPicker
            agentId={agentId}
            currentExecutorId={currentExecutorId}
            readiness={readiness}
            onChanged={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  )
}
