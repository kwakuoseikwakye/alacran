"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { visibleGroups, hrefFor, activeItem } from "@/lib/os/nav"
import { useAdvancedMode } from "@/components/advanced-only"

export function Subnav({
  companyId,
  pendingReviews,
}: {
  companyId: string | null
  pendingReviews: number
}) {
  const pathname = usePathname()
  const advanced = useAdvancedMode()
  const current = activeItem(pathname)

  return (
    <nav className="os-subnav" aria-label="Main navigation">
      {visibleGroups(advanced).map((group) => (
        <div key={group.id} className="os-subnav-group">
          <h2 className="os-subnav-label">{group.label}</h2>
          {group.items.map((item) => (
            <Link
              key={item.slug}
              href={hrefFor(item, companyId)}
              aria-current={current?.slug === item.slug ? "page" : undefined}
              className="os-subnav-item"
            >
              {item.label}
              {item.slug === "tasks" && pendingReviews > 0 ? (
                <span className="os-badge" aria-label={`${pendingReviews} awaiting review`}>
                  {pendingReviews}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
