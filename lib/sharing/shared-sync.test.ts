import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Agent } from "../adapters/types"

// Strings are stored under the data directory; point it at a temp one.
const dataRoot = path.join(tmpdir(), `alacran-sync-data-${process.pid}`)
vi.mock("../data-dir", async () => {
  const p = await import("node:path")
  return { dataPath: (...s: string[]) => p.join(dataRoot, ...s) }
})

const { connectCompaniesImpl, cutShareLinkImpl, updateShareScopeImpl } = await import("./actions-impl")
const { syncAllSharedKnowledge } = await import("./shared-sync")
const { SHARED_FILE } = await import("./shared-file")

let root: string
let a: Agent
let b: Agent
let getAgents: () => Promise<Agent[]>
const read = (agent: Agent) => readFile(path.join(agent.rootPath, SHARED_FILE), "utf-8")

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "alacran-sync-"))
  a = { id: "a", name: "Acme", rootPath: path.join(root, "a"), kind: "command-set" } as Agent
  b = { id: "b", name: "Beta", rootPath: path.join(root, "b"), kind: "command-set" } as Agent
  getAgents = async () => [a, b]
  await mkdir(path.join(a.rootPath, "docs", "decisions"), { recursive: true })
  await mkdir(b.rootPath, { recursive: true })
  await writeFile(path.join(a.rootPath, "docs", "company-summary.md"), "Acme sells anvils.", "utf-8")
  await writeFile(path.join(a.rootPath, "docs", "decisions", "2026-10-01-pricing.md"), "# Pricing\n\nNet 10.", "utf-8")
})
afterAll(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataRoot, { recursive: true, force: true })
})

describe("the shared file follows the strings", () => {
  it("is written the moment a string is made, in the receiving company's folder only", async () => {
    const made = await connectCompaniesImpl("a", "b", undefined, getAgents)
    expect(made.ok).toBe(true)
    expect(await read(b)).toContain("Acme sells anvils.")
    await expect(read(a)).rejects.toThrow()
  })

  it("is rewritten when the scope is narrowed", async () => {
    const links = JSON.parse(await readFile(path.join(dataRoot, "company-links.json"), "utf-8"))
    const narrowed = await updateShareScopeImpl(links[0].id, { summary: false, decisions: true, definitions: false }, getAgents)
    expect(narrowed.ok).toBe(true)
    const text = await read(b)
    expect(text).not.toContain("Acme sells anvils.")
    expect(text).toContain("Net 10.")
  })

  it("is refreshed by the timer when the sharing company changes what it wrote", async () => {
    await writeFile(path.join(a.rootPath, "docs", "decisions", "2026-10-02-stock.md"), "# Stock\n\nKeep 40 anvils.", "utf-8")
    await syncAllSharedKnowledge(getAgents)
    expect(await read(b)).toContain("Keep 40 anvils.")
  })

  it("is deleted the moment the string is cut", async () => {
    const links = JSON.parse(await readFile(path.join(dataRoot, "company-links.json"), "utf-8"))
    expect((await cutShareLinkImpl(links[0].id, getAgents)).ok).toBe(true)
    await expect(read(b)).rejects.toThrow()
  })
})
