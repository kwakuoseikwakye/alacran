"use client"

import { useState } from "react"
import { useAdvancedMode } from "@/components/advanced-only"
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
import { adoptFolder } from "@/lib/adopt-folder"
import { listHomeFolders, type FolderListing } from "@/lib/list-home-folders"
import { TEMPLATE_MANIFEST } from "@/lib/company-template-manifest"
import { getCompanyPathStatus } from "@/lib/get-company-path-status"
import { createCompanyFromTemplate } from "@/lib/create-company-from-template"
import { restoreCompany } from "@/lib/github/github-actions"
import { COMPANY_STARTER_PACKS, DEFAULT_COMPANY_STARTER_PACK_ID, getCompanyStarterPack } from "@/lib/company-starter-packs"
import { COMPANIES_DIR_NAME } from "@/lib/branding"

/** The top-level names adoption can add, straight from the manifest so the
 *  confirmation can't claim something the copy doesn't do. */
const STARTER_ENTRIES = [...new Set(TEMPLATE_MANIFEST.map((p) => p.split("/")[0]))].join(", ")

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
  const [showAdopt, setShowAdopt] = useState(false)
  const [browse, setBrowse] = useState<FolderListing | null>(null)
  const [confirmAdoptOpen, setConfirmAdoptOpen] = useState(false)

  const suggestedPath = homeDir
    ? `${homeDir}/${COMPANIES_DIR_NAME}${name.trim() ? `/${slugify(name)}` : ""}`
    : ""
  if (!pathTouched && !showAdopt && suggestedPath && suggestedPath !== rootPath) {
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

  async function loadFolders(dir?: string) {
    setBrowse(await listHomeFolders(dir))
  }

  function toggleAdopt() {
    const next = !showAdopt
    setShowAdopt(next)
    setMessage(null)
    // Either direction leaves a stale path behind: entering, the name-derived
    // ~/Alacran suggestion; leaving, the folder just picked. Clear it both ways
    // so the suggestion re-derives and the button stays disabled until there's
    // a real choice.
    setRootPath("")
    setPathTouched(next)
    if (next) void loadFolders()
  }

  function pickFolder(fullPath: string, folderName: string) {
    setRootPath(fullPath)
    setMessage(null)
    if (!name.trim()) setName(folderName)
  }

  async function handleConfirmAdopt() {
    setConfirmAdoptOpen(false)
    setPending(true)
    setMessage(null)
    const result = await adoptFolder(name, rootPath)
    setPending(false)
    if (result.ok) {
      setName("")
      setRootPath("")
      setShowAdopt(false)
      setPathTouched(false)
      setMessage(
        `Added "${result.company.name}"${result.added.length > 0 ? ` — ${result.added.length} starter file(s) copied in` : ""}`
      )
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

  const advanced = useAdvancedMode()

  // Shared between both presentations below: the onboarding wizard's inline
  // card (prominent) and the agents-page header's Sheet modal (default).
  const formFields = (
    <>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Second Co" />
      </div>
      {/* A filesystem path is the last technical value left in the happy
          path, and a non-technical user has no mental model for one. The
          field only appears in advanced mode; the value it holds is derived
          from the name either way, so nothing changes about what gets
          created — only whether the user is asked about it. */}
      {showAdopt ? (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Which folder is your work in?</label>
          <div className="rounded-md border border-border">
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-xs text-muted-foreground">
              {browse?.parent && (
                <button
                  type="button"
                  className="shrink-0 hover:text-foreground"
                  onClick={() => loadFolders(browse.parent ?? undefined)}
                >
                  ← Back
                </button>
              )}
              <span className="truncate">{browse ? browse.dir : "Loading…"}</span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {browse?.folders.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">No folders in here.</p>
              )}
              {browse?.folders.map((folder) => {
                const fullPath = `${browse.dir}/${folder}`
                return (
                  <div
                    key={folder}
                    className={`flex items-center gap-1 border-b border-border/50 px-2.5 text-xs last:border-b-0 ${
                      rootPath === fullPath ? "bg-primary/5 text-primary" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="flex-1 truncate py-2 text-left hover:text-primary"
                      onClick={() => pickFolder(fullPath, folder)}
                    >
                      {folder}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 px-2 py-2 text-muted-foreground hover:text-foreground"
                      title={`Look inside ${folder}`}
                      onClick={() => loadFolders(fullPath)}
                    >
                      ›
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {rootPath
              ? `Using ${rootPath}. It stays exactly where it is.`
              : "Click a folder to use it, or › to look inside it."}
          </p>
        </div>
      ) : advanced || external ? (
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
      ) : (
        <p className="text-xs text-muted-foreground">
          Saved in your {COMPANIES_DIR_NAME} folder, in your home folder. Everything stays on this computer.
        </p>
      )}
      {!showRestore && !showAdopt && (
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
      {!showRestore && !showAdopt && !external && (
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
        ) : showAdopt ? (
          <Button size="sm" onClick={() => setConfirmAdoptOpen(true)} disabled={pending || !name || !rootPath}>
            {pending ? "Setting up…" : "Use this folder"}
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

      <div className="flex flex-col items-start gap-1.5">
        {!showAdopt && (
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
        )}
        {!showRestore && (
          <button
            type="button"
            className="text-xs text-primary underline-offset-4 hover:underline"
            onClick={toggleAdopt}
            disabled={pending}
          >
            {showAdopt
              ? "← Create a new company instead"
              : "Already have a folder of work on this computer? →"}
          </button>
        )}
      </div>

      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </>
  )

  const confirmDialog = (
    <>
    <AlertDialog open={confirmAdoptOpen} onOpenChange={setConfirmAdoptOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Use this folder as &quot;{name}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            <code>{rootPath}</code> stays where it is and keeps everything in it. Alacrán adds the company
            files it needs alongside your own — {STARTER_ENTRIES} — and starts tracking the folder with git if
            it isn&apos;t already. Nothing you already have is replaced.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmAdopt}>Add these files &amp; register</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
    </>
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
