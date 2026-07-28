"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bot, Activity, BookOpen, Plug } from "lucide-react"
import { AlacranMark } from "@/components/alacran-mark"

const LINKS = [
  { href: "/", label: "Agents", icon: Bot },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/skills", label: "Skills", icon: BookOpen },
  { href: "/connect", label: "Connect", icon: Plug },
]

/**
 * The floating glass pill from the marketing site, brought into the app so the
 * two halves of the product share one piece of chrome. Sticky rather than
 * fixed: the gradient scrim below it lets content scroll underneath without
 * every page needing to reserve top padding.
 */
export function Nav() {
  const pathname = usePathname()

  return (
    <div className="sticky top-0 z-50 bg-gradient-to-b from-background via-background/90 to-transparent px-4 pt-3 pb-6">
      <nav className="a-glass a-rise mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-4 rounded-full py-1.5 pr-1.5 pl-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-display text-[15px] font-extrabold tracking-tight"
        >
          <AlacranMark className="w-6 transition-transform duration-300 hover:rotate-12" glow priority />
          <span className="hidden sm:inline">Alacrán</span>
        </Link>

        {/* min-w-0 is load-bearing: a flex child defaults to min-width:auto and
            would refuse to shrink, pushing the last link past the viewport. */}
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-all duration-200 ${
                  active
                    ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_30%,transparent)]"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 transition-transform duration-200 ${active ? "scale-110" : ""}`} />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
