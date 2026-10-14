"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { NAV_GROUPS, hrefFor, activeItem } from "@/lib/os/nav"
import { NAV_ICONS } from "@/components/os/icons"
import { useAdvancedMode } from "@/components/advanced-only"

/** One glyph per group, not per item: the rail picks the section, the subnav
 *  picks the destination. Clicking a glyph goes to that group's first visible
 *  item, so the rail is never a dead control. */
export function Rail({ companyId }: { companyId: string | null }) {
  const pathname = usePathname()
  const advanced = useAdvancedMode()
  const current = activeItem(pathname)

  return (
    <nav className="os-rail" aria-label="Sections">
      {NAV_GROUPS.map((group) => {
        const items = advanced ? group.items : group.items.filter((i) => !i.advancedOnly)
        if (items.length === 0) return null
        const first = items[0]
        const Icon = NAV_ICONS[first.icon]
        if (!Icon) return null // unknown icon name: skip the glyph rather than crash the rail
        const active = current ? group.items.some((i) => i.slug === current.slug) : false
        return (
          <Link
            key={group.id}
            href={hrefFor(first, companyId)}
            aria-current={active ? "true" : undefined}
            aria-label={group.label}
            title={group.label}
            className="os-rail-item"
          >
            <Icon className="size-5" aria-hidden />
          </Link>
        )
      })}
    </nav>
  )
}
