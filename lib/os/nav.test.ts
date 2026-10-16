import { describe, expect, it } from "vitest"
import { NAV_GROUPS, activeItem, hrefFor, mobileNavItems, visibleGroups } from "./nav"

const find = (slug: string) => {
  const item = NAV_GROUPS.flatMap((group) => group.items).find((candidate) => candidate.slug === slug)
  if (!item) throw new Error(`no nav item ${slug}`)
  return item
}

describe("NAV_GROUPS", () => {
  it("organizes the product around the owner's work", () => {
    expect(NAV_GROUPS.map((group) => group.id)).toEqual(["primary", "company", "advanced"])
    expect(NAV_GROUPS[0].items.map((item) => item.label)).toEqual(["Home", "Ask Alacrán", "Approvals"])
  })

  it("uses unique slugs", () => {
    const slugs = NAV_GROUPS.flatMap((group) => group.items).map((item) => item.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  // The sidebar replaced the advanced top strip and its More menu, and this
  // group is now the only way to them — so it holds every page they held.
  it("keeps every technical page in the Developer group, for advanced mode only", () => {
    const developer = NAV_GROUPS.find((group) => group.id === "advanced")!
    expect(developer.label).toBe("Developer")
    expect(developer.items.map((item) => item.label)).toEqual([
      "Terminal", "Departments", "Automations", "Unattended jobs", "Skills", "Analytics", "Diagnostics",
    ])
    expect(developer.items.map((item) => item.slug)).toEqual([
      "terminal", "org", "workflows", "jobs", "skills", "analytics", "doctor",
    ])
    expect(developer.items.every((item) => item.advancedOnly)).toBe(true)
  })

  // A non-technical person has no Developer group, so what Alacrán knows must
  // live where they can see it.
  it("puts what Alacrán knows in the Company group, visible in simple mode", () => {
    const company = NAV_GROUPS.find((group) => group.id === "company")!
    expect(company.items.map((item) => item.slug)).toEqual(["records", "brain", "agents", "connectors", "settings"])
    const brain = find("brain")
    expect(brain.label).toBe("What Alacrán knows")
    expect(brain.advancedOnly).toBeUndefined()
  })
})

describe("hrefFor", () => {
  it("scopes company destinations to the active company", () => {
    expect(hrefFor(find("dashboard"), "acme")).toBe("/c/acme/dashboard")
    expect(hrefFor(find("workflows"), "acme")).toBe("/c/acme/workflows")
  })

  it("opens Ask Alacrán in the company workspace", () => {
    expect(hrefFor(find("ask"), "acme")).toBe("/c/acme/ask")
  })

  it("sends a company destination to the picker without an active company", () => {
    expect(hrefFor(find("dashboard"), null)).toBe("/")
  })

  it("keeps system destinations global", () => {
    expect(hrefFor(find("connectors"), "acme")).toBe("/system/connectors")
    expect(hrefFor(find("settings"), null)).toBe("/system/settings")
  })
})

describe("activeItem", () => {
  it("matches primary, company, advanced, and system routes", () => {
    expect(activeItem("/c/acme/dashboard")?.slug).toBe("dashboard")
    expect(activeItem("/c/acme/tasks")?.slug).toBe("tasks")
    expect(activeItem("/c/acme/agents")?.slug).toBe("agents")
    expect(activeItem("/c/acme/brain")?.slug).toBe("brain")
    expect(activeItem("/c/acme/workflows")?.slug).toBe("workflows")
    expect(activeItem("/system/settings")?.slug).toBe("settings")
  })

  it("matches a nested route to its parent item", () => {
    expect(activeItem("/c/acme/skills/some-skill")?.slug).toBe("skills")
  })

  it("marks Ask active on its dedicated route", () => {
    expect(activeItem("/c/acme/ask")?.slug).toBe("ask")
    expect(activeItem("/c/acme/dashboard")?.slug).toBe("dashboard")
  })
})

describe("mobileNavItems", () => {
  it("keeps the three primary actions directly reachable", () => {
    expect(mobileNavItems(false).map((item) => item.slug)).toEqual([
      "dashboard", "ask", "tasks", "records",
    ])
    expect(mobileNavItems(true).map((item) => item.slug)).toEqual([
      "dashboard", "ask", "tasks", "records", "terminal",
    ])
  })
})

describe("visibleGroups", () => {
  it("keeps simple mode to eight plain-language destinations", () => {
    expect(visibleGroups(false).flatMap((group) => group.items).map((item) => item.slug)).toEqual([
      "dashboard",
      "ask",
      "tasks",
      "records",
      "brain",
      "agents",
      "connectors",
      "settings",
    ])
  })

  it("advanced mode adds technical tools without changing the primary navigation", () => {
    expect(visibleGroups(true).flatMap((group) => group.items)).toHaveLength(
      NAV_GROUPS.flatMap((group) => group.items).length
    )
    expect(visibleGroups(true).find((group) => group.id === "advanced")?.items).toHaveLength(7)
  })

  it("drops groups that would render empty", () => {
    expect(visibleGroups(false).every((group) => group.items.length > 0)).toBe(true)
  })
})
