import { describe, expect, it } from "vitest"
import {
  GOOGLE_SERVICES,
  DEFAULT_GOOGLE_SERVICE_IDS,
  serviceListArg,
  servicesFromScopes,
} from "./google-services"

describe("GOOGLE_SERVICES catalog", () => {
  it("defaults to gmail + calendar — extra services cost a console page each", () => {
    expect(DEFAULT_GOOGLE_SERVICE_IDS).toEqual(["gmail", "calendar"])
  })

  it("gives every service its own API page, since consent fails without it", () => {
    for (const svc of GOOGLE_SERVICES) {
      expect(svc.apiPage).toMatch(/^https:\/\/console\.cloud\.google\.com\/apis\/library\//)
      expect(svc.scopeMatch.length).toBeGreaterThan(0)
    }
  })
})

describe("serviceListArg", () => {
  it("keeps catalog order regardless of click order, and drops unknown ids", () => {
    expect(serviceListArg(["drive", "gmail", "nonsense"])).toBe("gmail,drive")
  })

  it("never produces an empty --services value, which would authorize nothing", () => {
    expect(serviceListArg([])).toBe("gmail,calendar")
  })
})

describe("servicesFromScopes", () => {
  it("reads the real scope names gog reports, not the service ids", () => {
    // Measured from a real `gog auth list -j` on this machine: Docs is granted
    // as .../auth/documents and Sheets as .../auth/spreadsheets, so matching
    // on the service id would silently under-report both.
    const real = [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/spreadsheets",
    ]
    expect(servicesFromScopes(real)).toEqual(["gmail", "calendar", "drive", "docs", "sheets"])
  })

  it("reports nothing for an account with only sign-in scopes", () => {
    expect(servicesFromScopes(["openid", "https://www.googleapis.com/auth/userinfo.email"])).toEqual([])
  })
})
