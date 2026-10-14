"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ActionProposal } from "@/lib/assistant/action-envelope"
import { createDepartmentAction, retryCommitAction } from "@/lib/os/departments/actions"
import { DEPARTMENT_PALETTE, isPaletteColor } from "@/lib/os/departments/palette"
import { MAX_NAME, MAX_PURPOSE, slugify } from "@/lib/os/departments/rules"
import { ColorPicker } from "@/components/os/departments/color-picker"
import { OfficeSign } from "@/components/os/departments/office-sign"

type Status = "idle" | "running" | "created" | "history-failed" | "dismissed" | "error"

export function DepartmentProposalCard({ proposal, companyName, onActed }: { proposal: ActionProposal; companyName?: string; onActed?: () => void }) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("idle")
  const [name, setName] = useState(proposal.fields.name ?? "")
  const [purpose, setPurpose] = useState(proposal.fields.purpose ?? "")
  const [color, setColor] = useState(isPaletteColor(proposal.fields.color) ? proposal.fields.color.toLowerCase() : DEPARTMENT_PALETTE[2].hex)
  const [error, setError] = useState<{ code: string; text: string } | null>(null)
  const [slug, setSlug] = useState("")
  const [retry, setRetry] = useState<{ paths: string[]; message: string } | null>(null)
  // One id for this card: pressing the button twice, or retrying after a timeout, can't create two.
  const operationId = useRef<string | null>(null)

  const [retrying, setRetrying] = useState(false)
  operationId.current ??= crypto.randomUUID()
  const unreachable = "Couldn't confirm the result. Pressing Add department again is safe: it won't create a duplicate."

  if (status === "dismissed") return null

  // Only ever called from a button click: rendering, replay and speech never create anything.
  async function confirm(adopt = false) {
    onActed?.()
    setStatus("running")
    setError(null)
    let res
    try {
      res = await createDepartmentAction(proposal.companyId, { name, purpose, color, adopt, operationId: operationId.current! })
    } catch {
      // Same operationId on purpose: a retry can't create a second department.
      setError({ code: "network", text: unreachable })
      setStatus("error")
      return
    }
    if (!res.ok) {
      setError({ code: res.code, text: res.error })
      setStatus("error")
      if (res.code !== "folder-exists") operationId.current = crypto.randomUUID()
      return
    }
    setSlug(res.slug)
    router.refresh()
    if (res.committed) setStatus("created")
    else {
      setRetry({ paths: res.commitPaths, message: res.commitMessage })
      setError({ code: "history", text: res.commitError ?? "Saved locally; history update failed." })
      setStatus("history-failed")
    }
  }

  async function retryHistory() {
    if (!retry) return
    setRetrying(true)
    try {
      const res = await retryCommitAction(proposal.companyId, retry.paths, retry.message)
      if (res.ok) { setError(null); setStatus("created") } else setError({ code: "history", text: res.error })
    } catch {
      setError({ code: "history", text: "Couldn't confirm the result. Try saving history again." })
    } finally {
      setRetrying(false)
    }
  }

  const editable = status === "idle" || status === "error"
  return (
    <div role="region" aria-label="Proposed department" className="mt-2.5 rounded-lg border border-border bg-card p-3 text-sm shadow-md">
      <div className="font-semibold">{proposal.label}</div>
      <p className="text-xs text-muted-foreground">For company: {companyName ?? proposal.companyId}. Nothing is created until you press the button.</p>
      <div className="mt-2 grid gap-2">
        <label className="grid gap-1"><span className="font-medium">Name</span>
          <input className="rounded border border-border bg-background px-2 py-1" value={name} onChange={(e) => { setName(e.target.value); if (status === "error") operationId.current = crypto.randomUUID() }} maxLength={MAX_NAME} disabled={!editable} /></label>
        <label className="grid gap-1"><span className="font-medium">What is it for?</span>
          <input className="rounded border border-border bg-background px-2 py-1" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={MAX_PURPOSE} disabled={!editable} /></label>
        {editable && <ColorPicker value={color} onChange={setColor} name={`proposal-color-${operationId.current}`} />}
        <OfficeSign slug={slugify(name) || "department"} name={name} color={color} />
      </div>
      {error && <p role="alert" className="mt-2 text-destructive">{error.text}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editable && (
          <>
            <button type="button" onClick={() => void confirm()} className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground">Add department</button>
            {error?.code === "folder-exists" && <button type="button" onClick={() => void confirm(true)} className="rounded-md border border-border px-3 py-1.5">Use the existing folder</button>}
            <button type="button" onClick={() => setStatus("dismissed")} className="rounded-md border border-border px-2.5 py-1.5 text-muted-foreground">Dismiss</button>
          </>
        )}
        {status === "running" && <span>Adding the department…</span>}
        {(status === "created" || status === "history-failed") && (
          <>
            <span className="font-medium">{status === "created" ? "Department added." : "Saved, but history wasn't updated."}</span>
            <Link className="underline" href={`/c/${proposal.companyId}/records/${slug}`}>Open department</Link>
            {status === "history-failed" && <button type="button" onClick={() => void retryHistory()} disabled={retrying} className="rounded-md border border-border px-2.5 py-1.5 disabled:opacity-60">{retrying ? "Saving…" : "Try saving history again"}</button>}
          </>
        )}
      </div>
    </div>
  )
}
