"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { HistoryNotice } from "./history-notice"
import { addRecordAction } from "@/lib/os/departments/actions"

export function AddRecordDialog({ companyId, slug, departmentName }: { companyId: string; slug: string; departmentName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [unsaved, setUnsaved] = useState<{ commitError?: string; commitPaths: string[]; commitMessage: string } | null>(null)
  const done = () => { setTitle(""); setBody(""); setUnsaved(null); setOpen(false); router.refresh() }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await addRecordAction(companyId, { slug, title, body })
      if (!res.ok) return setError(res.error)
      if (!res.committed) return setUnsaved(res)
      done()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && unsaved) return done(); setOpen(o) }}>
      <DialogTrigger asChild><Button>Add record</Button></DialogTrigger>
      <DialogContent aria-describedby="add-rec-desc">
        <DialogHeader>
          <DialogTitle>Add a record to {departmentName}</DialogTitle>
          <DialogDescription id="add-rec-desc">A title and whatever you want to remember. It is saved as a plain note you can open anywhere.</DialogDescription>
        </DialogHeader>
        {unsaved ? (
          <HistoryNotice companyId={companyId} commitError={unsaved.commitError} commitPaths={unsaved.commitPaths} commitMessage={unsaved.commitMessage} onDone={done} />
        ) : (
        <form onSubmit={submit} className="grid gap-4 overflow-y-auto">
          <label className="grid gap-1 text-sm"><span className="font-medium">Title</span><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required /></label>
          <label className="grid gap-1 text-sm"><span className="font-medium">Text</span><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={20000} /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save record"}</Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
