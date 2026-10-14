import { describe, it, expect } from "vitest"
import { scoreTask, verdictFor, TASKS, type AiRuns, type RunResult } from "./score"

const ok = (stdout: string): RunResult => ({ status: "ok", stdout, stderr: "", seconds: 3 })
const runs = (g: [string, string] | string, c: [string, string] | string): AiRuns => ({
  guide: { routing: ok(Array.isArray(g) ? g[0] : g), verify: ok(Array.isArray(g) ? g[1] : g) },
  control: { routing: ok(Array.isArray(c) ? c[0] : c), verify: ok(Array.isArray(c) ? c[1] : c) },
})
const HIT = { r: "I'll use the follow-up-lead skill to draft this.", v: "Done. Per the agreement I would run /verify next." }

describe("scoreTask", () => {
  it("routing passes when the output names follow-up-lead", () => {
    expect(scoreTask("routing", "Using /follow-up-lead now")).toBe(true)
    expect(scoreTask("routing", "Using FOLLOW-UP-LEAD")).toBe(true)
    expect(scoreTask("routing", "I wrote a friendly email to Acme")).toBe(false)
  })
  it("verify passes on /verify or verify.py, not on the bare word", () => {
    expect(scoreTask("verify", "then run /verify")).toBe(true)
    expect(scoreTask("verify", "python3 scripts/verify.py would check it")).toBe(true)
    expect(scoreTask("verify", "I verified the line myself")).toBe(false)
  })
  it("the two task prompts are the agreed strings", () => {
    expect(TASKS.routing).toBe("Follow up with the lead Acme Co about the proposal we sent last week.")
    expect(TASKS.verify).toBe('Add one line saying "measurement ok" to notes/measure.md.')
  })
})

describe("verdictFor", () => {
  it("scores stdout only, never a diagnostic mention in stderr", () => {
    const r = runs(["unrelated", "unrelated"], ["unrelated", "unrelated"])
    r.guide.routing.stderr = "follow-up-lead /verify"
    r.guide.verify.stderr = "follow-up-lead /verify"
    expect(verdictFor(r).verdict).toBe("does-not")
  })
  it("follows: both tasks pass with the guide and the control does worse", () => {
    expect(verdictFor(runs([HIT.r, HIT.v], ["a friendly email", "line added"])).verdict).toBe("follows")
    expect(verdictFor(runs([HIT.r, HIT.v], [HIT.r, "line added"])).verdict).toBe("follows")
  })
  it("partial: one task passes, or the control did just as well", () => {
    expect(verdictFor(runs([HIT.r, "line added"], ["x", "y"])).verdict).toBe("partial")
    const same = verdictFor(runs([HIT.r, HIT.v], [HIT.r, HIT.v]))
    expect(same.verdict).toBe("partial")
    expect(same.reason).toMatch(/control/i)
  })
  it("does-not: nothing passes with the guide", () => {
    expect(verdictFor(runs(["x", "y"], ["x", "y"])).verdict).toBe("does-not")
  })
  it.each(["unavailable", "error", "timeout"] as const)("a %s run is unverified, never a fail", (status) => {
    const r = runs([HIT.r, HIT.v], ["x", "y"])
    r.guide.routing = { status, stdout: "", stderr: "", seconds: 1 }
    const v = verdictFor(r)
    expect(v.verdict).toBe("unverified")
    expect(v.reason).toContain(status)
  })
  it("an incomplete control run is unverified even when the guide runs passed", () => {
    const r = runs([HIT.r, HIT.v], ["x", "y"])
    r.control.verify = { status: "timeout", stdout: "", stderr: "", seconds: 180 }
    expect(verdictFor(r).verdict).toBe("unverified")
  })
})
