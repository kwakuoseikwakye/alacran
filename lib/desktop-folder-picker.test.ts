import { afterEach, describe, expect, it } from "vitest"
import { chooseFolder, desktopFolderPicker, type DesktopFolderPicker } from "./desktop-folder-picker"

/** vitest runs in a node environment, so there is no `window` unless one is set. */
function withWindow(value: unknown) {
  ;(globalThis as { window?: unknown }).window = value
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe("desktopFolderPicker", () => {
  it("is null with no window at all — the server render must not throw", () => {
    expect(desktopFolderPicker()).toBeNull()
  })

  it("is null in a plain browser, where there is no bridge", () => {
    withWindow({})
    expect(desktopFolderPicker()).toBeNull()
  })

  it("is null in a shell built before this bridge existed", () => {
    // The gate is the dialog's own presence, never the shell string: an older
    // mac bundle still reports "mac" and has no dialog to call.
    withWindow({ alacran: { shell: "mac", update: {}, mic: {} } })
    expect(desktopFolderPicker()).toBeNull()
  })

  it("is the bridge when the shell publishes one", () => {
    const dialog = { pickDirectory: async () => ({ path: null }) }
    withWindow({ alacran: { shell: "mac", dialog } })
    expect(desktopFolderPicker()).toBe(dialog)
  })
})

describe("chooseFolder", () => {
  const picker = (path: string | null): DesktopFolderPicker => ({
    pickDirectory: async () => ({ path }),
  })

  it("answers null when the user dismisses the dialog", async () => {
    expect(await chooseFolder(picker(null))).toBeNull()
  })

  it("answers null when the shell refuses a second concurrent dialog", async () => {
    // Same shape as a cancel on purpose — both mean "nothing was chosen".
    expect(await chooseFolder(picker(""))).toBeNull()
  })

  it("returns the path plus the folder's own name, as the in-app browser does", async () => {
    expect(await chooseFolder(picker("/Users/ama/Work/acme"))).toEqual({
      path: "/Users/ama/Work/acme",
      name: "acme",
    })
  })

  it("ignores a trailing separator when naming the folder", async () => {
    expect(await chooseFolder(picker("/Users/ama/Work/acme/"))).toEqual({
      path: "/Users/ama/Work/acme/",
      name: "acme",
    })
  })

  it("falls back to the path itself when there is no name to take", async () => {
    expect(await chooseFolder(picker("/"))).toEqual({ path: "/", name: "/" })
  })
})
