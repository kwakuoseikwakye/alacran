"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FilePlus2, FolderPlus, Pencil, Trash2 } from "lucide-react"
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
import { createEntry, deleteEntry, moveEntry } from "@/lib/file-ops"

/**
 * Create / rename-or-move / delete, as three small dialogs sharing one state
 * machine. One component rather than three because they differ only in their
 * title, their one field and which action they call — three files would be the
 * same code three times.
 *
 * Every one of them ends in `router.refresh()`: the tree is server-rendered
 * from the real filesystem, so re-reading it is what makes the change appear,
 * and it is also what stops the UI ever showing a file that isn't there.
 */
export function FileActions({
  companyRoot,
  parentPath,
  selectedPath,
  selectedName,
  canModifySelection,
  skillDir,
  skillIsAppManaged,
  onDone,
}: {
  /** The company's own root, for the relative paths a move is expressed in. */
  companyRoot: string
  /** Where a new file or folder goes. */
  parentPath: string
  /** The file the workbench has open, if any. */
  selectedPath?: string
  selectedName?: string
  /** False for a skill the app manages — the next update would overwrite an
   *  edit, so the app does not accept one (v81). */
  canModifySelection?: boolean
  /**
   * The skill's own folder, when the open file is a `SKILL.md`.
   *
   * A skill is a DIRECTORY (`.claude/skills/<name>/SKILL.md`, plus whatever
   * `references/` it ships), but the tree selects the file inside it. Deleting
   * the file alone would leave the folder behind and the skill half-present, so
   * "Remove skill" targets this instead.
   */
  skillDir?: string
  /** True when that skill came from a starter pack, i.e. `Update skills` will
   *  put it back. Said out loud in the dialog rather than discovered later. */
  skillIsAppManaged?: boolean
  onDone?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState<null | "create-file" | "create-folder" | "move" | "delete" | "remove-skill">(null)
  const [value, setValue] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function start(which: NonNullable<typeof open>) {
    setError(null)
    setValue(which === "move" && selectedPath ? relativeTo(companyRoot, selectedPath) : "")
    setOpen(which)
  }

  async function run() {
    setPending(true)
    setError(null)
    const result =
      open === "remove-skill"
        ? await deleteEntry(skillDir!)
        : open === "delete"
        ? await deleteEntry(selectedPath!)
        : open === "move"
          ? await moveEntry(selectedPath!, value)
          : await createEntry(parentPath, value, open === "create-folder" ? "folder" : "file")
    setPending(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setOpen(null)
    onDone?.()
    router.refresh()
  }

  const isCreate = open === "create-file" || open === "create-folder"

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" variant="outline" onClick={() => start("create-file")}>
          <FilePlus2 className="size-3.5" /> New file
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => start("create-folder")}>
          <FolderPlus className="size-3.5" /> New folder
        </Button>
        {skillDir && (
          <Button type="button" size="sm" variant="outline" onClick={() => start("remove-skill")}>
            <Trash2 className="size-3.5" /> Remove skill
          </Button>
        )}
        {selectedPath && canModifySelection && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => start("move")}>
              <Pencil className="size-3.5" /> Rename or move
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => start("delete")}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {open === "remove-skill"
                ? `Remove the ${skillName(skillDir)} skill?`
                : open === "delete"
                ? `Delete ${selectedName}?`
                : open === "move"
                  ? `Rename or move ${selectedName}`
                  : open === "create-folder"
                    ? "New folder"
                    : "New file"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {open === "remove-skill" ? (
                <>
                  Removes the whole <span className="font-mono text-foreground">{skillName(skillDir)}</span> folder
                  from this company, so the skill stops being offered to your AI. It goes to Alacrán&apos;s own
                  trash and the removal is committed, so it is recoverable both ways.
                  {skillIsAppManaged && (
                    <>
                      {" "}
                      <b className="text-foreground">This one came with a starter pack</b>, so pressing{" "}
                      <b className="text-foreground">Update skills</b> on the company later will put it back.
                    </>
                  )}
                </>
              ) : open === "delete" ? (
                <>
                  It goes to Alacrán&apos;s own trash, and the removal is committed — so it&apos;s
                  recoverable both ways. Nothing here is ever permanently destroyed.
                </>
              ) : open === "move" ? (
                <>
                  Type where it should live, relative to the company folder. Changing only the last
                  part renames it; adding a folder in front moves it.
                </>
              ) : (
                <>
                  Created inside{" "}
                  <span className="font-mono text-foreground">{relativeTo(companyRoot, parentPath) || "the company folder"}</span>{" "}
                  and committed, so it can be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {open !== "delete" && open !== "remove-skill" && (
            <Input
              value={value}
              autoFocus
              spellCheck={false}
              onChange={(e) => setValue(e.target.value)}
              placeholder={isCreate ? (open === "create-folder" ? "reports" : "weekly-review.md") : "docs/decisions/name.md"}
              aria-label={isCreate ? "Name" : "New location"}
              // Enter is what anyone types after filling a single field.
              onKeyDown={(e) => {
                if (e.key === "Enter" && !pending && value.trim()) void run()
              }}
            />
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || (open !== "delete" && open !== "remove-skill" && !value.trim())}
              onClick={(e) => {
                // The primitive closes on click; this dialog has to stay open
                // to show a server-side refusal.
                e.preventDefault()
                void run()
              }}
            >
              {pending
                ? "Working…"
                : open === "remove-skill"
                  ? "Remove skill"
                  : open === "delete"
                    ? "Delete"
                    : open === "move"
                      ? "Move"
                      : "Create"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** The skill's own name, i.e. the folder's. Display-only. */
function skillName(dir?: string): string {
  return dir ? dir.slice(dir.lastIndexOf("/") + 1) : "skill"
}

/** Display-only. The server re-derives and re-checks every path it is given. */
function relativeTo(root: string, target: string): string {
  return target.startsWith(root + "/") ? target.slice(root.length + 1) : target === root ? "" : target
}
