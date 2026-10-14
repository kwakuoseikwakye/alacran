import { describe, it, expect, vi, beforeEach } from "vitest"

const state = { block: "BLOCK", synced: "written" as string }
vi.mock("../get-effective-agents", () => ({ getEffectiveAgents: async () => [{ id: "b", name: "Beta" }] }))
vi.mock("./live", () => ({ listLiveLinksImpl: async () => [{ to: "b" }] }))
vi.mock("./shared-context", () => ({ buildSharedKnowledgeBlock: async () => state.block }))
vi.mock("./shared-sync", () => ({ syncSharedKnowledgeFor: async () => state.synced }))

const { sharedKnowledgeForTerminal } = await import("./shared-for-company")

describe("sharedKnowledgeForTerminal", () => {
  beforeEach(() => {
    state.block = "BLOCK"
    state.synced = "written"
  })

  it("adds nothing for a company no string points at", async () => {
    state.block = ""
    expect(await sharedKnowledgeForTerminal("b")).toBe("")
  })

  it("returns nothing when asked about a company with no incoming string", async () => {
    expect(await sharedKnowledgeForTerminal("other")).toBe("")
  })

  it("tells the assistant where to read it again, once the file is there", async () => {
    const text = await sharedKnowledgeForTerminal("b")
    expect(text.startsWith("BLOCK")).toBe(true)
    expect(text).toContain("state/shared-knowledge.md")
    expect(text).toContain("Read that file again")
  })

  it("does not point at a file that is not ours, or was not written", async () => {
    state.synced = "skipped"
    expect(await sharedKnowledgeForTerminal("b")).toBe("BLOCK")
  })
})
