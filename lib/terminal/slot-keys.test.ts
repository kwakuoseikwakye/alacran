import { describe, expect, it } from "vitest"
import { slotKeyAction } from "./slot-keys"

const key = (over: Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }>) => ({
  key: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...over,
})
/** Focus in the workspace, outside any field, page visible. */
const ctx = (over: Partial<Parameters<typeof slotKeyAction>[1]> = {}) => ({
  isMac: true,
  inTerminal: false,
  hidden: false,
  inWorkspace: true,
  inField: false,
  ...over,
})

describe("slotKeyAction", () => {
  it("⌘1–⌘8 on a Mac, Ctrl elsewhere, focus a slot", () => {
    expect(slotKeyAction(key({ key: "3", metaKey: true }), ctx({ isMac: true, inTerminal: true }))).toEqual({ type: "focus", index: 2 })
    expect(slotKeyAction(key({ key: "3", ctrlKey: true }), ctx({ isMac: false, inTerminal: true }))).toEqual({ type: "focus", index: 2 })
    expect(slotKeyAction(key({ key: "3", ctrlKey: true }), ctx({ isMac: true, inTerminal: true }))).toBeNull() // Ctrl on a Mac is the terminal's
    expect(slotKeyAction(key({ key: "9", metaKey: true }), ctx({ isMac: true, inTerminal: false }))).toBeNull()
  })

  it("⌘↵ toggles grid and focus", () => {
    expect(slotKeyAction(key({ key: "Enter", metaKey: true }), ctx({ isMac: true, inTerminal: true }))).toEqual({ type: "toggle" })
  })

  it("Esc returns to the grid only outside a terminal — inside, it belongs to the program", () => {
    expect(slotKeyAction(key({ key: "Escape" }), ctx({ isMac: true, inTerminal: false }))).toEqual({ type: "grid" })
    expect(slotKeyAction(key({ key: "Escape" }), ctx({ isMac: true, inTerminal: true }))).toBeNull()
  })

  it("leaves other keys alone", () => {
    expect(slotKeyAction(key({ key: "a", metaKey: true }), ctx({ isMac: true, inTerminal: false }))).toBeNull()
    expect(slotKeyAction(key({ key: "1", metaKey: true, altKey: true }), ctx({ isMac: true, inTerminal: false }))).toBeNull()
  })

  it("does nothing while the terminal page isn't the one on screen", () => {
    for (const k of [key({ key: "1", metaKey: true }), key({ key: "Enter", metaKey: true }), key({ key: "Escape" })]) {
      expect(slotKeyAction(k, ctx({ hidden: true }))).toBeNull()
    }
  })

  it("leaves a key something else already handled — Esc closing a dialog", () => {
    expect(slotKeyAction({ ...key({ key: "Escape" }), defaultPrevented: true }, ctx())).toBeNull()
  })

  it("⌘↵ and Esc only count in the workspace and outside a text field; ⌘1–⌘8 anywhere on the page", () => {
    expect(slotKeyAction(key({ key: "Enter", metaKey: true }), ctx({ inWorkspace: false }))).toBeNull() // a sheet's own Start (⌘↵)
    expect(slotKeyAction(key({ key: "Enter", metaKey: true }), ctx({ inField: true }))).toBeNull()
    expect(slotKeyAction(key({ key: "Escape" }), ctx({ inWorkspace: false }))).toBeNull()
    expect(slotKeyAction(key({ key: "Escape" }), ctx({ inField: true }))).toBeNull()
    expect(slotKeyAction(key({ key: "2", metaKey: true }), ctx({ inWorkspace: false, inField: true }))).toEqual({ type: "focus", index: 1 })
  })
})
