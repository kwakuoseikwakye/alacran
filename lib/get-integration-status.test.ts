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

function takeshiAgent(rootPath: string): Agent {
  return { id: "plh-takeshi-agent", name: "Takeshi Email Agent", rootPath, kind: "pipeline" }
}

describe("getIntegrationStatus", () => {
  it("reports the connected email account for plh-takeshi-agent when config.json has one", async () => {
    await writeFile(path.join(root, "config.json"), JSON.stringify({ account: "nana@plh.life" }))
    expect(await getIntegrationStatus(takeshiAgent(root))).toBe("Email connected (nana@plh.life)")
  })

  it("reports none configured when config.json is missing", async () => {
    expect(await getIntegrationStatus(takeshiAgent(root))).toBe("none configured yet")
  })

  it("reports none configured when config.json is malformed JSON", async () => {
    await writeFile(path.join(root, "config.json"), "{ not json")
    expect(await getIntegrationStatus(takeshiAgent(root))).toBe("none configured yet")
  })

  it("reports none configured when the account field is missing", async () => {
    await writeFile(path.join(root, "config.json"), JSON.stringify({ sender: "takeshi@plh.life" }))
    expect(await getIntegrationStatus(takeshiAgent(root))).toBe("none configured yet")
  })

  it("reports none configured when the account field is an empty string", async () => {
    await writeFile(path.join(root, "config.json"), JSON.stringify({ account: "   " }))
    expect(await getIntegrationStatus(takeshiAgent(root))).toBe("none configured yet")
  })

  it("reports none configured for any other agent, without reading anything", async () => {
    const otherAgent: Agent = {
      id: "ai-company-starter-main",
      name: "AI Company Starter",
      rootPath: path.join(root, "does-not-exist"),
      kind: "command-set",
    }
    expect(await getIntegrationStatus(otherAgent)).toBe("none configured yet")
  })
})
