"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { ActionProposal } from "@/lib/assistant/action-envelope"
import { editDepartmentAction, getDepartmentForEditAction } from "@/lib/os/departments/actions"
import type { DepartmentDefinition } from "@/lib/os/departments/definitions"
import { isPaletteColor } from "@/lib/os/departments/palette"
import { MAX_NAME, MAX_PURPOSE } from "@/lib/os/departments/rules"
import { ColorPicker } from "@/components/os/departments/color-picker"
import { HistoryNotice } from "@/components/os/departments/history-notice"
import { OfficeSign } from "@/components/os/departments/office-sign"

type Status = "loading" | "idle" | "saving" | "history-failed" | "saved" | "dismissed"
type Loaded = { department: DepartmentDefinition; revision: string }
/** A change that is on disk but whose history entry failed: what the retry needs. */
type History = { paths: string[]; message: string; error?: string }

const CONFLICT = "The department changed while you were working. I've reloaded it — check the values, then press Save changes again."
const UNREACHABLE = "Couldn't confirm the result. Check the department before trying again."

/** A field the proposal left out (or sent blank) is "not changed", never "empty". */
const given = (v: string | undefined) => (v && v.trim() ? v : null)

export function EditDepartmentProposalCard({ proposal, onActed }: { proposal: ActionProposal; onActed?: () => void }) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("loading")
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // null = not touched: show (and send) the department's current value.
  const [name, setName] = useState<string | null>(given(proposal.fields.name))
  const [purpose, setPurpose] = useState<string | null>(given(proposal.fields.purpose))
  const [color, setColor] = useState<string | null>(isPaletteColor(proposal.fields.color) ? proposal.fields.color.toLowerCase() : null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const startedRef = useRef(false)
  const pickerName = `edit-color-${useId()}`
  const slug = proposal.fields.slug ?? ""

  // Read-only: fetches the department as it is now, with the revision a save will be checked against.
  async function load() {
    try {
      const res = await getDepartmentForEditAction(proposal.companyId, slug)
      if (res.ok) setLoaded({ department: res.department, revision: res.revision })
      else setError(res.error)
    } catch {
      setError("Couldn't load the department. Try again.")
    }
    setStatus("idle")
  }

  // Strict Mode runs this effect twice in development; the ref makes it one load.
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (status === "dismissed") return null

  const shownName = name ?? loaded?.department.name ?? ""
  const shownPurpose = purpose ?? loaded?.department.purpose ?? ""
  const shownColor = color ?? loaded?.department.color ?? ""
  const editable = status === "idle" && !!loaded
  // Saving what is already there would rewrite the same text and leave nothing to record in history.
  const unchanged = !!loaded && shownName.trim() === loaded.department.name && shownPurpose.trim() === loaded.department.purpose && shownColor.toLowerCase() === loaded.department.color

  // Only ever called from the button: rendering, replay and speech never change a department.
  async function save() {
    if (!loaded) return
    onActed?.()
    setStatus("saving")
    setError(null)
    let res
    try {
      res = await editDepartmentAction(proposal.companyId, {
        slug,
        name: shownName,
        purpose: shownPurpose,
        color: shownColor,
        expectedRevision: loaded.revision,
      })
    } catch {
      setError(UNREACHABLE)
      setStatus("idle")
      return
    }
    if (!res.ok) {
      setError(res.code === "conflict" ? CONFLICT : res.error)
      if (res.code === "conflict") {
        // The revision this card holds is out of date. Drop it, so no Save button sits on the old one, and read the current one.
        setLoaded(null)
        setStatus("loading")
        void load()
      } else setStatus("idle")
      return
    }
    if (res.committed) setStatus("saved")
    else {
      setHistory({ paths: res.commitPaths, message: res.commitMessage, error: res.commitError })
      setStatus("history-failed")
    }
    router.refresh()
  }

  return (
    <div role="region" aria-label="Proposed department change" className="mt-2.5 rounded-lg border border-border bg-card p-3 text-sm shadow-md">
      <div className="font-semibold">{proposal.label}</div>
      {status !== "saved" && status !== "history-failed" && <p className="text-xs text-muted-foreground">Nothing is changed until you press the button.</p>}
      {status === "loading" && <p className="mt-2">Loading the department…</p>}
      {loaded && (
        <div className="mt-2 grid gap-2">
          <label className="grid gap-1"><span className="font-medium">Name</span>
            <input className="rounded border border-border bg-background px-2 py-1" value={shownName} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME} disabled={!editable} /></label>
          <label className="grid gap-1"><span className="font-medium">What is it for?</span>
            <input className="rounded border border-border bg-background px-2 py-1" value={shownPurpose} onChange={(e) => setPurpose(e.target.value)} maxLength={MAX_PURPOSE} disabled={!editable} /></label>
          {editable && <ColorPicker value={shownColor} onChange={setColor} name={pickerName} />}
          <OfficeSign slug={loaded.department.slug} name={shownName} color={shownColor} />
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
      {editable && unchanged && <p className="mt-2 text-xs text-muted-foreground">Nothing to save yet. Change the name, the purpose or the colour first.</p>}
      {status === "history-failed" && history && (
        <div className="mt-3">
          <HistoryNotice companyId={proposal.companyId} commitError={history.error} commitPaths={history.paths} commitMessage={history.message} onDone={() => setStatus("saved")} />
        </div>
      )}
      {status !== "history-failed" && <div className="mt-3 flex flex-wrap items-center gap-2">
        {status === "saved" ? (
          <span className="font-medium">Saved.</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!editable || !shownName.trim() || unchanged}
              className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-60"
            >
              {status === "saving" ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={() => setStatus("dismissed")} disabled={status === "saving"} className="rounded-md border border-border px-2.5 py-1.5 text-muted-foreground disabled:opacity-60">Dismiss</button>
          </>
        )}
      </div>}
    </div>
  )
}
