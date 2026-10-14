"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Search, Sparkles } from "lucide-react"
import { NAV_GROUPS } from "@/lib/os/nav"

export const PALETTE_OPEN_EVENT = "alacran:palette"
export const CONDUCTOR_TOGGLE_EVENT = "alacran:conductor-toggle"

export type BreadcrumbResult = {
  companyLabel: string
  sectionLabel: string
  section: string
  targetPathForCompany: (companyId: string) => string
}

/** Pages the menu doesn't list: the departments carry the names the Records
 *  hub gives them. Everything else takes its menu label, so the bar and the
 *  sidebar never name one page two ways, and the bar never shows a URL slug. */
const SECTION_LABELS: Record<string, string> = {
  roadmap: "Roadmap",
  funnel: "Leads & customers",
  finances: "Money in & out",
  "content-social": "Content & social",
  social: "Distribution",
}

function navLabel(slug: string): string | undefined {
  return NAV_GROUPS.flatMap((group) => group.items).find((item) => item.slug === slug)?.label
}

export function resolveTopbarBreadcrumbs(
  pathname: string,
  activeCompanyId: string | null,
  companies: Array<{ id: string; name: string }>
): BreadcrumbResult {
  if (pathname.startsWith("/system/")) {
    const segments = pathname.split("/").filter(Boolean)
    const section = segments[1] || "settings"
    // These pages are machine-wide, but the company strip stays under them, so
    // the switcher keeps naming the company you came from rather than "system".
    const match = activeCompanyId ? companies.find((c) => c.id === activeCompanyId) : null
    const sectionLabel = ({ settings: "Preferences", connectors: "Connected tools", network: "Network" } as Record<string, string>)[section] ?? section
    return {
      companyLabel: match ? match.name : "All companies",
      sectionLabel,
      section: sectionLabel,
      targetPathForCompany: (newId: string) => `/c/${newId}/dashboard`,
    }
  }

  if (pathname.startsWith("/c/")) {
    const segments = pathname.split("/").filter(Boolean)
    const compId = segments[1] || activeCompanyId || ""
    if (compId) {
      const match = companies.find((c) => c.id === compId)
      const companyLabel = match ? match.name : compId
      const section = segments[2] || "dashboard"
      const sectionLabel = SECTION_LABELS[section] ?? navLabel(section) ?? section
      return {
        companyLabel,
        sectionLabel,
        section: sectionLabel,
        targetPathForCompany: (newId: string) => `/c/${newId}/${section}`,
      }
    }
  }

  if (pathname === "/doctor" || pathname.startsWith("/doctor/")) {
    const compId = activeCompanyId || ""
    const match = compId ? companies.find((c) => c.id === compId) : null
    const companyLabel = match ? match.name : compId || "All companies"
    return {
      companyLabel,
      sectionLabel: "System Doctor",
      section: "System Doctor",
      targetPathForCompany: (newId: string) => `/c/${newId}/doctor`,
    }
  }

  if (pathname === "/roadmap" || pathname.startsWith("/roadmap/")) {
    const compId = activeCompanyId || ""
    const match = compId ? companies.find((c) => c.id === compId) : null
    const companyLabel = match ? match.name : compId || "All companies"
    return {
      companyLabel,
      sectionLabel: "Roadmap",
      section: "Roadmap",
      targetPathForCompany: (newId: string) => `/c/${newId}/roadmap`,
    }
  }

  if (pathname === "/analytics" || pathname.startsWith("/analytics/")) {
    const compId = activeCompanyId || ""
    const match = compId ? companies.find((c) => c.id === compId) : null
    const companyLabel = match ? match.name : compId || "All companies"
    return {
      companyLabel,
      sectionLabel: "Analytics",
      section: "Analytics",
      targetPathForCompany: (newId: string) => `/c/${newId}/analytics`,
    }
  }

  if (pathname === "/skills" || pathname.startsWith("/skills/")) {
    const compId = activeCompanyId || ""
    const match = compId ? companies.find((c) => c.id === compId) : null
    const companyLabel = match ? match.name : compId || "All companies"
    return {
      companyLabel,
      sectionLabel: "Skills",
      section: "Skills",
      targetPathForCompany: (newId: string) => `/c/${newId}/skills`,
    }
  }

  if (pathname === "/terminal" || pathname.startsWith("/terminal/")) {
    const compId = activeCompanyId || ""
    const match = compId ? companies.find((c) => c.id === compId) : null
    const companyLabel = match ? match.name : compId || "All companies"
    return {
      companyLabel,
      sectionLabel: "Terminal",
      section: "Terminal",
      targetPathForCompany: (newId: string) => `/c/${newId}/terminal`,
    }
  }

  return {
    companyLabel: "All companies",
    sectionLabel: "",
    section: "",
    targetPathForCompany: (id: string) => `/c/${id}/dashboard`,
  }
}

export function openPalette() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PALETTE_OPEN_EVENT))
  }
}

export function toggleConductor() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CONDUCTOR_TOGGLE_EVENT))
  }
}

/** Whether the page has scrolled under the toolbar: the moment it turns to
 *  glass and takes over the page's name from the heading that just left. */
function useScrolledUnder(): boolean {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const scroller = document.getElementById("app-scroll")
    if (!scroller) return
    const update = () => setScrolled(scroller.scrollTop > 4)
    update()
    scroller.addEventListener("scroll", update, { passive: true })
    return () => scroller.removeEventListener("scroll", update)
  }, [])
  return scrolled
}

/**
 * The toolbar: one slim row at the top of the content, sticky inside the
 * scroll container so the page slides under it. Back and forward, the page's
 * name once its own heading has scrolled away, search (the ⌘K palette) and
 * the assistant. Destinations and the company switcher live in the sidebar.
 * On a Mac it is also the window's drag handle.
 */
export function Topbar({
  companies = [],
  activeCompanyId = null,
}: {
  companies?: Array<{ id: string; name: string }>
  activeCompanyId?: string | null
}) {
  const pathname = usePathname() || "/"
  const router = useRouter()
  const scrolled = useScrolledUnder()
  const routeCompanyId = pathname.startsWith("/c/") ? pathname.split("/").filter(Boolean)[1] || null : null
  const companyId = routeCompanyId ?? activeCompanyId
  const { sectionLabel } = resolveTopbarBreadcrumbs(pathname, companyId, companies)

  return (
    <header className="app-toolbar" data-scrolled={scrolled ? "" : undefined}>
      <div className="app-toolbar-history">
        <button type="button" onClick={() => router.back()} aria-label="Back" title="Back">
          <ChevronLeft aria-hidden />
        </button>
        <button type="button" onClick={() => router.forward()} aria-label="Forward" title="Forward">
          <ChevronRight aria-hidden />
        </button>
      </div>
      <span className="app-toolbar-title">{sectionLabel}</span>
      <div className="app-toolbar-actions">
        <button type="button" className="app-toolbar-search" onClick={openPalette} aria-label="Search">
          <Search aria-hidden />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
        {companyId ? (
          <button type="button" className="app-toolbar-icon" onClick={toggleConductor} aria-label="Open the assistant" title="Assistant">
            <Sparkles aria-hidden />
          </button>
        ) : null}
      </div>
    </header>
  )
}
