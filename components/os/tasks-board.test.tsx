import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

import { TasksBoard } from "./tasks-board"
import * as CompanyCommandResult from "@/lib/company-commands/company-command-result"

vi.mock("next/link", () => ({ default: "a" }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}))

vi.mock("@/lib/company-commands/batch-approve", () => ({
  batchCommitSafeReviews: vi.fn(),
}))

vi.mock("@/lib/company-commands/company-command-result", () => ({
  getCompanyCommandResult: vi.fn(),
}))

vi.mock("@/lib/company-commands/commit-company-command-result", () => ({
  commitCompanyCommandResult: vi.fn(),
}))

vi.mock("@/lib/company-commands/discard-company-command-result", () => ({
  discardCompanyCommandResult: vi.fn(),
}))

type ReactWithInternals = typeof React & {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H?: Record<string, unknown>
  }
}

describe("TasksBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const reactAny = React as ReactWithInternals
    if (reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE) {
      reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = {
        useCallback: (cb: unknown) => cb,
        useTransition: () => [false, (cb: () => void) => cb()],
        useState: (initial: unknown) => [
          typeof initial === "function" ? (initial as () => unknown)() : initial,
          () => {},
        ],
        useEffect: (cb: () => void | (() => void)) => {
          cb()
        },
      }
    }
  })

  it("renders empty state when visible reviews is empty", () => {
    const el = TasksBoard({ reviews: [] })
    expect(el).not.toBeNull()
    const str = JSON.stringify(el)
    expect(str).toContain("Nothing waiting on you.")
  })

  it("leaves the empty message out when something else on the page is waiting (suppressEmpty)", () => {
    const str = JSON.stringify(TasksBoard({ reviews: [], companyId: "acme", suppressEmpty: true }))
    expect(str).not.toContain("Nothing waiting on you.")
    expect(str).not.toContain("Ask Alacrán to prepare something")
    // The default is unchanged: with nothing at all waiting, it still says so.
    expect(JSON.stringify(TasksBoard({ reviews: [], companyId: "acme" }))).toContain("Ask Alacrán to prepare something")
  })

  it("renders pending review cards and summary banner when reviews exist", () => {
    vi.mocked(CompanyCommandResult.getCompanyCommandResult).mockResolvedValueOnce({
      changed: true,
      outputPath: "notes/company/sessions/2026-09-19.md",
      oldText: "",
      newText: "# Notes\nContent",
      extraFiles: [],
      strays: null,
    })

    const el = TasksBoard({
      reviews: [{ agentId: "test-co", commandId: "session-note" }],
    })
    expect(el).not.toBeNull()
    const str = JSON.stringify(el)
    expect(str).toContain("pending review")
    expect(str).toContain("session-note")
  })

  it("teaches what Approvals is when nothing is waiting, and offers Ask", () => {
    const str = JSON.stringify(TasksBoard({ reviews: [], companyId: "test-co" }))
    expect(str).toContain("Nothing waiting on you.")
    expect(str).toContain("it waits here until you say yes")
    expect(str).toContain("/c/test-co/ask")
  })

  it("omits the Ask link when it does not know which company", () => {
    const str = JSON.stringify(TasksBoard({ reviews: [] }))
    expect(str).toContain("it waits here until you say yes")
    expect(str).not.toContain("/ask")
  })

  it("says the draft is saved, in the empty state, right after a first approval", () => {
    expect(JSON.stringify(TasksBoard({ reviews: [], companyId: "test-co", justSaved: true }))).toContain(
      "Saved. Alacrán keeps it in your company"
    )
    expect(JSON.stringify(TasksBoard({ reviews: [], companyId: "test-co" }))).not.toContain("Saved. Alacrán keeps it")
    // Only true for some drafts (a getting-started note is never read back), so it is not promised.
    expect(JSON.stringify(TasksBoard({ reviews: [], companyId: "test-co", justSaved: true }))).not.toContain("from now on")
  })
})
