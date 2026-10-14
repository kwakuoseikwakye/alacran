import { describe, it, expect, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { AI_EXECUTORS, type AiExecutorId } from "@/lib/ai-executors"
import { buildMeasureCompany } from "./setup"
import { planRun, realSpawn, runOne, type SpawnFn } from "./runner"
import { TASKS, verdictFor, type AiRuns, type RunResult, type TaskId } from "./score"
import { renderJson, renderReport, type AiReport } from "./report"

const PLAN = process.env.GUIDE_COVERAGE_PLAN === "1"
const LIVE = process.env.GUIDE_COVERAGE_LIVE === "1"
const IDS = (process.env.GUIDE_COVERAGE_AIS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
const TASK_IDS = Object.keys(TASKS) as TaskId[]
const SIDES = ["guide", "control"] as const
const APPROVED_DIGEST = process.env.GUIDE_COVERAGE_APPROVED_DIGEST ?? ""

type Selection = { ok: true; ids: AiExecutorId[] } | { ok: false; error: string }

function parseSelection(env: { plan: boolean; live: boolean; ais: string[] }): Selection {
  if (env.plan && env.live) return { ok: false, error: "Set only one of GUIDE_COVERAGE_PLAN and GUIDE_COVERAGE_LIVE." }
  if (!env.ais.length) return { ok: false, error: "Set GUIDE_COVERAGE_AIS to a comma list of executor ids." }
  const seen = new Set<string>()
  const duplicates = env.ais.filter((id) => seen.has(id) || !seen.add(id))
  if (duplicates.length) return { ok: false, error: `Duplicate executor id: ${[...new Set(duplicates)].join(", ")}` }
  const unknown = env.ais.filter((id) => !Object.hasOwn(AI_EXECUTORS, id))
  if (unknown.length) return { ok: false, error: `Unknown executor id: ${unknown.join(", ")}` }
  if (env.live && env.ais.length !== 1) return { ok: false, error: "LIVE mode requires exactly one executor id per invocation." }
  return { ok: true, ids: env.ais as AiExecutorId[] }
}

function requireSelection(): AiExecutorId[] {
  const selection = parseSelection({ plan: PLAN, live: LIVE, ais: IDS })
  if (!selection.ok) throw new Error(selection.error)
  return selection.ids
}

export function planDigest(id: AiExecutorId): string {
  const plan = SIDES.flatMap((side) => TASK_IDS.map((task) => {
    const p = planRun(id, task)
    return { side, task, cmd: p.cmd, args: p.args, prompt: p.prompt }
  }))
  const canonical = JSON.stringify({
    executor: id,
    runs: plan,
    version: { cmd: AI_EXECUTORS[id].binaryName, args: ["--version"], timeoutMs: 4000, maxBytes: 16_000 },
    runLimits: { timeoutMs: 180_000, maxBytes: 200_000 },
  })
  return createHash("sha256").update(canonical).digest("hex")
}

export function validateLiveApproval(id: AiExecutorId, supplied: string): string | null {
  if (!supplied) return "LIVE mode requires GUIDE_COVERAGE_APPROVED_DIGEST from the displayed PLAN."
  const expected = planDigest(id)
  return supplied === expected ? null : `Approved plan digest does not match ${id}'s current PLAN (${expected}). Print PLAN again and obtain owner approval for that exact digest.`
}

export async function runApprovedLive<T>(id: AiExecutorId, supplied: string, startEffects: () => Promise<T>): Promise<T> {
  const error = validateLiveApproval(id, supplied)
  if (error) throw new Error(error)
  return startEffects()
}

describe("selection guard (always runs)", () => {
  it("refuses an empty list, unknown ids, duplicate ids and both modes", () => {
    expect(parseSelection({ plan: false, live: true, ais: [] }).ok).toBe(false)
    expect(parseSelection({ plan: false, live: true, ais: ["nope"] }).ok).toBe(false)
    expect(parseSelection({ plan: false, live: true, ais: ["codex", "codex"] }).ok).toBe(false)
    expect(parseSelection({ plan: true, live: true, ais: ["codex"] }).ok).toBe(false)
  })

  it("accepts only own executor ids and permits all unique ids in PLAN", () => {
    expect(parseSelection({ plan: true, live: false, ais: ["codex", "kimi"] })).toEqual({ ok: true, ids: ["codex", "kimi"] })
    expect(parseSelection({ plan: false, live: true, ais: ["codex", "kimi"] }).ok).toBe(false)
    expect(parseSelection({ plan: false, live: true, ais: ["toString"] }).ok).toBe(false)
  })
})

describe("LIVE approval digest guard", () => {
  it.each(["", "wrong-digest"])("blocks missing or mismatched digest before any side effects (%s)", async (digest) => {
    const effects = vi.fn(async () => "started")
    await expect(runApprovedLive("codex", digest, effects)).rejects.toThrow(/digest|PLAN/)
    expect(effects).not.toHaveBeenCalled()
  })

  it("runs after the exact PLAN digest is approved", async () => {
    const effects = vi.fn(async () => "started")
    await expect(runApprovedLive("codex", planDigest("codex"), effects)).resolves.toBe("started")
    expect(effects).toHaveBeenCalledOnce()
  })
})

describe.skipIf(!PLAN)("PLAN: print every command and prompt, run nothing", () => {
  it("prints all four plans per selected AI without building a company", () => {
    const ids = requireSelection()
    for (const id of ids) {
      console.log(`VERSION PROBE ${id}: ${AI_EXECUTORS[id].binaryName} "--version" (timeout: 4000ms)`)
      for (const side of SIDES) {
        for (const task of TASK_IDS) {
          const p = planRun(id, task)
          console.log(`PLAN ${id} ${side} ${task}`)
          console.log(`COMMAND: ${p.cmd} ${p.args.map((arg) => JSON.stringify(arg)).join(" ")}`)
          console.log("FULL PROMPT:")
          console.log(p.prompt)
          console.log("END PROMPT\n")
        }
      }
      console.log(`PLAN DIGEST ${id}: ${planDigest(id)}`)
    }
    console.log("NOTHING WAS RUN")
  })
})

async function versionOf(id: AiExecutorId, cwd: string, spawnFn: SpawnFn = realSpawn): Promise<string | null> {
  try {
    const { code, stdout, timedOut, notFound } = await spawnFn(AI_EXECUTORS[id].binaryName, ["--version"], {
      cwd,
      timeoutMs: 4000,
      maxBytes: 16_000,
    })
    if (timedOut || notFound || code !== 0) return null
    return stdout.trim().split("\n")[0] || null
  } catch {
    return null
  }
}

describe("CLI version probe", () => {
  it("uses the bounded process runner in the measurement company and reads its first line", async () => {
    let call: { cmd: string; args: string[]; opts: { cwd: string; timeoutMs: number; maxBytes: number } } | null = null
    const fakeSpawn: SpawnFn = async (cmd, args, opts) => {
      call = { cmd, args, opts }
      return { code: 0, stdout: "codex 1.2.3\nbuild metadata", stderr: "", timedOut: false, notFound: false }
    }

    await expect(versionOf("codex", "/tmp/measurement-company", fakeSpawn)).resolves.toBe("codex 1.2.3")
    expect(call).toEqual({
      cmd: AI_EXECUTORS.codex.binaryName,
      args: ["--version"],
      opts: { cwd: "/tmp/measurement-company", timeoutMs: 4000, maxBytes: 16_000 },
    })
  })

  it("treats timeouts, missing executables, and nonzero exits as unavailable", async () => {
    const result = (overrides: Partial<Awaited<ReturnType<SpawnFn>>>) => async (): Promise<Awaited<ReturnType<SpawnFn>>> => ({
      code: 0, stdout: "", stderr: "", timedOut: false, notFound: false, ...overrides,
    })
    await expect(versionOf("codex", "/tmp/measurement-company", result({ timedOut: true }))).resolves.toBeNull()
    await expect(versionOf("codex", "/tmp/measurement-company", result({ notFound: true }))).resolves.toBeNull()
    await expect(versionOf("codex", "/tmp/measurement-company", result({ code: 1 }))).resolves.toBeNull()
  })
})

function writeExclusivePair(outDir: string, date: string, reports: AiReport[], tmpPaths: string[]): void {
  const mdPath = path.join(outDir, `${date}-report.md`)
  const jsonPath = path.join(outDir, `${date}-report.json`)
  let mdCreated = false
  let jsonCreated = false
  try {
    const mdFd = fs.openSync(mdPath, "wx", 0o600)
    mdCreated = true
    try { fs.writeFileSync(mdFd, renderReport({ date, reports, tmpPaths })) }
    finally { fs.closeSync(mdFd) }

    const jsonFd = fs.openSync(jsonPath, "wx", 0o600)
    jsonCreated = true
    try { fs.writeFileSync(jsonFd, renderJson({ date, reports, tmpPaths })) }
    finally { fs.closeSync(jsonFd) }
  } catch (error) {
    // If either write fails, remove only report files this call created.
    if (mdCreated) fs.rmSync(mdPath, { force: true })
    if (jsonCreated) fs.rmSync(jsonPath, { force: true })
    throw error
  }
}

describe.skipIf(!LIVE)("LIVE: one small real run per task per AI (owner-approved)", () => {
  it(`measures ${IDS.join(", ")}`, async () => {
    const ids = requireSelection()
    await runApprovedLive(ids[0], APPROVED_DIGEST, async () => {
      const date = new Date().toISOString().slice(0, 10)
      const parent = fs.mkdtempSync(path.join(os.tmpdir(), "guide-coverage-"))
      const reports: AiReport[] = []
      try {
        const id = ids[0]
        const guide = await buildMeasureCompany({ parent, name: "with-guide", withGuide: true })
        const control = await buildMeasureCompany({ parent, name: "control", withGuide: false })
        const cliVersion = await versionOf(id, guide.root)
        const commands: AiReport["commands"] = []
        const results: { guide: Partial<Record<TaskId, RunResult>>; control: Partial<Record<TaskId, RunResult>> } = { guide: {}, control: {} }
        let nonOkRuns = 0

        for (const side of SIDES) {
          for (const task of TASK_IDS) {
            const p = planRun(id, task)
            commands.push({ task, side, line: `${p.cmd} ${p.args.map((arg) => JSON.stringify(arg)).join(" ")}` })
            if (!cliVersion) {
              results[side][task] = { status: "unavailable", stdout: "", stderr: "Unavailable: CLI was not found or --version failed.", seconds: 0 }
              nonOkRuns += 1
            } else if (nonOkRuns >= 2) {
              results[side][task] = { status: "unavailable", stdout: "", stderr: "Skipped: two earlier runs ended without an ok result.", seconds: 0 }
            } else {
              const result = await runOne(id, task, side === "guide" ? guide.root : control.root)
              results[side][task] = result
              if (result.status !== "ok") nonOkRuns += 1
            }
          }
        }
        const runs = results as AiRuns
        const verdict = verdictFor(runs)
        reports.push({ id, cliVersion, commands, runs, verdict: verdict.verdict, reason: cliVersion ? verdict.reason : "the CLI was not found or --version failed" })
        const outDir = path.join(process.cwd(), "docs", "guide-coverage")
        fs.mkdirSync(outDir, { recursive: true })
        writeExclusivePair(outDir, date, reports, [parent])
        expect(reports).toHaveLength(1)
      } finally {
        fs.rmSync(parent, { recursive: true, force: true })
      }
    })
  }, 60 * 60 * 1000)
})
