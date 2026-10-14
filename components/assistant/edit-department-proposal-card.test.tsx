import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

import { EditDepartmentProposalCard } from "./edit-department-proposal-card"
import { editDepartmentAction, getDepartmentForEditAction, retryCommitAction } from "@/lib/os/departments/actions"
import { HistoryNotice } from "@/components/os/departments/history-notice"
import { Button } from "@/components/ui/button"

vi.mock("@/lib/os/departments/actions", () => ({ editDepartmentAction: vi.fn(), getDepartmentForEditAction: vi.fn(), retryCommitAction: vi.fn() }))
const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

type ReactWithInternals = typeof React & {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { H?: Record<string, unknown> }
}

/** Every value any state setter was called with, in order. */
let setCalls: unknown[] = []
/** A starting value per state slot (0 status, 1 loaded, 2 name, 3 purpose, 4 colour, 5 error, 6 history). Slots 2-4 start from the proposal. */
let initial: Record<number, unknown> = {}
/** Mount effects the card registered; a test runs them to play the mount (twice, to play Strict Mode). */
let effects: Array<() => void> = []
let slot = 0
let refs: Array<{ current: unknown }> = []
let refSlot = 0

type Found = { props: { onClick?: () => void; onChange?: (e: unknown) => void; disabled?: boolean; value?: string; children?: unknown } }

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

/** The text boxes in document order: name, then purpose. */
function inputs(node: unknown, out: Found[] = []): Found[] {
  if (Array.isArray(node)) node.forEach((c) => inputs(c, out))
  else if (node && typeof node === "object") {
    const el = node as { type?: unknown; props?: { children?: unknown } }
    if (el.type === "input") out.push(el as Found)
    inputs(el.props?.children, out)
  }
  return out
}

const CURRENT = { slug: "sales", name: "Sales", purpose: "Win deals", color: "#0369a1" }
const LOADED = { department: CURRENT, revision: "r1" }
const CONFLICT = "The department changed while you were working. I've reloaded it — check the values, then press Save changes again."
const LONG_GIT_ERROR = `Saved locally; history update failed: ${"fatal: unable to write the index file ".repeat(10)}`
const HISTORY = { paths: ["definitions/departments.yaml"], message: "chore(departments): update Sales team", error: LONG_GIT_ERROR }

function proposal(fields: Record<string, string>) {
  return { companyId: "acme", commandId: "edit-department", actionType: "edit_department" as const, label: "Rename Sales", fields }
}

function card(fields: Record<string, string> = { slug: "sales" }) {
  slot = 0
  refSlot = 0
  return EditDepartmentProposalCard({ proposal: proposal(fields) })
}

const tick = () => new Promise((r) => setTimeout(r, 0))

async function save(el: unknown) {
  findTag(el, "button", "Save changes")!.props.onClick!()
  await tick()
}

describe("EditDepartmentProposalCard", () => {
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
        useId: () => ":r0:",
        useEffect: (cb: () => void) => {
          effects.push(cb)
        },
      }
    }
  })

  it("shows editable name and purpose boxes and a Save changes button, and saves nothing by rendering", () => {
    initial = { 0: "idle", 1: LOADED }
    const el = card({ slug: "sales", name: "Sales team" })
    const boxes = inputs(el)
    expect(boxes).toHaveLength(2)
    expect(findTag(el, "button", "Save changes")).not.toBeNull()
    expect(findTag(el, "button", "Dismiss")).not.toBeNull()
    expect(JSON.stringify(el)).toContain("Rename Sales")
    expect(editDepartmentAction).not.toHaveBeenCalled()
  })

  it("says it is loading, and keeps Save changes disabled, until the department has loaded", () => {
    const el = card()
    expect(JSON.stringify(el)).toContain("Loading the department")
    expect(findTag(el, "button", "Save changes")!.props.disabled).toBe(true)
  })

  it("fills the boxes from the proposal over the current department, and a field the proposal leaves out keeps the current value", () => {
    initial = { 0: "idle", 1: LOADED }
    const [name, purpose] = inputs(card({ slug: "sales", name: "Sales team" }))
    expect(name.props.value).toBe("Sales team")
    expect(purpose.props.value).toBe("Win deals") // left out: the current one, never empty
    const [name2, purpose2] = inputs(card({ slug: "sales", purpose: "Close the big ones" }))
    expect(name2.props.value).toBe("Sales")
    expect(purpose2.props.value).toBe("Close the big ones")
  })

  it("treats a blank field in the proposal as left out, not as an instruction to clear it", () => {
    initial = { 0: "idle", 1: LOADED }
    const [name, purpose] = inputs(card({ slug: "sales", name: "  ", purpose: "" }))
    expect(name.props.value).toBe("Sales")
    expect(purpose.props.value).toBe("Win deals")
  })

  it("loads the department on mount, once even when the effect runs twice, and never saves", async () => {
    vi.mocked(getDepartmentForEditAction).mockResolvedValue({ ok: true, department: CURRENT, revision: "r1" })
    card()
    effects.forEach((run) => run())
    effects.forEach((run) => run()) // Strict Mode: same instance, same ref
    await tick()
    expect(getDepartmentForEditAction).toHaveBeenCalledTimes(1)
    expect(getDepartmentForEditAction).toHaveBeenCalledWith("acme", "sales")
    expect(editDepartmentAction).not.toHaveBeenCalled()
    expect(setCalls).toEqual([LOADED, "idle"])
  })

  it("saves the proposal's values over the current ones at the revision it loaded, only when the button is pressed", async () => {
    vi.mocked(editDepartmentAction).mockResolvedValue({ ok: true, slug: "sales", committed: true, commitPaths: [], commitMessage: "m" })
    initial = { 0: "idle", 1: LOADED }
    const el = card({ slug: "sales", name: "Sales team", color: "#DC2626" })
    expect(editDepartmentAction).not.toHaveBeenCalled()
    await save(el)
    expect(editDepartmentAction).toHaveBeenCalledTimes(1)
    expect(editDepartmentAction).toHaveBeenCalledWith("acme", { slug: "sales", name: "Sales team", purpose: "Win deals", color: "#dc2626", expectedRevision: "r1" })
    expect(setCalls).toEqual(["saving", null, "saved"])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("keeps the current colour when the proposed one is not one of the offered colours", async () => {
    vi.mocked(editDepartmentAction).mockResolvedValue({ ok: true, slug: "sales", committed: true, commitPaths: [], commitMessage: "m" })
    initial = { 0: "idle", 1: LOADED }
    await save(card({ slug: "sales", name: "Sales team", color: "#123456" }))
    expect(vi.mocked(editDepartmentAction).mock.calls[0][1]).toMatchObject({ color: "#0369a1" })
  })

  it("sends what the owner typed over the proposal", async () => {
    vi.mocked(editDepartmentAction).mockResolvedValue({ ok: true, slug: "sales", committed: true, commitPaths: [], commitMessage: "m" })
    initial = { 0: "idle", 1: LOADED, 2: "Revenue" }
    await save(card({ slug: "sales", name: "Sales team" }))
    expect(vi.mocked(editDepartmentAction).mock.calls[0][1]).toMatchObject({ name: "Revenue" })
  })

  it("typing in a box sets just that box", () => {
    initial = { 0: "idle", 1: LOADED }
    const [name, purpose] = inputs(card())
    name.props.onChange!({ target: { value: "Revenue" } })
    purpose.props.onChange!({ target: { value: "Grow it" } })
    expect(setCalls).toEqual(["Revenue", "Grow it"])
  })

  it("on a conflict says it reloaded, drops the old revision BEFORE reading again, saves nothing more, and ends usable", async () => {
    vi.mocked(editDepartmentAction).mockResolvedValue({ ok: false, code: "conflict", error: "definitions/departments.yaml changed while you were working. Reload and try again." })
    vi.mocked(getDepartmentForEditAction).mockResolvedValue({ ok: true, department: CURRENT, revision: "r2" })
    initial = { 0: "idle", 1: LOADED }
    await save(card({ slug: "sales", name: "Sales team" }))
    // saving, error cleared, plain message, loaded dropped, loading, then the fresh read, then idle.
    expect(setCalls).toEqual(["saving", null, CONFLICT, null, "loading", { department: CURRENT, revision: "r2" }, "idle"])
    expect(CONFLICT).not.toContain("definitions/")
    expect(editDepartmentAction).toHaveBeenCalledTimes(1) // never auto-saved again
    expect(refresh).not.toHaveBeenCalled()
  })

  it("while it reads again after a conflict there is no Save button to press on the old revision", () => {
    initial = { 0: "loading", 1: null, 5: CONFLICT }
    const el = card({ slug: "sales", name: "Sales team" })
    expect(findTag(el, "button", "Save changes")!.props.disabled).toBe(true)
    expect(JSON.stringify(el)).toContain("Loading the department")
    expect(JSON.stringify(el)).toContain(CONFLICT)
  })

  it("if the read after a conflict fails, shows that plain message and keeps Save disabled", async () => {
    vi.mocked(editDepartmentAction).mockResolvedValue({ ok: false, code: "conflict", error: "x" })
    vi.mocked(getDepartmentForEditAction).mockResolvedValue({ ok: false, code: "not-found", error: "Only departments you created can be edited here." })
    initial = { 0: "idle", 1: LOADED }
    await save(card({ slug: "sales", name: "Sales team" }))
    expect(setCalls.slice(-2)).toEqual(["Only departments you created can be edited here.", "idle"])
    expect(setCalls).not.toContainEqual(expect.objectContaining({ revision: expect.anything() }))
    initial = { 0: "idle", 5: "Only departments you created can be edited here." }
    expect(findTag(card(), "button", "Save changes")!.props.disabled).toBe(true)
  })

  it("shows another refusal's own message and goes back to idle", async () => {
    vi.mocked(editDepartmentAction).mockResolvedValue({ ok: false, code: "invalid", error: "Say what this department is for." })
    initial = { 0: "idle", 1: LOADED }
    await save(card())
    expect(setCalls).toEqual(["saving", null, "Say what this department is for.", "idle"])
    expect(getDepartmentForEditAction).not.toHaveBeenCalled()
  })

  it("says it could not confirm the result when the request fails outright", async () => {
    vi.mocked(editDepartmentAction).mockRejectedValue(new Error("offline"))
    initial = { 0: "idle", 1: LOADED }
    await save(card())
    expect(setCalls[2]).toMatch(/Couldn't confirm the result/)
    expect(setCalls[3]).toBe("idle")
  })

  it("shows the load message and disables the button when the department cannot be loaded", async () => {
    vi.mocked(getDepartmentForEditAction).mockResolvedValue({ ok: false, code: "not-found", error: "Only departments you created can be edited here." })
    card()
    effects.forEach((run) => run())
    await tick()
    expect(setCalls).toEqual(["Only departments you created can be edited here.", "idle"])
    initial = { 0: "idle", 5: "Only departments you created can be edited here." }
    const el = card()
    expect(JSON.stringify(el)).toContain("Only departments you created can be edited here.")
    expect(findTag(el, "button", "Save changes")!.props.disabled).toBe(true)
  })

  it("disables Save changes for a blank name, and while saving", () => {
    initial = { 0: "idle", 1: LOADED, 2: "   " }
    expect(findTag(card(), "button", "Save changes")!.props.disabled).toBe(true)
    initial = { 0: "saving", 1: LOADED }
    expect(findTag(card(), "button", "Saving")!.props.disabled).toBe(true)
    initial = { 0: "idle", 1: LOADED }
    expect(findTag(card({ slug: "sales", name: "Sales team" }), "button", "Save changes")!.props.disabled).toBe(false)
  })

  it("disables Save changes when nothing would change, and says so", () => {
    initial = { 0: "idle", 1: LOADED }
    const noChange: Array<Record<string, string>> = [
      { slug: "sales" },
      { slug: "sales", name: "Sales", purpose: "Win deals", color: "#0369a1" },
      { slug: "sales", name: "Sales ", color: "#0369A1" }, // same after trimming and lower-casing
    ]
    for (const fields of noChange) {
      const el = card(fields)
      expect(findTag(el, "button", "Save changes")!.props.disabled, JSON.stringify(fields)).toBe(true)
      expect(JSON.stringify(el)).toContain("Nothing to save yet")
    }
    const changes: Array<Record<string, string>> = [{ slug: "sales", name: "Revenue" }, { slug: "sales", purpose: "Close deals" }, { slug: "sales", color: "#dc2626" }]
    for (const fields of changes) {
      const el = card(fields)
      expect(findTag(el, "button", "Save changes")!.props.disabled, JSON.stringify(fields)).toBe(false)
      expect(JSON.stringify(el)).not.toContain("Nothing to save yet")
    }
  })

  it("says Saved. once it is done, and Dismiss hides the card", () => {
    initial = { 0: "saved", 1: LOADED }
    const el = card()
    expect(JSON.stringify(el)).toContain("Saved.")
    expect(findTag(el, "button", "Save changes")).toBeNull()
    initial = { 0: "idle", 1: LOADED }
    findTag(card(), "button", "Dismiss")!.props.onClick!()
    expect(setCalls).toEqual(["dismissed"])
    initial = { 0: "dismissed" }
    expect(card()).toBeNull()
  })

  describe("when the change is saved but its history entry failed", () => {
    /** Render the notice the card handed over, as a plain function (it has its own state), and find a button in it. */
    function renderNotice(el: unknown) {
      const notice = findTag(el, HistoryNotice)!
      slot = 0
      initial = {} // the notice has its own state slots; the card's starting states do not apply to it
      return { notice, out: HistoryNotice(notice.props as never) }
    }
    const retryButton = (out: unknown) => findTag(out, Button, "Try saving history again")!

    it("keeps the change, refreshes, and holds what a retry needs instead of showing the raw error", async () => {
      vi.mocked(editDepartmentAction).mockResolvedValue({ ok: true, slug: "sales", committed: false, commitError: LONG_GIT_ERROR, commitPaths: HISTORY.paths, commitMessage: HISTORY.message })
      initial = { 0: "idle", 1: LOADED }
      await save(card({ slug: "sales", name: "Sales team" }))
      expect(setCalls).toEqual(["saving", null, HISTORY, "history-failed"])
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    it("shows a plain sentence and a retry button, not the long git error, and no Save button", () => {
      initial = { 0: "history-failed", 1: LOADED, 6: HISTORY }
      const el = card({ slug: "sales", name: "Sales team" })
      expect(findTag(el, "button", "Save changes")).toBeNull()
      expect(JSON.stringify(el)).not.toContain("Nothing is changed until you press the button")
      const { notice, out } = renderNotice(el)
      expect(notice.props).toMatchObject({ companyId: "acme", commitPaths: HISTORY.paths, commitMessage: HISTORY.message })
      const str = JSON.stringify(out)
      expect(str).toContain("Saved on this computer, but the history entry is missing.")
      expect(str).not.toContain("fatal: unable to write")
      expect(retryButton(out)).not.toBeNull()
    })

    it("pressing retry calls retryCommitAction once with the paths and message the action returned", async () => {
      vi.mocked(retryCommitAction).mockResolvedValue({ ok: true })
      initial = { 0: "history-failed", 1: LOADED, 6: HISTORY }
      const { out } = renderNotice(card({ slug: "sales", name: "Sales team" }))
      retryButton(out).props.onClick!()
      await tick()
      expect(retryCommitAction).toHaveBeenCalledTimes(1)
      expect(retryCommitAction).toHaveBeenCalledWith("acme", HISTORY.paths, HISTORY.message)
    })

    it("after a successful retry the card says Saved.", async () => {
      vi.mocked(retryCommitAction).mockResolvedValue({ ok: true })
      initial = { 0: "history-failed", 1: LOADED, 6: HISTORY }
      const { out } = renderNotice(card({ slug: "sales", name: "Sales team" }))
      retryButton(out).props.onClick!()
      await tick()
      expect(setCalls).toContain("saved")
      initial = { 0: "saved", 1: LOADED, 6: HISTORY }
      expect(JSON.stringify(card())).toContain("Saved.")
    })

    it("after a failed retry it shows a plain message and the card does not say Saved.", async () => {
      vi.mocked(retryCommitAction).mockResolvedValue({ ok: false, code: "failed", error: "History update failed again: the folder is locked" })
      initial = { 0: "history-failed", 1: LOADED, 6: HISTORY }
      const { out } = renderNotice(card({ slug: "sales", name: "Sales team" }))
      retryButton(out).props.onClick!()
      await tick()
      expect(setCalls).toContain("History update failed again: the folder is locked")
      expect(setCalls).not.toContain("saved")
    })
  })
})
