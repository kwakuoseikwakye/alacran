import type { LicenseValidation } from "./validate-license-impl"
import type { StoredLicense } from "./license-store"

export type LicenseStatus = { licensed: boolean; message?: string }

// Re-validate against the server at most this often; within the window a
// last-known-good result is trusted so the app doesn't hit the network on
// every page load.
export const REVALIDATE_MS = 24 * 60 * 60 * 1000 // 1 day
// If the license server is unreachable, keep a previously-valid license working
// this long so a paying user offline is not locked out.
export const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function licenseStatusImpl(opts: {
  enforced: boolean
  now: number
  read: () => StoredLicense | null
  write: (license: StoredLicense) => void
  validate: (key: string) => Promise<LicenseValidation>
}): Promise<LicenseStatus> {
  // Developer / bypass builds are never gated.
  if (!opts.enforced) return { licensed: true }

  const stored = opts.read()
  if (!stored?.key) return { licensed: false }

  const age = opts.now - stored.lastValidatedAt

  // Recent successful validation → trust the cache.
  if (stored.lastResult === "valid" && age < REVALIDATE_MS) {
    return { licensed: true }
  }

  // Time to re-check with the server.
  try {
    const v = await opts.validate(stored.key)
    opts.write({ key: stored.key, lastValidatedAt: opts.now, lastResult: v.valid ? "valid" : "invalid" })
    return v.valid ? { licensed: true } : { licensed: false, message: v.message }
  } catch {
    // Server unreachable → generous offline grace on the last-known-good result.
    if (stored.lastResult === "valid" && age < OFFLINE_GRACE_MS) {
      return { licensed: true }
    }
    return { licensed: false, message: "Could not verify your license (offline). Reconnect to continue." }
  }
}
