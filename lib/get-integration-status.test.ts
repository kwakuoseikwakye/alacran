import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getIntegrationStatus } from "./get-integration-status"
import type { Agent } from "./adapters/types"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "integration-status-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const company = (rootPath: string): Agent => ({
  id: "ai-company-starter-main",
  name: "AI Company Starter",
  rootPath,
  kind: "command-set",
})

describe("getIntegrationStatus", () => {
  it("reports none configured when the company has no .env at all", async () => {
    expect(await getIntegrationStatus(company(path.join(root, "does-not-exist")))).toBe("none configured yet")
  })

  it("reports Notion connected when the company's own .env has NOTION_TOKEN", async () => {
    await writeFile(path.join(root, ".env"), "NOTION_TOKEN=secret_real\n")
    expect(await getIntegrationStatus(company(root))).toBe("Notion connected")
  })

  it("reports none configured for the empty NOTION_TOKEN= placeholder written before a value is pasted", async () => {
    await writeFile(path.join(root, ".env"), "NOTION_TOKEN=\n")
    expect(await getIntegrationStatus(company(root))).toBe("none configured yet")
  })

  // This function used to read a config.json from one hardcoded agent id and
  // surface the email address inside it — the only place this app ever printed
  // a real mailbox on screen. That branch is gone, so a config.json with an
  // account in it must now be ignored entirely rather than reported.
  it("never surfaces an email address, even when a config.json holds one", async () => {
    await writeFile(path.join(root, "config.json"), JSON.stringify({ account: "someone@example.com" }))
    const status = await getIntegrationStatus(company(root))
    expect(status).toBe("none configured yet")
    expect(status).not.toContain("@")
  })
})
