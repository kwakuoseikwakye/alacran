import { homedir } from "node:os"
import path from "node:path"
import { existsSync, cpSync } from "node:fs"

/**
 * Where this app keeps the user's own data (company registry, license, avatars,
 * command-run state).
 *
 * This MUST NOT live inside the .app bundle. The packaged launcher `cd`s into
 * Contents/Resources/app, so a `process.cwd()`-relative ".data" wrote the
 * registry and the license key *inside the application itself* — and dragging a
 * new version into /Applications replaces that bundle wholesale, silently
 * destroying both on every update.
 *
 * Development deliberately keeps using the repo's own .data (gitignored), so
 * the dev machine's day-to-day state is unaffected and tests stay hermetic.
 */
export function resolveDataDirFrom(
  env: { ALACRAN_DATA_DIR?: string; NODE_ENV?: string; XDG_DATA_HOME?: string },
  cwd: string,
  home: string,
  platform: NodeJS.Platform = process.platform
): string {
  const override = env.ALACRAN_DATA_DIR?.trim()
  if (override) return override
  if (env.NODE_ENV === "production") {
    if (platform === "darwin") {
      return path.join(home, "Library", "Application Support", "Alacrán")
    }
    // Linux (and any other non-macOS target): XDG Base Directory spec —
    // respect $XDG_DATA_HOME if the user's set it, else the standard default.
    const xdgDataHome = env.XDG_DATA_HOME?.trim()
    return path.join(xdgDataHome || path.join(home, ".local", "share"), "Alacrán")
  }
  return path.join(cwd, ".data")
}

/** The legacy location — inside the bundle in a packaged build. */
const LEGACY_DIR = path.join(process.cwd(), ".data")

export const DATA_DIR = resolveDataDirFrom(process.env, process.cwd(), homedir())

/**
 * One-time rescue for installs that already wrote data into the old in-bundle
 * location. Copies anything not already present at the new path; never
 * overwrites (`force: false`), so newer real data always wins. Best-effort —
 * a failure here must not stop the app from starting.
 */
function migrateLegacyData(): void {
  if (DATA_DIR === LEGACY_DIR) return
  if (!existsSync(LEGACY_DIR)) return
  try {
    cpSync(LEGACY_DIR, DATA_DIR, { recursive: true, force: false, errorOnExist: false })
  } catch {
    // Losing the migration is recoverable (the user re-enters their key);
    // crashing on startup is not.
  }
}

migrateLegacyData()

/** Resolve a path inside the user-data directory. */
export function dataPath(...segments: string[]): string {
  return path.join(DATA_DIR, ...segments)
}
