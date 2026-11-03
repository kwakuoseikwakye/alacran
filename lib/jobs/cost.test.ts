import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  checkMonthlyLimit,
  monthSpending,
  readableRunLog,
  readReportedCost,
  readSpendingView,
  recordRunCost,
  SESSION_NOTES_JOB,
  SPENDING_COPY,
  jobMonthWords,
  spendingHeadline,
  spentAgainst,
  usd,
  type CostEntry,
} from "./cost"

const ok = (cost: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, total_cost_usd: cost, result: "Done", ...extra })

describe("readReportedCost", () => {
  it("reads Claude Code's own reported cost from the run's last line", () => {
    expect(readReportedCost(`some earlier line\n${ok(0.0123)}\n`, 0)).toBe(0.0123)
  })

  it("is null, never 0, whenever the cost can't be read", () => {
    const cases: [string, number | null][] = [
      ["just text, no result line", 0],
      [JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Done" }), 0],
      [ok("0.01"), 0],
      [ok(null), 0],
      [ok(-1), 0],
      ['{"type":"result","total_cost_usd":NaN}', 0],
      ["{garbage", 0],
      ["", 0],
      [ok(0.5, { is_error: true }), 0],
      [ok(0.5, { subtype: "error_max_turns" }), 0],
      [`${ok(0.5)}\nthen something else`, 0],
      [ok(0.5), 1],
      [ok(0.5), null],
    ]
    for (const [output, code] of cases) expect(readReportedCost(output, code), output).toBeNull()
  })

  it("keeps a real zero as zero", () => {
    expect(readReportedCost(ok(0), 0)).toBe(0)
  })
})

describe("readableRunLog", () => {
  it("shows the answer instead of the result object, and leaves every other line alone", () => {
    expect(readableRunLog(`Alacrán: note\n${ok(0.1)}\n`)).toBe("Alacrán: note\nDone\n")
  })

  it("says plainly that a run ended in an error when the result carries no text", () => {
    expect(readableRunLog(JSON.stringify({ type: "result", is_error: true, total_cost_usd: 0 }))).toBe("The run ended with an error.")
  })

  it("leaves JSON that isn't a result line untouched", () => {
    const line = JSON.stringify({ type: "assistant", text: "hi" })
    expect(readableRunLog(line)).toBe(line)
  })
})

const entry = (at: Date, costUsd: number | null, job = "acme:digest"): CostEntry => ({
  job,
  executorId: "claude-code",
  startedAt: at.toISOString(),
  finishedAt: at.toISOString(),
  costUsd,
})

describe("monthSpending", () => {
  const october = [entry(new Date(2026, 9, 3, 10, 0), 1.25), entry(new Date(2026, 9, 31, 23, 0), 0.75), entry(new Date(2026, 9, 31, 23, 30), null)]

  it("counts this local month only, across the month boundary", () => {
    const end = monthSpending(october, new Date(2026, 9, 31, 23, 59))
    expect(end.knownUsd).toBeCloseTo(2)
    expect(end.unknownRuns).toBe(1)

    const next = monthSpending(october, new Date(2026, 10, 1, 0, 1))
    expect(next.knownUsd).toBe(0)
    expect(next.unknownRuns).toBe(0)
    expect(next.byJob.size).toBe(0)
  })

  it("never adds an unknown cost in, and gives each job its month total and last cost", () => {
    const { byJob } = monthSpending(october, new Date(2026, 9, 31, 23, 59))
    expect(byJob.get("acme:digest")).toMatchObject({ monthUsd: 2, lastCostUsd: null, runs: 3 })
  })

  it("counts a visible-terminal run (no finish time) by when it started", () => {
    const visible: CostEntry = { job: "acme:digest", executorId: "claude-code", startedAt: new Date(2026, 9, 5).toISOString(), finishedAt: null, costUsd: null }
    expect(monthSpending([visible], new Date(2026, 9, 20)).unknownRuns).toBe(1)
  })
})

let root: string
let dataRoot: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "cost-co-"))
  dataRoot = await mkdtemp(path.join(tmpdir(), "cost-data-"))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataRoot, { recursive: true, force: true })
})

async function setLimit(text: string) {
  await mkdir(path.join(root, "definitions"), { recursive: true })
  await writeFile(path.join(root, "definitions/budget.yaml"), text)
}

describe("checkMonthlyLimit", () => {
  const agent = () => ({ id: "acme", rootPath: root })
  const now = new Date(2026, 9, 20, 12, 0)

  it("is not blocked with no limit, whatever was spent", async () => {
    await recordRunCost(path.join(dataRoot, "acme"), entry(new Date(2026, 9, 2), 500))
    expect(await checkMonthlyLimit(agent(), now, dataRoot)).toEqual({ blocked: false })
  })

  it("is not blocked below the limit and blocked once known spend reaches it", async () => {
    await setLimit("monthly_limit_usd: 5\n")
    await recordRunCost(path.join(dataRoot, "acme"), entry(new Date(2026, 9, 2), 4))
    await recordRunCost(path.join(dataRoot, "acme"), entry(new Date(2026, 9, 3), null))
    expect((await checkMonthlyLimit(agent(), now, dataRoot)).blocked).toBe(false)

    await recordRunCost(path.join(dataRoot, "acme"), entry(new Date(2026, 9, 4), 1))
    const check = await checkMonthlyLimit(agent(), now, dataRoot)
    expect(check.blocked).toBe(true)
    if (check.blocked) expect(check.message).toMatch(/limit of \$5\.00 is reached \(estimated so far: .*\)\.$/)
    // The Run hint is the caller's: only a schedule has a Run button.
    const forSchedule = await checkMonthlyLimit(agent(), now, dataRoot, " Press Run to start it yourself.")
    if (forSchedule.blocked) expect(forSchedule.message).toMatch(/\)\. Press Run to start it yourself\.$/)
  })

  it("lets runs start again in a new month without anything else", async () => {
    await setLimit("monthly_limit_usd: 5\n")
    await recordRunCost(path.join(dataRoot, "acme"), entry(new Date(2026, 9, 2), 9))
    expect((await checkMonthlyLimit(agent(), new Date(2026, 10, 1, 0, 1), dataRoot)).blocked).toBe(false)
  })

  it("blocks when the limit file can't be read, rather than guessing", async () => {
    await setLimit('monthly_limit_usd: "25"\n')
    const check = await checkMonthlyLimit(agent(), now, dataRoot)
    expect(check.blocked).toBe(true)
    if (check.blocked) expect(check.message).toMatch(/can't be read/)
  })
})

describe("readSpendingView", () => {
  it("adds up the month, each job, the unknown runs and whether the limit is reached", async () => {
    await setLimit("monthly_limit_usd: 2\n")
    const dir = path.join(dataRoot, "acme")
    await recordRunCost(dir, entry(new Date(2026, 9, 1, 8), 1.5, "acme:digest"))
    await recordRunCost(dir, entry(new Date(2026, 9, 2, 8), 0.5, "acme:digest"))
    await recordRunCost(dir, entry(new Date(2026, 9, 2, 9), 0.25, SESSION_NOTES_JOB))
    await recordRunCost(dir, { job: "acme:digest", executorId: "claude-code", startedAt: new Date(2026, 9, 3).toISOString(), finishedAt: null, costUsd: null })
    await recordRunCost(dir, entry(new Date(2026, 8, 30), 50, "acme:digest"))

    const view = await readSpendingView("acme", root, new Date(2026, 9, 20), dataRoot)
    expect(view.monthUsd).toBeCloseTo(2.25)
    expect(view.unknownRuns).toBe(1)
    expect(view.reached).toBe(true)
    expect(view.limit).toEqual({ ok: true, usd: 2 })
    const digest = view.jobs.find((j) => j.job === "acme:digest")!
    expect(digest).toMatchObject({ monthUsd: 2, lastCostUsd: null, runs: 3, knownRuns: 2 })
    expect(view.jobs.find((j) => j.job === SESSION_NOTES_JOB)).toMatchObject({ label: "Automatic session notes", lastCostUsd: 0.25 })
  })

  it("shows nothing spent and no limit for a company with no runs, and never throws", async () => {
    const view = await readSpendingView("nobody", root, new Date(2026, 9, 20), dataRoot)
    expect(view).toMatchObject({ monthUsd: 0, unknownRuns: 0, jobs: [], limit: { ok: true, usd: null }, reached: false })
  })
})

describe("how amounts read", () => {
  it("never shows a job whose costs weren't seen as $0.00", async () => {
    const dir = path.join(dataRoot, "acme")
    const unknown = (d: Date): CostEntry => ({ job: "acme:retro", executorId: "codex", startedAt: d.toISOString(), finishedAt: d.toISOString(), costUsd: null })
    await recordRunCost(dir, unknown(new Date(2026, 9, 1)))
    await recordRunCost(dir, unknown(new Date(2026, 9, 2)))
    const view = await readSpendingView("acme", root, new Date(2026, 9, 20), dataRoot)
    const retro = view.jobs.find((j) => j.job === "acme:retro")!
    expect(retro).toMatchObject({ runs: 2, knownRuns: 0 })
    expect(jobMonthWords(retro)).toBe("cost not known this month")
    expect(jobMonthWords({ monthUsd: 0.03, runs: 2, knownRuns: 1 })).toBe("$0.03 this month, plus 1 run with cost not known")
    expect(jobMonthWords({ monthUsd: 0.03, runs: 4, knownRuns: 1 })).toBe("$0.03 this month, plus 3 runs with cost not known")
    expect(jobMonthWords({ monthUsd: 0, runs: 1, knownRuns: 1 })).toBe("$0.00 this month")
  })

  it("says under a cent for a cost above zero, and $0.00 only for a true zero", () => {
    expect(usd(0)).toBe("$0.00")
    expect(usd(0.004)).toBe("under $0.01")
    expect(usd(0.0099)).toBe("under $0.01")
    expect(usd(0.01)).toBe("$0.01")
    expect(usd(1.239)).toBe("$1.24")
  })

  it("leads with what it couldn't see rather than $0.00 when no cost was seen", () => {
    const h = spendingHeadline({ monthUsd: 0, unknownRuns: 2, limit: { ok: true, usd: null } })
    expect(h.before + h.figure + h.after).toBe("No cost Alacrán could see yet this month.")
    const sub = spendingHeadline({ monthUsd: 0.004, unknownRuns: 0, limit: { ok: true, usd: null } })
    expect(sub.figure + sub.after).toBe("Under $0.01 so far this month.")
    const plain = spendingHeadline({ monthUsd: 1.5, unknownRuns: 0, limit: { ok: true, usd: 25 } })
    expect(plain.before + plain.figure + plain.after).toBe("About $1.50 so far this month of a $25.00 limit.")
  })

  it("makes a reached limit look reached when both round to the same cents", () => {
    expect(spentAgainst(0.0423, 0.04)).toBe("just over $0.04")
    expect(spentAgainst(0.0396, 0.04)).toBe("just under $0.04")
    expect(spentAgainst(0.04, 0.04)).toBe("$0.04")
    expect(spentAgainst(0.06, 0.04)).toBe("$0.06")
    expect(spentAgainst(0.0423, null)).toBe("$0.04")
    const h = spendingHeadline({ monthUsd: 0.0423, unknownRuns: 0, limit: { ok: true, usd: 0.04 } })
    expect(h.before + h.figure + h.after).toBe("Just over $0.04 so far this month of a $0.04 limit.")
  })
})

describe("what the spending section promises", () => {
  it("says the limit can be passed and never promises a hard stop", () => {
    const all = Object.values(SPENDING_COPY).join(" ").toLowerCase()
    expect(all).toMatch(/can be passed/)
    expect(all).toMatch(/already going are allowed to finish/)
    expect(all).toMatch(/only known once a run ends/)
    expect(all).toMatch(/aren't counted/)
    for (const banned of ["guarantee", "never more than", "never exceed", "at most"]) expect(all).not.toContain(banned)
    expect(SPENDING_COPY.estimate).toMatch(/^Estimated/)
  })

  it("reads cost only from local output: nothing in the cost code reaches the network", async () => {
    for (const file of ["cost.ts", "cost-words.ts"]) {
      const src = await readFile(path.join(__dirname, file), "utf-8")
      expect(src).not.toMatch(/fetch\(|https?:\/\/|node:https?|node:net/)
    }
  })
})
