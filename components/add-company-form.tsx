"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
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
import { COMPANY_STARTER_PACKS, DEFAULT_COMPANY_STARTER_PACK_ID, getCompanyStarterPack } from "@/lib/company-starter-packs"
import { COMPANIES_DIR_NAME } from "@/lib/branding"

/** Turns a company name into a directory-safe leaf, e.g. "Second Co!" -> "second-co". */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function AddCompanyForm({
  /** Onboarding shows this as the step's primary action; the dashboard keeps it quiet. */
  prominent = false,
  /** Server-detected home directory, used to suggest a path non-technical users don't have to type. */
  homeDir,
}: { prominent?: boolean; homeDir?: string } = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [rootPath, setRootPath] = useState("")
  // False until the user edits the path field directly. This keeps the suggested
  // path in sync with the name for non-technical users, without ever
  // clobbering a path a technical user typed themselves.
  const [pathTouched, setPathTouched] = useState(false)
  const [packId, setPackId] = useState(DEFAULT_COMPANY_STARTER_PACK_ID)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false)
  const [restoreUrl, setRestoreUrl] = useState("")
  const [showRestore, setShowRestore] = useState(false)
  const [external, setExternal] = useState(false)

  const suggestedPath = homeDir
    ? `${homeDir}/${COMPANIES_DIR_NAME}${name.trim() ? `/${slugify(name)}` : ""}`
    : ""
  if (!pathTouched && suggestedPath && suggestedPath !== rootPath) {
    setRootPath(suggestedPath)
  }

  async function handleSubmit() {
    setPending(true)
    setMessage(null)
    // An external folder must already exist — scaffolding a company into
    // someone's unrelated project is the opposite of what this option means,
    // so the create-from-template branch is skipped entirely and a missing
    // path just fails registration.
    if (!external) {
      const status = await getCompanyPathStatus(rootPath)
      if (status === "creatable") {
        setPending(false)
        setConfirmCreateOpen(true)
        return
      }
    }
    const result = await registerCompany(name, rootPath, external)
    setPending(false)
    if (result.ok) {
      setName("")
      setRootPath("")
      setPathTouched(false)
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
      setPathTouched(false)
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
    const result = await createCompanyFromTemplate(name, rootPath, packId)
    setPending(false)
    if (result.ok) {
      setName("")
      setRootPath("")
      setPathTouched(false)
      setPackId(DEFAULT_COMPANY_STARTER_PACK_ID)
      setMessage(`Created and registered "${result.company.name}"`)
      setOpen(false)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  const packsByCategory = COMPANY_STARTER_PACKS.reduce<Record<string, typeof COMPANY_STARTER_PACKS>>(
    (acc, pack) => {
      ;(acc[pack.category] ??= []).push(pack)
      return acc
    },
    {}
  )

  // Shared between both presentations below: the onboarding wizard's inline
  // card (prominent) and the agents-page header's Sheet modal (default).
  const formFields = (
    <>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Second Co" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Local directory path</label>
        <Input
          value={rootPath}
          onChange={(e) => {
            setRootPath(e.target.value)
            setPathTouched(true)
          }}
          placeholder={homeDir ? `${homeDir}/${COMPANIES_DIR_NAME}/second-co` : `~/${COMPANIES_DIR_NAME}/second-co`}
        />
        <p className="text-xs text-muted-foreground">
          {pathTouched
            ? "Using your custom path. Please make sure it's a real location on this machine."
            : `Created in an ${COMPANIES_DIR_NAME} folder in your home directory, next to your other companies. The folder is made for you if it isn't there yet. Know exactly where you want it? Just type over the path above.`}
        </p>
      </div>
      {!showRestore && (
        <label className="flex cursor-pointer gap-2.5 rounded-md border border-border p-2.5 text-xs">
          <input
            type="checkbox"
            checked={external}
            onChange={(e) => setExternal(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            <span className="block font-medium text-foreground">
              This is an existing project or workflow, not an Alacrán company
            </span>
            <span className="mt-0.5 block text-muted-foreground">
              Add any folder you already work in, whatever it&apos;s built with. It gets one button — Open in
              Terminal — and nothing else: no setup, no backup, no files written to it. The folder must already
              exist.
            </span>
          </span>
        </label>
      )}
      {!showRestore && !external && (
        <div className="space-y-2.5">
          <label className="text-xs text-muted-foreground">
            Starter template{" "}
            <span className="text-muted-foreground/70">
              (available for any new company, any time. Skipped only if the path above already exists)
            </span>
          </label>
          {Object.entries(packsByCategory).map(([category, packs]) => (
            <div key={category} className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {category}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {packs.map((pack) => (
                  <label
                    key={pack.id}
                    className={`cursor-pointer rounded-md border p-2.5 text-xs transition-colors ${
                      packId === pack.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-transparent hover:border-muted-foreground/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="starter-pack"
                      value={pack.id}
                      checked={packId === pack.id}
                      onChange={() => setPackId(pack.id)}
                      className="sr-only"
                    />
                    <span className="block font-medium text-foreground">{pack.label}</span>
                    <span className="mt-0.5 block text-muted-foreground">{pack.description}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {showRestore && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">GitHub repository URL</label>
          <Input
            value={restoreUrl}
            onChange={(e) => setRestoreUrl(e.target.value)}
            placeholder="https://github.com/you/your-company"
          />
          <p className="text-xs text-muted-foreground">
            Clones a company you previously backed up, so it works on this computer too.
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
        {showRestore ? "← Create a new company instead" : "Restoring from a backup on another computer? →"}
      </button>

      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </>
  )

  const confirmDialog = (
    <AlertDialog open={confirmCreateOpen} onOpenChange={setConfirmCreateOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create this company?</AlertDialogTitle>
          <AlertDialogDescription>
            <code>{rootPath}</code> doesn&apos;t exist yet. Create &quot;{name}&quot; here from the{" "}
            <strong>{getCompanyStarterPack(packId).label}</strong> starter?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmCreate}>Create &amp; register</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // Onboarding's "create" step is already a dedicated step of its own
  // full-width wizard card — expanding inline there is the right shape.
  // It's only the agents-page header (below) where inline expansion has no
  // room to work: see the Sheet modal instead.
  if (prominent) {
    if (!open) {
      return (
        <Button
          className="w-full shadow-[0_10px_30px_-12px_var(--primary)] transition-transform hover:-translate-y-0.5"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Create my first company
        </Button>
      )
    }
    return (
      <div className="a-rise w-full space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">Add a company</h2>
        {formFields}
        {confirmDialog}
      </div>
    )
  }

  return (
    <>
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add a company
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Add a company</SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">{formFields}</div>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </>
  )
}
