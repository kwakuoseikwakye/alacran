import type { BrandId } from "@/components/brand-icon"

/**
 * The Google services a user can authorize through `gog`.
 *
 * One catalog, three readers: the checkbox list on the Connect card, the
 * `gog auth add --services …` command it builds, and the console pages the
 * browser agent has to click Enable on. Before this, the service list was two
 * hardcoded `"gmail,calendar"` string constants and a separate hardcoded array
 * of marks — three places that had to be edited together and no way to notice
 * when they weren't.
 *
 * `scopeMatch` is what makes the card honest. v64's rule was "keep the marks
 * in sync with the scopes or the card lies"; keeping two lists in sync is a
 * chore that eventually fails, so instead the marks are derived from the
 * scopes `gog auth list -j` really reports. A service shows as connected when
 * the account actually carries a matching scope — never because we assumed the
 * default list was granted.
 *
 * `apiPage` is the console page that enables the underlying API. Every service
 * needs its own Enable click before consent will succeed, which is exactly the
 * cost that kept v64's default narrow: each extra box here is one more page
 * the user (or the agent) has to work through.
 *
 * `brand` is only set where a real product mark exists in lib/brand-icons.ts.
 * Never invent one — the standing rule is that vendor marks come from Simple
 * Icons, not from us.
 */
export type GoogleService = {
  /** The exact token `gog --services` expects. */
  id: string
  label: string
  brand?: BrandId
  apiPage: string
  /** Substrings of a granted OAuth scope that prove this service is authorized. */
  scopeMatch: string[]
  /** Preselected, and what every existing install already has. */
  default?: true
}

export const GOOGLE_SERVICES: GoogleService[] = [
  {
    id: "gmail",
    label: "Gmail",
    brand: "gmail",
    apiPage: "https://console.cloud.google.com/apis/library/gmail.googleapis.com",
    scopeMatch: ["gmail"],
    default: true,
  },
  {
    id: "calendar",
    label: "Calendar",
    brand: "googlecalendar",
    apiPage: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com",
    scopeMatch: ["calendar"],
    default: true,
  },
  {
    id: "drive",
    label: "Drive",
    apiPage: "https://console.cloud.google.com/apis/library/drive.googleapis.com",
    scopeMatch: ["drive"],
  },
  {
    id: "docs",
    label: "Docs",
    apiPage: "https://console.cloud.google.com/apis/library/docs.googleapis.com",
    // gog requests the Docs scope as .../auth/documents, not /docs.
    scopeMatch: ["documents"],
  },
  {
    id: "sheets",
    label: "Sheets",
    apiPage: "https://console.cloud.google.com/apis/library/sheets.googleapis.com",
    // Likewise: the Sheets scope reads .../auth/spreadsheets.
    scopeMatch: ["spreadsheets"],
  },
  {
    id: "slides",
    label: "Slides",
    apiPage: "https://console.cloud.google.com/apis/library/slides.googleapis.com",
    scopeMatch: ["presentations"],
  },
  {
    id: "tasks",
    label: "Tasks",
    apiPage: "https://console.cloud.google.com/apis/library/tasks.googleapis.com",
    scopeMatch: ["tasks"],
  },
  {
    id: "contacts",
    label: "Contacts",
    apiPage: "https://console.cloud.google.com/apis/library/people.googleapis.com",
    scopeMatch: ["contacts", "directory.readonly"],
  },
]

export const DEFAULT_GOOGLE_SERVICE_IDS = GOOGLE_SERVICES.filter((s) => s.default).map((s) => s.id)

/** Build the `--services` value, always in catalog order and always
 *  non-empty — an empty list would authorize nothing and read as a no-op. */
export function serviceListArg(ids: string[]): string {
  const known = GOOGLE_SERVICES.filter((s) => ids.includes(s.id)).map((s) => s.id)
  return (known.length > 0 ? known : DEFAULT_GOOGLE_SERVICE_IDS).join(",")
}

/** Which services these granted OAuth scopes actually prove. Substring match:
 *  a real scope is a full URL (…/auth/spreadsheets), and gog varies the suffix
 *  (gmail.modify, contacts.other.readonly), so exact equality would under-report. */
export function servicesFromScopes(scopes: string[]): string[] {
  const flat = scopes.join(" ").toLowerCase()
  return GOOGLE_SERVICES.filter((s) => s.scopeMatch.some((m) => flat.includes(m))).map((s) => s.id)
}
