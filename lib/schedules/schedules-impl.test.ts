import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { isDue, localStamp, setScheduleImpl, runDueSchedulesImpl, type Schedule, type LastRun } from "./schedules-impl"

let dir: string
let schedulesPath: string
let lastRunPath: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "schedules-"))
  schedulesPath = path.join(dir, "schedules.json")
  lastRunPath = path.join(dir, "schedules-last-run.json")
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const digestAt7: Schedule = { agentId: "acme", commandId: "digest", time: "07:00" }

describe("isDue", () => {
  it("is not due before its time", () => {
    expect(isDue(digestAt7, undefined, "2026-08-18", "06:59")).toBe(false)
  })

  it("is due once its time has passed and it hasn't run today", () => {
    expect(isDue(digestAt7, undefined, "2026-08-18", "07:00")).toBe(true)
    expect(isDue(digestAt7, "2026-08-17", "2026-08-18", "09:30")).toBe(true)
  })

  it("is not due twice on the same day", () => {
    expect(isDue(digestAt7, "2026-08-18", "2026-08-18", "23:59")).toBe(false)
  })

  it("does not fire on the day it was saved if its time had already passed", () => {
    const saved = { ...digestAt7, skipDate: "2026-08-18" }
    expect(isDue(saved, undefined, "2026-08-18", "15:00")).toBe(false)
    expect(isDue(saved, undefined, "2026-08-19", "07:00")).toBe(true)
  })
})

describe("localStamp", () => {
  it("zero-pads both halves so string comparison is clock comparison", () => {
    expect(localStamp(new Date(2026, 0, 5, 9, 7))).toEqual({ date: "2026-01-05", time: "09:07" })
  })
})

describe("setScheduleImpl", () => {
  it("refuses a command whose fields have to be typed in", async () => {
    const result = await setScheduleImpl("acme", "retro", "07:00", false, new Date(2026, 7, 18, 9, 0), schedulesPath)
    expect(result.saved).toBe(false)
    expect(result.message).toContain("can't run on its own")
  })

  it("refuses a time that isn't a real clock time", async () => {
    const result = await setScheduleImpl("acme", "digest", "25:00", false, new Date(2026, 7, 18, 9, 0), schedulesPath)
    expect(result.saved).toBe(false)
  })

  it("marks a schedule saved after its own time so it waits for tomorrow", async () => {
    await setScheduleImpl("acme", "digest", "07:00", false, new Date(2026, 7, 18, 15, 0), schedulesPath)
    const saved = JSON.parse(await readFile(schedulesPath, "utf-8")) as Schedule[]
    expect(saved).toEqual([{ agentId: "acme", commandId: "digest", time: "07:00", skipDate: "2026-08-18" }])
  })

  it("leaves a schedule saved before its own time free to run today", async () => {
    await setScheduleImpl("acme", "digest", "23:00", false, new Date(2026, 7, 18, 15, 0), schedulesPath)
    const saved = JSON.parse(await readFile(schedulesPath, "utf-8")) as Schedule[]
    expect(saved).toEqual([{ agentId: "acme", commandId: "digest", time: "23:00" }])
  })

  it("replaces rather than duplicates, and clears on null", async () => {
    await setScheduleImpl("acme", "digest", "07:00", false, new Date(2026, 7, 18, 6, 0), schedulesPath)
    await setScheduleImpl("acme", "digest", "08:00", false, new Date(2026, 7, 18, 6, 0), schedulesPath)
    expect(JSON.parse(await readFile(schedulesPath, "utf-8"))).toHaveLength(1)

    await setScheduleImpl("acme", "digest", null, false, new Date(2026, 7, 18, 6, 0), schedulesPath)
    expect(JSON.parse(await readFile(schedulesPath, "utf-8"))).toEqual([])
  })
})

describe("runDueSchedulesImpl", () => {
  it("runs only what's due, with no field values, and doesn't repeat it that day", async () => {
    await setScheduleImpl("acme", "digest", "07:00", false, new Date(2026, 7, 17, 6, 0), schedulesPath)
    await setScheduleImpl("acme", "check-inbox", "22:00", false, new Date(2026, 7, 17, 6, 0), schedulesPath)

    const calls: Array<[string, Record<string, string>, string]> = []
    const runFn = async (commandId: string, fieldValues: Record<string, string>, agentId: string) => {
      calls.push([commandId, fieldValues, agentId])
      return { started: true, message: "Started" }
    }

    const started = await runDueSchedulesImpl(new Date(2026, 7, 18, 9, 0), runFn, schedulesPath, lastRunPath)
    expect(started).toBe(1)
    expect(calls).toEqual([["digest", {}, "acme"]])

    await runDueSchedulesImpl(new Date(2026, 7, 18, 9, 1), runFn, schedulesPath, lastRunPath)
    expect(calls).toHaveLength(1)

    const stamped = await runDueSchedulesImpl(new Date(2026, 7, 19, 9, 0), runFn, schedulesPath, lastRunPath)
    expect(stamped).toBe(1)
    expect(calls).toHaveLength(2)
  })

  it("keeps a refusal's reason and does not retry it until the next day", async () => {
    await setScheduleImpl("acme", "digest", "07:00", false, new Date(2026, 7, 17, 6, 0), schedulesPath)

    let attempts = 0
    const runFn = async () => {
      attempts++
      return { started: false, message: "Unknown company \"acme\"" }
    }

    expect(await runDueSchedulesImpl(new Date(2026, 7, 18, 7, 0), runFn, schedulesPath, lastRunPath)).toBe(0)
    await runDueSchedulesImpl(new Date(2026, 7, 18, 7, 1), runFn, schedulesPath, lastRunPath)
    expect(attempts).toBe(1)

    const lastRuns = JSON.parse(await readFile(lastRunPath, "utf-8"))
    expect(lastRuns["acme:digest"]).toEqual({ date: "2026-08-18", message: 'Unknown company "acme"' })
  })
})

describe("auto-commit", () => {
  it("refuses it on a command that reads text from outside the company", async () => {
    const result = await setScheduleImpl("acme", "check-inbox", "07:00", true, new Date(2026, 7, 18, 6, 0), schedulesPath)
    expect(result.saved).toBe(false)
    expect(result.message).toContain("always waits for you")
    // Refused before the write, so an existing schedule is left exactly as it was.
    await expect(readFile(schedulesPath, "utf-8")).rejects.toThrow()
  })

  it("stores it on a command that doesn't", async () => {
    await setScheduleImpl("acme", "digest", "07:00", true, new Date(2026, 7, 18, 6, 0), schedulesPath)
    const saved = JSON.parse(await readFile(schedulesPath, "utf-8")) as Schedule[]
    expect(saved).toEqual([{ agentId: "acme", commandId: "digest", time: "07:00", autoCommit: true }])
  })

  it("commits the run it started, on a later tick, and only once", async () => {
    await setScheduleImpl("acme", "digest", "07:00", true, new Date(2026, 7, 17, 6, 0), schedulesPath)
    const runFn = async () => ({ started: true, message: "Started" })
    let sweeps = 0
    const sweepFn = async () => {
      sweeps++
      return { committed: true, message: "Committed" }
    }

    await runDueSchedulesImpl(new Date(2026, 7, 18, 7, 0), runFn, schedulesPath, lastRunPath, sweepFn)
    let stamped = JSON.parse(await readFile(lastRunPath, "utf-8")) as Record<string, LastRun>
    expect(sweeps).toBe(0)
    expect(stamped["acme:digest"].pendingCommit).toBe(true)

    await runDueSchedulesImpl(new Date(2026, 7, 18, 7, 1), runFn, schedulesPath, lastRunPath, sweepFn)
    stamped = JSON.parse(await readFile(lastRunPath, "utf-8")) as Record<string, LastRun>
    expect(sweeps).toBe(1)
    expect(stamped["acme:digest"]).toEqual({ date: "2026-08-18", message: "Ran and committed automatically" })

    await runDueSchedulesImpl(new Date(2026, 7, 18, 7, 2), runFn, schedulesPath, lastRunPath, sweepFn)
    expect(sweeps).toBe(1)
  })

  it("leaves the run pending while it's still going", async () => {
    await setScheduleImpl("acme", "digest", "07:00", true, new Date(2026, 7, 17, 6, 0), schedulesPath)
    const runFn = async () => ({ started: true, message: "Started" })
    const stillRunning = async () => null

    await runDueSchedulesImpl(new Date(2026, 7, 18, 7, 0), runFn, schedulesPath, lastRunPath, stillRunning)
    await runDueSchedulesImpl(new Date(2026, 7, 18, 7, 1), runFn, schedulesPath, lastRunPath, stillRunning)

    const stamped = JSON.parse(await readFile(lastRunPath, "utf-8")) as Record<string, LastRun>
    expect(stamped["acme:digest"].pendingCommit).toBe(true)
  })

  it("never marks a plain schedule for auto-commit", async () => {
    await setScheduleImpl("acme", "digest", "07:00", false, new Date(2026, 7, 17, 6, 0), schedulesPath)
    const runFn = async () => ({ started: true, message: "Started" })
    let sweeps = 0
    const sweepFn = async () => {
      sweeps++
      return { committed: true, message: "Committed" }
    }

    await runDueSchedulesImpl(new Date(2026, 7, 18, 7, 0), runFn, schedulesPath, lastRunPath, sweepFn)
    await runDueSchedulesImpl(new Date(2026, 7, 18, 7, 1), runFn, schedulesPath, lastRunPath, sweepFn)

    const stamped = JSON.parse(await readFile(lastRunPath, "utf-8")) as Record<string, LastRun>
    expect(stamped["acme:digest"].pendingCommit).toBeUndefined()
    expect(sweeps).toBe(0)
  })
})
