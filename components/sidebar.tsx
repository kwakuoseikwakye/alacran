"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bot, Activity, BookOpen, Plug, Network, Settings } from "lucide-react"
import { useAdvancedMode } from "@/components/advanced-only"
import { AlacranMark } from "@/components/alacran-mark"
import { APP_VERSION } from "@/lib/app-version"

const NAV = [
  { href: "/",         label: "Agents",     icon: Bot      },
  { href: "/activity", label: "Activities", icon: Activity },
  { href: "/skills",   label: "Skills",     icon: BookOpen },
  { href: "/connect",  label: "Connectors", icon: Plug     },
  { href: "/settings", label: "Settings",   icon: Settings },
]

/** Network is a map of what every company is plugged into — genuinely useful,
 *  and genuinely meaningless to someone who hasn't connected anything yet.
 *  Inserted before Settings so Settings stays last in both modes. */
const NETWORK_ITEM = { href: "/network", label: "Networks", icon: Network }

/**
 * Collapsible glassmorphic sidebar. Collapses to 72px of icon-only rail on
 * desktop and expands to 228px on hover. On mobile it vanishes entirely and
 * is replaced by the bottom-nav strip rendered in layout.tsx.
 */
export function Sidebar() {
  const pathname = usePathname()
  const advanced = useAdvancedMode()
  const nav = advanced ? [...NAV.slice(0, -1), NETWORK_ITEM, NAV[NAV.length - 1]] : NAV

  return (
    <>
      {/* ---- DESKTOP SIDEBAR ---- */}
      <aside className="app-sidebar" aria-label="Main navigation">
        <Link href="/" className="sidebar-brand">
          <AlacranMark className="brand-mark" glow priority />
          <span className="brand-name">Alacrán</span>
        </Link>

        <span className="sidebar-section-label">Navigation</span>

        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`sidebar-nav-item${active ? " active" : ""}`}
            >
              <span className="nav-icon">
                <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
              </span>
              <span className="nav-label">{label}</span>
            </Link>
          )
        })}

        <div className="sidebar-spacer" />
        <div className="sidebar-sep" />

        <span className="sidebar-version">v{APP_VERSION}</span>
      </aside>

      {/* ---- MOBILE BOTTOM NAV ---- */}
      <nav className="app-bottom-nav" aria-label="Mobile navigation">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`bottom-nav-item${active ? " active" : ""}`}
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
