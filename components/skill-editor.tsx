"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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
import { DiffView } from "@/components/diff-view"
import { saveSkillContent } from "@/lib/save-skill-content"

export function SkillEditor({
  path,
  initialContent,
  onSaved,
}: {
  path: string
  initialContent: string
  onSaved?: (newContent: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialContent)
  const [savedContent, setSavedContent] = useState(initialContent)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function startEditing() {
    setDraft(savedContent)
    setEditing(true)
    setMessage(null)
  }

  function cancelEditing() {
    setDraft(savedContent)
    setEditing(false)
    setMessage(null)
  }

  async function handleConfirmSave() {
    setPending(true)
    const result = await saveSkillContent(path, draft)
    setPending(false)
    setConfirmOpen(false)
    setMessage(result.message)
    if (result.saved) {
      setSavedContent(draft)
      setEditing(false)
      onSaved?.(draft)
    }
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <pre className="whitespace-pre-wrap text-sm">{savedContent}</pre>
        <Button size="sm" variant="outline" onClick={startEditing}>
          Edit
        </Button>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="min-h-[50vh] font-mono text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={draft === savedContent || pending}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={cancelEditing}>
          Cancel
        </Button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="max-h-[60vh] overflow-y-auto">
                <DiffView oldText={savedContent} newText={draft} />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSave}>Confirm &amp; commit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
