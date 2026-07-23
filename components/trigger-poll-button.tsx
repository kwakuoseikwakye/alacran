"use client"

import { useEffect, useState } from "react"
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
import { LogTailView } from "@/components/log-tail-view"
import type { PollLockStatus } from "@/lib/adapters/poll-lock"
import { triggerPoll } from "@/lib/trigger-poll"
import { getPollStatus } from "@/lib/get-poll-status"
import { getPollLogTail } from "@/lib/adapters/get-poll-log-tail"

const POLL_INTERVAL_MS = 3000

export function TriggerPollButton({ pollStatus }: { pollStatus: PollLockStatus }) {
  const [running, setRunning] = useState(pollStatus.running)
  const [message, setMessage] = useState<string | null>(null)
  const [tail, setTail] = useState("")

  async function pollUntilDone() {
    const status = await getPollStatus()
    const logTail = await getPollLogTail()
    setTail([logTail.stdout, logTail.stderr].filter(Boolean).join("\n"))
    if (status.running) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      return
    }
    setRunning(false)
  }

  useEffect(() => {
    if (pollStatus.running) {
      pollUntilDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleConfirm() {
    setMessage(null)
    const result = await triggerPoll()
    setMessage(result.message)
    if (result.started) {
      setRunning(true)
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
    }
  }

  return (
    <div className="space-y-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" disabled={running}>
            {running ? "Running…" : "Run now"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run the Owner agent now?</AlertDialogTitle>
            <AlertDialogDescription>
              This runs the same automated pipeline that normally fires every 5 minutes — run it now?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      {running && <LogTailView content={tail} />}
    </div>
  )
}
