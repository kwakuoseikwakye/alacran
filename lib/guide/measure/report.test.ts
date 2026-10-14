import os from "node:os"
import { describe, expect, it } from "vitest"
import { redact, renderJson, renderReport, type AiReport } from "./report"

const ok = (stdout: string) => ({ status: "ok" as const, stdout, stderr: "diagnostic usage summary", seconds: 4 })
const report: AiReport = {
  id: "codex",
  cliVersion: "codex-cli 0.160.0",
  commands: [{ task: "routing", side: "guide", line: "codex exec 'Follow AGENTS.md…'" }],
  runs: { guide: { routing: ok("follow-up-lead"), verify: ok("/verify") }, control: { routing: ok("an email"), verify: ok("done") } },
  verdict: "follows",
  reason: "both tasks passed with the guide; the control passed 0 of 2",
}
const args = { date: "2026-10-04", reports: [report], tmpPaths: [] }
// All credentials in these tests are synthetic.
const secrets = [os.homedir(), "/private/tmp/test.[x]/company", "abc.def.ghi", "sk-synthetic_key_123456", "a".repeat(40)]
const sensitive = `${secrets[0]}/file ${secrets[1]}/file Bearer ${secrets[2]} ${secrets[3]} ${secrets[4]}`

describe("redact", () => {
  it("removes paths, bearer tokens, keys and long tokens", () => {
    const out = redact(sensitive, [secrets[1]])
    for (const secret of secrets) expect(out).not.toContain(secret)
    expect(out).toContain("<home>")
    expect(out).toContain("<tmp>")
    expect(out).toContain("Bearer <redacted>")
  })
  it("preserves ordinary text", () => {
    expect(redact("Using /follow-up-lead to draft the email.")).toBe("Using /follow-up-lead to draft the email.")
  })
  it("handles empty, overlapping and regex-special paths literally", () => {
    expect(redact("/private/tmp/a.[x]/nested/file", ["", "/private/tmp/a.[x]", "/private/tmp/a.[x]/nested"])).toBe("<tmp>/file")
  })
  it("recognizes bearer authorization case-insensitively", () => {
    expect(redact("bearer synthetic.token")).toBe("Bearer <redacted>")
  })
})

describe("report evidence", () => {
  it("renders Markdown verdicts, commands, runs and unavailable executors", () => {
    const md = renderReport({ ...args, reports: [report, { ...report, id: "kimi", cliVersion: null, runs: null, verdict: "unverified", reason: "kimi was not signed in" }] })
    expect(md).toContain("# Operating guide: executor coverage report")
    expect(md).toContain("2026-10-04")
    expect(md).toContain("| codex | codex-cli 0.160.0 | follows |")
    expect(md).toContain("| kimi | not found | unverified |")
    expect(md).toContain(report.commands[0].line)
    expect(md).toContain("kimi was not signed in")
    expect(md).toContain("No runs were made.")
    expect(md).toContain("### guide / routing: ok (4s)")
  })
  it("retains commands, seconds, statuses and null values in JSON", () => {
    const json = JSON.parse(renderJson({ ...args, reports: [report, { ...report, cliVersion: null, runs: null }] }))
    expect(json.date).toBe(args.date)
    expect(json.reports[0]).toEqual(report)
    expect(json.reports[1].cliVersion).toBeNull()
    expect(json.reports[1].runs).toBeNull()
  })
  for (const [format, render] of [["Markdown", renderReport], ["JSON", renderJson]] as const) {
    it(`${format} redacts every external string, including runtime enum values`, () => {
      const contaminated = {
        id: sensitive, cliVersion: sensitive, verdict: sensitive, reason: sensitive,
        commands: [{ task: sensitive, side: sensitive, line: sensitive }],
        runs: { guide: { routing: { ...ok(sensitive), status: sensitive }, verify: ok(sensitive) }, control: { routing: ok(sensitive), verify: ok(sensitive) } },
      } as unknown as AiReport
      const out = render({ date: sensitive, reports: [contaminated], tmpPaths: [secrets[1]] })
      for (const secret of secrets) expect(out).not.toContain(secret)
      expect(out).toContain("<redacted>")
      expect(out).toContain("<tmp>")
      expect(out).toContain("<home>")
    })
    it(`${format} redacts before clipping across secret boundaries`, () => {
      for (const secret of ["sk-synthetic_key_123456", "a".repeat(40), `${os.homedir()}/private`, secrets[1], "Bearer synthetic.token"]) {
        const prefix = "x ".repeat(secret.startsWith("Bearer ") ? 1994 : 1998)
        const output = `${prefix}${secret} ${"z ".repeat(100)}`
        const out = render({ ...args, tmpPaths: [secrets[1]], reports: [{ ...report, runs: { ...report.runs!, guide: { ...report.runs!.guide, routing: ok(output) } } }] })
        expect(out).not.toContain(`${prefix}${secret.slice(0, secret.startsWith("Bearer ") ? 11 : 4)}`)
        expect(out).toContain("… (cut)")
      }
    })
    it(`${format} states scoring and interactive-path limits`, () => {
      const out = render(args)
      expect(out).toContain("final-output-only")
      expect(out).toContain("Silent compliance is not detected")
      expect(out).toContain("mentions and negations may produce false positives")
      expect(out).toContain("No interactive-path measurement")
    })
  }
  it("clips redacted output at exactly 4000 characters and leaves input untouched", () => {
    const output = "y ".repeat(5000)
    const long = { ...report, runs: { ...report.runs!, guide: { ...report.runs!.guide, routing: ok(output) } } }
    const json = JSON.parse(renderJson({ ...args, reports: [long] }))
    expect(json.reports[0].runs.guide.routing.stdout).toBe(`${output.slice(0, 4000)}\n… (cut)`)
    expect(json.reports[0].runs.guide.routing.stderr).toContain("diagnostic usage summary")
    expect(renderReport({ ...args, reports: [long] })).toContain(`${output.slice(0, 4000)}\n… (cut)`)
    expect(long.runs.guide.routing.stdout).toBe(output)
  })
})
