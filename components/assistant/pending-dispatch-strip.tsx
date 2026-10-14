"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, Send, X } from "lucide-react"
import type { ActionProposal } from "@/lib/assistant/action-envelope"
import { sanitizeTaskText } from "@/lib/terminal/task-text"
import { claimDispatch, DISPATCH_SECONDS, startDispatchTimer } from "@/lib/voice/agent/dispatch-timer"
import { DelegateTaskCard, delegateMessage } from "./delegate-task-card"

type State =
  | { kind: "counting"; left: number }
  | { kind: "sending" }
  | { kind: "sent"; message: string }
  | { kind: "cancelled" }
  | { kind: "card" }
  | { kind: "error"; message: string }

/**
 * A spoken task on its way to the owner's agent: the exact words, a countdown, and a way to stop it.
 *
 * It exists only when the owner switched this company on and the task passed the gate check; the
 * server checks both again before typing anything. Cancelling, pressing Esc, saying "cancel", closing
 * the dock or ending the call all stop it, and a stop never sends. It starts counting when it mounts
 * and tells its host straight away (`onActed`), so a host that remounts it shows "already acted" rather
 * than counting down a second time.
 */
export function PendingDispatchStrip({ proposal, companyName, onActed }: { proposal: ActionProposal; companyName?: string; onActed?: () => void }) {
  const task = sanitizeTaskText(proposal.fields.task)
  const nonce = proposal.fields.nonce ?? ""
  const [state, setState] = useState<State>({ kind: "counting", left: DISPATCH_SECONDS })
  const cancelRef = useRef<(() => void) | null>(null)
  const onActedRef = useRef(onActed)
  onActedRef.current = onActed

  async function send() {
    // Once per spoken task, however many times this strip mounts.
    if (!claimDispatch(nonce)) {
      setState({ kind: "error", message: "This task was already sent, or couldn't be sent. Say it again if you still want it." })
      return
    }
    setState({ kind: "sending" })
    try {
      const response = await fetch(`/api/terminal/${encodeURIComponent(proposal.companyId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "delegate-task", task, auto: true }),
      })
      const body = await response.json().catch(() => ({}))
      // A refusal (the server wants a click, or an earlier task is still waiting) falls back to the
      // approval card, which warns about answering the agent's question first. No dead end.
      setState(
        response.ok
          ? { kind: "sent", message: typeof body?.message === "string" && body.message ? body.message : "Sent to your agent." }
          : { kind: "card" }
      )
    } catch {
      setState({ kind: "error", message: delegateMessage(null) })
    }
  }

  useEffect(() => {
    onActedRef.current?.()
    const timer = startDispatchTimer({
      seconds: DISPATCH_SECONDS,
      onTick: (left) => setState({ kind: "counting", left }),
      onCancel: () => setState({ kind: "cancelled" }),
      onFire: () => void send(),
    })
    cancelRef.current = timer.cancel
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") timer.cancel()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      timer.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the countdown starts once per mount, by design
  }, [])

  const where = companyName ?? proposal.companyId
  if (state.kind === "card") return <DelegateTaskCard proposal={proposal} companyName={companyName} />

  return (
    <div
      className="mt-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-foreground shadow-md backdrop-blur-sm dark:bg-amber-950/25"
      role="region"
      aria-label="Task being sent"
    >
      <div className="font-semibold text-sm text-foreground">{proposal.label}</div>
      <p className="mt-1 text-sm text-foreground">“{task}”</p>
      <div className="mt-2 flex flex-wrap items-center gap-2" aria-live="polite">
        {state.kind === "counting" && (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-300">
              <Send className="h-3.5 w-3.5" />
              Sending to {where}&apos;s agent in {state.left}s
            </span>
            <button
              type="button"
              onClick={() => cancelRef.current?.()}
              title="Stops this from being sent. Press Esc, or say cancel while the mic is on."
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/60 px-3 py-1.5 text-sm font-semibold hover:bg-amber-500/15"
            >
              <X className="h-3.5 w-3.5" />
              Cancel, don&apos;t send
            </button>
          </>
        )}
        {state.kind === "sending" && <span className="text-sm text-muted-foreground">Sending to your agent…</span>}
        {state.kind === "sent" && (
          <div role="status" className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>{state.message}</span>
          </div>
        )}
        {state.kind === "cancelled" && <span className="text-sm font-medium text-muted-foreground">Cancelled. Nothing was sent.</span>}
        {state.kind === "error" && (
          <span role="alert" className="text-sm text-rose-400">
            {state.message}
          </span>
        )}
      </div>
    </div>
  )
}
