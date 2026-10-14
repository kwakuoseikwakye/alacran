import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React
vi.mock("@/lib/voice/voice-actions", () => ({ createElevenLabsAgent: vi.fn(), listElevenLabsVoices: vi.fn() }))
import { ElevenLabsAgentSetup } from "./elevenlabs-agent-setup"

const SENTENCE = "Your voice agent is out of date. Press Update agent to get the latest voice features."
const render = (initialOutdated: boolean) =>
  renderToStaticMarkup(React.createElement(ElevenLabsAgentSetup, { initialReady: true, initialOutdated, initialVoiceId: "v" }))

describe("ElevenLabsAgentSetup", () => {
  it("says the agent is out of date when the saved agent lacks the newer tools", () => {
    const html = render(true)
    expect(html).toContain(SENTENCE)
    expect(html).toContain("Update agent")
  })

  it("stays quiet for an up-to-date agent", () => {
    const html = render(false)
    expect(html).not.toContain("out of date")
    expect(html).toContain("ready")
  })
})
