"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DEPARTMENT_PALETTE } from "@/lib/os/departments/palette"
import { MAX_NAME, MAX_PURPOSE, slugify } from "@/lib/os/departments/rules"
import { createDepartmentAction } from "@/lib/os/departments/actions"
import type { GuideRefresh } from "@/lib/guide/refresh"
import { GuideNote, guideNoteText } from "@/components/os/guide/guide-note"
import { HistoryNotice } from "./history-notice"
import { ColorPicker } from "./color-picker"
import { OfficeSign } from "./office-sign"

export function AddDepartmentDialog({
  companyId,
  trigger,
  initialName = "",
  adoptExisting = false,
}: {
  companyId: string
  trigger: React.ReactNode
  /** Pre-fills the name (adopting a folder that already exists). */
  initialName?: string
  adoptExisting?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initialName)
  const [purpose, setPurpose] = useState("")
  const [color, setColor] = useState<string>(DEPARTMENT_PALETTE[2].hex)
  const [adopt, setAdopt] = useState(adoptExisting)
  const [error, setError] = useState<{ code: string; text: string } | null>(null)
  const [notice, setNotice] = useState<{ committed: boolean; commitError?: string; commitPaths: string[]; commitMessage: string; slug: string; guide?: GuideRefresh } | null>(null)
  const [pending, start] = useTransition()
  // One id per dialog session: a double click or retry can never create two departments.
  const operationId = useRef(crypto.randomUUID())

  function reset() {
    setName(initialName); setPurpose(""); setColor(DEPARTMENT_PALETTE[2].hex)
    setAdopt(adoptExisting); setError(null); setNotice(null)
    operationId.current = crypto.randomUUID()
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await createDepartmentAction(companyId, { name, purpose, color, adopt, operationId: operationId.current })
      if (!res.ok) {
        setError({ code: res.code, text: res.error })
        if (res.code !== "folder-exists") setAdopt(adoptExisting)
        if (res.code !== "folder-exists") operationId.current = crypto.randomUUID()
        return
      }
      if (!res.committed || guideNoteText(res.guide)) {
        setNotice(res)
        return
      }
      setOpen(false)
      router.push(`/c/${companyId}/records/${res.slug}`)
    })
  }

  const slugPreview = slugify(name)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) reset(); setOpen(o) }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent aria-describedby="add-dept-desc">
        <DialogHeader>
          <DialogTitle>Add a department</DialogTitle>
          <DialogDescription id="add-dept-desc">A place to keep one kind of record, with a room in your office once it holds records.</DialogDescription>
        </DialogHeader>
        {notice ? (
          <div className="grid gap-3">
            <GuideNote guide={notice.guide} />
            {notice.committed ? (
              <div className="flex justify-end"><Button onClick={() => { setOpen(false); router.push(`/c/${companyId}/records/${notice.slug}`) }}>Continue</Button></div>
            ) : (
              <HistoryNotice companyId={companyId} commitError={notice.commitError} commitPaths={notice.commitPaths} commitMessage={notice.commitMessage} onDone={() => { setOpen(false); router.push(`/c/${companyId}/records/${notice.slug}`) }} />
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4 overflow-y-auto">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Name</span>
              <Input value={name} onChange={(e) => { setName(e.target.value); setError(null); setAdopt(adoptExisting && slugify(e.target.value) === slugify(initialName)) }} maxLength={MAX_NAME} required aria-describedby={slugPreview ? "dept-folder" : undefined} />
              {slugPreview && <span id="dept-folder" className="text-xs text-muted-foreground">Folder: records/{slugPreview}</span>}
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">What is it for?</span>
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={MAX_PURPOSE} required />
            </label>
            <div className="grid gap-2 text-sm">
              <span id="add-color-label" className="mb-1 font-medium">Colour</span>
              <ColorPicker value={color} onChange={setColor} labelledBy="add-color-label" />
            </div>
            <div className="grid gap-1 text-sm"><span className="font-medium">Office sign</span><OfficeSign slug={slugPreview || "department"} name={name} color={color} /></div>
            {error?.code === "folder-exists" && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={adopt} onChange={(e) => setAdopt(e.target.checked)} className="mt-1" />
                <span>Use the folder that is already there. Its records stay exactly as they are.</span>
              </label>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error.text}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending || (error?.code === "folder-exists" && !adopt)}>{pending ? "Adding…" : "Add department"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
