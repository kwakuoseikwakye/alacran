"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { setAiExecutor } from "@/lib/set-ai-executor"
import { listAiExecutors } from "@/lib/ai-executors"
import { READINESS_TEXT, type Readiness } from "@/lib/executor-readiness"

const EXECUTOR_OPTIONS = listAiExecutors()

/** One tile per AI, one click to switch. `readiness` is optional: without it the
 *  tiles still work, they just don't say whether each AI is set up. */
export function AiExecutorPicker({
  agentId,
  currentExecutorId,
  readiness,
  onChanged,
}: {
  agentId: string
  currentExecutorId: string
  readiness?: Record<string, Readiness>
  onChanged?: () => void
}) {
  const router = useRouter()
  const [value, setValue] = useState(currentExecutorId)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleChange(next: string) {
    const previous = value
    setValue(next)
    setPending(true)
    const result = await setAiExecutor(agentId, next)
    setPending(false)
    if (result.ok) {
      setMessage(null)
      router.refresh()
      onChanged?.()
    } else {
      setValue(previous)
      setMessage(result.message)
    }
  }

  const chosen = readiness?.[value]

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="AI for this company" className="ai-tiles">
        {EXECUTOR_OPTIONS.map((option) => {
          const on = option.id === value
          const state = readiness?.[option.id]
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={pending}
              title={on ? `${option.label} is doing this company's work` : `Switch this company to ${option.label}`}
              onClick={() => (on ? undefined : void handleChange(option.id))}
              className="ai-tile"
              data-on={on ? "" : undefined}
            >
              <span className="ai-tile-name">{option.label}</span>
              {state ? (
                <span className="ai-tile-status" data-state={state}>{READINESS_TEXT[state]}</span>
              ) : null}
              {on ? <Check className="ai-tile-check" aria-hidden /> : null}
            </button>
          )
        })}
      </div>
      {chosen && chosen !== "ready" ? (
        <p className="text-xs text-muted-foreground">
          {chosen === "needs-sign-in" ? "Not signed in yet." : "Not installed yet."} <Link className="underline underline-offset-2" href="/system/connectors">Finish setup in Connected tools</Link>
        </p>
      ) : null}
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  )
}
