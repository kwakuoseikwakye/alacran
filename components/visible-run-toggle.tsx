"use client"

import { useEffect, useState } from "react"
import { getVisibleRun } from "@/lib/get-visible-run"
import { setVisibleRun } from "@/lib/set-visible-run"

export function VisibleRunToggle({ agentId }: { agentId: string }) {
  const [checked, setChecked] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getVisibleRun(agentId).then((value) => {
      if (cancelled) return
      setChecked(value)
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
    const result = await setVisibleRun(agentId, next)
    setPending(false)
    if (!result.ok) {
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
        Run commands in a visible Terminal window
      </label>
      <p className="text-xs text-muted-foreground">
        Every command opens a real terminal window and shows you the exact prompt before running —
        press Enter to proceed, or Ctrl-C to abort. When it finishes, it offers an interactive session
        continuing that run, which is not limited to what the command itself is allowed to do. Works on
        macOS and Linux (using whichever terminal emulator is installed).
      </p>
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  )
}
