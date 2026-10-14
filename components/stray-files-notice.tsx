"use client"

/**
 * What the run changed outside the folder it was supposed to write to.
 *
 * Silent in the only case that deserves silence — a confirmed empty list. A
 * `null` (couldn't tell: a run record from before this shipped, or git
 * unreadable) says so out loud rather than looking clean, because the whole
 * point of this notice is that the diff above is not the whole story.
 *
 * Deliberately not styled as an error. A stray file is usually the agent being
 * untidy, not an attack; the job is to make sure it is never invisible.
 *
 * Shared rather than duplicated: every surface that asks a human to approve a
 * write must show the same disclosure, or the approval is being given on a
 * partial picture. The Brain's review rail promotes into `definitions/` and
 * needs this exactly as much as the command runner does.
 */
export function StrayFilesNotice({ strays }: { strays: string[] | null }) {
  if (strays === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Couldn&apos;t check whether anything outside this job&apos;s own folder changed.
      </p>
    )
  }
  if (strays.length === 0) return null
  return (
    <div className="space-y-1 rounded-md border border-primary/40 bg-primary/5 p-2.5">
      <p className="text-xs font-medium">
        This run also changed {strays.length} file{strays.length === 1 ? "" : "s"} outside its own folder
      </p>
      <ul className="space-y-0.5">
        {strays.slice(0, 10).map((file) => (
          <li key={file} className="font-mono text-xs text-muted-foreground">
            {file}
          </li>
        ))}
      </ul>
      {strays.length > 10 && (
        <p className="text-xs text-muted-foreground">…and {strays.length - 10} more</p>
      )}
      <p className="text-xs text-muted-foreground">
        Only the file shown below gets committed. These are left in your folder for you to look at.
      </p>
    </div>
  )
}
