import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, mkdir, writeFile, utimes } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getRunSignals } from "./run-signals"
import type { Agent } from "../adapters/types"

const AGENTS: Agent[] = [
  { id: "acme", name: "Acme", kind: "command-set", rootPath: "/tmp/acme" },
  { id: "beta", name: "Beta", kind: "command-set", rootPath: "/tmp/beta" },
]

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "run-signals-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** A log file with a known mtime, so the assertion isn't racing the clock. */
async function writeLog(agentId: string, commandId: string, mtimeSeconds: number) {
  const dir = path.join(root, agentId)
  await mkdir(dir, { recursive: true })
  const p = path.join(dir, `${commandId}.log`)
  await writeFile(p, "ran\n", "utf-8")
  await utimes(p, mtimeSeconds, mtimeSeconds)
}

describe("getRunSignals", () => {
  it("returns nothing when no company has a data dir", async () => {
    expect(await getRunSignals(AGENTS, root)).toEqual({})
  })

  it("returns nothing for a data dir that holds no logs", async () => {
    await mkdir(path.join(root, "acme"), { recursive: true })
    await writeFile(path.join(root, "acme", "digest.run.json"), "{}", "utf-8")
    expect(await getRunSignals(AGENTS, root)).toEqual({})
  })

  it("reports a command's last run from its log's mtime", async () => {
    await writeLog("acme", "digest", 1_700_000_000)
    const signals = await getRunSignals(AGENTS, root)
    expect(signals["acme:digest"]).toEqual({ lastRunAt: 1_700_000_000_000, running: false })
  })

  it("keys signals per company, so two companies never collide", async () => {
    await writeLog("acme", "digest", 1_700_000_000)
    await writeLog("beta", "digest", 1_800_000_000)
    const signals = await getRunSignals(AGENTS, root)
    expect(signals["acme:digest"].lastRunAt).toBe(1_700_000_000_000)
    expect(signals["beta:digest"].lastRunAt).toBe(1_800_000_000_000)
  })

  it("marks every command of a company whose lock is held as running", async () => {
    await writeLog("acme", "digest", 1_700_000_000)
    await writeLog("acme", "retro", 1_700_000_500)
    await writeLog("beta", "digest", 1_700_000_000)
    const lockFn = async (dataDir: string) => ({ running: dataDir.endsWith("acme") })
    const signals = await getRunSignals(AGENTS, root, undefined, undefined, lockFn)
    expect(signals["acme:digest"].running).toBe(true)
    expect(signals["acme:retro"].running).toBe(true)
    // The lock is company-wide, so a second company must not inherit it.
    expect(signals["beta:digest"].running).toBe(false)
  })

  it("survives a log that disappears between the listing and the stat", async () => {
    await writeLog("acme", "digest", 1_700_000_000)
    const statFn = async () => {
      throw new Error("ENOENT")
    }
    expect(await getRunSignals(AGENTS, root, undefined, statFn)).toEqual({})
  })

  it("survives a lock check that throws, rather than failing the whole page", async () => {
    await writeLog("acme", "digest", 1_700_000_000)
    const lockFn = async () => {
      throw new Error("unreadable")
    }
    const signals = await getRunSignals(AGENTS, root, undefined, undefined, lockFn)
    expect(signals["acme:digest"]).toEqual({ lastRunAt: 1_700_000_000_000, running: false })
  })

  it("ignores non-log files sitting beside the logs", async () => {
    await writeLog("acme", "digest", 1_700_000_000)
    const dir = path.join(root, "acme")
    await writeFile(path.join(dir, "digest.prompt"), "x", "utf-8")
    await writeFile(path.join(dir, "digest.args"), "x", "utf-8")
    await writeFile(path.join(dir, "company-command.lock"), "1", "utf-8")
    expect(Object.keys(await getRunSignals(AGENTS, root))).toEqual(["acme:digest"])
  })
})
