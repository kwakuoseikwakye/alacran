"use client"

import { useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { runsApi } from "@/lib/agent-runs/client"

/**
 * "What should this agent do?" — one task, an optional name, Start. Centred,
 * like every other form in the app (see components/ui/sheet.tsx).
 */
export function NewAgentSheet({
  agentId,
  open,
  onOpenChange,
  onStarted,
}: {
  agentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted: (tab: { id: string; kind: "run"; label: string }, dirty: boolean) => void
}) {
  const [task, setTask] = useState("")
  const [title, setTitle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  async function start() {
    if (!task.trim() || starting) return
    setStarting(true)
    setError(null)
    // Asked when it first matters (someone is handing over a task and may walk
    // away), and before the wait: Safari only asks inside the click itself.
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission()
    const started = await runsApi.start(agentId, task, title.trim() || undefined)
    setStarting(false)
    if (!started.ok) return setError(started.message)
    setTask("")
    setTitle("")
    onOpenChange(false)
    onStarted({ id: started.id, kind: "run", label: started.label }, started.dirty)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New agent</SheetTitle>
          <SheetDescription>
            It works on its own copy of this company while you do something else. Nothing it changes reaches the company
            until you keep it.
          </SheetDescription>
        </SheetHeader>
        <form
          className="new-agent-form"
          onSubmit={(e) => {
            e.preventDefault()
            void start()
          }}
        >
          <label className="new-agent-label" htmlFor="new-agent-task">
            What should this agent do?
          </label>
          <Textarea
            id="new-agent-task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void start()
            }}
            rows={5}
            placeholder="Tidy the pricing notes and add a one-line summary at the top."
            autoFocus
          />
          <label className="new-agent-label" htmlFor="new-agent-title">
            Name <span className="new-agent-optional">(optional)</span>
          </label>
          <input
            id="new-agent-title"
            className="new-agent-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            placeholder="Pricing tidy"
          />
          {error && (
            <p className="new-agent-error" role="alert">
              {error}
            </p>
          )}
          <SheetFooter>
            <button type="submit" className="run-btn run-btn--primary" disabled={starting || !task.trim()}>
              {starting ? "Starting…" : "Start"}
            </button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
