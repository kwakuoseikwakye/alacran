import { describe, it, expect } from "vitest"
import { resolveActiveCompany, legacyRedirect, ACTIVE_COMPANY_COOKIE, getActiveCompanyRoot } from "./active-company"

describe("resolveActiveCompany", () => {
  it("returns the cookie's company when it still exists on disk", () => {
    expect(resolveActiveCompany("acme", ["acme", "northwind"])).toBe("acme")
  })

  it("returns null when the cookie names a company that is gone", () => {
    expect(resolveActiveCompany("deleted", ["acme"])).toBeNull()
  })

  it("returns null when there is no cookie", () => {
    expect(resolveActiveCompany(undefined, ["acme"])).toBeNull()
  })

  it("returns null when no companies exist", () => {
    expect(resolveActiveCompany("acme", [])).toBeNull()
  })
})

describe("legacyRedirect", () => {
  it("sends machine-scoped routes to /system regardless of active company", () => {
    expect(legacyRedirect("/connect", null)).toBe("/system/connectors")
    expect(legacyRedirect("/network", "acme")).toBe("/system/connectors")
    expect(legacyRedirect("/settings", null)).toBe("/system/settings")
  })

  it("sends company-scoped routes into the active company", () => {
    expect(legacyRedirect("/activity", "acme")).toBe("/c/acme/activity")
    expect(legacyRedirect("/files", "acme")).toBe("/c/acme/files")
    expect(legacyRedirect("/assistant", "acme")).toBe("/c/acme/dashboard?dock=open")
    expect(legacyRedirect("/doctor", "acme")).toBe("/c/acme/doctor")
  })

  it("sends company-scoped routes to the picker when no company is active", () => {
    expect(legacyRedirect("/activity", null)).toBe("/")
    expect(legacyRedirect("/files", null)).toBe("/")
    expect(legacyRedirect("/assistant", null)).toBe("/")
    expect(legacyRedirect("/doctor", null)).toBe("/")
  })

  it("redirects /roadmap to active company scoped path", () => {
    expect(legacyRedirect("/roadmap", "acme")).toBe("/c/acme/roadmap")
    expect(legacyRedirect("/roadmap", null)).toBe("/")
  })

  it("redirects /analytics to active company scoped path", () => {
    expect(legacyRedirect("/analytics", "acme")).toBe("/c/acme/analytics")
    expect(legacyRedirect("/analytics", null)).toBe("/")
  })

  it("redirects /skills to active company scoped path", () => {
    expect(legacyRedirect("/skills", "acme")).toBe("/c/acme/skills")
    expect(legacyRedirect("/skills", null)).toBe("/")
  })

  it("redirects /personas to active company scoped path", () => {
    expect(legacyRedirect("/personas", "acme")).toBe("/c/acme/personas")
    expect(legacyRedirect("/personas", null)).toBe("/")
  })

  it("redirects /social and /social/beehiiv to active company scoped paths", () => {
    expect(legacyRedirect("/social", "acme")).toBe("/c/acme/social")
    expect(legacyRedirect("/social", null)).toBe("/")
    expect(legacyRedirect("/social/beehiiv", "acme")).toBe("/c/acme/social/beehiiv")
    expect(legacyRedirect("/social/beehiiv", null)).toBe("/")
  })

  it("returns null for a path it does not own", () => {
    expect(legacyRedirect("/c/acme/brain", "acme")).toBeNull()
    expect(legacyRedirect("/", "acme")).toBeNull()
  })
})

describe("ACTIVE_COMPANY_COOKIE", () => {
  it("is a stable name", () => {
    expect(ACTIVE_COMPANY_COOKIE).toBe("alacran-active-company")
  })
})

describe("getActiveCompanyRoot", () => {
  it("returns null for unknown company id", async () => {
    const root = await getActiveCompanyRoot("non-existent-company-xyz")
    expect(root).toBeNull()
  })
})
