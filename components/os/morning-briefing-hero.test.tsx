import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

import { MorningBriefingHero } from "./morning-briefing-hero"
import type { ExecutiveBriefingData } from "@/lib/os/executive-briefing"

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

type ReactWithInternals = typeof React & {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H?: Record<string, unknown>
  }
}

const mockBriefing: ExecutiveBriefingData = {
  companyId: "acme-corp",
  companyName: "Acme Corp",
  dateFormatted: "Friday, September 19, 2026",
  headline: "2 decisions waiting in the Human Gate.",
  summaryParagraph: "Good morning. Acme Corp has 2 pending reviews waiting for decision.",
  audioScript: "Good morning. Here is your executive briefing for Acme Corp.",
  metrics: {
    pendingReviewsCount: 2,
    safeReviewsCount: 1,
    governedReviewsCount: 1,
    leadsCount: 5,
    pipelineValue: 85000,
    cashBalance: 42000,
    contentCount: 4,
  },
  nextAction: {
    title: "Review pending decisions in the Human Gate",
    detail: "Inspect waiting proposals before changes land in company memory.",
    href: "/c/acme-corp/tasks",
  },
}

describe("MorningBriefingHero", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const reactAny = React as ReactWithInternals
    if (reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE) {
      reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = {
        useTransition: () => [false, (cb: () => void) => cb()],
        useState: (initial: unknown) => [
          typeof initial === "function" ? (initial as () => unknown)() : initial,
          () => {},
        ],
        useRef: (initial: unknown) => ({ current: initial }),
        useEffect: (cb: () => void | (() => void)) => {
          cb()
        },
      }
    }
  })

  it("renders the executive morning briefing hero with audio affordance and metrics", () => {
    const el = MorningBriefingHero({ briefing: mockBriefing })
    expect(el).not.toBeNull()
    const str = JSON.stringify(el)
    expect(str).toContain("Morning briefing")
    expect(str).toContain("Acme Corp")
    expect(str).toContain("$85,000")
    expect(str).toContain("$42,000")
    expect(str).toContain("Review pending decisions in the Human Gate")
  })

  // Home shows one primary next step; while a setup card leads the page, the
  // briefing's own Take Action would be a second one.
  it("leaves out Take Action when Home already shows a next step", () => {
    const str = JSON.stringify(MorningBriefingHero({ briefing: mockBriefing, showNextMove: false }))
    expect(str).not.toContain("Take Action")
    expect(str).toContain("Morning briefing")
  })
})
