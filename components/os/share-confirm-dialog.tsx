"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { connectCompanies, previewConnection } from "@/lib/sharing/actions"
import { DEFAULT_SHARE_SCOPE, SHARE_SCOPE_KEYS, SHARE_SCOPE_LABELS, type ShareScope } from "@/lib/sharing/model"
import type { SharedPreview } from "@/lib/sharing/shared-context"

/**
 * The question asked before a string exists.
 *
 * Dropping a string on a company is the gesture; this is the approval. A string
 * lets one company's assistants read another's memory — access changing hands,
 * a gated step — so it says exactly what would be readable (counted from the
 * real files, not described in general), lets the person narrow it, and names
 * what can never be shared. Nothing is written until the button is pressed.
 */
export function ShareConfirmDialog({
  fromId,
  toId,
  fromName,
  toName,
  onClose,
  onDone,
}: {
  fromId: string
  toId: string
  fromName: string
  toName: string
  onClose: () => void
  onDone: () => void
}) {
  const [scope, setScope] = useState<ShareScope>(DEFAULT_SHARE_SCOPE)
  const [preview, setPreview] = useState<SharedPreview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const anyOn = SHARE_SCOPE_KEYS.some((key) => scope[key])

  useEffect(() => {
    let cancelled = false
    if (!anyOn) {
      setPreview([])
      return
    }
    void previewConnection(fromId, toId, scope).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setPreview(result.preview)
        setMessage(null)
      } else setMessage(result.message)
    })
    return () => {
      cancelled = true
    }
  }, [fromId, toId, scope, anyOn])

  async function confirm() {
    setBusy(true)
    setMessage(null)
    const result = await connectCompanies(fromId, toId, scope)
    setBusy(false)
    if (result.ok) onDone()
    else setMessage(result.message)
  }

  const lineFor = (key: (typeof SHARE_SCOPE_KEYS)[number]) => {
    if (!scope[key]) return null
    const found = preview?.find((p) => p.key === key)
    if (!found) return "Looking…"
    return found.items === 0 ? "Nothing there yet." : `${found.items} ${found.items === 1 ? "item" : "items"}, ${found.chars.toLocaleString()} characters.`
  }

  return (
    <Dialog open onOpenChange={(open) => (open || busy ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Share {fromName}&apos;s knowledge with {toName}?
          </DialogTitle>
          <DialogDescription>
            {toName}&apos;s assistants will be able to read what you tick below when you ask them something. They can read it, never change it, and
            they will say it came from {fromName}. Cut the string any time and it stops straight away.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2.5">
          {SHARE_SCOPE_KEYS.map((key) => (
            <label key={key} className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={scope[key]}
                disabled={busy}
                onChange={(event) => setScope({ ...scope, [key]: event.target.checked })}
              />
              <span>
                <span className="font-medium">{SHARE_SCOPE_LABELS[key].label}</span>
                <span className="block text-xs text-muted-foreground">
                  {SHARE_SCOPE_LABELS[key].hint} {lineFor(key)}
                </span>
              </span>
            </label>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Never shared: notes, anything from chats, records such as money and leads, and passwords or keys. There is no switch for them.
        </p>

        {message ? (
          <p className="text-sm text-destructive" role="alert">
            {message}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !anyOn} onClick={() => void confirm()}>
            Share with {toName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
