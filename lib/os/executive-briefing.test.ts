import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { buildExecutiveBriefing } from "./executive-briefing"

let root: string
let dataDir: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "briefing-test-root-"))
  dataDir = await mkdtemp(path.join(tmpdir(), "briefing-test-data-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
})

describe("buildExecutiveBriefing", () => {
  it("builds morning briefing with accurate pipeline and finances metrics", async () => {
    // 1. Setup leads
    await mkdir(path.join(root, "records/funnel"), { recursive: true })
    await writeFile(
      path.join(root, "records/funnel/leads.yaml"),
      `schema_version: 1
records:
  - id: l1
    name: Pied Piper
    stage: qualified
    source: inbound
    owner: human
    value: 50000
    currency: USD
    first_seen: "2026-09-01"
    last_touch: "2026-09-18"
  - id: l2
    name: Hooli
    stage: new
    source: outbound
    owner: agent
    value: 20000
    currency: USD
    first_seen: "2026-09-05"
    last_touch: "2026-09-18"
`
    )

    // 2. Setup transactions
    await mkdir(path.join(root, "records/finances"), { recursive: true })
    await writeFile(
      path.join(root, "records/finances/transactions.yaml"),
      `schema_version: 1
records:
  - id: t1
    date: "2026-09-01"
    description: Client retainer
    amount: 15000
    currency: USD
    type: income
    category: Revenue
    account: Operating
    status: cleared
  - id: t2
    date: "2026-09-05"
    description: Server Hosting
    amount: 3000
    currency: USD
    type: expense
    category: Operations
    account: Operating
    status: cleared
`
    )

    const briefing = await buildExecutiveBriefing(
      "test-co",
      "Test Co",
      root,
      [],
      dataDir
    )

    expect(briefing.companyId).toBe("test-co")
    expect(briefing.metrics.leadsCount).toBe(2)
    expect(briefing.metrics.pipelineValue).toBe(70000)
    expect(briefing.metrics.cashBalance).toBe(12000)
    expect(briefing.audioScript).toContain("$70,000")
    expect(briefing.audioScript).toContain("$12,000")
    expect(briefing.summaryParagraph).toContain("70,000")
  })

  it("identifies safe vs governed reviews in briefing audio script", async () => {
    // Setup 1 safe digest review
    await mkdir(path.join(root, "notes/company/digests"), { recursive: true })
    await writeFile(path.join(root, "notes/company/digests/digest.md"), "# Digest")
    const coData = path.join(dataDir, "test-co")
    await mkdir(coData, { recursive: true })
    await writeFile(
      path.join(coData, "digest.run.json"),
      JSON.stringify({
        commandId: "digest",
        outputKind: "new-file-in-dir",
        outputPath: "notes/company/digests",
        before: [],
      })
    )

    const briefing = await buildExecutiveBriefing(
      "test-co",
      "Test Co",
      root,
      [{ agentId: "test-co", commandId: "digest" }],
      dataDir
    )

    expect(briefing.metrics.pendingReviewsCount).toBe(1)
    expect(briefing.metrics.safeReviewsCount).toBe(1)
    expect(briefing.audioScript).toContain("1 change waiting for your OK")
    expect(briefing.audioScript).toContain("routine, and you can keep them in one go")
  })
})

describe("buildExecutiveBriefing with owned files (v234)", () => {
  afterEach(() => {
    vi.doUnmock("../company-commands/company-command-result-impl")
    vi.doUnmock("../company-commands/registry")
    vi.resetModules()
  })

  async function briefingFor(commandId: string, result: Record<string, unknown>) {
    vi.resetModules() // the file's static import above already cached the real module
    const getResultMock = vi.fn().mockResolvedValue(result)
    vi.doMock("../company-commands/company-command-result-impl", () => ({ getCompanyCommandResultImpl: getResultMock }))
    vi.doMock("../company-commands/registry", () => ({
      getCompanyCommand: (id: string) => (id === "session-note" ? { id, alsoWrites: ["definitions/"] } : { id }),
    }))
    const { buildExecutiveBriefing: build } = await import("./executive-briefing")
    const briefing = await build("test-co", "Test Co", root, [{ agentId: "test-co", commandId }], dataDir)
    return { briefing, getResultMock }
  }

  const note = { changed: true, outputPath: "notes/company/sessions/a.md", oldText: "", newText: "x", extraFiles: [], strays: [] }

  it("counts a session note that also edits company facts as governed, not safe", async () => {
    const { briefing, getResultMock } = await briefingFor("session-note", {
      ...note,
      ownedFiles: [{ path: "definitions/ontology/company.yaml", oldText: "a", newText: "b", isNew: false }],
    })
    expect(getResultMock.mock.calls[0][4]).toBe(true)
    expect(briefing.metrics.safeReviewsCount).toBe(0)
    expect(briefing.metrics.governedReviewsCount).toBe(1)
  })

  it("counts a note that proposes fact changes as governed, not safe (v234 I5)", async () => {
    const { briefing } = await briefingFor("session-note", { ...note, newText: "# S\n\n## Proposed fact changes\n- fact | pricing | fixed | was: hourly | \"q\"\n" })
    expect(briefing.metrics.safeReviewsCount).toBe(0)
    expect(briefing.metrics.governedReviewsCount).toBe(1)
  })

  it("still reads a command without alsoWrites with computeStrayFiles false", async () => {
    const { briefing, getResultMock } = await briefingFor("digest", {
      ...note,
      outputPath: "notes/company/digests/d.md",
    })
    expect(getResultMock.mock.calls[0][4]).toBe(false)
    expect(briefing.metrics.safeReviewsCount).toBe(1)
  })
})
