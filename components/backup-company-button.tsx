"use client"

import { useEffect, useState } from "react"
import { CloudUpload, Check, Loader2 } from "lucide-react"
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
import { BrandIcon } from "@/components/brand-icon"
import { backupCompany, getCompanyRemote } from "@/lib/github/github-actions"

/**
 * Backing up creates a real GitHub repository and pushes real business content,
 * so it always goes through a confirmation that states plainly what will happen
 * and that the repo is private — matching how every other outward-facing action
 * in this app is gated.
 */
export function BackupCompanyButton({ agentId, companyName }: { agentId: string; companyName: string }) {
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getCompanyRemote(agentId).then((r) => {
      if (cancelled) return
      if (r.ok) setRemoteUrl(r.remoteUrl)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [agentId])

  async function handleConfirm() {
    setConfirmOpen(false)
    setPending(true)
    setMessage(null)
    const result = await backupCompany(agentId)
    setPending(false)
    if (result.ok) {
      setRemoteUrl(result.remoteUrl)
      setMessage(result.remoteUrl ? "Backed up" : "Pushed")
    } else {
      setMessage(result.message)
    }
  }

  if (!loaded) return null

  const isFirstBackup = remoteUrl === null

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" className="w-full" onClick={() => setConfirmOpen(true)} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
        {pending ? "Backing up…" : isFirstBackup ? "Back up to GitHub" : "Push latest changes"}
      </Button>

      {remoteUrl && !pending && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BrandIcon id="github" tone="brand" className="size-3" />
          <span className="truncate">{remoteUrl}</span>
        </p>
      )}
      {message && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {message === "Backed up" || message === "Pushed" ? (
            <Check className="size-3 text-success" />
          ) : null}
          {message}
        </p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isFirstBackup ? `Back up "${companyName}" to GitHub?` : `Push "${companyName}" to GitHub?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isFirstBackup ? (
                <>
                  This creates a new <strong>private</strong> GitHub repository and pushes this company&apos;s
                  full history to it — including its business context, decisions and notes. Nobody else can see
                  a private repo. You can then restore this company on another Mac.
                </>
              ) : (
                <>
                  This pushes new local commits to <code>{remoteUrl}</code>.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {isFirstBackup ? "Create private repo & push" : "Push"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
