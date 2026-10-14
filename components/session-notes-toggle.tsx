"use client"

import { ExecutorGapNote } from "@/components/executor-gap-note"
import { useEffect, useState } from "react"
import { getLastSessionNoteOutcome, getSessionNotes, setSessionNotes } from "@/lib/session-notes-actions"
import type { SessionNoteStatus } from "@/lib/terminal/session-note-status"

/** Rendered client-side on purpose: the stored value is UTC and the user
 *  reads it in their own timezone. */
function formatWhen(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return "recently"
  return at.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

/**
 * The off switch for automatic session notes.
 *
 * Deliberately sits beside VisibleRunToggle rather than getting its own
 * surface: both answer "how should this company behave when I'm not watching",
 * and one place to look beats two. Starts from the server value rather than a
 * guessed default, so the box never flips under the user after it paints.
 */
export function SessionNotesToggle({ agentId }: { agentId: string }) {
  const [checked, setChecked] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  /**
   * The last unattended attempt, which had nowhere to be seen before this.
   * `catchUpSessionNotes` kept only a count and dropped every message, so a
   * company that could not write its memory down was indistinguishable from
   * one with nothing to say — and on a real machine that state lasted three
   * days across every company without a word anywhere.
   */
  const [last, setLast] = useState<SessionNoteStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([getSessionNotes(agentId), getLastSessionNoteOutcome(agentId)]).then(([value, outcome]) => {
      if (cancelled) return
      setChecked(value)
      setLast(outcome)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [agentId])

  async function handleChange(next: boolean) {
    const previous = checked
    setChecked(next)
    setPending(true)
    setMessage(null)
    const result = await setSessionNotes(agentId, next)
    setPending(false)
    if (!result.ok) {
      // Put the box back where it was: a switch that stays flipped after the
      // save failed is a switch that lies about what the app will do tonight.
      setChecked(previous)
      setMessage(result.message)
    }
  }

  if (!loaded) return null

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(e) => void handleChange(e.target.checked)}
        />
        Write down what we talked about, on its own
      </label>
      <ExecutorGapNote agentId={agentId} need="resume" />
      <p className="text-xs text-muted-foreground">
        When a conversation with this company&rsquo;s assistant finishes, Alacrán reopens it and asks it to
        write a short note — what you worked on, what was decided, what&rsquo;s still open — into this
        company&rsquo;s own folder. The note waits for you to approve it, like every other job. Turning this
        off means conversations are only remembered if you press &ldquo;Save what we learned&rdquo; yourself.
        Leaving it on uses your AI account each time a conversation finishes.
      </p>
      {message && <p className="text-xs text-destructive">{message}</p>}
      {/* Only when it is ON: an outcome from before the switch was turned off
          describes a job that no longer runs, which reads as a live problem. */}
      {checked && last && (
        <p className={`text-xs ${last.started ? "text-muted-foreground" : "text-destructive"}`}>
          {last.started ? "Last written up" : "Last attempt failed"} {formatWhen(last.at)}
          {last.started ? "." : `: ${last.message}`}
        </p>
      )}
    </div>
  )
}
