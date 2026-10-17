import { afterEach, describe, expect, it, vi } from "vitest"
import { copyText } from "./copy-text"

function legacyClipboard(result = true) {
  const previousFocus = { focus: vi.fn() }
  const textarea = {
    value: "", style: {}, setAttribute: vi.fn(),
    focus: vi.fn(), select: vi.fn(), remove: vi.fn(),
  }
  const doc = {
    activeElement: previousFocus,
    body: { appendChild: vi.fn() },
    createElement: vi.fn(() => textarea),
    execCommand: vi.fn(() => result),
  }
  vi.stubGlobal("document", doc)
  return { doc, textarea, previousFocus }
}

afterEach(() => vi.unstubAllGlobals())

describe("copyText", () => {
  it("copies the exact command using the Clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    expect(await copyText("gh auth login")).toBe(true)
    expect(writeText).toHaveBeenCalledWith("gh auth login")
  })

  it("falls back when the desktop webview has no Clipboard API", async () => {
    vi.stubGlobal("navigator", {})
    const { doc, textarea, previousFocus } = legacyClipboard()
    expect(await copyText("command --flag\nsecond line")).toBe(true)
    expect(textarea.value).toBe("command --flag\nsecond line")
    expect(doc.body.appendChild).toHaveBeenCalledWith(textarea)
    expect(textarea.select).toHaveBeenCalledOnce()
    expect(doc.execCommand).toHaveBeenCalledWith("copy")
    expect(textarea.remove).toHaveBeenCalledOnce()
    expect(previousFocus.focus).toHaveBeenCalledOnce()
  })

  it("falls back when the desktop shell denies Clipboard API permission", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) } })
    const { doc } = legacyClipboard()
    expect(await copyText("gh auth login")).toBe(true)
    expect(doc.execCommand).toHaveBeenCalledWith("copy")
  })

  it("reports failure when the fallback refuses to copy", async () => {
    vi.stubGlobal("navigator", {})
    const { textarea, previousFocus } = legacyClipboard(false)
    expect(await copyText("gh auth login")).toBe(false)
    expect(textarea.remove).toHaveBeenCalledOnce()
    expect(previousFocus.focus).toHaveBeenCalledOnce()
  })

  it("cleans up and restores focus even if the fallback throws", async () => {
    vi.stubGlobal("navigator", {})
    const { doc, textarea, previousFocus } = legacyClipboard()
    doc.execCommand.mockImplementation(() => { throw new Error("unsupported") })
    expect(await copyText("gh auth login")).toBe(false)
    expect(textarea.remove).toHaveBeenCalledOnce()
    expect(previousFocus.focus).toHaveBeenCalledOnce()
  })

  it("reports failure without a browser document", async () => {
    vi.stubGlobal("navigator", {})
    expect(await copyText("gh auth login")).toBe(false)
  })
})
