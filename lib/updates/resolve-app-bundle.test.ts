import { describe, it, expect } from "vitest"
import { resolveAppBundlePath } from "./resolve-app-bundle"

describe("resolveAppBundlePath", () => {
  it("resolves the bundle from the payload dir the packaged launcher cd's into", () => {
    expect(resolveAppBundlePath("/Applications/Alacrán.app/Contents/Resources/app")).toBe(
      "/Applications/Alacrán.app"
    )
  })

  it("finds the bundle wherever it actually lives, not a hardcoded /Applications", () => {
    expect(resolveAppBundlePath("/Volumes/External/Apps/Alacrán.app/Contents/Resources/app")).toBe(
      "/Volumes/External/Apps/Alacrán.app"
    )
    expect(resolveAppBundlePath("/Users/me/Applications/Alacrán.app/Contents/Resources/app")).toBe(
      "/Users/me/Applications/Alacrán.app"
    )
  })

  // The guard that keeps `next dev` and any unpackaged checkout out of the
  // updater — without it, three-levels-up from a repo checkout is some
  // unrelated directory that would then get renamed.
  it("returns null when not running inside a .app payload", () => {
    expect(resolveAppBundlePath("/Users/me/code/control-panel")).toBeNull()
    expect(resolveAppBundlePath("/Users/me/code/control-panel/.next/standalone")).toBeNull()
    expect(resolveAppBundlePath("/")).toBeNull()
  })

  it("returns null when the tail matches but the container isn't a .app", () => {
    expect(resolveAppBundlePath("/tmp/NotAnApp/Contents/Resources/app")).toBeNull()
  })
})
