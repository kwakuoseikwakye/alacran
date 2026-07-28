import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { readLicense, writeLicense } from "./license-store"

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "license-store-"))
  file = path.join(dir, "nested", "license.json")
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("license-store", () => {
  it("returns null when the file doesn't exist", () => {
    expect(readLicense(file)).toBeNull()
  })

  it("round-trips a stored license (creating the parent dir)", () => {
    const license = { key: "K-1", lastValidatedAt: 123, lastResult: "valid" as const }
    writeLicense(license, file)
    expect(readLicense(file)).toEqual(license)
  })

  it("returns null for corrupt JSON", async () => {
    const { writeFile } = await import("node:fs/promises")
    const { mkdir } = await import("node:fs/promises")
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, "not json", "utf-8")
    expect(readLicense(file)).toBeNull()
  })
})
