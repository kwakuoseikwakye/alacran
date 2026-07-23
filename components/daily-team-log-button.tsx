"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { triggerDailyTeamLog } from "@/lib/daily-team-log/trigger-daily-team-log"
import { getDailyTeamLogStatus } from "@/lib/daily-team-log/daily-team-log-status"
import { getDailyTeamLogResult } from "@/lib/daily-team-log/daily-team-log-result"

const POLL_INTERVAL_MS = 3000

export function DailyTeamLogButton() {
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function pollUntilDone() {
    const status = await getDailyTeamLogStatus()
    if (status.running) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      return
    }
    setRunning(false)
    const result = await getDailyTeamLogResult()
    setMessage(result.lastLine ?? "Finished (no output captured).")
  }

  async function handleConfirm() {
    setMessage(null)
    const response = await triggerDailyTeamLog()
    if (!response.started) {
      setMessage(response.message)
      return
    }
    setRunning(true)
    setTimeout(pollUntilDone, POLL_INTERVAL_MS)
  }

  return (
    <div className="space-y-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={running}>
            {running ? "Running…" : "Run now"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run the daily team-log now?</AlertDialogTitle>
            <AlertDialogDescription>
              This reads your local Claude Code session history, writes and commits a report, and
              pushes it to the shared plh-ops repo — the same routine that already runs automatically
              every night at 22:00.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
