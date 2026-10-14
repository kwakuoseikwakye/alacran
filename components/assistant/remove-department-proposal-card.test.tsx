import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

import { RemoveDepartmentProposalCard, describeRemoval } from "./remove-department-proposal-card"
import { planRemovalAction, removeDepartmentAction, retryCommitAction } from "@/lib/os/departments/actions"
import { HistoryNotice } from "@/components/os/departments/history-notice"
import { Button } from "@/components/ui/button"

vi.mock("@/lib/os/departments/actions", () => ({ planRemovalAction: vi.fn(), removeDepartmentAction: vi.fn(), retryCommitAction: vi.fn() }))
const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

type ReactWithInternals = typeof React & {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { H?: Record<string, unknown> }
}

/** Every value any state setter was called with, in order. */
let setCalls: unknown[] = []
/** A starting value per state slot (0 status, 1 loaded plan, 2 error, 3 history), to render the card as if it were already in a state. */
let initial: Record<number, unknown> = {}
/** Mount effects the card registered; a test runs them to play the mount (twice, to play Strict Mode). */
let effects: Array<() => void> = []
let slot = 0
let refs: Array<{ current: unknown }> = []
let refSlot = 0

type Found = { props: { onClick?: () => void; disabled?: boolean; children?: unknown } }

/** Find the first element of a given type (a tag name or a component; optionally one whose children mention some text) in a rendered tree. */
function findTag(node: unknown, tag: unknown, text?: string): Found | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findTag(child, tag, text)
      if (hit) return hit
    }
    return null
  }
  if (!node || typeof node !== "object") return null
  const el = node as { type?: unknown; props?: { children?: unknown } }
  if (el.type === tag && (!text || JSON.stringify(el.props?.children).includes(text))) return el as Found
  return findTag(el.props?.children, tag, text)
}

const PLAN = { kind: "populated" as const, fileCount: 3, archiveTarget: "records/.archive/events" }
const proposal = { companyId: "acme", commandId: "remove-department", actionType: "remove_department" as const, label: "Remove the Events department", fields: { slug: "events" } }
const LOADED = { plan: PLAN, revision: "r1" }
const NEW_PLAN = { kind: "populated" as const, fileCount: 5, archiveTarget: "records/.archive/events-2" }
const LONG_GIT_ERROR = `Saved locally; history update failed: ${"fatal: unable to write the index file ".repeat(10)}`
const HISTORY = { paths: ["definitions/departments.yaml", "records/.archive/events"], message: "chore(departments): remove events", error: LONG_GIT_ERROR }

function card() {
  slot = 0
  refSlot = 0
  return RemoveDepartmentProposalCard({ proposal })
}

const tick = () => new Promise((r) => setTimeout(r, 0))

async function press(el: unknown, label: string) {
  findTag(el, "button", label)!.props.onClick!()
  await tick()
}

describe("describeRemoval", () => {
  it("says an empty department has nothing to lose and that its empty folder is deleted", () => {
    expect(describeRemoval({ kind: "empty" })).toBe("This department is empty, so there are no files to lose. It will be removed from the list and its empty folder will be deleted.")
  })

  it("says a populated department's files are moved, not deleted, and where to", () => {
    const text = describeRemoval({ kind: "populated", fileCount: 3, archiveTarget: "archive/events" })
    expect(text).toContain("3 files")
    expect(text).toContain("archive/events")
    expect(text).toContain("moved")
    expect(text).toMatch(/nothing is deleted/i)
  })

  it("uses the singular for one file", () => {
    const text = describeRemoval({ kind: "populated", fileCount: 1, archiveTarget: "archive/events" })
    expect(text).toContain("1 file")
    expect(text).not.toContain("1 files")
  })
})

describe("RemoveDepartmentProposalCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setCalls = []
    initial = {}
    effects = []
    refs = []
    const reactAny = React as ReactWithInternals
    if (reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE) {
      reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = {
        useState: (fallback: unknown) => {
          const i = slot++
          const value = i in initial ? initial[i] : typeof fallback === "function" ? (fallback as () => unknown)() : fallback
          return [value, (next: unknown) => setCalls.push(next)]
        },
        useRef: (start: unknown) => (refs[refSlot++] ??= { current: start }),
        useEffect: (cb: () => void) => {
          effects.push(cb)
        },
      }
    }
  })

  it("shows the label, a Remove department button and a Keep it button, and acts on nothing by rendering", () => {
    const el = card()
    const str = JSON.stringify(el)
    expect(str).toContain("Remove the Events department")
    expect(findTag(el, "button", "Remove department")).not.toBeNull()
    expect(findTag(el, "button", "Keep it")).not.toBeNull()
    expect(planRemovalAction).not.toHaveBeenCalled()
    expect(removeDepartmentAction).not.toHaveBeenCalled()
  })

  it("keeps the Remove button disabled until the plan has loaded", () => {
    expect(JSON.stringify(card())).toContain("Looking at the department")
    expect(findTag(card(), "button", "Remove department")!.props.disabled).toBe(true)
    initial = { 0: "ready", 1: LOADED }
    const el = card()
    expect(findTag(el, "button", "Remove department")!.props.disabled).toBe(false)
    expect(JSON.stringify(el)).toContain(describeRemoval(PLAN).replace(/"/g, '\\"'))
  })

  it("loads the plan on mount, once even when the effect runs twice, and never removes", async () => {
    vi.mocked(planRemovalAction).mockResolvedValue({ ok: true, plan: PLAN, revision: "r1" })
    card()
    effects.forEach((run) => run())
    // Strict Mode: the same component instance (same ref) mounts its effect again.
    effects.forEach((run) => run())
    await tick()
    expect(planRemovalAction).toHaveBeenCalledTimes(1)
    expect(planRemovalAction).toHaveBeenCalledWith("acme", "events")
    expect(removeDepartmentAction).not.toHaveBeenCalled()
    expect(setCalls).toEqual([LOADED, "ready"])
  })

  it("shows the reason and keeps the button disabled when the plan cannot be loaded", async () => {
    vi.mocked(planRemovalAction).mockResolvedValue({ ok: false, code: "not-found", error: "Only departments you created can be removed here." })
    card()
    effects.forEach((run) => run())
    await tick()
    expect(setCalls).toEqual(["Only departments you created can be removed here.", "ready"])
    initial = { 0: "ready", 2: "Only departments you created can be removed here." }
    const el = card()
    expect(JSON.stringify(el)).toContain("Only departments you created can be removed here.")
    expect(findTag(el, "button", "Remove department")!.props.disabled).toBe(true)
  })

  it("removes the department with exactly the plan that was shown, only when the button is pressed", async () => {
    vi.mocked(removeDepartmentAction).mockResolvedValue({ ok: true, slug: "events", committed: true, commitPaths: [], commitMessage: "m" })
    initial = { 0: "ready", 1: LOADED }
    const el = card()
    expect(removeDepartmentAction).not.toHaveBeenCalled()
    await press(el, "Remove department")
    expect(removeDepartmentAction).toHaveBeenCalledTimes(1)
    expect(removeDepartmentAction).toHaveBeenCalledWith("acme", { slug: "events", expectedRevision: "r1", confirm: PLAN })
    expect(setCalls).toEqual(["removing", null, "removed"])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("says Removed. once it is done, and offers no more buttons", () => {
    initial = { 0: "removed", 1: LOADED }
    const el = card()
    expect(JSON.stringify(el)).toContain("Removed.")
    expect(JSON.stringify(el)).not.toContain("Nothing is removed until you press the button")
    expect(JSON.stringify(el)).not.toContain("will be moved")
    expect(findTag(el, "button", "Remove department")).toBeNull()
    expect(findTag(el, "button", "Keep it")).toBeNull()
  })

  it("on a conflict says so plainly, drops the old plan BEFORE looking again, removes nothing more, and ends with the new plan", async () => {
    vi.mocked(removeDepartmentAction).mockResolvedValue({ ok: false, code: "conflict", error: "definitions/departments.yaml changed while you were working. Reload and try again." })
    vi.mocked(planRemovalAction).mockResolvedValue({ ok: true, plan: NEW_PLAN, revision: "r2" })
    initial = { 0: "ready", 1: LOADED }
    await press(card(), "Remove department")
    const changed = "The department list changed while you were working. Check what will happen, then press Remove department again."
    // removing, error cleared, plain message, old plan dropped, loading, the fresh plan, ready.
    expect(setCalls).toEqual(["removing", null, changed, null, "loading", { plan: NEW_PLAN, revision: "r2" }, "ready"])
    expect(changed).not.toContain("definitions/")
    expect(removeDepartmentAction).toHaveBeenCalledTimes(1) // no auto-confirm of the new plan
    expect(planRemovalAction).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    // And what is then on screen is the new plan, with a button that would confirm exactly that one.
    initial = { 0: "ready", 1: { plan: NEW_PLAN, revision: "r2" } }
    const el = card()
    expect(JSON.stringify(el)).toContain("5 files")
    expect(JSON.stringify(el)).toContain("events-2")
    expect(JSON.stringify(el)).not.toContain("3 files")
  })

  it("on a stale result shows the action's own sentence, looks again, and removes nothing more", async () => {
    const stale = "This department changed since you looked at it. Review what will happen and confirm again."
    vi.mocked(removeDepartmentAction).mockResolvedValue({ ok: false, code: "stale", error: stale })
    vi.mocked(planRemovalAction).mockResolvedValue({ ok: true, plan: NEW_PLAN, revision: "r2" })
    initial = { 0: "ready", 1: LOADED }
    await press(card(), "Remove department")
    expect(setCalls).toEqual(["removing", null, stale, null, "loading", { plan: NEW_PLAN, revision: "r2" }, "ready"])
    expect(removeDepartmentAction).toHaveBeenCalledTimes(1)
    expect(planRemovalAction).toHaveBeenCalledTimes(1)
  })

  it("while it looks again there is no enabled Remove button on the old plan", () => {
    initial = { 0: "loading", 1: null, 2: "The department list changed while you were working. Check what will happen, then press Remove department again." }
    const el = card()
    expect(findTag(el, "button", "Remove department")!.props.disabled).toBe(true)
    expect(JSON.stringify(el)).toContain("Looking at the department")
    expect(JSON.stringify(el)).not.toContain("3 files")
  })

  it("if looking again fails, shows that plain message and keeps Remove disabled", async () => {
    vi.mocked(removeDepartmentAction).mockResolvedValue({ ok: false, code: "conflict", error: "x" })
    vi.mocked(planRemovalAction).mockResolvedValue({ ok: false, code: "not-found", error: "Only departments you created can be removed here." })
    initial = { 0: "ready", 1: LOADED }
    await press(card(), "Remove department")
    expect(setCalls.slice(-2)).toEqual(["Only departments you created can be removed here.", "ready"])
    expect(setCalls).not.toContainEqual(expect.objectContaining({ revision: expect.anything() }))
    initial = { 0: "ready", 2: "Only departments you created can be removed here." }
    expect(findTag(card(), "button", "Remove department")!.props.disabled).toBe(true)
  })

  describe("when the removal is done but its history entry failed", () => {
    /** Render the notice the card handed over, as a plain function (it has its own state). */
    function renderNotice(el: unknown) {
      const notice = findTag(el, HistoryNotice)!
      slot = 0
      initial = {} // the notice has its own state slots; the card's starting states do not apply to it
      return { notice, out: HistoryNotice(notice.props as never) }
    }
    const retryButton = (out: unknown) => findTag(out, Button, "Try saving history again")!

    it("holds what a retry needs instead of showing the raw error, and still refreshes", async () => {
      vi.mocked(removeDepartmentAction).mockResolvedValue({ ok: true, slug: "events", committed: false, commitError: LONG_GIT_ERROR, commitPaths: HISTORY.paths, commitMessage: HISTORY.message })
      initial = { 0: "ready", 1: LOADED }
      await press(card(), "Remove department")
      expect(setCalls).toEqual(["removing", null, HISTORY, "history-failed"])
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    it("shows a plain sentence and a retry button, not the long git error, and no Remove button", () => {
      initial = { 0: "history-failed", 1: LOADED, 3: HISTORY }
      const el = card()
      expect(findTag(el, "button", "Remove department")).toBeNull()
      expect(JSON.stringify(el)).not.toContain("will be moved")
      const { notice, out } = renderNotice(el)
      expect(notice.props).toMatchObject({ companyId: "acme", commitPaths: HISTORY.paths, commitMessage: HISTORY.message })
      const str = JSON.stringify(out)
      expect(str).toContain("Saved on this computer, but the history entry is missing.")
      expect(str).not.toContain("fatal: unable to write")
      expect(retryButton(out)).not.toBeNull()
    })

    it("pressing retry calls retryCommitAction once with the paths and message the action returned", async () => {
      vi.mocked(retryCommitAction).mockResolvedValue({ ok: true })
      initial = { 0: "history-failed", 1: LOADED, 3: HISTORY }
      const { out } = renderNotice(card())
      retryButton(out).props.onClick!()
      await tick()
      expect(retryCommitAction).toHaveBeenCalledTimes(1)
      expect(retryCommitAction).toHaveBeenCalledWith("acme", HISTORY.paths, HISTORY.message)
    })

    it("after a successful retry the card says Removed.", async () => {
      vi.mocked(retryCommitAction).mockResolvedValue({ ok: true })
      initial = { 0: "history-failed", 1: LOADED, 3: HISTORY }
      const { out } = renderNotice(card())
      retryButton(out).props.onClick!()
      await tick()
      expect(setCalls).toContain("removed")
      initial = { 0: "removed", 1: LOADED, 3: HISTORY }
      expect(JSON.stringify(card())).toContain("Removed.")
    })

    it("after a failed retry it shows a plain message and the card does not say Removed.", async () => {
      vi.mocked(retryCommitAction).mockResolvedValue({ ok: false, code: "failed", error: "History update failed again: the folder is locked" })
      initial = { 0: "history-failed", 1: LOADED, 3: HISTORY }
      const { out } = renderNotice(card())
      retryButton(out).props.onClick!()
      await tick()
      expect(setCalls).toContain("History update failed again: the folder is locked")
      expect(setCalls).not.toContain("removed")
    })
  })

  it("shows another refusal's own message and goes back to ready", async () => {
    vi.mocked(removeDepartmentAction).mockResolvedValue({ ok: false, code: "dirty", error: "records/events has changes that aren't saved to history yet. Save or discard them first." })
    initial = { 0: "ready", 1: LOADED }
    await press(card(), "Remove department")
    expect(setCalls).toEqual(["removing", null, "records/events has changes that aren't saved to history yet. Save or discard them first.", "ready"])
    expect(planRemovalAction).not.toHaveBeenCalled()
  })

  it("says it could not confirm the result when the request fails outright", async () => {
    vi.mocked(removeDepartmentAction).mockRejectedValue(new Error("offline"))
    initial = { 0: "ready", 1: LOADED }
    await press(card(), "Remove department")
    expect(setCalls[2]).toMatch(/Couldn't confirm the result/)
    expect(setCalls[3]).toBe("ready")
  })

  it("Keep it dismisses the card without calling anything", () => {
    initial = { 0: "ready", 1: LOADED }
    findTag(card(), "button", "Keep it")!.props.onClick!()
    expect(setCalls).toEqual(["dismissed"])
    expect(removeDepartmentAction).not.toHaveBeenCalled()
    initial = { 0: "dismissed" }
    expect(card()).toBeNull()
  })

  it("disables Remove while it is removing", () => {
    initial = { 0: "removing", 1: LOADED }
    expect(findTag(card(), "button", "Removing")!.props.disabled).toBe(true)
  })
})
