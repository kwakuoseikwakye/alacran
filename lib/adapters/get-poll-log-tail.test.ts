import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "get-poll-log-tail-test-"))
  await mkdir(path.join(root, "logs"), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

describe("getPollLogTail", () => {
  it("returns empty strings when neither log file exists", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
    }))
    const { getPollLogTail } = await import("./get-poll-log-tail")

    const result = await getPollLogTail()

    expect(result).toEqual({ stdout: "", stderr: "" })
  })

  it("returns the tail of both log files when they exist", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
    }))
    await writeFile(path.join(root, "logs", "poll.out.log"), "line1\nline2\n")
    await writeFile(path.join(root, "logs", "poll.err.log"), "warning: x\n")
    const { getPollLogTail } = await import("./get-poll-log-tail")

    const result = await getPollLogTail()

    expect(result).toEqual({ stdout: "line1\nline2", stderr: "warning: x" })
  })

  it("returns empty strings when the agent isn't configured", async () => {
    vi.doMock("../config", () => ({ AGENTS: [] }))
    const { getPollLogTail } = await import("./get-poll-log-tail")

    const result = await getPollLogTail()

    expect(result).toEqual({ stdout: "", stderr: "" })
  })
})
