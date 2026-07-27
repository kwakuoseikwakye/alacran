"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
} from "@/components/ui/alert-dialog"
import { installDailyTeamLog } from "@/lib/install-daily-team-log"

export function InstallDailyTeamLogButton({ agentId, companyName }: { agentId: string; companyName: string }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleConfirm() {
    setConfirmOpen(false)
    setPending(true)
    setMessage(null)
    const result = await installDailyTeamLog(agentId)
    setPending(false)
    if (result.ok) {
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)} disabled={pending}>
        {pending ? "Installing…" : "Install daily-team-log"}
      </Button>
      {message && <p className="text-xs text-destructive">{message}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Install daily-team-log?</AlertDialogTitle>
            <AlertDialogDescription>
              Adds a daily-report skill to &quot;{companyName}&quot; — turns each day&apos;s Claude Code
              session history into a daily report, committed to this company&apos;s own repo. Setup (who
              you are, which projects to include, scheduling) happens afterward inside Claude Code, not
              here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Install</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
