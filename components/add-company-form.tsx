"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { registerCompany } from "@/lib/register-company"
import { getCompanyPathStatus } from "@/lib/get-company-path-status"
import { createCompanyFromTemplate } from "@/lib/create-company-from-template"

export function AddCompanyForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [rootPath, setRootPath] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false)

  async function handleSubmit() {
    setPending(true)
    setMessage(null)
    const status = await getCompanyPathStatus(rootPath)
    if (status === "creatable") {
      setPending(false)
      setConfirmCreateOpen(true)
      return
    }
    const result = await registerCompany(name, rootPath)
    setPending(false)
    if (result.ok) {
      setName("")
      setRootPath("")
      setMessage(`Registered "${result.company.name}"`)
      setOpen(false)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  async function handleConfirmCreate() {
    setConfirmCreateOpen(false)
    setPending(true)
    setMessage(null)
    const result = await createCompanyFromTemplate(name, rootPath)
    setPending(false)
    if (result.ok) {
      setName("")
      setRootPath("")
      setMessage(`Created and registered "${result.company.name}"`)
      setOpen(false)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add a company
      </Button>
    )
  }

  return (
    <div className="max-w-sm space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Add a company</h2>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Second Co" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Local directory path</label>
        <Input
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          placeholder="/Users/you/AI-Native/second-co"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={pending || !name || !rootPath}>
          {pending ? "Adding…" : "Add company"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}

      <AlertDialog open={confirmCreateOpen} onOpenChange={setConfirmCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create this company?</AlertDialogTitle>
            <AlertDialogDescription>
              <code>{rootPath}</code> doesn&apos;t exist yet. Create &quot;{name}&quot; here from the
              ai-company-starter-main template?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCreate}>Create &amp; register</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
