"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { PanelLeft } from "lucide-react"
import { visibleGroups, hrefFor, activeItem, type NavItem } from "@/lib/os/nav"
import { NAV_ICONS } from "@/components/os/icons"
import { useAdvancedMode } from "@/components/advanced-only"
import { AgentTerminalStatus } from "@/components/agent-terminal-status"
import { CompanySwitcher } from "@/components/os/company-switcher"
import { blendArrived, blendTo, shouldBlend } from "@/components/os/motion"

export const DEFAULT_SIDEBAR_W = 232
export const MIN_SIDEBAR_W = 190
export const MAX_SIDEBAR_W = 420
export const COLLAPSED_SIDEBAR_W = 56

export const SIDEBAR_WIDTH_KEY = "alacran.sidebar.w"
export const SIDEBAR_COLLAPSED_KEY = "alacran.sidebar.collapsed"

export function clampSidebarWidth(width: number): number {
  return Math.max(MIN_SIDEBAR_W, Math.min(MAX_SIDEBAR_W, width))
}

/** Stamp the width the main pane makes room for, and whether it's the icon rail. */
function applyGeometry(collapsed: boolean, width: number) {
  const root = document.documentElement
  root.style.setProperty("--sidebar-w", `${collapsed ? COLLAPSED_SIDEBAR_W : width}px`)
  if (collapsed) root.setAttribute("data-sidebar", "collapsed")
  else root.removeAttribute("data-sidebar")
}

type LinkProps = {
  item: NavItem
  companyId: string | null
  selected: string | null
  /** The page actually on screen, as opposed to the optimistic selection. */
  onScreen: string | null
  collapsed: boolean
  pendingReviews: number
  onSelect: (slug: string) => void
  onTip: (tip: { label: string; y: number } | null) => void
  prefetch: (href: string) => void
  go: (href: string) => void
}

function SidebarLink({ item, companyId, selected, onScreen, collapsed, pendingReviews, onSelect, onTip, prefetch, go }: LinkProps) {
  const href = hrefFor(item, companyId)
  const Icon = NAV_ICONS[item.icon]
  return (
    <Link
      href={href}
      // Twenty data-heavy routes: warm only the one the pointer is heading
      // for, never all of them as they scroll into view.
      prefetch={false}
      data-slug={item.slug}
      aria-current={selected === item.slug ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className="app-sidebar-link"
      onClick={(event) => {
        onSelect(item.slug)
        if (!shouldBlend(event, onScreen === item.slug)) return
        event.preventDefault()
        blendTo(href, go)
      }}
      onPointerEnter={(event) => {
        prefetch(href)
        if (collapsed) onTip({ label: item.label, y: event.currentTarget.getBoundingClientRect().top })
      }}
      onPointerLeave={() => (collapsed ? onTip(null) : undefined)}
      onFocus={() => prefetch(href)}
    >
      {Icon ? <Icon aria-hidden strokeWidth={1.7} /> : null}
      {collapsed ? null : <span className="app-sidebar-label">{item.label}</span>}
      {item.slug === "terminal" && companyId && !collapsed ? <AgentTerminalStatus agentId={companyId} layout="spinner" /> : null}
      {item.slug === "tasks" && pendingReviews > 0 ? (
        <span className="app-sidebar-badge" data-approvals-badge aria-label={`${pendingReviews} waiting`}>
          {collapsed ? null : pendingReviews}
        </span>
      ) : null}
    </Link>
  )
}

/**
 * The frame's left side: the company switcher, then every destination from
 * lib/os/nav.ts — simple mode's plain list, plus the Developer group in
 * advanced mode — with Preferences at the foot. One highlight slides to the
 * selected page instead of each link painting its own. Resizable; collapses
 * to an icon rail. Glass inside the Mac shell, solid everywhere else (see the
 * glass frame section of app/globals.css).
 */
export function Sidebar({
  companyId,
  pendingReviews = 0,
  companies = [],
}: {
  companyId: string | null
  pendingReviews?: number
  companies?: Array<{ id: string; name: string }>
}) {
  const pathname = usePathname() || "/"
  const search = useSearchParams().toString()
  const router = useRouter()
  const advanced = useAdvancedMode()
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(DEFAULT_SIDEBAR_W)
  const [pendingSlug, setPendingSlug] = useState<string | null>(null)
  const [tip, setTip] = useState<{ label: string; y: number } | null>(null)
  const [highlight, setHighlight] = useState<{ y: number; h: number } | null>(null)
  const navRef = useRef<HTMLElement>(null)

  const routeCompanyId = pathname.startsWith("/c/") ? pathname.split("/")[2] || null : null
  const effectiveCompanyId = routeCompanyId ?? companyId
  const current = activeItem(pathname, search)
  // The highlight moves on click, before the next page has rendered.
  const selected = pendingSlug ?? current?.slug ?? null

  useEffect(() => {
    setPendingSlug(null)
    blendArrived()
  }, [pathname, search])

  // The pre-paint script in app/layout.tsx already stamped the saved geometry;
  // this brings React's state in line with it.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
      if (Number.isFinite(saved) && saved >= MIN_SIDEBAR_W && saved <= MAX_SIDEBAR_W) setWidth(saved)
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1")
    } catch {
      /* storage unreadable: defaults stand */
    }
  }, [])

  useEffect(() => applyGeometry(collapsed, width), [collapsed, width])
  useEffect(() => {
    if (!collapsed) setTip(null)
  }, [collapsed])

  useLayoutEffect(() => {
    const link = navRef.current?.querySelector<HTMLElement>(`[data-slug="${selected}"]`)
    setHighlight(link ? { y: link.offsetTop, h: link.offsetHeight } : null)
  }, [selected, collapsed, advanced, width, effectiveCompanyId])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((was) => {
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, was ? "0" : "1")
      } catch {
        /* the toggle still works for this session */
      }
      return !was
    })
  }, [])

  const onDragStart = useCallback(
    (event: React.MouseEvent) => {
      if (collapsed) return
      event.preventDefault()
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      let latest = width
      const onMove = (move: MouseEvent) => {
        latest = clampSidebarWidth(move.clientX)
        setWidth(latest)
      }
      const onUp = () => {
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        try {
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(latest))
        } catch {
          /* width still applies for this session */
        }
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [collapsed, width]
  )

  const prefetch = useCallback(
    (href: string) => {
      try {
        router.prefetch(href)
      } catch {
        /* prefetch is an optimisation, never a failure */
      }
    },
    [router]
  )

  // Company pages need a company; on the picker with none, only the
  // machine-wide destinations show. Preferences lives at the foot.
  const groups = visibleGroups(advanced)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (effectiveCompanyId || item.scope === "system") && item.slug !== "settings"),
    }))
    .filter((group) => group.items.length > 0)
  const settings = visibleGroups(advanced).flatMap((group) => group.items).find((item) => item.slug === "settings")
  const linkProps = {
    companyId: effectiveCompanyId,
    selected,
    onScreen: current?.slug ?? null,
    collapsed,
    pendingReviews,
    onSelect: setPendingSlug,
    onTip: setTip,
    prefetch,
    go: (href: string) => router.push(href),
  }

  return (
    <aside
      className="app-sidebar"
      aria-label="Sidebar"
      data-collapsed={collapsed ? "" : undefined}
      style={{ width: collapsed ? COLLAPSED_SIDEBAR_W : width }}
    >
      <div className="app-sidebar-head">
        <CompanySwitcher companies={companies} activeCompanyId={effectiveCompanyId} collapsed={collapsed} />
        <button
          type="button"
          className="app-sidebar-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Show labels" : "Hide labels"}
          title={collapsed ? "Show labels" : "Hide labels"}
          aria-expanded={!collapsed}
        >
          <PanelLeft aria-hidden strokeWidth={1.7} />
        </button>
      </div>

      <nav ref={navRef} className="app-sidebar-nav" aria-label="Main navigation">
        {highlight ? (
          <span
            className="app-sidebar-highlight"
            aria-hidden
            style={{ transform: `translateY(${highlight.y}px)`, height: highlight.h }}
          />
        ) : null}
        {groups.map((group) => (
          <div key={group.id} className="app-sidebar-group" role="group" aria-label={group.label}>
            {group.id === "advanced" && !collapsed ? <p className="app-sidebar-group-label">{group.label}</p> : null}
            {group.items.map((item) => (
              <SidebarLink key={item.slug} item={item} {...linkProps} />
            ))}
          </div>
        ))}
        {settings ? (
          <div className="app-sidebar-foot">
            <SidebarLink item={settings} {...linkProps} />
          </div>
        ) : null}
      </nav>

      {collapsed && tip ? (
        <div className="app-sidebar-tip" style={{ top: tip.y + 16 }} role="tooltip">
          {tip.label}
        </div>
      ) : null}

      {collapsed ? null : (
        <div
          className="app-sidebar-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize, double-click to reset"
          onMouseDown={onDragStart}
          onDoubleClick={() => {
            setWidth(DEFAULT_SIDEBAR_W)
            try {
              localStorage.setItem(SIDEBAR_WIDTH_KEY, String(DEFAULT_SIDEBAR_W))
            } catch {
              /* reset still applies for this session */
            }
          }}
        />
      )}
    </aside>
  )
}
