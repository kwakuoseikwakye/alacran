"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { saveCompanyCredential } from "@/lib/save-company-credential"
// Type-only: lib/credentials/resolve.ts imports node:fs/promises, and this is a
// "use client" module. `import type` is erased before bundling; a value import
// would drag node:fs into the client bundle and fail the build. Same note as
// McpServer in mcp-servers-sheet.tsx.
import type { CredentialSource } from "@/lib/credentials/resolve"

export const CREDENTIAL_ROW_BLURB =
  "For each service, either this company uses the one set up on this computer, or it has its own. A row that says \"machine default\" is one where the bill, the workspace and the data belong to whatever you connected on the Connections page — which is right until two companies want two different accounts."

/** Pure, so it is testable without rendering. The machine-default wording is
 *  the spec's §Risks mitigation — a silent fallback is the trap this feature
 *  exists to close. */
export function rowSummary(source: CredentialSource): string {
  if (source === "company") return "This company has its own"
  if (source === "machine") return "Using your machine default"
  return "Not connected yet — add one in Connections"
}

/**
 * One service, two options: the machine's credential, or this company's own.
 *
 * **It never shows a key, and it never takes one from scratch.** The only
 * value that reaches the DOM is `source` — three words about WHERE the
 * credential came from. Typing a company's own key is a deliberate second
 * step behind the sheet, and choosing "machine default" saves the empty
 * string, which is how save-company-credential-impl.ts deletes the line.
 *
 * A `<select>` rather than the two buttons the brief sketched, for one
 * concrete reason: `.company-action-control button::after` in globals.css
 * stretches a row's single button across the whole row, and its own comment
 * says that is only safe while a row holds AT MOST ONE button. Two toggle
 * buttons would have produced two overlapping full-row hit targets. The two
 * existing picker rows (Google accounts, AI engine) already hold no button,
 * so this follows the shape the CSS was written for instead of fighting it.
 */
export function CompanyCredentialRow({
  agentId,
  label,
  credentialKey,
  source,
}: {
  agentId: string
  label: string
  credentialKey: string
  /** Resolved server-side by resolveCredential. Never the value itself. */
  source: CredentialSource
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // "unset" has no option of its own: the company is still inheriting, there
  // is just nothing to inherit. The caption below says which it is.
  const selected = source === "company" ? "company" : "machine"

  async function selectMachineDefault() {
    setPending(true)
    setMessage(null)
    // An EMPTY value deletes the key — that is how a company returns to the
    // machine default (Task 4's saveCompanyCredentialImpl).
    const result = await saveCompanyCredential(agentId, credentialKey, "")
    setPending(false)
    if (result.ok) router.refresh()
    else setMessage(result.message)
  }

  async function saveOwn() {
    setPending(true)
    setMessage(null)
    const result = await saveCompanyCredential(agentId, credentialKey, value.trim())
    setPending(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    // Cleared immediately: the typed key has no reason to sit in component
    // state after the write, and the sheet reopens empty rather than
    // redisplaying anything.
    setValue("")
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground" htmlFor={`cred-${agentId}-${credentialKey}`}>
        {label}
      </label>
      <select
        id={`cred-${agentId}-${credentialKey}`}
        value={selected}
        disabled={pending}
        onChange={(e) => {
          if (e.target.value === "company") setOpen(true)
          else void selectMachineDefault()
        }}
        className="flex h-9 w-full min-w-0 rounded-md border border-os-border bg-os-surface px-3 py-1 text-xs text-os-text shadow-xs transition-colors outline-none focus-visible:border-os-accent focus-visible:ring-1 focus-visible:ring-os-accent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="machine" className="bg-os-surface text-os-text">
          Machine default
        </option>
        <option value="company" className="bg-os-surface text-os-text">
          This company&apos;s own
        </option>
      </select>
      <p className="text-xs text-muted-foreground">{pending ? "Saving…" : rowSummary(source)}</p>
      {/* The empty picker links ONE way. Connections is where a machine
          credential is added; this page only ever picks between what is
          already there and this company's own. */}
      {source === "unset" && (
        <Link
          href="/system/connectors"
          className="text-primary text-xs underline-offset-4 hover:underline"
        >
          Open Connections
        </Link>
      )}
      {message && <p className="text-xs text-destructive">{message}</p>}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Give this company its own {label} key</SheetTitle>
            <SheetDescription>
              It is saved in this company&apos;s own folder, readable only by you, and never committed —
              so it does not travel with a backup. Leave this and pick &quot;Machine default&quot; to go back
              to the one set up on this computer.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-4 text-sm">
            <label className="text-muted-foreground block space-y-1 text-xs">
              <span>{credentialKey}</span>
              <Input
                type="password"
                autoComplete="off"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={`Paste this company's ${label} key`}
              />
            </label>
            <Button size="sm" disabled={pending || !value.trim()} onClick={() => void saveOwn()}>
              {pending ? "Saving…" : "Save"}
            </Button>
            {message && <p className="text-destructive text-xs">{message}</p>}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
