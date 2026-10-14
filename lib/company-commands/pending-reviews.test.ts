import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Agent } from "../adapters/types"

const getResultMock = vi.hoisted(() => vi.fn())
vi.mock("./company-command-result-impl", () => ({ getCompanyCommandResultImpl: getResultMock }))
vi.mock("./registry", () => ({
  getCompanyCommand: (id: string) => (id === "writes-more" ? { id, alsoWrites: ["docs/decisions/"] } : { id }),
}))

import { listPendingReviews } from "./pending-reviews"

let dataRoot: string
const agent = { id: "acme", rootPath: "/nowhere" } as unknown as Agent

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(tmpdir(), "pending-reviews-"))
  await mkdir(path.join(dataRoot, "acme"), { recursive: true })
  getResultMock.mockReset()
  getResultMock.mockResolvedValue({ changed: true })
})

afterEach(async () => {
  await rm(dataRoot, { recursive: true, force: true })
})

async function record(commandId: string) {
  await writeFile(path.join(dataRoot, "acme", `${commandId}.run.json`), "{}")
}

describe("listPendingReviews computeStrayFiles", () => {
  it("stays false (no git call) for a command without alsoWrites", async () => {
    await record("digest")
    await listPendingReviews([agent], dataRoot)
    expect(getResultMock).toHaveBeenCalledTimes(1)
    expect(getResultMock.mock.calls[0][4]).toBe(false)
  })

  it("is true for a command that declares alsoWrites", async () => {
    await record("writes-more")
    expect(await listPendingReviews([agent], dataRoot)).toEqual([{ agentId: "acme", commandId: "writes-more" }])
    expect(getResultMock.mock.calls[0][4]).toBe(true)
  })
})
