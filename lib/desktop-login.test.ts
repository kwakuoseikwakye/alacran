import { afterEach, describe, expect, it } from "vitest"
import { desktopLogin } from "./desktop-login"

function withWindow(value: unknown) {
  ;(globalThis as { window?: unknown }).window = value
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe("desktopLogin", () => {
  it("is null on the server, in a browser, and in a shell built before the bridge", () => {
    expect(desktopLogin()).toBeNull()
    withWindow({})
    expect(desktopLogin()).toBeNull()
    withWindow({ alacran: { shell: "mac", dialog: {} } })
    expect(desktopLogin()).toBeNull()
  })

  it("is the bridge when the shell publishes one", () => {
    const login = { get: async () => false, set: async (open: boolean) => open }
    withWindow({ alacran: { shell: "mac", login } })
    expect(desktopLogin()).toBe(login)
  })
})
