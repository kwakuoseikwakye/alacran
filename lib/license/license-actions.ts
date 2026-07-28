"use server"

import { validateLicenseImpl } from "./validate-license-impl"
import { readLicense, writeLicense } from "./license-store"
import { licenseStatusImpl } from "./license-status-impl"
import type { LicenseStatus } from "./license-status-impl"

// The gate is enforced only in a production build (i.e. the packaged app), and
// can be bypassed with LICENSE_BYPASS=1 for the developer's own testing. So
// `next dev` and bypass builds are never gated.
function isEnforced(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.LICENSE_BYPASS
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  return licenseStatusImpl({
    enforced: isEnforced(),
    now: Date.now(),
    read: () => readLicense(),
    write: (license) => writeLicense(license),
    validate: (key) => validateLicenseImpl(key),
  })
}

export async function activateLicense(key: string): Promise<{ ok: boolean; message: string }> {
  const trimmed = key.trim()
  if (!trimmed) return { ok: false, message: "Enter your license key" }
  try {
    const v = await validateLicenseImpl(trimmed)
    if (!v.valid) return { ok: false, message: v.message }
    writeLicense({ key: trimmed, lastValidatedAt: Date.now(), lastResult: "valid" })
    return { ok: true, message: "License activated" }
  } catch {
    return { ok: false, message: "Could not reach the license server. Check your connection and try again." }
  }
}
