"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { TerminalWorkspace } from "@/components/terminal-workspace"

/**
 * Keeps the terminal mounted across all `/c/[companyId]/*` page navigations.
 *
 * The problem: `TerminalWorkspace` uses xterm instances bound to server ptys
 * over SSE. When Next.js navigates from `/c/acme/terminal` to
 * `/c/acme/dashboard`, it unmounts the terminal page, disposing xterm and
 * closing the EventSource. The pty keeps running server-side, but the user
 * loses visual continuity — the tab strip resets, the active session forgets
 * where it was, and xterm has to reconnect and replay the entire backlog.
 *
 * The fix: this component lives in the company layout (which persists across
 * child route navigations). When the user is on `/terminal`, the terminal
 * container has full height and is visible. When they navigate elsewhere, the
 * container collapses to zero height with `overflow: hidden` — the DOM stays
 * alive but takes no space and is invisible. The xterm's EventSource keeps
 * streaming, the tab state survives, and navigating back is instant.
 *
 * The `inert` attribute prevents keyboard interaction when hidden, so tab
 * order and focus stay correct on the visible page.
 *
 * The workspace mounts on the first visit to `/terminal`, never before:
 * mounting it opens an assistant session when none is running, so mounting it
 * on every company page started a real agent run on a visit to Home.
 */
export function TerminalPersist({
  companyId,
  companyName,
}: {
  companyId: string
  companyName: string
}) {
  const pathname = usePathname()
  const isTerminalPage = pathname === `/c/${companyId}/terminal`
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [opened, setOpened] = useState(isTerminalPage)
  if (isTerminalPage && !opened) setOpened(true)

  // When the terminal page becomes visible, scroll it into view so the user
  // doesn't land in the middle of the page.
  useEffect(() => {
    if (isTerminalPage && containerRef.current) {
      containerRef.current.scrollIntoView({ block: "nearest" })
    }
  }, [isTerminalPage])

  return (
    <div
      ref={containerRef}
      // When hidden: zero height, no overflow, no pointer events, removed
      // from tab order. When visible: the whole content area under the
      // toolbar, edge to edge — no page heading, the terminal is the page.
      className={isTerminalPage ? "terminal-page" : "h-0 overflow-hidden pointer-events-none"}
      aria-hidden={!isTerminalPage}
      inert={!isTerminalPage}
    >
      {opened && <TerminalWorkspace agentId={companyId} companyName={companyName} />}
    </div>
  )
}
