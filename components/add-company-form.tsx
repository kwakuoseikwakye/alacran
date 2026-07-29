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
import { restoreCompany } from "@/lib/github/github-actions"

export function AddCompanyForm({
  /** Onboarding shows this as the step's primary action; the dashboard keeps it quiet. */
  prominent = false,
}: { prominent?: boolean } = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [rootPath, setRootPath] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false)
  const [restoreUrl, setRestoreUrl] = useState("")
  const [showRestore, setShowRestore] = useState(false)

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

  async function handleRestore() {
    setPending(true)
    setMessage(null)
    const result = await restoreCompany(name, restoreUrl, rootPath)
    setPending(false)
    if (result.ok) {
      setName("")
      setRootPath("")
      setRestoreUrl("")
      setShowRestore(false)
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
    return prominent ? (
      <Button
        className="w-full shadow-[0_10px_30px_-12px_var(--primary)] transition-transform hover:-translate-y-0.5"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Create my first company
      </Button>
    ) : (
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add a company
      </Button>
    )
  }

  return (
    <div
      className={`${prominent ? "w-full" : "max-w-sm"} a-rise space-y-3 rounded-lg border border-border bg-card p-4`}
    >
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
      {showRestore && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">GitHub repository URL</label>
          <Input
            value={restoreUrl}
            onChange={(e) => setRestoreUrl(e.target.value)}
            placeholder="https://github.com/you/your-company"
          />
          <p className="text-xs text-muted-foreground">
            Clones a company you previously backed up, so it works on this Mac too.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {showRestore ? (
          <Button size="sm" onClick={handleRestore} disabled={pending || !name || !rootPath || !restoreUrl}>
            {pending ? "Restoring…" : "Restore company"}
          </Button>
        ) : (
          <Button size="sm" onClick={handleSubmit} disabled={pending || !name || !rootPath}>
            {pending ? "Adding…" : "Add company"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>

      <button
        type="button"
        className="text-xs text-primary underline-offset-4 hover:underline"
        onClick={() => {
          setShowRestore((v) => !v)
          setMessage(null)
        }}
        disabled={pending}
      >
        {showRestore ? "← Create a new company instead" : "Restoring from a backup on another Mac? →"}
      </button>

      {message && <p className="text-xs text-muted-foreground">{message}</p>}

      <AlertDialog open={confirmCreateOpen} onOpenChange={setConfirmCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create this company?</AlertDialogTitle>
            <AlertDialogDescription>
              <code>{rootPath}</code> doesn&apos;t exist yet. Create &quot;{name}&quot; here from the
              company starter template?
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
