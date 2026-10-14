import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

const route = { pathname: "/c/c1/dashboard" }
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ back: () => {}, forward: () => {}, push: () => {} }),
}))

import {
  resolveTopbarBreadcrumbs,
  Topbar,
  PALETTE_OPEN_EVENT,
  CONDUCTOR_TOGGLE_EVENT,
} from "./topbar"
import { NAV_ICONS } from "./icons"

describe("Topbar Breadcrumbs", () => {
  // The label beside the company switcher used to fall back to the URL slug,
  // so owners read "dashboard", "tasks" and "records" at the top of every page.
  it("names every page the way the menu does, never by its URL slug", () => {
    const companies = [{ id: "c1", name: "Acme Corp" }]
    const label = (pathname: string) => resolveTopbarBreadcrumbs(pathname, "c1", companies).sectionLabel
    expect(label("/c/c1/dashboard")).toBe("Home")
    expect(label("/c/c1/ask")).toBe("Ask Alacrán")
    expect(label("/c/c1/tasks")).toBe("Approvals")
    expect(label("/c/c1/records")).toBe("Records")
    expect(label("/c/c1/workflows")).toBe("Automations")
    expect(label("/c/c1/finances")).toBe("Money in & out")
    expect(label("/c/c1/content-social")).toBe("Content & social")
  })

  it("resolves org and workflows section breadcrumbs", () => {
    const companies = [{ id: "c1", name: "Acme Corp" }]
    expect(resolveTopbarBreadcrumbs("/c/c1/org", "c1", companies).sectionLabel).toBe("Departments")
    expect(resolveTopbarBreadcrumbs("/c/c1/workflows", "c1", companies).sectionLabel).toBe("Automations")
  })

  it("resolves operational pipeline, distribution, brain, and agents breadcrumb labels", () => {
    const companies = [{ id: "c1", name: "Acme Corp" }]
    expect(resolveTopbarBreadcrumbs("/c/c1/funnel", "c1", companies).sectionLabel).toBe("Leads & customers")
    expect(resolveTopbarBreadcrumbs("/c/c1/social", "c1", companies).sectionLabel).toBe("Distribution")
    expect(resolveTopbarBreadcrumbs("/c/c1/brain", "c1", companies).sectionLabel).toBe("What Alacrán knows")
    expect(resolveTopbarBreadcrumbs("/c/c1/agents", "c1", companies).sectionLabel).toBe("Company profile")
  })

  it("has icon components for org and workflows in NAV_ICONS", () => {
    expect(NAV_ICONS.Users).toBeDefined()
    expect(NAV_ICONS.Workflow).toBeDefined()
  })

  it("resolves doctor subroute to System Doctor label", () => {
    const breadcrumbs = resolveTopbarBreadcrumbs("/c/acme/doctor", "acme", [{ id: "acme", name: "Acme Corp" }])
    expect(breadcrumbs.section).toBe("Diagnostics")
  })

  it("resolves roadmap subroute to Roadmap label", () => {
    const breadcrumbs = resolveTopbarBreadcrumbs("/c/acme/roadmap", "acme", [{ id: "acme", name: "Acme Corp" }])
    expect(breadcrumbs.section).toBe("Roadmap")
  })

  it("resolves analytics subroute to Analytics label", () => {
    const breadcrumbs = resolveTopbarBreadcrumbs("/c/acme/analytics", "acme", [{ id: "acme", name: "Acme Corp" }])
    expect(breadcrumbs.section).toBe("Analytics")
  })

  it("resolves skills subroute to Skills label", () => {
    const breadcrumbs = resolveTopbarBreadcrumbs("/c/acme/skills", "acme", [{ id: "acme", name: "Acme Corp" }])
    expect(breadcrumbs.section).toBe("Skills")
  })

  it("resolves terminal subroute to Terminal label", () => {
    const breadcrumbs = resolveTopbarBreadcrumbs("/c/acme/terminal", "acme", [{ id: "acme", name: "Acme Corp" }])
    expect(breadcrumbs.section).toBe("Terminal")

    const legacy = resolveTopbarBreadcrumbs("/terminal", "acme", [{ id: "acme", name: "Acme Corp" }])
    expect(legacy.section).toBe("Terminal")
  })

  it("has icon component for Terminal in NAV_ICONS", () => {
    expect(NAV_ICONS.Terminal).toBeDefined()
  })

  it("resolves root fleet view breadcrumb", () => {
    const crumb = resolveTopbarBreadcrumbs("/", null, [{ id: "c1", name: "Acme" }])
    expect(crumb.companyLabel).toBe("All companies")
    expect(crumb.sectionLabel).toBe("")
    expect(crumb.targetPathForCompany("c1")).toBe("/c/c1/dashboard")
  })

  it("resolves company scoped section breadcrumb", () => {
    const crumb = resolveTopbarBreadcrumbs("/c/c1/finances", "c1", [{ id: "c1", name: "Acme Corp" }])
    expect(crumb.companyLabel).toBe("Acme Corp")
    expect(crumb.sectionLabel).toBe("Money in & out")
  })

  it("computes target route when switching company", () => {
    const crumb = resolveTopbarBreadcrumbs("/c/c1/finances", "c1", [{ id: "c1", name: "Acme Corp" }])
    expect(crumb.targetPathForCompany("c2")).toBe("/c/c2/finances")
  })

  it("falls back to company id when name is not found in companies list", () => {
    const crumb = resolveTopbarBreadcrumbs("/c/unknown-co/tasks", "unknown-co", [{ id: "c1", name: "Acme Corp" }])
    expect(crumb.companyLabel).toBe("unknown-co")
    expect(crumb.sectionLabel).toBe("Approvals")
    expect(crumb.targetPathForCompany("c1")).toBe("/c/c1/tasks")
  })

  it("defaults to dashboard section when company route has no subpath", () => {
    const crumb = resolveTopbarBreadcrumbs("/c/c1", "c1", [{ id: "c1", name: "Acme Corp" }])
    expect(crumb.companyLabel).toBe("Acme Corp")
    expect(crumb.sectionLabel).toBe("Home")
    expect(crumb.targetPathForCompany("c2")).toBe("/c/c2/dashboard")
  })

  it("resolves system paths and resets target company navigation to dashboard", () => {
    const crumb = resolveTopbarBreadcrumbs("/system/connectors", null, [{ id: "c1", name: "Acme" }])
    expect(crumb.companyLabel).toBe("All companies")
    expect(crumb.sectionLabel).toBe("Connected tools")
    expect(crumb.targetPathForCompany("c1")).toBe("/c/c1/dashboard")

    const crumb2 = resolveTopbarBreadcrumbs("/system/network", "c1", [{ id: "c1", name: "Acme" }])
    expect(crumb2.companyLabel).toBe("Acme")
    expect(crumb2.sectionLabel).toBe("Network")
    expect(resolveTopbarBreadcrumbs("/system/settings", "c1", [{ id: "c1", name: "Acme" }]).sectionLabel).toBe("Preferences")
    expect(crumb2.targetPathForCompany("c2")).toBe("/c/c2/dashboard")
  })

  it("exports custom event constants for command palette and conductor", () => {
    expect(PALETTE_OPEN_EVENT).toBe("alacran:palette")
    expect(CONDUCTOR_TOGGLE_EVENT).toBe("alacran:conductor-toggle")
  })

  // The Search button dispatched this event for a release with nothing
  // listening, so clicking it did nothing. A constant alone proves no reader.
  it("has the command palette listening for the Search button's event", async () => {
    const { readFileSync } = await import("node:fs")
    const source = readFileSync(new URL("./command-palette.tsx", import.meta.url), "utf8")
    expect(source).toMatch(/addEventListener\(PALETTE_OPEN_EVENT/)
  })

  it("exports the Topbar component", () => {
    expect(typeof Topbar).toBe("function")
  })

})

describe("Topbar (the toolbar)", () => {
  const render = (activeCompanyId: string | null = "c1") =>
    renderToStaticMarkup(React.createElement(Topbar, { companies: [{ id: "c1", name: "Acme" }], activeCompanyId }))

  // The sidebar holds the destinations and the company switcher now; the
  // toolbar is history, the page's name, search and the assistant.
  it("is one slim row: back, forward, the page name, search and the assistant", () => {
    route.pathname = "/c/c1/tasks"
    const html = render()
    expect(html).toContain('class="app-toolbar"')
    expect(html).toContain('aria-label="Back"')
    expect(html).toContain('aria-label="Forward"')
    expect(html).toContain(">Approvals<")
    expect(html).toContain('aria-label="Search"')
    expect(html).toContain('aria-label="Open the assistant"')
  })

  it("carries no shortcut strip and no second company switcher", () => {
    const html = render()
    expect(html).not.toContain("workspace-shortcuts")
    expect(html).not.toContain("switch company")
    expect(html).not.toContain(">More<")
  })

  it("offers the assistant only when there is a company for it to talk about", () => {
    route.pathname = "/"
    expect(render(null)).not.toContain('aria-label="Open the assistant"')
  })
})

describe("Topbar as the Mac window's drag handle", () => {
  // Electron ignores -webkit-app-region on anything inside a scrolling
  // element: with the toolbar inside #app-scroll the window could not be
  // dragged at all.
  it("sits beside the scroller in the root layout, never inside it", async () => {
    const { readFile } = await import("node:fs/promises")
    const layout = await readFile(new URL("../../app/layout.tsx", import.meta.url), "utf-8")
    const scroller = layout.indexOf('id="app-scroll"')
    const toolbar = layout.indexOf("<Topbar")
    expect(scroller).toBeGreaterThan(-1)
    expect(toolbar).toBeGreaterThan(-1)
    expect(toolbar).toBeLessThan(scroller)
  })
})
