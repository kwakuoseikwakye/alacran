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
import { addPortableSkills, previewPortableSkills } from "@/lib/add-portable-skills"

export function PortableSkillsButton({ agentId, companyName }: { agentId: string; companyName: string }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ move: string[]; keep: string[] } | null>(null)

  async function openDialog() {
    setPreview(null)
    setConfirmOpen(true)
    // What will move and what will stay is read when the dialog opens, so the person agrees to a list.
    const result = await previewPortableSkills(agentId)
    if (result.ok) setPreview({ move: result.move, keep: result.keep })
  }

  async function handleConfirm() {
    setConfirmOpen(false)
    setPending(true)
    setMessage(null)
    setNote(null)
    const result = await addPortableSkills(agentId)
    setPending(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    const notes: string[] = []
    if (result.kept.length > 0) notes.push(`Left as they were: ${result.kept.join(", ")}.`)
    if (result.conflicts.length > 0) notes.push(`Not overwritten because you wrote or edited them: ${result.conflicts.join(", ")}.`)
    if (!result.committed) notes.push("The commands are moved, but git did not record it as a commit, so there is nothing to undo there.")
    if (notes.length > 0) setNote(notes.join(" "))
    router.refresh()
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={openDialog} disabled={pending}>
        {pending ? "Moving…" : "Let any AI run these commands"}
      </Button>
      {message && <p className="text-xs text-destructive">{message}</p>}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Let any AI run these commands?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{companyName}&quot; keeps its commands in <code>.claude/commands</code>, a folder only Claude
              Code reads. This moves them to <code>.agents/skills</code>, which Codex, Kimi and Antigravity read,
              and gives Claude Code and Kiro a copy in their own folders. Ready-made skills the app keeps up to
              date stay where they are. In Codex you run a command as <code>$name</code> instead of{" "}
              <code>/name</code>, because Codex has no custom slash commands. It is one commit in this
              company&apos;s own repo, so you can undo it there.
            </AlertDialogDescription>
            {preview && (
              <div className="space-y-1 text-sm">
                <p><strong>Moving:</strong> {preview.move.length > 0 ? preview.move.join(", ") : "nothing new (only tidying old copies)"}</p>
                {preview.keep.length > 0 && <p><strong>Staying where they are:</strong> {preview.keep.join(", ")}</p>}
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Move them</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
