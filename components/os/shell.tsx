"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { NAV_ICONS } from "@/components/os/icons"
import { CommandPalette } from "@/components/os/command-palette"
import { AssistantDock } from "@/components/os/assistant-dock"
import { Sidebar } from "@/components/os/sidebar"
import { useAdvancedMode } from "@/components/advanced-only"
import { mobileNavItems, hrefFor, activeItem } from "@/lib/os/nav"
import type { PaletteCommand } from "@/lib/os/palette-sources"
import type { AssistantCompany } from "@/components/assistant/assistant-stage"
import type { AssistantPersona } from "@/lib/assistant/persona"
import type { VoiceProviderId } from "@/lib/voice/providers"
import type { AiExecutorId } from "@/lib/ai-executors"

export type ShellAssistantData = {
  companies: AssistantCompany[]
  voiceProviderId: VoiceProviderId
  voiceReady: boolean
  persona: AssistantPersona | null
  initialExecutorId: AiExecutorId
  elevenlabsAgentReady: boolean
  autoDispatchCompanies: string[]
}

/**
 * The cockpit chrome: a unified resizable Sidebar, sticky Topbar, and a
 * bottom-nav strip that replaces both on a phone. It renders no page content —
 * `app/layout.tsx` keeps the `.app-shell-main` pane — so this is only ever the
 * navigation frame.
 *
 * `rootFallback` marks the instance mounted by the ROOT layout, which only
 * knows the active company from a cookie. On a `/c/[companyId]` route the
 * company-scoped layout mounts its own `<Shell>` with the id straight off the
 * URL; the root instance then steps aside so the two never stack.
 */
export function Shell({
  companyId,
  pendingReviews,
  commands,
  assistant,
  companies = [],
  rootFallback = false,
}: {
  companyId: string | null
  pendingReviews: number
  commands: PaletteCommand[]
  assistant: ShellAssistantData
  companies?: Array<{ id: string; name: string }>
  rootFallback?: boolean
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const advanced = useAdvancedMode()

  if (rootFallback && pathname.startsWith("/c/")) return null

  const current = activeItem(pathname, searchParams.toString())
  const mobileItems = mobileNavItems(advanced)

  return (
    <>
      <CommandPalette commands={commands} />

      {/* The assistant only has a company to talk about once one is active —
       *  on the bare picker ("/") there is nothing to dock. */}
      {companyId ? (
        <AssistantDock
          companyId={companyId}
          defaultOpen={searchParams.get("dock") === "open"}
          {...assistant}
        />
      ) : null}

      <Sidebar companyId={companyId} pendingReviews={pendingReviews} companies={companies} />

      {/* ---- MOBILE: keep the three daily actions directly reachable ---- */}
      <nav className="app-bottom-nav" aria-label="Mobile navigation">
        {mobileItems.map((item) => {
          const Icon = NAV_ICONS[item.icon]
          if (!Icon) return null // unknown icon name: skip the tab rather than crash the strip
          const active = current?.slug === item.slug
          const label = item.slug === "terminal" ? "More" : item.label
          return (
            <Link
              key={item.slug}
              href={hrefFor(item, companyId)}
              prefetch={false}
              aria-current={active ? "true" : undefined}
              className={`bottom-nav-item${active ? " active" : ""}`}
            >
              <span className="relative">
                <Icon className="size-[22px]" aria-hidden />
                {item.slug === "tasks" && pendingReviews > 0 ? (
                  <span className="absolute -right-1 -top-1 size-2 rounded-full bg-primary" />
                ) : null}
              </span>
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
