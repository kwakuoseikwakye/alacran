"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { MAX_NAME, MAX_PURPOSE } from "@/lib/os/departments/rules"
import { editDepartmentAction, planRemovalAction, removeDepartmentAction } from "@/lib/os/departments/actions"
import type { RemovalPlan } from "@/lib/os/departments/mutations"
import type { GuideRefresh } from "@/lib/guide/refresh"
import { GuideNote, guideNoteText } from "@/components/os/guide/guide-note"
import { HistoryNotice } from "./history-notice"
import { ColorPicker } from "./color-picker"
import { OfficeSign } from "./office-sign"

export function EditDepartmentDialog({
  companyId, slug, initial, revision,
}: { companyId: string; slug: string; initial: { name: string; purpose: string; color: string }; revision: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initial.name)
  const [purpose, setPurpose] = useState(initial.purpose)
  const [color, setColor] = useState(initial.color)
  const [error, setError] = useState<string | null>(null)
  const [removal, setRemoval] = useState<{ plan: RemovalPlan; revision: string } | null>(null)
  const [pending, start] = useTransition()
  const [unsaved, setUnsaved] = useState<{ committed: boolean; commitError?: string; commitPaths: string[]; commitMessage: string; guide?: GuideRefresh; next: () => void } | null>(null)

  const keepRef = useRef<HTMLButtonElement>(null)
  const removeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (removal) keepRef.current?.focus() }, [removal])
  function dismissRemoval() {
    setRemoval(null)
    setTimeout(() => removeRef.current?.focus(), 0)
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await editDepartmentAction(companyId, { slug, name, purpose, color, expectedRevision: revision })
      if (!res.ok) return setError(res.error)
      const done = () => { setOpen(false); router.refresh() }
      if (!res.committed || guideNoteText(res.guide)) return setUnsaved({ ...res, next: done })
      done()
    })
  }

  function askToRemove() {
    setError(null)
    start(async () => {
      const res = await planRemovalAction(companyId, slug)
      if (!res.ok) return setError(res.error)
      setRemoval({ plan: res.plan, revision: res.revision })
    })
  }

  function confirmRemove() {
    if (!removal) return
    start(async () => {
      const res = await removeDepartmentAction(companyId, { slug, expectedRevision: removal.revision, confirm: removal.plan })
      if (!res.ok) return setError(res.error)
      const done = () => { setOpen(false); router.push(`/c/${companyId}/records`) }
      if (!res.committed || guideNoteText(res.guide)) return setUnsaved({ ...res, next: done })
      done()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && unsaved) unsaved.next(); setName(initial.name); setPurpose(initial.purpose); setColor(initial.color); setRemoval(null); setError(null); setUnsaved(null); setOpen(o) }}>
      <DialogTrigger asChild><Button variant="outline">Edit department</Button></DialogTrigger>
      <DialogContent aria-describedby="edit-dept-desc">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">Edit {initial.name}</DialogTitle>
          <DialogDescription id="edit-dept-desc">Change how it looks. Its folder, records/{slug}, never changes.</DialogDescription>
        </DialogHeader>
        {unsaved ? (
          <div className="grid gap-3">
            <GuideNote guide={unsaved.guide} />
            {unsaved.committed ? (
              <div className="flex justify-end"><Button onClick={unsaved.next}>Continue</Button></div>
            ) : (
              <HistoryNotice companyId={companyId} commitError={unsaved.commitError} commitPaths={unsaved.commitPaths} commitMessage={unsaved.commitMessage} onDone={unsaved.next} />
            )}
          </div>
        ) : removal ? (
          <section className="grid gap-3 text-sm" aria-labelledby="confirm-removal"><h3 id="confirm-removal" className="font-semibold">Confirm removal</h3>
            {removal.plan.kind === "empty" ? (
              <p>{initial.name} has no records. Removing it deletes only its empty folder and its entry in definitions/departments.yaml.</p>
            ) : (
              <p>
                {initial.name} has {removal.plan.fileCount} {removal.plan.fileCount === 1 ? "file" : "files"}. They are not deleted: the whole folder moves to
                {" "}<code>{removal.plan.archiveTarget}</code> and the department disappears from Records and your office.
              </p>
            )}
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button ref={keepRef} variant="outline" onClick={dismissRemoval}>Keep the department</Button>
              <Button variant="destructive" disabled={pending} onClick={confirmRemove}>{pending ? "Removing…" : removal.plan.kind === "empty" ? "Remove department" : "Archive records and remove"}</Button>
            </div>
          </section>
        ) : (
          <form onSubmit={save} className="grid gap-4 overflow-y-auto">
            <label className="grid gap-1 text-sm"><span className="font-medium">Name</span><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME} required /></label>
            <label className="grid gap-1 text-sm"><span className="font-medium">What is it for?</span><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={MAX_PURPOSE} required /></label>
            <div className="grid gap-2 text-sm"><span id="edit-color-label" className="mb-1 font-medium">Colour</span><ColorPicker value={color} onChange={setColor} name="edit-color" labelledBy="edit-color-label" /></div>
            <div className="grid gap-1 text-sm"><span className="font-medium">Office sign</span><OfficeSign slug={slug} name={name} color={color} /></div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <Button ref={removeRef} type="button" variant="ghost" className="text-destructive" onClick={askToRemove} disabled={pending}>Remove department…</Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
