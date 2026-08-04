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
import type { LaunchdHealth } from "@/lib/adapters/launchd"
import { setScheduledJob } from "@/lib/scheduled-job/set-scheduled-job"
import { getScheduledJobStatus } from "@/lib/scheduled-job/get-scheduled-job-status"

export function ScheduledJobToggle({ health }: { health: LaunchdHealth }) {
  const [loaded, setLoaded] = useState(health.loaded)
  const [lastExitStatus, setLastExitStatus] = useState(health.lastExitStatus)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await setScheduledJob(!loaded)
      // Always render the state launchctl actually reports, never an optimistic
      // guess — a failed unload must not render as "off".
      const fresh = await getScheduledJobStatus()
      setLoaded(fresh.loaded)
      setLastExitStatus(fresh.lastExitStatus)
      setMessage(result.message)
      setFailed(!result.ok)
    } catch {
      setMessage("Could not reach the server — reload and check the status.")
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          Scheduled runs: {loaded ? "on" : "off"}
          {lastExitStatus !== null && ` (last exit ${lastExitStatus})`}
        </span>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={busy}>
              {busy ? "Working…" : loaded ? "Stop" : "Start"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {loaded ? "Stop scheduled runs?" : "Start scheduled runs?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {loaded
                  ? "This stops a run already in progress, not just future ones, and the schedule stays off across logout and reboot until you turn it back on."
                  : "The agent will resume polling for new email every 5 minutes, unattended."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </p>
      {message && (
        <p className={`text-xs ${failed ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>
      )}
    </div>
  )
}
