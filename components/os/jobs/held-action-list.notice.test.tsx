import { describe, it, expect, vi } from "vitest"
import React from "react"
globalThis.React = React

// A tiny hook harness (no DOM here): state persists across calls of the component function, the
// way it does across a router.refresh() while the component stays mounted.
const states: unknown[] = []
let at = 0
vi.mock("react", async (orig) => {
  const real = await orig<typeof import("react")>()
  return {
    ...real,
    default: real,
    useState: (init: unknown) => {
      const i = at++
      if (!(i in states)) states[i] = init
      return [states[i], (v: unknown) => (states[i] = v)]
    },
    useTransition: () => [false, (fn: () => Promise<void>) => void (pending = fn())],
    useRef: () => ({ current: null }),
    useEffect: () => {},
  }
})
let pending: Promise<void> = Promise.resolve()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const approveHeldAction = vi.fn(async () => ({ ok: true, message: "Sent 1." }))
vi.mock("@/lib/jobs/actions", () => ({ approveHeldAction: () => approveHeldAction(), rejectHeldAction: vi.fn() }))

import { HeldActionList } from "./held-action-list"
import type { HeldAction } from "@/lib/jobs/store"

const item: HeldAction = {
  id: "1",
  key: "k",
  jobId: "j",
  runId: "r",
  row: "publication",
  title: "Email Ama",
  detail: "",
  createdAt: "2026-10-26T09:00:00.000Z",
  status: "pending",
  mail: { to: "ama@x.com", subject: "Hi", body: "Hello" },
}

function render(items: HeldAction[]) {
  at = 0
  return HeldActionList({ companyId: "acme", items, now: 0 })
}
function find(node: unknown, match: (el: React.ReactElement) => boolean): React.ReactElement | null {
  if (Array.isArray(node)) return node.map((n) => find(n, match)).find(Boolean) ?? null
  if (!React.isValidElement(node)) return null
  if (match(node)) return node
  return find((node.props as { children?: unknown }).children, match)
}
const text = (node: unknown): string =>
  Array.isArray(node) ? node.map(text).join("") : React.isValidElement(node) ? text((node.props as { children?: unknown }).children) : node == null || node === false ? "" : String(node)

describe("HeldActionList after a decision", () => {
  it("AC9/AC11: the result is still said once the queue it decided has emptied", async () => {
    const before = render([item])
    const approve = find(before, (el) => text(el) === "Approve and send" && "onClick" in (el.props as object))!
    ;(approve.props as { onClick: () => void }).onClick()
    await pending
    // router.refresh() brings back an empty queue; the component is still mounted.
    const after = render([])
    expect(after).not.toBeNull()
    expect(text(find(after, (el) => (el.props as { role?: string }).role === "status"))).toBe("Sent 1.")
  })
})
