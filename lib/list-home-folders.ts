"use server"

import { readdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export type FolderListing = { dir: string; parent: string | null; folders: string[] }

/**
 * The folders inside `dir`, for picking one in the UI instead of typing a path
 * — the last technical value left in the "I already have a folder" flow, and
 * one a non-technical user has no mental model for. This ships as a local web
 * app, and no web API yields an absolute path — `showDirectoryPicker()` returns
 * a handle with no path on it and `<input webkitdirectory>` yields relative
 * names only, neither of which a server action can do anything with.
 *
 * Since v164 the mac shell publishes a real Finder dialog over its bridge
 * (`lib/desktop-folder-picker.ts`), and the form offers it when it is there.
 * This stays as the fallback and is still the whole flow in a browser, in
 * `next dev`, on Linux, and in any mac bundle built before that bridge existed.
 *
 * Confined to the home subtree deliberately. This is a browser-reachable
 * action, so an unchecked `dir` would list any directory on the machine;
 * anything outside falls back to home rather than erroring, since the only way
 * to get there is a hand-made request.
 */
export async function listHomeFolders(dir?: string): Promise<FolderListing> {
  const home = os.homedir()
  const requested = dir ? path.resolve(dir) : home
  const withinHome = requested === home || requested.startsWith(home + path.sep)
  const root = withinHome ? requested : home
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  return {
    dir: root,
    parent: root === home ? null : path.dirname(root),
    folders: entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b)),
  }
}
