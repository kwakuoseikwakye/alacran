"use client"

import { useEffect, useState } from "react"
import { useAdvancedMode } from "@/components/advanced-only"
import { useRouter } from "next/navigation"
import { FolderOpen, Plus, GitBranch, ShieldCheck } from "lucide-react"
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
import { chooseFolder, desktopFolderPicker, type DesktopFolderPicker } from "@/lib/desktop-folder-picker"
import { TEMPLATE_MANIFEST } from "@/lib/company-template-manifest"
import { getCompanyPathStatus } from "@/lib/get-company-path-status"
import { createCompanyFromTemplate } from "@/lib/create-company-from-template"
import { restoreCompany } from "@/lib/github/github-actions"
import { COMPANY_STARTER_PACKS, DEFAULT_COMPANY_STARTER_PACK_ID, getCompanyStarterPack } from "@/lib/company-starter-packs"
import { COMPANIES_DIR_NAME } from "@/lib/branding"
import type { RegisteredCompany } from "@/lib/companies-registry"

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

export type OnboardingTab = "new" | "adopt" | "restore"

export const STARTER_PACK_ROLES: Record<string, string[]> = {
  general: ["Workspace Operator", "Lead Developer", "Generalist"],
  "software-engineering": ["Tech Lead", "Software Engineer", "QA Architect", "Platform Ops"],
  sales: ["Head of Sales", "Account Executive", "BDR Outreach"],
  marketing: ["Head of Growth", "Content Strategist", "Demand Gen"],
  "customer-support": ["Head of CX", "Support Engineer", "Success Manager"],
  "hr-people": ["Head of Talent", "People Partner", "Culture Ops"],
  "leadership-team": ["CEO / Founder", "Head of Ops / COO", "Chief of Staff"],
}

export const STARTER_VALUE_STATEMENTS: Record<string, string> = {
  general: "Start blank and describe your business in your own words.",
  "software-engineering": "For building software: plans, reviews and tests, with every change waiting for your OK.",
  sales: "Tracks leads and deals. Never sends a quote or a discount without you.",
  marketing: "Plans posts and campaigns. Never publishes anything without you.",
  "customer-support": "Helps you answer customers. Never shares their data or offers a refund without you.",
  "hr-people": "Helps with hiring and your team. Never makes an offer without you.",
  "leadership-team": "Keeps your priorities and decisions in one place, with the reasons written down.",
}

function getCategoryBadgeClass(category: string): string {
  switch (category) {
    case "Engineering":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
    case "Sales":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
    case "Marketing":
      return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
    case "Support":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
    case "HR & People":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
    case "Leadership":
      return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
    default:
      return "bg-muted text-muted-foreground border-border"
  }
}

export type AddCompanyFormProps = {
  /** Onboarding shows this as the step's primary action; the dashboard keeps it quiet. */
  prominent?: boolean
  /** Server-detected home directory, used to suggest a path non-technical users don't have to type. */
  homeDir?: string
  /** Callback fired with the newly registered or adopted company */
  onSuccess?: (company: RegisteredCompany) => void
  /** Callback fired when the form is closed or cancelled */
  onCancel?: () => void
  /** Force the form to be open initially */
  defaultOpen?: boolean
  /** Outcome-selected starter used by first-run onboarding. */
  initialPackId?: string
  /** Keep first-run creation focused after onboarding already chose an outcome. */
  guided?: boolean
}

export function AddCompanyForm({
  prominent = false,
  homeDir,
  onSuccess,
  onCancel,
  defaultOpen,
  initialPackId,
  guided = false,
}: AddCompanyFormProps = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen ?? Boolean(onSuccess || onCancel))
  const [activeTab, setActiveTab] = useState<OnboardingTab>("new")
  const [name, setName] = useState("")
  const [rootPath, setRootPath] = useState("")
  // False until the user edits the path field directly. This keeps the suggested
  // path in sync with the name for non-technical users, without ever
  // clobbering a path a technical user typed themselves.
  const [pathTouched, setPathTouched] = useState(false)
  const [packId, setPackId] = useState(initialPackId ?? DEFAULT_COMPANY_STARTER_PACK_ID)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false)
  const [restoreUrl, setRestoreUrl] = useState("")
  const [external, setExternal] = useState(false)
  const [browse, setBrowse] = useState<FolderListing | null>(null)
  const [confirmAdoptOpen, setConfirmAdoptOpen] = useState(false)
  const [nativePicker, setNativePicker] = useState<DesktopFolderPicker | null>(null)
  const [picking, setPicking] = useState(false)
  useEffect(() => setNativePicker(desktopFolderPicker()), [])

  const suggestedPath = homeDir
    ? `${homeDir}/${COMPANIES_DIR_NAME}${name.trim() ? `/${slugify(name)}` : ""}`
    : ""
  if (!pathTouched && activeTab !== "adopt" && suggestedPath && suggestedPath !== rootPath) {
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
        // In first-run setup, creating it is the only possible outcome, so a
        // dialog asking to confirm it (showing a folder path) was one more
        // thing to read before anything happened.
        if (guided) {
          await handleConfirmCreate()
          return
        }
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
      onSuccess?.(result.company)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  async function loadFolders(dir?: string) {
    setBrowse(await listHomeFolders(dir))
  }

  function pickFolder(fullPath: string, folderName: string) {
    setRootPath(fullPath)
    setMessage(null)
    if (!name.trim()) setName(folderName)
  }

  /** The native dialog's result goes through `pickFolder` too, so validation,
   *  the name autofill and the confirmation all behave identically to a folder
   *  clicked in the list below. A dismissed dialog is a no-op. */
  async function pickFolderNatively() {
    if (!nativePicker) return
    setPicking(true)
    const chosen = await chooseFolder(nativePicker).catch(() => null)
    setPicking(false)
    if (!chosen) return
    pickFolder(chosen.path, chosen.name)
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
      setPathTouched(false)
      setMessage(
        `Added "${result.company.name}"${result.added.length > 0 ? ` — ${result.added.length} starter file(s) copied in` : ""}`
      )
      setOpen(false)
      onSuccess?.(result.company)
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
      setOpen(false)
      const registeredCompany: RegisteredCompany = (result as { company?: RegisteredCompany }).company ?? {
        id: slugify(name),
        name,
        rootPath,
      }
      onSuccess?.(registeredCompany)
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
      // In setup the next page takes a moment to open; collapsing the form
      // left the screen looking as if nothing had happened.
      setMessage(guided ? "Created. Opening your company…" : `Created "${result.company.name}"`)
      if (!guided) setOpen(false)
      onSuccess?.(result.company)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  function handleCancel() {
    setOpen(false)
    onCancel?.()
  }

  const advanced = useAdvancedMode()

  // 3-tab Segment Control
  const tabControl = (
    <div
      role="tablist"
      aria-label="Onboarding mode"
      className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1 text-xs border border-border/40"
    >
      <button
        type="button"
        role="tab"
        id="tab-new"
        aria-selected={activeTab === "new"}
        aria-controls="panel-new"
        onClick={() => {
          setActiveTab("new")
          setMessage(null)
          setPathTouched(false)
        }}
        className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-all ${
          activeTab === "new"
            ? "bg-card text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Plus className="h-3.5 w-3.5" />
        New Company
      </button>
      <button
        type="button"
        role="tab"
        id="tab-adopt"
        aria-selected={activeTab === "adopt"}
        aria-controls="panel-adopt"
        onClick={() => {
          setActiveTab("adopt")
          setMessage(null)
          setRootPath("")
          setPathTouched(true)
          void loadFolders()
        }}
        className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-all ${
          activeTab === "adopt"
            ? "bg-card text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        Adopt Folder
      </button>
      <button
        type="button"
        role="tab"
        id="tab-restore"
        aria-selected={activeTab === "restore"}
        aria-controls="panel-restore"
        onClick={() => {
          setActiveTab("restore")
          setMessage(null)
          setPathTouched(false)
        }}
        className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-all ${
          activeTab === "restore"
            ? "bg-card text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <GitBranch className="h-3.5 w-3.5" />
        Restore Backup
      </button>
    </div>
  )

  // View: Adopt Folder
  const adoptView = (
    <div
      role="tabpanel"
      id="panel-adopt"
      aria-labelledby="tab-adopt"
      className="space-y-3 pt-1"
    >
      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Adopt an existing project</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Safely adds Alacrán context (definitions/, docs/, records/) without modifying existing source code.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Company Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Existing Project Name"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Which folder is your work in?</label>
          {nativePicker && (
            <Button
              size="sm"
              variant="outline"
              onClick={pickFolderNatively}
              disabled={pending || picking}
              className="h-7 text-xs"
            >
              <FolderOpen className="h-3.5 w-3.5 mr-1" />
              {picking ? "Waiting for your choice…" : "Browse…"}
            </Button>
          )}
        </div>

        <div className="rounded-md border border-border bg-card/40">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-xs text-muted-foreground">
            {browse?.parent && (
              <button
                type="button"
                className="shrink-0 hover:text-foreground font-medium"
                onClick={() => loadFolders(browse.parent ?? undefined)}
              >
                ← Back
              </button>
            )}
            <span className="truncate">{browse ? browse.dir : "Loading…"}</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {browse?.folders.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">No folders in here.</p>
            )}
            {browse?.folders.map((folder) => {
              const fullPath = `${browse.dir}/${folder}`
              return (
                <div
                  key={folder}
                  className={`flex items-center gap-1 border-b border-border/50 px-2.5 text-xs last:border-b-0 transition-colors ${
                    rootPath === fullPath ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/40"
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 truncate py-2 text-left"
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
            : nativePicker
              ? "Press Browse… to look anywhere on this computer, or click a folder below."
              : "Click a folder to use it, or › to look inside it."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button size="sm" onClick={() => setConfirmAdoptOpen(true)} disabled={pending || !name || !rootPath}>
          {pending ? "Setting up…" : "Use this folder"}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  )

  // View: Restore Backup
  const restoreView = (
    <div
      role="tabpanel"
      id="panel-restore"
      aria-labelledby="tab-restore"
      className="space-y-3 pt-1"
    >
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Company Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Restored Company"
        />
      </div>

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

      {advanced && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Local directory path</label>
          <Input
            value={rootPath}
            onChange={(e) => {
              setRootPath(e.target.value)
              setPathTouched(true)
            }}
            placeholder={homeDir ? `${homeDir}/${COMPANIES_DIR_NAME}/restored-co` : `~/${COMPANIES_DIR_NAME}/restored-co`}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button size="sm" onClick={handleRestore} disabled={pending || !name || !rootPath || !restoreUrl}>
          {pending ? "Restoring…" : "Restore company"}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  )

  // View: New Company (with Bento Card Starter Selector)
  const newCompanyView = (
    <div
      role="tabpanel"
      id="panel-new"
      aria-labelledby="tab-new"
      className="space-y-3 pt-1"
    >
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ama's Catering"
        />
      </div>

      {advanced || external ? (
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
              : `Created in an ${COMPANIES_DIR_NAME} folder in your home directory, next to your other companies.`}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Saved in your {COMPANIES_DIR_NAME} folder, in your home folder. Everything stays on this computer.
        </p>
      )}

      {!guided && <label className="flex cursor-pointer gap-2.5 rounded-md border border-border p-2.5 text-xs bg-card/30 hover:bg-card/60 transition-colors">
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
            Terminal — and nothing else: no setup, no backup, no files written to it.
          </span>
        </span>
      </label>}

      {!external && guided && (
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-primary">Tailored to your goal</p>
          <p className="mt-1 text-sm font-semibold">{getCompanyStarterPack(packId).label}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{STARTER_VALUE_STATEMENTS[packId] ?? getCompanyStarterPack(packId).description}</p>
          <p className="mt-2 text-xs text-primary">You can add or change roles later.</p>
        </div>
      )}

      {!external && !guided && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground font-medium">Starter template</label>
            <span className="text-[11px] text-muted-foreground/70">
              Select an archetype to seed roles &amp; records
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {COMPANY_STARTER_PACKS.map((pack) => {
              const roles = STARTER_PACK_ROLES[pack.id] ?? []
              const valueStatement = STARTER_VALUE_STATEMENTS[pack.id] ?? pack.description
              const isSelected = packId === pack.id

              return (
                <label
                  key={pack.id}
                  className={`group relative flex flex-col justify-between rounded-lg border p-3 text-xs transition-all cursor-pointer focus-within:ring-2 focus-within:ring-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary/30"
                      : "border-border bg-card/40 hover:border-muted-foreground/40 hover:bg-card/70"
                  }`}
                >
                  <input
                    type="radio"
                    name="starter-pack"
                    value={pack.id}
                    checked={isSelected}
                    onChange={() => setPackId(pack.id)}
                    className="sr-only"
                  />

                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`inline-block w-fit rounded border px-1.5 py-0.5 text-[10px] font-medium ${getCategoryBadgeClass(
                            pack.category
                          )}`}
                        >
                          {pack.category}
                        </span>
                        <span className="font-semibold text-foreground text-sm mt-0.5">{pack.label}</span>
                      </div>
                      <div
                        className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors mt-0.5 ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30 bg-transparent"
                        }`}
                        aria-hidden="true"
                      >
                        {isSelected && <div className="size-1.5 rounded-full bg-current" />}
                      </div>
                    </div>

                    <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                      {valueStatement}
                    </p>

                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {roles.slice(0, 4).map((role) => (
                        <span
                          key={role}
                          className="rounded bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/50"
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[10px]">
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400">
                      <ShieldCheck className="h-3 w-3" />
                      Asks before anything risky
                    </span>
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button size="sm" onClick={handleSubmit} disabled={pending || !name || !rootPath}>
          {pending ? "Adding…" : "Add company"}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  )

  const formBody = (
    <div className="space-y-4">
      {tabControl}
      {activeTab === "new" && newCompanyView}
      {activeTab === "adopt" && adoptView}
      {activeTab === "restore" && restoreView}
      {message && <p className="text-xs text-muted-foreground pt-1">{message}</p>}
    </div>
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
            <AlertDialogTitle>Create &quot;{name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              It starts from the <strong>{getCompanyStarterPack(packId).label}</strong> starter and is saved in{" "}
              <code>{rootPath}</code>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCreate}>Create company</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  // Onboarding wizard prominent presentation
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
      <div className="a-rise w-full space-y-3 rounded-lg border border-border bg-card p-4 max-h-[85vh] overflow-y-auto pr-1 pb-4">
        <h2 className="text-sm font-medium">Add a company</h2>
        {formBody}
        {confirmDialog}
      </div>
    )
  }

  // Header / default Sheet modal presentation
  return (
    <>
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add a company
      </Button>
      <Sheet open={open} onOpenChange={(val) => {
        setOpen(val)
        if (!val) onCancel?.()
      }}>
        <SheetContent className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Add a company</SheetTitle>
          </SheetHeader>
          <div className="flex-1 max-h-[85vh] overflow-y-auto pr-1 pb-4 px-4 space-y-3">
            {formBody}
          </div>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </>
  )
}
