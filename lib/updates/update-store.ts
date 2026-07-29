import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import { dataPath } from "../data-dir"

// Cached result of the last release check, plus which version the user has
// already dismissed. Lives in the data dir (outside the .app bundle) so it
// survives the very update it is telling them about.
export type StoredUpdate = {
  lastCheckedAt: number
  latestVersion: string
  // Set when the user closes the banner; we then stay quiet about this exact
  // version forever, but a newer one will still speak up.
  dismissedVersion?: string
}

const DEFAULT_PATH = dataPath("update-check.json")

export function readUpdate(filePath: string = DEFAULT_PATH): StoredUpdate | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as StoredUpdate
  } catch {
    return null
  }
}

export function writeUpdate(update: StoredUpdate, filePath: string = DEFAULT_PATH): void {
  try {
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(update, null, 2), "utf-8")
  } catch {
    // A cache we cannot persist is a slower check, not a broken app. Never let
    // an unwritable disk take the whole UI down over a cosmetic banner.
  }
}
