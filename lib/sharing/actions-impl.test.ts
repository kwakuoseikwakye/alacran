import { describe, it, expect, vi } from "vitest"
import type { Agent } from "../adapters/types"

// The store writes to the real data directory by default; point it at a temp file.
vi.mock("../data-dir", async () => {
  const os = await import("node:os")
  const path = await import("node:path")
  const dir = path.join(os.tmpdir(), `alacran-actions-${process.pid}`)
  return { dataPath: (...s: string[]) => path.join(dir, ...s) }
})

const { connectCompaniesImpl, cutShareLinkImpl, listLiveLinksImpl, previewConnectionImpl } = await import("./actions-impl")

const agents = [
  { id: "a", name: "Acme", rootPath: "/nope/a", kind: "command-set" },
  { id: "b", name: "Beta", rootPath: "/nope/b", kind: "command-set" },
  { id: "x", name: "Folder", rootPath: "/nope/x", kind: "external" },
] as Agent[]
const getAgents = async () => agents

describe("sharing actions", () => {
  it("previews without writing, and refuses itself, an unknown company, and an external folder", async () => {
    expect((await previewConnectionImpl("a", "b", undefined, getAgents)).ok).toBe(true)
    expect((await previewConnectionImpl("a", "a", undefined, getAgents)).ok).toBe(false)
    expect((await previewConnectionImpl("a", "zzz", undefined, getAgents)).ok).toBe(false)
    expect((await previewConnectionImpl("a", "x", undefined, getAgents)).ok).toBe(false)
    expect(await listLiveLinksImpl(getAgents)).toEqual([])
  })

  it("connects, lists only strings whose two ends still exist, and cuts", async () => {
    const made = await connectCompaniesImpl("a", "b", undefined, getAgents)
    expect(made.ok).toBe(true)
    expect(await listLiveLinksImpl(getAgents)).toHaveLength(1)
    // Beta removed from the registry: the string stays in the file but is not live.
    expect(await listLiveLinksImpl(async () => [agents[0]])).toEqual([])
    if (made.ok) expect((await cutShareLinkImpl(made.link.id)).ok).toBe(true)
    expect(await listLiveLinksImpl(getAgents)).toEqual([])
  })

  it("will not connect an external folder", async () => {
    expect((await connectCompaniesImpl("a", "x", undefined, getAgents)).ok).toBe(false)
  })
})
