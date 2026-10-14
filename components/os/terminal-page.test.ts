import { describe, it, expect } from "vitest"
import { NAV_GROUPS, hrefFor, activeItem } from "@/lib/os/nav"
import { legacyRedirect } from "@/lib/os/active-company"

describe("Company Terminal Navigation & Route Resolution", () => {
  it("includes terminal under the advanced More group", () => {
    const advancedGroup = NAV_GROUPS.find((g) => g.id === "advanced")
    expect(advancedGroup).toBeDefined()
    const terminalItem = advancedGroup?.items.find((i) => i.slug === "terminal")
    expect(terminalItem).toBeDefined()
    expect(terminalItem?.label).toBe("Terminal")
    expect(terminalItem?.icon).toBe("Terminal")
    expect(terminalItem?.scope).toBe("company")
  })

  it("resolves href for terminal under company scope", () => {
    const advancedGroup = NAV_GROUPS.find((g) => g.id === "advanced")
    const terminalItem = advancedGroup!.items.find((i) => i.slug === "terminal")!
    expect(hrefFor(terminalItem, "acme")).toBe("/c/acme/terminal")
    expect(hrefFor(terminalItem, null)).toBe("/")
  })

  it("identifies terminal as active item for /c/[companyId]/terminal", () => {
    const active = activeItem("/c/acme/terminal")
    expect(active?.slug).toBe("terminal")
  })

  it("handles legacy /terminal redirect to company-scoped terminal", () => {
    expect(legacyRedirect("/terminal", "acme")).toBe("/c/acme/terminal")
    expect(legacyRedirect("/terminal", null)).toBe("/")
  })
})
