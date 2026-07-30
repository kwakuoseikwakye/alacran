import { describe, it, expect } from "vitest"
import path from "node:path"
import { resolveDataDirFrom } from "./data-dir"

const CWD = "/Applications/Alacrán.app/Contents/Resources/app"
const HOME = "/Users/someone"

describe("resolveDataDirFrom", () => {
  it("uses the OS application-support dir in production on macOS, NOT the app bundle", () => {
    const dir = resolveDataDirFrom({ NODE_ENV: "production" }, CWD, HOME, "darwin")
    expect(dir).toBe(path.join(HOME, "Library", "Application Support", "Alacrán"))
    // the whole point of this module: never inside the .app, which every
    // update replaces wholesale
    expect(dir.startsWith(CWD)).toBe(false)
  })

  it("uses the XDG default data dir in production on Linux", () => {
    const dir = resolveDataDirFrom({ NODE_ENV: "production" }, CWD, HOME, "linux")
    expect(dir).toBe(path.join(HOME, ".local", "share", "Alacrán"))
  })

  it("respects $XDG_DATA_HOME in production on Linux when set", () => {
    const env = { NODE_ENV: "production", XDG_DATA_HOME: "/custom/xdg-data" }
    const dir = resolveDataDirFrom(env, CWD, HOME, "linux")
    expect(dir).toBe(path.join("/custom/xdg-data", "Alacrán"))
  })

  it("ignores a blank $XDG_DATA_HOME on Linux and falls back to the default", () => {
    const env = { NODE_ENV: "production", XDG_DATA_HOME: "   " }
    const dir = resolveDataDirFrom(env, CWD, HOME, "linux")
    expect(dir).toBe(path.join(HOME, ".local", "share", "Alacrán"))
  })

  it("keeps writing into the repo's .data during development", () => {
    const dir = resolveDataDirFrom({ NODE_ENV: "development" }, "/repo", HOME)
    expect(dir).toBe(path.join("/repo", ".data"))
  })

  it("treats a missing NODE_ENV as non-production", () => {
    expect(resolveDataDirFrom({}, "/repo", HOME)).toBe(path.join("/repo", ".data"))
  })

  it("lets an explicit ALACRAN_DATA_DIR override win everywhere", () => {
    const env = { ALACRAN_DATA_DIR: "/custom/spot", NODE_ENV: "production" }
    expect(resolveDataDirFrom(env, CWD, HOME)).toBe("/custom/spot")
  })

  it("ignores a blank or whitespace-only override", () => {
    const env = { ALACRAN_DATA_DIR: "   ", NODE_ENV: "production" }
    expect(resolveDataDirFrom(env, CWD, HOME)).toBe(
      path.join(HOME, "Library", "Application Support", "Alacrán")
    )
  })
})
