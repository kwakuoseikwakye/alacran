import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import { HumanoidAvatar } from "./humanoid-avatar"

describe("HumanoidAvatar", () => {
  it("renders full centerpiece mode when idle", () => {
    const onToggle = vi.fn()
    const html = renderToString(
      React.createElement(HumanoidAvatar, {
        mode: "idle",
        onToggle,
      })
    )
    expect(html).toContain("Talk")
    expect(html).toContain("Speak")
    expect(html).toContain("Tap to talk or hold Spacebar")
    expect(html).not.toContain("<canvas") // Verifies 3D canvas orb is completely removed
  })

  it("renders listening mode with live reactive indicator", () => {
    const onToggle = vi.fn()
    const html = renderToString(
      React.createElement(HumanoidAvatar, {
        mode: "listening",
        onToggle,
      })
    )
    expect(html).toContain("Stop")
    expect(html).toContain("Listening...")
    expect(html).toContain("Speak now — tap to finish")
  })

  it("renders thinking mode with loader", () => {
    const onToggle = vi.fn()
    const html = renderToString(
      React.createElement(HumanoidAvatar, {
        mode: "thinking",
        onToggle,
      })
    )
    expect(html).toContain("Thinking...")
    expect(html).toContain("Consulting company context &amp; files")
  })

  it("renders compact mode for docked conversations", () => {
    const onToggle = vi.fn()
    const html = renderToString(
      React.createElement(HumanoidAvatar, {
        mode: "idle",
        onToggle,
        compact: true,
      })
    )
    expect(html).toContain("Speak")
    expect(html).toContain("Tap to talk or hold Spacebar")
  })
})
