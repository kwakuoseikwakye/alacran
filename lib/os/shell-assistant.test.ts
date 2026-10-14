import { describe, it, expect } from "vitest"
import { buildShellAssistant } from "./shell-assistant"

const view = {
  providerId: "elevenlabs" as const,
  hasKey: true,
  persona: null,
  assistantExecutorId: "claude-code" as const,
  elevenlabsAgentReady: true,
  elevenlabsAgentOutdated: false,
  elevenlabsVoiceId: "v",
  autoDispatchCompanies: [] as string[],
}

describe("buildShellAssistant", () => {
  it("passes elevenlabsAgentReady through, true and false", () => {
    expect(buildShellAssistant([], view, null).elevenlabsAgentReady).toBe(true)
    expect(buildShellAssistant([], { ...view, elevenlabsAgentReady: false }, null).elevenlabsAgentReady).toBe(false)
  })

  it("is ready only when the provider's key is saved", () => {
    expect(buildShellAssistant([], { ...view, hasKey: false }, null).voiceReady).toBe(false)
  })
})
