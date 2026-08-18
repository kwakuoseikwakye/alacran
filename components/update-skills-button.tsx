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
import { updateCompanySkills } from "@/lib/update-company-skills"

/** Tags are shown as-is; a commit-SHA pin is shortened to the usual 7 chars. */
function showTag(tag: string) {
  return /^[0-9a-f]{40}$/.test(tag) ? tag.slice(0, 7) : tag
}

export const UPDATE_SKILLS_BLURB =
  "Appears when this app ships newer versions of the ready-made skills your company was created with. It replaces those skills and leaves everything else — your company info, your notes and any skill you wrote yourself — exactly as it is."

export function UpdateSkillsButton({
  agentId,
  companyName,
  installedTag,
  bundledTag,
}: {
  agentId: string
  companyName: string
  installedTag: string | null
  bundledTag: string
}) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function handleConfirm() {
    setConfirmOpen(false)
    setPending(true)
    setMessage(null)
    setNote(null)
    const result = await updateCompanySkills(agentId)
    setPending(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    // Skills left alone because a skill of the same name was already there and
    // this app didn't put it there. Saying so is the whole point: silently
    // doing nothing would read as a broken button, and the alternative —
    // overwriting — is what the dialog promises not to do.
    if (result.skipped.length > 0) {
      setNote(
        `Kept your own ${result.skipped.join(", ")} — nothing was overwritten. Rename yours if you want this app's version too.`
      )
    }
    router.refresh()
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)} disabled={pending}>
        {pending ? "Updating…" : installedTag === null ? "Add ready-made skills" : "Update skills"}
      </Button>
      {message && <p className="text-xs text-destructive">{message}</p>}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {installedTag === null ? "Add ready-made skills?" : "Update ready-made skills?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {installedTag === null ? (
                <>
                  &quot;{companyName}&quot; was created before these skills existed. This adds them
                  ({showTag(bundledTag)}) to the company so your AI can use them.
                </>
              ) : (
                <>
                  Replaces the ready-made skills in &quot;{companyName}&quot; ({showTag(installedTag)} →{" "}
                  {showTag(bundledTag)}).
                </>
              )}{" "}
              Your company info, notes and any skill you wrote yourself are left alone. The change is
              committed to this company&apos;s own repo, so you can undo it there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {installedTag === null ? "Add" : "Update"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
