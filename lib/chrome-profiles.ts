import { readFile, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

/**
 * Which Google account each Chrome profile on THIS machine is signed in as.
 *
 * The Google setup agent drives the user's own Chrome, so the account that
 * browser is on decides which mailbox gets connected — and a machine with more
 * than one profile has no single answer. This one was reported from real use:
 * three profiles here (a personal Gmail, a work address, a third project
 * account), the app named none of them, and `open -a "Google Chrome"` lands on
 * whichever was last used. The agent then set Google up against the wrong one.
 *
 * setup-google-impl.ts used to say this "has no API", and treated it as a
 * checkbox the user ticks. There is no *web* API, but Chrome writes it to a
 * plain JSON file next to the profiles, which is a `readFile` away — a far
 * smaller intrusion than letting an agent operate the wrong Google account.
 *
 * Read-only, and best-effort by design: a missing or reshaped Local State
 * yields [], and every caller treats that as "can't tell" rather than "none".
 */
export type ChromeProfile = {
  /** The `--profile-directory` value Chrome itself takes, e.g. "Default". */
  directory: string
  /** The signed-in Google address, lowercased. */
  email: string
  /** Whether the Claude browser extension is installed in THIS profile.
   *  Extensions are per-profile, and `claude --chrome` can only reach a browser
   *  the extension is in — so a profile without it is a dead end the app can
   *  see coming instead of the agent discovering it mid-run. */
  hasClaudeExtension: boolean
}

/** The Claude browser extension's stable Chrome Web Store id. */
export const CLAUDE_EXTENSION_ID = "fcoeoabgfenejglbffodgkkbkcdhcgfn"

/** Where the extension link lives, for the pairing step. */
export const CLAUDE_EXTENSION_PAGE = "https://claude.ai/chrome"

export type ReadFileFn = (filePath: string) => Promise<string>

const defaultReadFile: ReadFileFn = (filePath) => readFile(filePath, "utf-8")

/** Chrome's own state file. Windows is not a build target (see README). */
export function localStatePath(platform: NodeJS.Platform, home: string): string | null {
  const root = chromeRoot(platform, home)
  return root ? path.join(root, "Local State") : null
}

function chromeRoot(platform: NodeJS.Platform, home: string): string | null {
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "Google", "Chrome")
  if (platform === "linux") return path.join(home, ".config", "google-chrome")
  return null
}

export type ReadDirFn = (dirPath: string) => Promise<string[]>

const defaultReadDir: ReadDirFn = (dirPath) => readdir(dirPath)

export async function listChromeProfiles(
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
  readFileFn: ReadFileFn = defaultReadFile,
  readDirFn: ReadDirFn = defaultReadDir
): Promise<ChromeProfile[]> {
  const statePath = localStatePath(platform, home)
  if (!statePath) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(await readFileFn(statePath))
  } catch {
    // Absent, unreadable, or mid-write. Not an error: the caller degrades to
    // the old confirm-it-yourself behaviour rather than blocking setup.
    return []
  }

  const cache = (parsed as { profile?: { info_cache?: unknown } } | null)?.profile?.info_cache
  if (typeof cache !== "object" || cache === null) return []

  const profiles: ChromeProfile[] = []
  for (const [directory, info] of Object.entries(cache as Record<string, unknown>)) {
    // `user_name` is empty for a profile nobody has signed into. Those are real
    // profiles but can't be matched to an address, so they are dropped rather
    // than offered as a target.
    const email = (info as { user_name?: unknown } | null)?.user_name
    if (typeof email === "string" && email.trim() !== "") {
      const root = chromeRoot(platform, home)
      const installed = root
        ? await readDirFn(path.join(root, directory, "Extensions")).catch(() => [] as string[])
        : []
      profiles.push({
        directory,
        email: email.trim().toLowerCase(),
        hasClaudeExtension: installed.includes(CLAUDE_EXTENSION_ID),
      })
    }
  }
  return profiles
}

/**
 * The profile signed in as this address, or null.
 *
 * Case-insensitive, matching how gog and setup-google-impl already compare
 * addresses — a profile rendered `Nana@Gmail.com` must not read as a different,
 * unknown account (the same rule v75 pinned for accountServices lookups).
 */
export function findProfileForEmail(profiles: ChromeProfile[], email: string): ChromeProfile | null {
  const wanted = email.trim().toLowerCase()
  return profiles.find((p) => p.email === wanted) ?? null
}
