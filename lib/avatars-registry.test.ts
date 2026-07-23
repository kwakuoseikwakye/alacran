import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dataDir: string
let registryPath: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "avatars-registry-data-"))
  registryPath = path.join(dataDir, "avatars.json")
  vi.doMock("./get-effective-agents", () => ({
    getEffectiveAgents: async () => [
      { id: "email-pipeline-agent", name: "Email Pipeline Agent", rootPath: "/fake", kind: "pipeline" },
      { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/fake", kind: "command-set" },
    ],
  }))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

describe("avatars-registry", () => {
  it("returns an empty list when the registry file doesn't exist", async () => {
    const { getAvatars } = await import("./avatars-registry")
    expect(await getAvatars(registryPath)).toEqual([])
  })

  it("returns an empty list when the registry file is unparseable", async () => {
    await writeFile(registryPath, "{ not json")
    const { getAvatars } = await import("./avatars-registry")
    expect(await getAvatars(registryPath)).toEqual([])
  })

  it("sets a new avatar for a known agent", async () => {
    const { setAvatarImpl, getAvatars } = await import("./avatars-registry")
    const result = await setAvatarImpl("ai-company-starter-main", "https://example.com/a.png", registryPath)
    expect(result).toEqual({ ok: true })
    expect(await getAvatars(registryPath)).toEqual([
      { agentId: "ai-company-starter-main", imageUrl: "https://example.com/a.png" },
    ])
  })

  it("accepts a data:image/ URI", async () => {
    const { setAvatarImpl, getAvatars } = await import("./avatars-registry")
    const dataUri = "data:image/svg+xml,<svg></svg>"
    const result = await setAvatarImpl("ai-company-starter-main", dataUri, registryPath)
    expect(result).toEqual({ ok: true })
    expect(await getAvatars(registryPath)).toEqual([{ agentId: "ai-company-starter-main", imageUrl: dataUri }])
  })

  it("upserts — setting a second time for the same agent replaces the first", async () => {
    const { setAvatarImpl, getAvatars } = await import("./avatars-registry")
    await setAvatarImpl("ai-company-starter-main", "https://example.com/first.png", registryPath)
    await setAvatarImpl("ai-company-starter-main", "https://example.com/second.png", registryPath)
    expect(await getAvatars(registryPath)).toEqual([
      { agentId: "ai-company-starter-main", imageUrl: "https://example.com/second.png" },
    ])
  })

  it("rejects an unknown agentId", async () => {
    const { setAvatarImpl } = await import("./avatars-registry")
    const result = await setAvatarImpl("not-a-real-agent", "https://example.com/a.png", registryPath)
    expect(result).toEqual({ ok: false, message: "Unknown agent" })
  })

  it("rejects a URL with a disallowed scheme", async () => {
    const { setAvatarImpl } = await import("./avatars-registry")
    const result = await setAvatarImpl("ai-company-starter-main", "javascript:alert(1)", registryPath)
    expect(result).toEqual({ ok: false, message: "Image URL must start with https://, http://, or data:image/" })
  })

  it("removes an existing avatar", async () => {
    const { setAvatarImpl, removeAvatarImpl, getAvatars } = await import("./avatars-registry")
    await setAvatarImpl("ai-company-starter-main", "https://example.com/a.png", registryPath)
    const result = await removeAvatarImpl("ai-company-starter-main", registryPath)
    expect(result).toEqual({ ok: true })
    expect(await getAvatars(registryPath)).toEqual([])
  })

  it("reports not-found when removing an agent with no avatar set", async () => {
    const { removeAvatarImpl } = await import("./avatars-registry")
    const result = await removeAvatarImpl("ai-company-starter-main", registryPath)
    expect(result).toEqual({ ok: false, message: "Not found" })
  })
})
