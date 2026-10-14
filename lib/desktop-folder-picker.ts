/**
 * The desktop shell's native folder dialog, when the page is running inside a
 * shell that has one.
 *
 * Why it can only live here: web code cannot obtain an absolute filesystem
 * path. `showDirectoryPicker()` hands back a handle with no path on it, and
 * `<input type="file" webkitdirectory>` reports names relative to the folder
 * that was chosen, never that folder's own location. A server action needs the
 * absolute path, so the only way to get one is a process that can ask the OS —
 * which is the mac shell's main process (`dialog.showOpenDialog`) and nothing
 * else today.
 *
 * Runtime-only and absent everywhere else — a plain browser, `next dev`, and
 * the Linux WebKitGTK shell, which has no JS bridge at all. Callers must gate
 * on this returning non-null rather than on `window.alacran.shell === "mac"`:
 * a shell built before this bridge existed reports "mac" and has no dialog,
 * and control-panel updates independently of the shell around it. Same shape
 * as lib/voice/desktop-mic.ts; `window.alacran` is typed in
 * lib/updates/desktop-updater.ts.
 */

export type DesktopFolderPicker = {
  /** The folder the user chose, or `{ path: null }` if they dismissed the dialog. */
  pickDirectory: () => Promise<{ path: string | null }>
}

export function desktopFolderPicker(): DesktopFolderPicker | null {
  if (typeof window === "undefined") return null
  return window.alacran?.dialog ?? null
}

/**
 * Runs the dialog and answers with what the existing in-app browser answers
 * with — a full path plus the folder's own name — so both routes feed the same
 * `pickFolder(fullPath, folderName)` and nothing downstream can tell them
 * apart.
 *
 * `null` means "nothing was chosen": the user cancelled, or the shell refused
 * because a dialog was already open. Both are no-ops, not errors. The path is
 * still untrusted — it crossed a process boundary — and is validated
 * server-side by `adoptFolder` exactly as a typed one is.
 */
export async function chooseFolder(
  picker: DesktopFolderPicker
): Promise<{ path: string; name: string } | null> {
  const { path } = await picker.pickDirectory()
  if (!path) return null
  // POSIX only, which is every shell that can reach this: the dialog exists on
  // macOS alone today. Falls back to the whole path for "/", which the server
  // then refuses on its own terms.
  const name = path.split("/").filter(Boolean).pop() ?? path
  return { path, name }
}
