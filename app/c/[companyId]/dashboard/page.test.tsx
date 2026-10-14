import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

vi.mock("next/link", () => ({ default: "a" }))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound")
  },
}))
vi.mock("@/lib/get-effective-agents", () => ({
  getEffectiveAgents: vi.fn(),
  getEffectiveAdapters: vi.fn(async () => ({})),
}))
vi.mock("@/lib/get-all-activities", () => ({
  getAllActivities: vi.fn(async () => []),
  mergeAndSortActivities: vi.fn(() => []),
}))
vi.mock("@/lib/company-commands/pending-reviews", () => ({ listPendingReviews: vi.fn() }))
vi.mock("@/lib/company-commands/run-lock", () => ({ checkRunLockStatus: vi.fn() }))
vi.mock("@/lib/get-company-ontology-impl", () => ({ getCompanyOntologyImpl: vi.fn() }))
vi.mock("@/lib/connect/connect-status-impl", () => ({ companyAiStatusImpl: vi.fn() }))
vi.mock("@/lib/ai-executor-registry", () => ({ resolveAiExecutorForAgent: vi.fn(async () => ({ id: "claude-code", enforcesToolScope: true })) }))
vi.mock("@/lib/executor-readiness", () => ({ readinessOf: vi.fn(() => "ready") }))
vi.mock("@/lib/os/first-run-state", () => ({ readFirstRun: vi.fn() }))
vi.mock("@/lib/guide/observe", () => ({ observeGuide: vi.fn() }))
vi.mock("@/components/os/guide/guide-home-row", () => ({ GuideHomeRow: () => null }))
vi.mock("@/lib/os/memory-items", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/os/memory-items")>()),
  listMemoryItems: vi.fn(async () => [
    { path: "definitions/ontology/company.yaml", kind: "fact", title: "Your company profile", statement: "Your business: A bakery", changedAt: 1 },
  ]),
}))
vi.mock("@/lib/os/preferences/offer-load", () => ({ loadPreferenceOfferFor: vi.fn(async () => null) }))
vi.mock("@/lib/os/memory-health/load", () => ({ loadMemoryHealth: vi.fn(async () => ({ state: "none" })) }))
vi.mock("@/components/os/dashboard/ai-setup-card", () => ({ AiSetupCard: () => null }))
vi.mock("@/components/os/dashboard/first-run-hero", () => ({ FirstRunHero: () => null }))
vi.mock("@/components/os/dashboard/ai-chip", () => ({ AiChip: () => null }))
vi.mock("@/components/alacran-mark", () => ({ AlacranMark: () => null }))
vi.mock("@/components/os/composer", () => ({ Composer: () => null, ComposerSuggestions: () => null }))

import DashboardPage from "./page"
import { FirstRunHero } from "@/components/os/dashboard/first-run-hero"
import { AiSetupCard } from "@/components/os/dashboard/ai-setup-card"
import { SavedNotice } from "@/components/os/dashboard/saved-notice"
import { MemoryCard } from "@/components/os/dashboard/memory-card"
import { listMemoryItems } from "@/lib/os/memory-items"
import { loadMemoryHealth } from "@/lib/os/memory-health/load"
import { loadPreferenceOfferFor } from "@/lib/os/preferences/offer-load"
import { PreferencesOffer } from "@/components/os/dashboard/preferences-offer"
import { resolveAiExecutorForAgent } from "@/lib/ai-executor-registry"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { listPendingReviews } from "@/lib/company-commands/pending-reviews"
import { checkRunLockStatus } from "@/lib/company-commands/run-lock"
import { getCompanyOntologyImpl } from "@/lib/get-company-ontology-impl"
import { companyAiStatusImpl } from "@/lib/connect/connect-status-impl"
import { readFirstRun } from "@/lib/os/first-run-state"
import { observeGuide } from "@/lib/guide/observe"
import { GuideHomeRow } from "@/components/os/guide/guide-home-row"

type Scene = {
  kind?: "command-set" | "external"
  aiConnected?: boolean
  answered?: boolean
  pending?: string[]
  running?: boolean
  firstRun?: { firstSavedAt?: string; dismissedAt?: string }
  guide?: "none" | "proposal" | "dismissed"
}

const GUIDE_COUNTS = { new: 2, reworded: 1, removed: 1 }

const ANSWERS = { domain: "We cater events in Accra.", stakeholders: [], valueFlow: { input: "", transform: "", output: "" }, bottleneck: "" }

async function render(scene: Scene = {}) {
  const s = { kind: "command-set", aiConnected: true, answered: false, pending: [] as string[], running: false, firstRun: {}, guide: "none", ...scene }
  vi.mocked(getEffectiveAgents).mockResolvedValue([{ id: "acme", name: "Acme", rootPath: "/fake/acme", kind: s.kind }] as never)
  vi.mocked(listPendingReviews).mockResolvedValue(s.pending.map((commandId) => ({ agentId: "acme", commandId })))
  vi.mocked(companyAiStatusImpl).mockResolvedValue({ id: "claude-code", label: "Claude Code", connected: s.aiConnected, detail: "", guidance: { steps: [] } } as never)
  vi.mocked(checkRunLockStatus).mockResolvedValue({ running: s.running })
  vi.mocked(getCompanyOntologyImpl).mockResolvedValue(
    (s.answered ? { ok: true, answers: ANSWERS } : { ok: false, message: "no saved company.yaml yet", nothingSaved: true }) as never
  )
  vi.mocked(readFirstRun).mockResolvedValue(s.firstRun)
  vi.mocked(observeGuide).mockResolvedValue(
    (s.guide === "none"
      ? { result: { kind: "none", state: { state: "up-to-date" } }, dismissed: false }
      : {
          result: { kind: "proposal", proposal: { id: "a".repeat(64), baseBodyHash: "b".repeat(64), groups: [], counts: GUIDE_COUNTS, oldBody: "", newBody: "" } },
          dismissed: s.guide === "dismissed",
        }) as never
  )
  return DashboardPage({ params: Promise.resolve({ companyId: "acme" }) })
}

function findAll(node: unknown, match: (el: React.ReactElement) => boolean, out: React.ReactElement[] = []): React.ReactElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child, match, out))
    return out
  }
  if (!React.isValidElement(node)) return out
  if (match(node)) out.push(node)
  findAll((node.props as { children?: unknown }).children, match, out)
  return out
}
const ofType = (tree: unknown, type: unknown) => findAll(tree, (el) => el.type === type)
const text = (tree: unknown) => JSON.stringify(tree)

const now = () => new Date().toISOString()
const longAgo = "2020-01-01T00:00:00.000Z"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Home (DashboardPage)", () => {
  it("day one: leads with the describe hero, says so plainly, and does not claim everything is clear", async () => {
    const tree = await render({ answered: false })
    const hero = ofType(tree, FirstRunHero)
    expect(hero).toHaveLength(1)
    expect(hero[0].props).toMatchObject({ stage: "describe", companyId: "acme", companyName: "Acme", running: false })
    const html = text(tree)
    expect(html).toContain("Let's set up your business.")
    expect(html).not.toContain("Everything is clear.")
    expect(html).not.toContain("caught up")
    expect(html).not.toContain("What needs your attention")
  })

  it("business described, nothing drafted yet: offers the first draft", async () => {
    const tree = await render({ answered: true })
    expect(ofType(tree, FirstRunHero)[0].props).toMatchObject({ stage: "first-draft" })
    expect(text(tree)).toContain("Ready when you are.")
  })

  it("a draft waiting: the hero carries its plain title and there is no second card", async () => {
    const tree = await render({ answered: false, pending: ["define-company"] })
    expect(ofType(tree, FirstRunHero)[0].props).toMatchObject({
      stage: "review",
      running: false,
      pendingTitle: "Save your company profile",
    })
    const html = text(tree)
    expect(html).toContain("One thing needs your attention.")
    expect(html).not.toContain("What needs your attention")
  })

  it("a run in flight with nothing waiting: says it is working", async () => {
    const tree = await render({ answered: true, running: true })
    const props = ofType(tree, FirstRunHero)[0].props as { stage: string; running: boolean; pendingTitle?: string }
    expect(props.stage).toBe("review")
    expect(props.running).toBe(true)
    expect(props.pendingTitle).toBeUndefined()
    expect(text(tree)).toContain("Alacrán is preparing your draft.")
  })

  it("after the first approval: no hero, the caught-up card, and the saved notice for a while", async () => {
    const tree = await render({ firstRun: { firstSavedAt: now() } })
    expect(ofType(tree, FirstRunHero)).toHaveLength(0)
    expect(ofType(tree, SavedNotice)).toHaveLength(1)
    const html = text(tree)
    expect(html).toContain("You're all caught up")
    expect(html).toContain("Everything is clear.")
  })

  it("long after the first approval: no saved notice", async () => {
    const tree = await render({ firstRun: { firstSavedAt: longAgo } })
    expect(ofType(tree, SavedNotice)).toHaveLength(0)
    expect(ofType(tree, FirstRunHero)).toHaveLength(0)
  })

  it("dismissed: no hero even though nothing else is done, and the steady state shows", async () => {
    const tree = await render({ answered: false, firstRun: { dismissedAt: longAgo } })
    expect(ofType(tree, FirstRunHero)).toHaveLength(0)
    expect(text(tree)).toContain("You're all caught up")
  })

  it("a waiting approval is never swallowed when the AI has disconnected", async () => {
    const tree = await render({ aiConnected: false, answered: false, pending: ["digest"] })
    expect(ofType(tree, AiSetupCard)).toHaveLength(1)
    expect(ofType(tree, FirstRunHero)).toHaveLength(0)
    const html = text(tree)
    expect(html).toContain("What needs your attention")
    expect(html).toContain("Save your weekly summary")
    expect(html).toContain("/c/acme/tasks")
  })

  it("does not guide a folder the app only opens (an external company): no hero to press, no first draft to start", async () => {
    const tree = await render({ kind: "external", answered: false })
    expect(ofType(tree, FirstRunHero)).toHaveLength(0)
    expect(ofType(tree, SavedNotice)).toHaveLength(0)
    expect(text(tree)).toContain("Everything is clear.")
  })

  it("steady state: says what Alacrán knows, from this company's own folder", async () => {
    const tree = await render({ firstRun: { firstSavedAt: longAgo } })
    const [card] = ofType(tree, MemoryCard)
    expect(card.props).toMatchObject({ companyId: "acme", items: [{ path: "definitions/ontology/company.yaml" }] })
    expect(listMemoryItems).toHaveBeenLastCalledWith("/fake/acme")
  })

  it("hands the memory card this company's memory health", async () => {
    vi.mocked(loadMemoryHealth).mockResolvedValueOnce({ state: "unknown" })
    const tree = await render({ firstRun: { firstSavedAt: longAgo } })
    expect(loadMemoryHealth).toHaveBeenCalledWith("/fake/acme")
    expect(ofType(tree, MemoryCard)[0].props).toMatchObject({ health: { state: "unknown" } })
  })

  it("offers to learn preferences when the loader finds a repeated revision pattern", async () => {
    const offer = { commands: [{ id: "digest", revisions: 3 }] }
    vi.mocked(loadPreferenceOfferFor).mockResolvedValueOnce(offer)
    const tree = await render({ firstRun: { firstSavedAt: longAgo } })
    expect(loadPreferenceOfferFor).toHaveBeenCalledWith("acme", "/fake/acme")
    const found = ofType(tree, PreferencesOffer)
    expect(found).toHaveLength(1)
    expect(found[0].props).toEqual({ companyId: "acme", offer })
  })

  it("hides the preferences offer, without loading it, for an executor that cannot enforce tool scope", async () => {
    vi.mocked(loadPreferenceOfferFor).mockClear()
    vi.mocked(resolveAiExecutorForAgent).mockResolvedValueOnce({ id: "kimi", enforcesToolScope: false } as never)
    const tree = await render({ firstRun: { firstSavedAt: longAgo } })
    expect(loadPreferenceOfferFor).not.toHaveBeenCalled()
    expect(ofType(tree, PreferencesOffer)).toHaveLength(0)
  })

  it("shows no preferences offer when there is nothing to offer", async () => {
    const tree = await render({ firstRun: { firstSavedAt: longAgo } })
    expect(ofType(tree, PreferencesOffer)).toHaveLength(0)
  })

  it("does not show the memory card while the first-run hero leads", async () => {
    const tree = await render({ answered: false })
    expect(loadMemoryHealth).not.toHaveBeenCalled()
    expect(loadPreferenceOfferFor).not.toHaveBeenCalled()
    expect(ofType(tree, FirstRunHero)).toHaveLength(1)
    expect(ofType(tree, MemoryCard)).toHaveLength(0)
  })

  it("does not show the memory card for a folder the app only opens, and never reads its history", async () => {
    vi.mocked(listMemoryItems).mockClear()
    const tree = await render({ kind: "external" })
    expect(ofType(tree, MemoryCard)).toHaveLength(0)
    expect(listMemoryItems).not.toHaveBeenCalled()
  })

  it("a stale guide in the steady state: one row with the counts, counted in the headline, and not 'caught up'", async () => {
    const tree = await render({ firstRun: { firstSavedAt: longAgo }, guide: "proposal" })
    const rows = ofType(tree, GuideHomeRow)
    expect(rows).toHaveLength(1)
    expect(rows[0].props).toMatchObject({ companyId: "acme", counts: GUIDE_COUNTS })
    const html = text(tree)
    expect(html).toContain("One thing needs your attention.")
    expect(html).not.toContain("You're all caught up")
    expect(html).not.toContain("What needs your attention")
  })

  it("a stale guide beside a waiting command review: both rows show and the headline counts both", async () => {
    const tree = await render({ firstRun: { firstSavedAt: longAgo }, pending: ["digest"], guide: "proposal" })
    expect(ofType(tree, GuideHomeRow)).toHaveLength(1)
    const html = text(tree)
    expect(html).toContain("2 things need your attention.")
    expect(html).toContain("Save your weekly summary")
    expect(html).toContain("What needs your attention")
  })

  it("a dismissed guide proposal shows no row, and Home is caught up", async () => {
    const tree = await render({ firstRun: { firstSavedAt: longAgo }, guide: "dismissed" })
    expect(ofType(tree, GuideHomeRow)).toHaveLength(0)
    expect(text(tree)).toContain("You're all caught up")
  })

  it("while the first-run hero leads, the guide neither competes nor changes the headline", async () => {
    const tree = await render({ answered: false, guide: "proposal" })
    expect(ofType(tree, FirstRunHero)).toHaveLength(1)
    expect(ofType(tree, GuideHomeRow)).toHaveLength(0)
    expect(text(tree)).toContain("Let's set up your business.")
  })

  it("a stale guide still shows when the AI has disconnected, like any waiting approval", async () => {
    const tree = await render({ aiConnected: false, answered: false, guide: "proposal" })
    expect(ofType(tree, AiSetupCard)).toHaveLength(1)
    expect(ofType(tree, GuideHomeRow)).toHaveLength(1)
    expect(text(tree)).toContain("One thing needs your attention.")
  })

  it("a folder the app only opens never checks or shows a guide", async () => {
    vi.mocked(observeGuide).mockClear()
    const tree = await render({ kind: "external", guide: "proposal" })
    expect(observeGuide).not.toHaveBeenCalled()
    expect(ofType(tree, GuideHomeRow)).toHaveLength(0)
  })

  it("the AI setup card still shows once the guide is done, if the AI later disconnects", async () => {
    const tree = await render({ aiConnected: false, firstRun: { firstSavedAt: longAgo } })
    expect(ofType(tree, AiSetupCard)).toHaveLength(1)
    expect(ofType(tree, FirstRunHero)).toHaveLength(0)
  })
})
