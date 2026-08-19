"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { addCompanyPack } from "@/lib/company-packs"

export const ADD_PACK_BLURB =
  "Adds another starter pack's ready-made commands and skills to this company — say your marketing company now builds websites too. It only adds; anything already here, including your own edits, is left exactly as it is. What your company IS never changes."

export type AvailablePack = { id: string; label: string; description: string }

export function AddPackButton({
  agentId,
  companyName,
  availablePacks,
}: {
  agentId: string
  companyName: string
  availablePacks: AvailablePack[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleAdd(packId: string) {
    setPending(packId)
    setMessage(null)
    const result = await addCompanyPack(agentId, packId)
    setPending(null)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Add more skills
      </Button>
      {message && <p className="text-xs text-destructive">{message}</p>}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add more skills to &quot;{companyName}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Each of these adds its ready-made commands and skills to this company. Nothing
              already here is replaced, and what this company IS — its own company info — is not
              touched. The change is committed to this company&apos;s own repo, so you can undo it
              there.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {availablePacks.map((pack) => (
              <div key={pack.id} className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{pack.label}</p>
                  <p className="text-xs text-muted-foreground">{pack.description}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending !== null}
                  onClick={() => handleAdd(pack.id)}
                >
                  {pending === pack.id ? "Adding…" : "Add"}
                </Button>
              </div>
            ))}
          </div>

          {message && <p className="text-xs text-destructive">{message}</p>}

          <AlertDialogFooter>
            <AlertDialogCancel>Done</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
