import { describe, it, expect } from "vitest"
import path from "node:path"
import { resolveDataDirFrom } from "./data-dir"

const CWD = "/Applications/Alacrán.app/Contents/Resources/app"
const HOME = "/Users/someone"

describe("resolveDataDirFrom", () => {
  it("uses the OS application-support dir in production, NOT the app bundle", () => {
    const dir = resolveDataDirFrom({ NODE_ENV: "production" }, CWD, HOME)
    expect(dir).toBe(path.join(HOME, "Library", "Application Support", "Alacrán"))
    // the whole point of this module: never inside the .app, which every
    // update replaces wholesale
    expect(dir.startsWith(CWD)).toBe(false)
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
