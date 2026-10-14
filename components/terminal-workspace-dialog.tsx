"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listAiExecutors } from "@/lib/ai-executors"
import { DEFAULT_WORKSPACE_ID, MAX_WORKSPACE_NAME, type Workspace } from "@/lib/terminal/workspace-model"

const EXECUTORS = listAiExecutors()

/**
 * The form behind "New workspace" and "Edit workspace".
 *
 * Both ask for a name and which AI the workspace's assistants run; the AI
 * starts on "the company's own" so a person who never opens the list gets what
 * the rest of the app already uses, and changing the company's AI still moves
 * that workspace. Editing may change the AI too, and says what that does not do:
 * an assistant already open keeps the AI it started with. Main has no AI choice
 * of its own — it is the company's, set where the company's AI is set.
 *
 * `onSubmit` returns a sentence when it refuses, which stays in the form so the
 * name just typed is not lost.
 */
export function TerminalWorkspaceDialog({
  mode,
  workspace,
  companyAiLabel,
  canDelete,
  onSubmit,
  onDelete,
  onClose,
}: {
  mode: "create" | "edit"
  workspace?: Workspace
  companyAiLabel: string
  /** Edit mode only: an empty workspace that is not Main may be deleted. */
  canDelete?: boolean
  onSubmit: (name: string, executorId: string) => Promise<string | null>
  onDelete?: () => Promise<string | null>
  onClose: () => void
}) {
  const [name, setName] = useState(workspace?.name ?? "")
  const [executorId, setExecutorId] = useState(workspace?.executorId ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<string | null>) {
    setBusy(true)
    setMessage(null)
    const refusal = await action().catch(() => "Something went wrong. Try again.")
    setBusy(false)
    if (refusal) setMessage(refusal)
    else onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => (open || busy ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) void run(() => onSubmit(name, executorId))
          }}
        >
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "New workspace" : "Edit workspace"}</DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "A workspace is its own set of terminals. Open as many assistants in it as you like."
                : "Change its name or its AI. Terminals already open keep running as they are; new assistants use the AI chosen here."}
            </DialogDescription>
          </DialogHeader>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_WORKSPACE_NAME}
              placeholder="Research, Customer emails, …"
              autoFocus
            />
          </label>

          {(mode === "create" || workspace?.id !== DEFAULT_WORKSPACE_ID) && (
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">AI for this workspace</span>
              <select
                value={executorId}
                onChange={(event) => setExecutorId(event.target.value)}
                className="h-9 w-full rounded-md border border-os-border bg-os-surface px-3 text-sm text-os-text outline-none focus-visible:border-os-accent focus-visible:ring-1 focus-visible:ring-os-accent"
              >
                <option value="">{companyAiLabel} (this company&apos;s AI)</option>
                {EXECUTORS.map((executor) => (
                  <option key={executor.id} value={executor.id}>
                    {executor.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {message && (
            <p className="text-sm text-destructive" role="alert">
              {message}
            </p>
          )}

          <DialogFooter className="sm:justify-between">
            {mode === "edit" && onDelete ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy || !canDelete}
                onClick={() => void run(onDelete)}
                title={canDelete ? "Remove this empty workspace" : "Close the terminals in this workspace first. The main workspace can't be deleted."}
              >
                Delete workspace
              </Button>
            ) : (
              <span />
            )}
            <span className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {mode === "create" ? "Create workspace" : "Save changes"}
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
