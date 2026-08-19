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
import { addPortableAgentFile } from "@/lib/add-portable-agent-file"

export const PORTABLE_AGENT_FILE_BLURB =
  "Appears when this company keeps what your AI should know in a file only Claude Code reads. It moves that text to AGENTS.md, which every AI tool reads, so switching this company to a different AI doesn't lose its memory."

export function PortableAgentFileButton({
  agentId,
  companyName,
}: {
  agentId: string
  companyName: string
}) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleConfirm() {
    setConfirmOpen(false)
    setPending(true)
    setMessage(null)
    const result = await addPortableAgentFile(agentId)
    setPending(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)} disabled={pending}>
        {pending ? "Moving…" : "Let any AI read this company"}
      </Button>
      {message && <p className="text-xs text-destructive">{message}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Let any AI read this company?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{companyName}&quot; keeps what your AI should know in <code>CLAUDE.md</code>,
              which only Claude Code reads. This moves that text — your own edits included — to{" "}
              <code>AGENTS.md</code>, the file OpenAI Codex, Aider and Google Antigravity read too,
              and leaves a short note in <code>CLAUDE.md</code> pointing at it. Nothing else in the
              company changes. It&apos;s one commit in this company&apos;s own repo, so you can undo
              it there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Move it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
