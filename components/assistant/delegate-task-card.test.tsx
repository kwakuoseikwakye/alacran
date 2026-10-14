import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
globalThis.React = React

import { DelegateTaskCard, delegateMessage } from "./delegate-task-card"

type ReactWithInternals = typeof React & {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { H?: Record<string, unknown> }
}

/** Every value any state setter was called with, in order. */
let setCalls: unknown[] = []
/** A starting value per slot (0 task, 1 status, 2 message), to render the card as if it were already in a state. */
let initial: Record<number, unknown> = {}

type Found = { props: { onClick?: () => void; children?: unknown } }

/** Find the first element of a given tag (optionally one whose children mention some text) in a rendered tree. */
function findTag(node: unknown, tag: string, text?: string): Found | null {
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

function proposal(task: string, companyId = "acme") {
  return { companyId, commandId: "delegate-task", actionType: "delegate_task" as const, label: "Send to Acme's agent", fields: { task } }
}

function card(task: string, companyId?: string) {
  return DelegateTaskCard({ proposal: proposal(task, companyId), companyName: "Acme" })
}

async function press(el: unknown) {
  findTag(el, "button", "Send to my agent")!.props.onClick!()
  await new Promise((r) => setTimeout(r, 0))
}

const NOTE =
  "This is typed into your newest agent tab as keystrokes, ending with Enter. If your agent is waiting for you to answer something, answer it in Terminal first, or this Enter will answer it."
const ADDS = 'Alacrán adds: "When you finish, save a short summary of what you did in a notes file."'
const ADDS_JSON = JSON.stringify(ADDS).slice(1, -1)
const BANG = 'A task can\'t start with "!": your agent would run it as a command line without asking you. Reword it.'
const BANG_JSON = JSON.stringify(BANG).slice(1, -1)
const COMMAND_NOTE = 'This starts with "/" or "!", so your agent will treat it as a command rather than a message.'
// Inside JSON.stringify output the quotes are escaped.
const COMMAND_NOTE_JSON = JSON.stringify(COMMAND_NOTE).slice(1, -1)
const GENERIC = "Couldn't send that. Try again."

describe("DelegateTaskCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setCalls = []
    initial = {}
    let hooks = 0
    const reactAny = React as ReactWithInternals
    if (reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE) {
      reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = {
        useState: (fallback: unknown) => {
          const slot = hooks++ % 3
          const value = slot in initial ? initial[slot] : typeof fallback === "function" ? (fallback as () => unknown)() : fallback
          return [value, (next: unknown) => setCalls.push(next)]
        },
      }
    }
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows the task in a capped textarea, the plain note, and a send button", () => {
    const str = JSON.stringify(card("Draft the plan"))
    expect(str).toContain("textarea")
    expect(str).toContain('"maxLength":4000')
    expect(str).toContain("Draft the plan")
    expect(str).toContain(NOTE)
    expect(str).toContain(ADDS_JSON)
    expect(str).toContain("Send to my agent")
    expect(str).toContain("Type this into your agent as if you typed it")
    expect(str).not.toContain('"disabled":true')
  })

  it("disables the button while the task is blank", () => {
    const str = JSON.stringify(card("   "))
    expect(str).toContain('"disabled":true')
    expect(str).toContain("Say what you want your agent to do first")
  })

  it("treats a task of only control characters as blank, since nothing would be typed", () => {
    const str = JSON.stringify(card("\u0001\u001b\u0085 \n"))
    expect(str).toContain('"disabled":true')
    expect(str).toContain("Say what you want your agent to do first")
  })

  it("sends the task to that company's terminal route, once, only when the button is pressed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Sent." }) })
    vi.stubGlobal("fetch", fetchMock)
    const el = card("Draft the plan")
    expect(fetchMock).not.toHaveBeenCalled()
    await press(el)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith("/api/terminal/acme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "delegate-task", task: "Draft the plan" }),
    })
    expect(setCalls).toEqual(["sending", "Sent.", "sent"])
  })

  it("encodes the company id in the route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Sent." }) })
    vi.stubGlobal("fetch", fetchMock)
    await press(card("Draft the plan", "acme co"))
    expect(fetchMock.mock.calls[0][0]).toBe("/api/terminal/acme%20co")
  })

  it("shows the server's reason when it refuses", async () => {
    const message = "Your agent isn't open for Acme. Open it in Terminal, then send again."
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message }) }))
    await press(card("Draft the plan"))
    expect(setCalls).toEqual(["sending", message, "error"])
  })

  it("says it could not send when the request fails outright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    await press(card("Draft the plan"))
    expect(setCalls).toEqual(["sending", GENERIC, "error"])
  })

  it("gives the generic message when a refusal has no readable body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error("not json") } }))
    await press(card("Draft the plan"))
    expect(setCalls).toEqual(["sending", GENERIC, "error"])
  })

  // The server answers 200 only after it has typed the text, so an unreadable body must never read as a
  // failure: "Try again" there would type the same task into the agent twice.
  it("still reports sent when a 200 has no readable body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("not json") } }))
    await press(card("Draft the plan"))
    expect(setCalls).toEqual(["sending", "Sent to your agent.", "sent"])
  })

  it("keeps the text and goes back to idle when Try again is pressed", () => {
    initial = { 1: "error", 2: "Your agent isn't open for Acme. Open it in Terminal, then send again." }
    const el = card("Draft the plan")
    const str = JSON.stringify(el)
    expect(str).toContain("Your agent isn't open for Acme.")
    expect(str).toContain("Draft the plan")
    findTag(el, "button", "Try again")!.props.onClick!()
    expect(setCalls).toEqual(["idle"]) // the task is not touched, so the text stays
  })

  it("keeps the send button mounted but disabled while sending, once sent, and after an error", () => {
    for (const [status, label] of [["sending", "Sending…"], ["sent", "Sent"], ["error", "Send to my agent"]] as const) {
      initial = { 1: status, 2: "msg" }
      const button = findTag(card("Draft the plan"), "button", label)
      expect(button, status).not.toBeNull()
      expect(JSON.stringify(button), status).toContain('"disabled":true')
    }
  })

  it("announces a sent task politely", () => {
    initial = { 1: "sent", 2: "Sent. Watch your agent." }
    const str = JSON.stringify(card("Draft the plan"))
    expect(str).toContain('"role":"status"')
    expect(str).toContain("Sent. Watch your agent.")
  })

  describe("the slash warning reads the text that will actually be typed", () => {
    it.each([
      ["a slash", "/clear everything"],
      ["a control character before a slash", "\u001b/clear"],
      ["a control character and space before a slash", "\u0001 /x"],
    ])("warns for %s, and still lets it be sent", (_name, task) => {
      const el = card(task)
      expect(JSON.stringify(el)).toContain(COMMAND_NOTE_JSON)
      expect(JSON.stringify(findTag(el, "button", "Send to my agent"))).not.toContain('"disabled":true')
    })

    it.each([
      ["ordinary text", "Draft the plan / the budget!"],
      ["a control character before ordinary text", "\u0001 hello"],
    ])("does not warn for %s", (_name, task) => {
      const str = JSON.stringify(card(task))
      expect(str).not.toContain("will treat it as a command")
      expect(str).not.toContain(BANG_JSON)
    })

    it("makes the warning stand out from the ordinary note", () => {
      const warning = findTag(card("/clear"), "p", "will treat it as a command")
      expect(JSON.stringify(warning)).toContain("text-amber")
    })
  })

  // A leading "!" is a command line in Claude Code that runs with no permission prompt, and the server
  // refuses it, so the card says so and does not offer to send.
  describe("a task that starts with a bang", () => {
    it.each([
      ["a plain bang", "!ls"],
      ["a bang after spaces", "  !ls"],
      ["a bang after a control character", "\u0001!ls"],
      ["a bang after a C1 control", "\u0085!ls"],
    ])("disables Send and shows the reason for %s", (_name, task) => {
      const el = card(task)
      const str = JSON.stringify(el)
      expect(JSON.stringify(findTag(el, "button", "Send to my agent"))).toContain('"disabled":true')
      expect(str).toContain(BANG_JSON)
      expect(str).not.toContain("will treat it as a command") // the old slash/bang warning is gone for "!"
      expect(JSON.stringify(findTag(el, "p", "can't start with"))).toContain("text-amber")
    })

    it("does not disable Send for a bang later in the text", () => {
      const el = card("Say hi!")
      expect(JSON.stringify(findTag(el, "button", "Send to my agent"))).not.toContain('"disabled":true')
      expect(JSON.stringify(el)).not.toContain(BANG_JSON)
    })
  })

  it("lets a long task grow the box instead of hiding the end of it", () => {
    const textarea = findTag(card("Draft the plan"), "textarea") as unknown as {
      props: { rows: number; maxLength: number; style: Record<string, string>; className: string }
    }
    expect(textarea.props.rows).toBe(4)
    expect(textarea.props.maxLength).toBe(4000)
    expect(textarea.props.style).toMatchObject({ fieldSizing: "content" })
    expect(textarea.props.style.maxHeight).toBeTruthy()
    expect(textarea.props.className).toContain("overflow-y-auto")
  })

  // The server answers 200 after typing, so a JSON `null` body must read as sent, not throw into "error".
  it("still reports sent when a 200 body is JSON null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => null }))
    await press(card("Draft the plan"))
    expect(setCalls).toEqual(["sending", "Sent to your agent.", "sent"])
  })

  it("gives the generic message when a refusal body is JSON null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => null }))
    await press(card("Draft the plan"))
    expect(setCalls).toEqual(["sending", GENERIC, "error"])
  })
})

describe("delegateMessage", () => {
  it("returns the server's message", () => {
    expect(delegateMessage({ message: "Your agent isn't open for Acme. Open it in Terminal, then send again." })).toBe(
      "Your agent isn't open for Acme. Open it in Terminal, then send again."
    )
  })

  it("falls back when there is none", () => {
    expect(delegateMessage({})).toBe(GENERIC)
    expect(delegateMessage(null)).toBe(GENERIC)
    expect(delegateMessage({ message: 5 })).toBe(GENERIC)
  })
})
