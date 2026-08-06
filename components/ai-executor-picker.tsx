"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { setAiExecutor } from "@/lib/set-ai-executor"
import { listAiExecutors } from "@/lib/ai-executors"
import { cn } from "@/lib/utils"

export const AI_EXECUTOR_BLURB =
  "Choose which AI tool runs this company's commands. It uses your own account, so this app never stores anything."

const EXECUTOR_OPTIONS = listAiExecutors()

export function AiExecutorPicker({ agentId, currentExecutorId }: { agentId: string; currentExecutorId: string }) {
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
    } else {
      setValue(previous)
      setMessage(result.message)
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground" htmlFor={`ai-executor-${agentId}`}>
        Runs commands with
      </label>
      <select
        id={`ai-executor-${agentId}`}
        value={value}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        className={cn(
          "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
        )}
      >
        {EXECUTOR_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  )
}
