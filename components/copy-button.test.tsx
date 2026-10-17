import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CopyButton } from "./copy-button"
import { copyText } from "@/lib/copy-text"

const hooks = vi.hoisted(() => ({
  useState: vi.fn(),
  useRef: vi.fn(),
  useEffect: vi.fn(),
}))
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(), ...hooks,
}))
vi.mock("@/lib/copy-text", () => ({ copyText: vi.fn() }))

const setCopied = vi.fn()
const setFailed = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  hooks.useState.mockReturnValueOnce([false, setCopied]).mockReturnValueOnce([false, setFailed])
  hooks.useRef.mockReturnValue({ current: null })
})
afterEach(() => vi.useRealTimers())

function button() {
  const tree = CopyButton({ text: "gh auth login" })
  return React.Children.toArray(tree.props.children)[0] as React.ReactElement<{ onClick: () => Promise<void> }>
}

describe("CopyButton", () => {
  it("shows confirmation only when the command was actually copied", async () => {
    vi.mocked(copyText).mockResolvedValue(true)
    await button().props.onClick()
    expect(copyText).toHaveBeenCalledWith("gh auth login")
    expect(setCopied).toHaveBeenCalledWith(true)
    expect(setFailed).toHaveBeenCalledWith(false)
    vi.advanceTimersByTime(1500)
    expect(setCopied).toHaveBeenLastCalledWith(false)
  })

  it("reports failed copying instead of swallowing it", async () => {
    vi.mocked(copyText).mockResolvedValue(false)
    await button().props.onClick()
    expect(setCopied).toHaveBeenCalledWith(false)
    expect(setFailed).toHaveBeenCalledWith(true)
  })

  it("renders an accessible manual-copy instruction after failure", () => {
    hooks.useState.mockReset()
    hooks.useState.mockReturnValueOnce([false, setCopied]).mockReturnValueOnce([true, setFailed])
    const tree = CopyButton({ text: "gh auth login" })
    const message = React.Children.toArray(tree.props.children)[1] as React.ReactElement<{ role: string; children: string }>
    expect(message.props.role).toBe("status")
    expect(message.props.children).toContain("Select the command and copy it manually")
  })
})
