export type FetchLike = (url: string, init: RequestInit) => Promise<{ json: () => Promise<unknown> }>

export type LicenseValidation = { valid: boolean; message: string }

// Lemon Squeezy license validation — authenticates with the license key itself,
// so no store API secret is needed here.
const LS_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate"

const defaultFetch: FetchLike = (url, init) => fetch(url, init)

export async function validateLicenseImpl(key: string, fetchFn: FetchLike = defaultFetch): Promise<LicenseValidation> {
  const res = await fetchFn(LS_VALIDATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ license_key: key }),
  })
  const data = (await res.json()) as { valid?: boolean; error?: string | null }
  return {
    valid: Boolean(data.valid),
    message: data.error ?? (data.valid ? "License active" : "License is not valid"),
  }
}
