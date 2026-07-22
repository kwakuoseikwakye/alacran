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
import type { PollLockStatus } from "@/lib/adapters/poll-lock"
import { triggerPoll } from "@/lib/trigger-poll"

export function TriggerPollButton({ pollStatus }: { pollStatus: PollLockStatus }) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleConfirm() {
    setPending(true)
    setMessage(null)
    const result = await triggerPoll()
    setMessage(result.message)
    setPending(false)
  }

  const running = pollStatus.running || pending

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
            <AlertDialogTitle>Run the Takeshi agent now?</AlertDialogTitle>
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
    </div>
  )
}
