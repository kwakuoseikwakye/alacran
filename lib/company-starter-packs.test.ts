import { describe, it, expect } from "vitest"
import { existsSync } from "node:fs"
import path from "node:path"
import { COMPANY_STARTER_PACKS, DEFAULT_COMPANY_STARTER_PACK_ID, getCompanyStarterPack } from "./company-starter-packs"

describe("COMPANY_STARTER_PACKS", () => {
  it("has a unique id for every pack", () => {
    const ids = COMPANY_STARTER_PACKS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("has exactly one pack with no overlay (the general/default one)", () => {
    const noOverlay = COMPANY_STARTER_PACKS.filter((p) => p.dirName === null)
    expect(noOverlay).toHaveLength(1)
    expect(noOverlay[0].id).toBe(DEFAULT_COMPANY_STARTER_PACK_ID)
  })

  it("gives every non-default pack its own distinct directory name", () => {
    const dirNames = COMPANY_STARTER_PACKS.map((p) => p.dirName).filter((d): d is string => d !== null)
    expect(new Set(dirNames).size).toBe(dirNames.length)
  })

  it("gives every pack a non-empty category", () => {
    for (const pack of COMPANY_STARTER_PACKS) {
      expect(pack.category.trim().length).toBeGreaterThan(0)
    }
  })

  it("has a templates/packs/<dirName> directory on disk for every pack that declares one", () => {
    for (const pack of COMPANY_STARTER_PACKS) {
      if (pack.dirName === null) continue
      const dir = path.join(process.cwd(), "templates", "packs", pack.dirName)
      expect(existsSync(dir), `expected ${dir} to exist for pack "${pack.id}"`).toBe(true)
    }
  })
})

describe("getCompanyStarterPack", () => {
  it("finds a pack by id", () => {
    expect(getCompanyStarterPack("software-engineering").label).toBe("Software engineering")
  })

  it("falls back to the default pack for an unknown id", () => {
    expect(getCompanyStarterPack("does-not-exist").id).toBe(DEFAULT_COMPANY_STARTER_PACK_ID)
  })

  it("falls back to the default pack when no id is given", () => {
    expect(getCompanyStarterPack(undefined).id).toBe(DEFAULT_COMPANY_STARTER_PACK_ID)
  })
})
