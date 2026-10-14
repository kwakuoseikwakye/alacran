import fs from "node:fs"
import path from "node:path"
import { parseChangelog, type ChangelogItem, type ChangelogCategory } from "./parse-changelog"
import { fetchLatestReleaseDetailsImpl, type LatestReleaseDetails } from "./fetch-latest-release-impl"
import { compareVersions } from "./compare-versions"
import { canAutoUpdate } from "./can-auto-update"
import { APP_VERSION } from "../app-version"

export type { ChangelogItem, ChangelogCategory }

export type ChangelogFeed = {
  currentVersion: string
  latestVersion?: string
  hasUpdate: boolean
  canAutoUpdate: boolean
  releaseNotes?: LatestReleaseDetails | null
  entries: ChangelogItem[]
}

/**
 * Searches candidates for the local CHANGELOG.md file.
 */
export function readLocalChangelogText(): string {
  const candidates = [
    path.join(process.cwd(), "CHANGELOG.md"),
    path.join(process.cwd(), "control-panel", "CHANGELOG.md"),
    path.resolve(process.cwd(), "..", "control-panel", "CHANGELOG.md"),
    path.resolve(__dirname, "../../CHANGELOG.md"),
    path.resolve(__dirname, "../../../CHANGELOG.md"),
  ]

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, "utf8")
      }
    } catch {
      // Continue to next candidate
    }
  }

  return ""
}

export async function getChangelogFeedImpl(opts: {
  currentVersion?: string
  fetchReleaseDetails?: () => Promise<LatestReleaseDetails | null>
  readChangelog?: () => string
  platform?: NodeJS.Platform
  maxEntries?: number
} = {}): Promise<ChangelogFeed> {
  const currentVersion = opts.currentVersion ?? APP_VERSION
  const readChangelog = opts.readChangelog ?? readLocalChangelogText
  const fetchRelease = opts.fetchReleaseDetails ?? (() => fetchLatestReleaseDetailsImpl())
  const platform = opts.platform ?? process.platform
  const maxEntries = opts.maxEntries ?? 20

  const markdown = readChangelog()
  const entries = parseChangelog(markdown, { maxEntries })

  let releaseNotes: LatestReleaseDetails | null = null
  try {
    releaseNotes = await fetchRelease()
  } catch {
    releaseNotes = null
  }

  const latestTag = releaseNotes?.tagName
  const hasUpdate = Boolean(latestTag && compareVersions(latestTag, currentVersion) > 0)

  return {
    currentVersion,
    // No tag reachable (offline, or GitHub down) means nothing newer is known
    // to exist. The newest changelog entry is not a substitute: its version is
    // whatever release it shipped in, which is usually the one already running.
    latestVersion: latestTag ?? currentVersion,
    hasUpdate,
    canAutoUpdate: canAutoUpdate(platform),
    releaseNotes,
    entries,
  }
}
