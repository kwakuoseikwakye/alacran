"use client"

import { useState } from "react"
import { CheckCircle2, Send } from "lucide-react"
import type { ActionProposal } from "@/lib/assistant/action-envelope"
import { BANG_REFUSAL, MAX_TASK, sanitizeTaskText } from "@/lib/terminal/task-text"

type Status = "idle" | "sending" | "sent" | "error"

/** The server's own reason when it gave one, otherwise a plain fallback. */
export function delegateMessage(body: unknown): string {
  const message = (body as { message?: unknown } | null)?.message
  return typeof message === "string" && message ? message : "Couldn't send that. Try again."
}

export function DelegateTaskCard({ proposal, companyName, onActed }: { proposal: ActionProposal; companyName?: string; onActed?: () => void }) {
  const [task, setTask] = useState(proposal.fields.task ?? "")
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState("")
  // The server types the sanitised text, so blank and the slash/bang check read that, not the raw box:
  // a leading control character must not hide a "/" or "!" that will still be the first thing typed.
  // A "!" first is refused by the server (it would run as a command line), so Send is off for it.
  const typed = sanitizeTaskText(task)
  const blank = !typed
  const lead = typed.charAt(0)
  const bang = lead === "!"
  const title = blank
    ? "Say what you want your agent to do first"
    : bang
      ? BANG_REFUSAL
      : status === "sending"
        ? "Sending to your agent"
        : status === "sent"
          ? "Already sent to your agent"
          : "Type this into your agent as if you typed it"

  // Only ever called from a button click: rendering, replay and speech never send anything.
  async function send() {
    onActed?.()
    setStatus("sending")
    try {
      const response = await fetch(`/api/terminal/${encodeURIComponent(proposal.companyId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "delegate-task", task }),
      })
      const body = await response.json().catch(() => ({}))
      if (response.ok) {
        setMessage(typeof body?.message === "string" && body.message ? body.message : "Sent to your agent.")
        setStatus("sent")
      } else {
        setMessage(delegateMessage(body))
        setStatus("error")
      }
    } catch {
      setMessage(delegateMessage(null))
      setStatus("error")
    }
  }

  return (
    <div
      className="mt-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-foreground shadow-md backdrop-blur-sm dark:bg-amber-950/25"
      role="region"
      aria-label="Proposed action"
    >
      <div className="font-semibold text-sm text-foreground">{proposal.label}</div>
      <p className="mt-1 text-xs text-muted-foreground">For company: {companyName ?? proposal.companyId}.</p>

      <label className="mt-2 block">
        <span className="font-medium text-amber-600 dark:text-amber-400/90">What your agent should do</span>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={status !== "idle"}
          rows={4}
          maxLength={MAX_TASK}
          // Grows with a long task (browsers without field-sizing keep the 4 rows and scroll).
          style={{ fieldSizing: "content", maxHeight: "16rem" }}
          className="mt-0.5 w-full overflow-y-auto rounded border border-border bg-background px-2 py-1 text-sm"
        />
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        {'Alacrán adds: "When you finish, save a short summary of what you did in a notes file."'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        This is typed into your newest agent tab as keystrokes, ending with Enter. If your agent is waiting for you to answer something, answer
        it in Terminal first, or this Enter will answer it.
      </p>
      {bang ? (
        <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">{BANG_REFUSAL}</p>
      ) : lead === "/" ? (
        <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
          {'This starts with "/" or "!", so your agent will treat it as a command rather than a message.'}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Stays mounted through every state, so keyboard focus is not dropped when it is pressed. */}
        <button
          type="button"
          onClick={() => void send()}
          disabled={blank || bang || status !== "idle"}
          title={title}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-amber-400 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
          {status === "sending" ? "Sending…" : status === "sent" ? "Sent" : "Send to my agent"}
        </button>
        {status === "sent" && (
          <div role="status" className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>{message}</span>
          </div>
        )}
        {status === "error" && (
          <div role="alert" className="flex flex-col gap-1 text-sm text-rose-400">
            <span>{message}</span>
            <button type="button" onClick={() => setStatus("idle")} className="self-start text-xs underline hover:text-rose-300">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
