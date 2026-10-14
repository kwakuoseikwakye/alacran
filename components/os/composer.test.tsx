import { describe, it, expect, vi, afterEach } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React
import { Composer, COMPOSER_MAX_H, composerHeight, sendToAssistant } from "./composer"
import { ASSISTANT_OPEN_EVENT } from "./assistant-dock"

describe("Composer", () => {
  it("is one growing text box and a send button that waits for words", () => {
    const html = renderToStaticMarkup(React.createElement(Composer, { companyId: "acme", placeholder: "Ask anything" }))
    expect(html).toContain("<textarea")
    expect(html).toContain('placeholder="Ask anything"')
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/)
  })

  it("grows with what you type, up to a cap", () => {
    expect(composerHeight(32)).toBe(32)
    expect(composerHeight(90)).toBe(90)
    expect(composerHeight(900)).toBe(COMPOSER_MAX_H)
  })
})

describe("sendToAssistant", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("opens the assistant on this company with the question, trimmed", () => {
    const sent: Array<{ type: string; detail: unknown }> = []
    vi.stubGlobal("window", { dispatchEvent: (event: CustomEvent) => sent.push({ type: event.type, detail: event.detail }) })
    expect(sendToAssistant("  who needs a follow-up?  ", "acme")).toBe(true)
    expect(sent).toEqual([{ type: ASSISTANT_OPEN_EVENT, detail: { prompt: "who needs a follow-up?", companyId: "acme" } }])
  })

  it("sends nothing for an empty box", () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal("window", { dispatchEvent })
    expect(sendToAssistant("   ", "acme")).toBe(false)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })
})
