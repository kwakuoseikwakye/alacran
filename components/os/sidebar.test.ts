import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

const route = { pathname: "/c/acme/dashboard", advanced: false }

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, prefetch: () => {} }),
}))
vi.mock("@/components/advanced-only", () => ({ useAdvancedMode: () => route.advanced }))
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean }) =>
    React.createElement("a", { href, ...rest }, children),
}))
// Under vitest a PNG import is a bare URL string, not Next's {src,width,height}
// object, so next/image's dev-mode size check throws. Only fires when
// NODE_ENV isn't "production" — CI, not a shell that exports it.
vi.mock("@/components/alacran-mark", () => ({ AlacranMark: () => null }))

import {
  clampSidebarWidth,
  MIN_SIDEBAR_W,
  MAX_SIDEBAR_W,
  DEFAULT_SIDEBAR_W,
  COLLAPSED_SIDEBAR_W,
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_COLLAPSED_KEY,
  Sidebar,
} from "./sidebar"

const render = (props: Partial<React.ComponentProps<typeof Sidebar>> = {}) =>
  renderToStaticMarkup(
    React.createElement(Sidebar, {
      companyId: "acme",
      pendingReviews: 0,
      companies: [{ id: "acme", name: "Acme Catering" }],
      ...props,
    })
  )

describe("Sidebar Geometry & Constants", () => {
  it("defines default, min, max, and collapsed widths", () => {
    expect(DEFAULT_SIDEBAR_W).toBe(232)
    expect(MIN_SIDEBAR_W).toBe(190)
    expect(MAX_SIDEBAR_W).toBe(420)
    expect(COLLAPSED_SIDEBAR_W).toBe(56)
  })

  it("clamps width within boundaries", () => {
    expect(clampSidebarWidth(0)).toBe(190)
    expect(clampSidebarWidth(189.9)).toBe(190)
    expect(clampSidebarWidth(232)).toBe(232)
    expect(clampSidebarWidth(420.1)).toBe(420)
    expect(clampSidebarWidth(9999)).toBe(420)
  })

  it("exports storage keys for width and collapsed state", () => {
    expect(SIDEBAR_WIDTH_KEY).toBe("alacran.sidebar.w")
    expect(SIDEBAR_COLLAPSED_KEY).toBe("alacran.sidebar.collapsed")
  })
})

describe("Sidebar", () => {
  beforeEach(() => {
    route.pathname = "/c/acme/dashboard"
    route.advanced = false
  })

  it("opens with the company you're in", () => {
    expect(render()).toContain("Acme Catering")
  })

  it("shows simple mode's eight destinations and nothing technical", () => {
    const html = render()
    for (const label of ["Home", "Ask Alacrán", "Approvals", "Records", "What Alacrán knows", "Company profile", "Connected tools", "Preferences"]) {
      expect(html).toContain(`>${label}<`)
    }
    expect(html).not.toContain("Developer")
    expect(html).not.toContain(">Terminal<")
  })

  // The strip and its More menu are gone, so advanced mode reaches every
  // technical page from here or not at all.
  it("adds the Developer group in advanced mode", () => {
    route.advanced = true
    const html = render()
    for (const label of ["Developer", "Terminal", "Departments", "Automations", "Skills", "Analytics", "Diagnostics"]) {
      expect(html).toContain(`>${label}<`)
    }
  })

  it("marks the current page", () => {
    route.pathname = "/c/acme/tasks"
    expect(render()).toMatch(/href="\/c\/acme\/tasks"[^>]*aria-current="page"/)
  })

  it("counts what is waiting on Approvals, where an approved item can fly to", () => {
    const html = render({ pendingReviews: 3 })
    expect(html).toMatch(/data-approvals-badge[^>]*>3</)
  })

  it("shows no company pages on the picker when no company is active", () => {
    route.pathname = "/"
    const html = render({ companyId: null })
    expect(html).not.toContain('href="/c/')
    expect(html).toContain(">Connected tools<")
    expect(html).toContain(">Preferences<")
  })
})
