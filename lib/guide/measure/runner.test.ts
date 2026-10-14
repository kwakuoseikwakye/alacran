import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { AI_EXECUTORS } from "@/lib/ai-executors"
import { planRun, realSpawn, runOne, RUN_LIMITS, type SpawnFn } from "./runner"

const dirs: string[] = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "guide-run-")); dirs.push(d); return d }
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }) })

const fake = (r: Partial<Awaited<ReturnType<SpawnFn>>>): SpawnFn => async () => ({ code: 0, stdout: "", stderr: "", timedOut: false, notFound: false, ...r })

describe("planRun", () => {
  it("uses the registry's own unattended argv and the app's unattended-run prompt", () => {
    for (const id of Object.keys(AI_EXECUTORS) as (keyof typeof AI_EXECUTORS)[]) {
      const p = planRun(id, "routing")
      expect(p.cmd).toBe(AI_EXECUTORS[id].binaryName)
      expect(p.prompt).toContain("Follow AGENTS.md in this folder.")
      expect(p.prompt).toContain("Follow up with the lead Acme Co about the proposal we sent last week.")
      expect(p.args.join(" ")).toContain("Follow AGENTS.md")
    }
  })
  it("plans and executes the same registry command with routine model arguments", async () => {
    for (const id of Object.keys(AI_EXECUTORS) as (keyof typeof AI_EXECUTORS)[]) {
      const executor = AI_EXECUTORS[id]
      const plan = planRun(id, "routing")
      expect(plan.args).toEqual([
        ...executor.buildArgs({ prompt: plan.prompt, editScopePattern: "notes/**", bashPatterns: [] }),
        ...(executor.routineModelArgs ?? []),
      ])
      let invocation: { cmd: string; args: string[] } | undefined
      await runOne(id, "routing", tmp(), async (cmd, args) => {
        invocation = { cmd, args }
        return { code: 0, stdout: "done", stderr: "", timedOut: false, notFound: false }
      })
      expect(invocation).toEqual({ cmd: plan.cmd, args: plan.args })
    }
  })
  it("never grants shell access in the plan", () => {
    const p = planRun("claude-code", "verify")
    expect(p.args.join(" ")).not.toMatch(/Bash\(/)
  })
})

describe("runOne classification", () => {
  it("ok: zero exit with output", async () => {
    const r = await runOne("codex", "routing", tmp(), fake({ stdout: "using follow-up-lead" }))
    expect(r).toMatchObject({ status: "ok", stdout: "using follow-up-lead", stderr: "" })
  })
  it("a missing binary is unavailable", async () => {
    expect((await runOne("codex", "routing", tmp(), fake({ notFound: true, code: null }))).status).toBe("unavailable")
  })
  it("a signed-out CLI is unavailable, not a failure", async () => {
    expect((await runOne("kimi", "routing", tmp(), fake({ code: 1, stderr: "Please log in first" }))).status).toBe("unavailable")
  })
  it("a timeout is a timeout; any other non-zero exit is an error", async () => {
    expect((await runOne("kiro", "routing", tmp(), fake({ timedOut: true, code: null }))).status).toBe("timeout")
    expect((await runOne("kiro", "routing", tmp(), fake({ code: 2, stderr: "segfault" }))).status).toBe("error")
  })
})

describe("runOne exit-0 and wording", () => {
  it("a short sign-in prompt with exit 0 is unavailable", async () => {
    expect((await runOne("kimi", "routing", tmp(), fake({ stdout: "Please log in to continue" }))).status).toBe("unavailable")
  })
  it("uses both streams for short exit-0 sign-in diagnostics", async () => {
    const r = await runOne("kimi", "routing", tmp(), fake({ stdout: "CLI ready", stderr: "Please sign in" }))
    expect(r).toMatchObject({ status: "unavailable", stdout: "CLI ready", stderr: "Please sign in" })
    expect((await runOne("kimi", "routing", tmp(), fake({ stderr: "Please log in" }))).status).toBe("unavailable")
  })
  it("applies the short-output threshold to both streams together", async () => {
    const r = await runOne("kimi", "routing", tmp(), fake({ stdout: "Here is the plan. ".repeat(25), stderr: "credential" }))
    expect(r.status).toBe("ok")
  })
  it("a long normal answer mentioning credential is ok", async () => {
    const out = "Here is the plan. ".repeat(30) + "Never paste a credential into chat."
    expect(out.length).toBeGreaterThan(400)
    expect((await runOne("kimi", "routing", tmp(), fake({ stdout: out }))).status).toBe("ok")
  })
  it("'author' does not look signed-out", async () => {
    expect((await runOne("kimi", "routing", tmp(), fake({ code: 1, stderr: "author of the file" }))).status).toBe("error")
  })
})

describe("realSpawn", () => {
  it("captures output, caps it, ignores stdin and reports not-found", async () => {
    const cwd = tmp()
    const echoed = await realSpawn(process.execPath, ["-e", "console.log('hello')"], { cwd, timeoutMs: 20_000, maxBytes: 1000 })
    expect(echoed.stdout.trim()).toBe("hello")
    const big = await realSpawn(process.execPath, ["-e", "console.log('x'.repeat(5000))"], { cwd, timeoutMs: 20_000, maxBytes: 100 })
    expect(big.stdout.length).toBeLessThanOrEqual(100)
    const missing = await realSpawn("definitely-not-a-binary-xyz", [], { cwd, timeoutMs: 5_000, maxBytes: 100 })
    expect(missing.notFound).toBe(true)
  })
  it("caps each stream in UTF-8 bytes without splitting a multibyte character", async () => {
    const r = await realSpawn(process.execPath, ["-e", "process.stdout.write('😀'.repeat(100)); process.stderr.write('界'.repeat(100))"], { cwd: tmp(), timeoutMs: 20_000, maxBytes: 101 })
    expect(r.stdout).toBe("😀".repeat(25))
    expect(r.stderr).toBe("界".repeat(33))
    expect(Buffer.byteLength(r.stdout)).toBeLessThanOrEqual(101)
    expect(Buffer.byteLength(r.stderr)).toBeLessThanOrEqual(101)
  })
  it("preserves UTF-8 characters split across chunks", async () => {
    const script = "const b=Buffer.from('😀界'); process.stdout.write(b.subarray(0,2)); setTimeout(()=>process.stdout.write(b.subarray(2)),100)"
    const r = await realSpawn(process.execPath, ["-e", script], { cwd: tmp(), timeoutMs: 20_000, maxBytes: 7 })
    expect(r.stdout).toBe("😀界")
  })
  it("keeps malformed UTF-8 replacement output within the byte cap", async () => {
    const r = await realSpawn(process.execPath, ["-e", "process.stdout.write(Buffer.alloc(100,255))"], { cwd: tmp(), timeoutMs: 20_000, maxBytes: 100 })
    expect(Buffer.byteLength(r.stdout)).toBeLessThanOrEqual(100)
  })
  it("kills a run that exceeds its time limit", async () => {
    const r = await realSpawn(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], { cwd: tmp(), timeoutMs: 300, maxBytes: 100 })
    expect(r.timedOut).toBe(true)
  })
  it("a grandchild holding the pipes open cannot defeat the timeout", async () => {
    const marker = "guide-grandchild-" + process.pid
    const script = `require('child_process').spawn(process.execPath,['-e','/*${marker}*/setTimeout(()=>{},60000)'],{stdio:'inherit'});setTimeout(()=>{},60000)`
    const t0 = Date.now()
    const r = await realSpawn(process.execPath, ["-e", script], { cwd: tmp(), timeoutMs: 300, maxBytes: 100 })
    expect(r.timedOut).toBe(true)
    expect(Date.now() - t0).toBeLessThan(5000)
    await new Promise((res) => setTimeout(res, 300))
    const left = spawnSync("pgrep", ["-f", marker]).stdout.toString().trim()
    expect(left).toBe("")
  })
  it("has sane default limits", () => {
    expect(RUN_LIMITS.timeoutMs).toBe(180_000)
    expect(RUN_LIMITS.maxBytes).toBe(200_000)
  })
})
