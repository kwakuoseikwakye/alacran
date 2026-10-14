"use client"

import { useEffect, useState, type ReactNode } from "react"

export type SectionTab = { id: string; label: string; icon?: ReactNode }

/** Scroll-aware in-page navigation. Hash links still work without JS; the
 * active treatment follows the section the user is actually reading. */
export function SectionTabs({
  items,
  className,
}: {
  items: SectionTab[]
  className: string
}) {
  const [active, setActive] = useState(items[0]?.id ?? "")

  useEffect(() => {
    const fromHash = window.location.hash.slice(1)
    if (items.some((item) => item.id === fromHash)) setActive(fromHash)

    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => Boolean(element))
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible?.target.id) setActive(visible.target.id)
      },
      { rootMargin: "-18% 0px -68% 0px", threshold: 0 }
    )
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [items])

  return (
    <nav className={className} aria-label="Page sections">
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "location" : undefined}
              className={active === item.id ? "active" : ""}
              onClick={() => setActive(item.id)}
            >
              {item.icon}{item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
