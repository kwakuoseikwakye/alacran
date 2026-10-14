import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound")
  },
}))
vi.mock("@/lib/get-effective-agents", () => ({ getEffectiveAgents: vi.fn() }))
vi.mock("@/lib/company-commands/pending-reviews", () => ({ listPendingReviews: vi.fn() }))
vi.mock("@/lib/content-social/posts", () => ({ listPosts: vi.fn(async () => []) }))
vi.mock("@/lib/os/first-run-state", () => ({ readFirstRun: vi.fn(async () => ({})) }))
vi.mock("@/lib/guide/observe", () => ({ observeGuide: vi.fn() }))
vi.mock("@/components/os/tasks-board", () => ({ TasksBoard: () => null }))
vi.mock("@/components/content-social/post-list", () => ({ PostList: () => null }))
vi.mock("@/components/os/loop-strip", () => ({ LoopStrip: () => null }))
vi.mock("@/components/os/guide/guide-proposal-card", () => ({ GuideProposalCard: () => null }))

import TasksPage from "./page"
import { TasksBoard } from "@/components/os/tasks-board"
import { GuideProposalCard } from "@/components/os/guide/guide-proposal-card"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { listPendingReviews } from "@/lib/company-commands/pending-reviews"
import { observeGuide } from "@/lib/guide/observe"

const PROPOSAL = {
  id: "a".repeat(64),
  baseBodyHash: "b".repeat(64),
  groups: [],
  counts: { new: 1, reworded: 0, removed: 0 },
  oldBody: "",
  newBody: "",
}

async function render(opts: { guide: "none" | "proposal" | "dismissed"; pending?: string[] }) {
  vi.mocked(getEffectiveAgents).mockResolvedValue([{ id: "acme", name: "Acme", rootPath: "/fake/acme", kind: "command-set" }] as never)
  vi.mocked(listPendingReviews).mockResolvedValue((opts.pending ?? []).map((commandId) => ({ agentId: "acme", commandId })))
  vi.mocked(observeGuide).mockResolvedValue(
    (opts.guide === "none"
      ? { result: { kind: "none", state: { state: "up-to-date" } }, dismissed: false }
      : { result: { kind: "proposal", proposal: PROPOSAL }, dismissed: opts.guide === "dismissed" }) as never
  )
  return TasksPage({ params: Promise.resolve({ companyId: "acme" }) })
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

beforeEach(() => vi.clearAllMocks())

describe("Approvals page and the guide update", () => {
  it("a stale guide: the card gets the live proposal and the board's empty message is suppressed", async () => {
    const tree = await render({ guide: "proposal" })
    const [card] = ofType(tree, GuideProposalCard)
    expect(card.props).toMatchObject({ companyId: "acme", proposal: PROPOSAL })
    expect(ofType(tree, TasksBoard)[0].props).toMatchObject({ suppressEmpty: true })
  })

  it("a dismissed proposal is not shown, and the board says it is empty as before", async () => {
    const tree = await render({ guide: "dismissed" })
    expect(ofType(tree, GuideProposalCard)[0].props).toMatchObject({ proposal: null })
    expect(ofType(tree, TasksBoard)[0].props).toMatchObject({ suppressEmpty: false })
  })

  it("no proposal at all leaves the page as it was", async () => {
    const tree = await render({ guide: "none" })
    expect(ofType(tree, GuideProposalCard)[0].props).toMatchObject({ proposal: null })
    expect(ofType(tree, TasksBoard)[0].props).toMatchObject({ suppressEmpty: false })
  })

  it("command reviews still reach the board untouched, beside the guide card", async () => {
    const tree = await render({ guide: "proposal", pending: ["digest"] })
    expect(ofType(tree, TasksBoard)[0].props).toMatchObject({
      companyId: "acme",
      reviews: [{ agentId: "acme", commandId: "digest" }],
    })
    expect(ofType(tree, GuideProposalCard)).toHaveLength(1)
  })

  it("an unknown company is a 404 before anything is read", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([])
    await expect(TasksPage({ params: Promise.resolve({ companyId: "ghost" }) })).rejects.toThrow("notFound")
    expect(observeGuide).not.toHaveBeenCalled()
  })
})
