import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { appendActions, formatAction, oneLine, type ActionEvent } from "./action-log"
import { listDepartmentRecords, readDepartmentRecord } from "../os/departments/records"

let root: string
let outside: string
let calls: string[][]
const exec = async (_cmd: string, args: string[]) => {
  calls.push(args)
  return { stdout: "", stderr: "" }
}
const at = new Date(2026, 9, 26, 9, 14)
const now = () => at
const FILE = "records/actions/2026-10.md"
const LINE = /^- \d{4}-\d\d-\d\d \d\d:\d\d · .+$/

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "action-log-company-"))
  outside = await mkdtemp(path.join(os.tmpdir(), "action-log-outside-"))
  calls = []
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

const sent = (over: Partial<Extract<ActionEvent, { kind: "sent" }>> = {}): Extract<ActionEvent, { kind: "sent" }> => ({
  kind: "sent",
  at,
  jobId: "followup",
  policy: "invite",
  to: "a@x.com",
  subject: "Welcome Ama",
  by: "policy",
  ...over,
})
const body = (lines: string) => lines.split("\n").filter((l) => l.startsWith("- "))

describe("action log", () => {
  it("formats each kind of action as one line with the time, the outcome and who decided", () => {
    expect(formatAction(sent())).toBe('- 2026-10-26 09:14 · Sent email "Welcome Ama" to a@x.com · job followup, policy invite · decided by: send policy')
    expect(formatAction({ ...sent(), kind: "not-sent", reason: "Not signed in" })).toBe(
      '- 2026-10-26 09:14 · Email "Welcome Ama" to a@x.com not sent: Not signed in · job followup, policy invite · decided by: send policy'
    )
    expect(formatAction(sent({ by: "owner", policy: undefined }))).toBe('- 2026-10-26 09:14 · Sent email "Welcome Ama" to a@x.com · job followup · approved by the owner')
    const step = { at, jobId: "followup", what: "Spends money", title: "Pay the printer £120" }
    expect(formatAction({ ...step, kind: "approved" })).toBe('- 2026-10-26 09:14 · Spends money: "Pay the printer £120" · job followup · approved by the owner, to be carried out by the owner')
    expect(formatAction({ ...step, kind: "done" })).toBe('- 2026-10-26 09:14 · Spends money: "Pay the printer £120" · job followup · marked done by the owner')
    expect(formatAction({ ...step, kind: "rejected" })).toBe('- 2026-10-26 09:14 · Rejected: "Pay the printer £120" (Spends money) · job followup · rejected by the owner')
  })

  it("AC7: a value can never break the line: line breaks, list or heading markers, and long text are neutralised", () => {
    expect(oneLine("Hi\n# Evil")).toBe("Hi # Evil")
    expect(oneLine("- x")).toBe("\\- x")
    expect(oneLine("# heading")).toBe("\\# heading")
    expect(oneLine("a\u2028b\r\nc\u0000d")).toBe("a b c d")
    const long = oneLine("r".repeat(500))
    expect(long.length).toBe(121)
    expect(long.endsWith("…")).toBe(true)
    const events: ActionEvent[] = [
      sent({ subject: "Hi\n# Evil\n- injected line" }),
      { kind: "not-sent", at, jobId: "j\nx", to: "a@x.com", subject: "S", by: "policy", policy: "p", reason: "x".repeat(500) },
      { kind: "rejected", at, jobId: "j", what: "Sends a message", title: "- x\n## y" },
    ]
    for (const e of events) {
      const line = formatAction(e)
      expect(line).not.toContain("\n")
      expect(line).toMatch(LINE)
    }
    expect(formatAction(events[1])).not.toContain("x".repeat(121))
  })

  it("AC1/AC8: the first write of a month creates the file with its frontmatter, and the commit names only that file", async () => {
    expect(await appendActions(root, [sent(), sent({ to: "b@x.com" })], { exec, now })).toEqual({ ok: true })
    const text = await readFile(path.join(root, FILE), "utf-8")
    expect(text.startsWith("---\ntitle: Actions taken, October 2026\nupdated: " + at.toISOString() + "\n---\n")).toBe(true)
    expect(body(text)).toHaveLength(2)
    expect(text.endsWith("decided by: send policy\n")).toBe(true)
    expect(calls).toEqual([
      ["-C", root, "add", "--", FILE],
      ["-C", root, "commit", "-m", "Log 2 actions", "--", FILE],
    ])
  })

  it("AC8: every earlier byte, hand edits included, is kept; only `updated:` changes; new lines go last", async () => {
    await mkdir(path.join(root, "records/actions"), { recursive: true })
    const old = "---\ntitle: Actions taken, October 2026\nupdated: 2026-10-01T00:00:00.000Z\n---\n\nIntro.\n\n- 2026-10-01 08:00 · hand edited by Ama, see note"
    await writeFile(path.join(root, FILE), old)
    expect(await appendActions(root, [sent()], { exec, now })).toEqual({ ok: true })
    const text = await readFile(path.join(root, FILE), "utf-8")
    const expectedOld = old.replace("updated: 2026-10-01T00:00:00.000Z", `updated: ${at.toISOString()}`)
    expect(text.startsWith(expectedOld + "\n")).toBe(true)
    expect(text.slice(expectedOld.length + 1)).toBe(formatAction(sent()) + "\n")
  })

  it("AC9: a commit that fails leaves the line on disk, tries once, and the next good call commits it", async () => {
    let attempts = 0
    const broken = async (_cmd: string, args: string[]) => {
      if (args.includes("commit")) {
        attempts++
        throw new Error("index.lock exists")
      }
      return { stdout: "", stderr: "" }
    }
    expect(await appendActions(root, [sent()], { exec: broken, now })).toEqual({ ok: false, reason: "the line was written but couldn't be committed" })
    expect(attempts).toBe(1)
    expect(body(await readFile(path.join(root, FILE), "utf-8"))).toHaveLength(1)
    expect(await appendActions(root, [sent({ to: "b@x.com" })], { exec, now })).toEqual({ ok: true })
    expect(calls[0]).toEqual(["-C", root, "add", "--", FILE])
    expect(body(await readFile(path.join(root, FILE), "utf-8"))).toHaveLength(2)
  })

  it("AC9: never writes outside the company folder, and never throws on a folder it can't use", async () => {
    await mkdir(path.join(root, "records"), { recursive: true })
    await symlink(outside, path.join(root, "records/actions"))
    expect(await appendActions(root, [sent()], { exec, now })).toMatchObject({ ok: false })
    expect(calls).toEqual([])

    await rm(path.join(root, "records/actions"))
    await writeFile(path.join(root, "records/actions"), "not a folder")
    expect(await appendActions(root, [sent()], { exec, now })).toMatchObject({ ok: false })

    await rm(path.join(root, "records/actions"))
    await mkdir(path.join(root, "records/actions"))
    await symlink(path.join(outside, "x.md"), path.join(root, FILE))
    expect(await appendActions(root, [sent()], { exec, now })).toMatchObject({ ok: false })
    expect(calls).toEqual([])
    await expect(readFile(path.join(outside, "x.md"), "utf-8")).rejects.toThrow()
  })

  it("AC11: a month's file opens as a readable record under Records > Actions", async () => {
    await appendActions(root, [sent()], { exec, now })
    expect((await listDepartmentRecords(root, "actions")).map((r) => r.file)).toEqual(["2026-10.md"])
    const opened = await readDepartmentRecord(root, "actions", "2026-10.md")
    expect(opened).toMatchObject({ title: "Actions taken, October 2026", updated: at.toISOString() })
    expect(opened?.body).toContain(formatAction(sent()))
  })

  it("no events: no file and no git call", async () => {
    expect(await appendActions(root, [], { exec, now })).toEqual({ ok: true })
    expect(calls).toEqual([])
    await expect(readFile(path.join(root, FILE), "utf-8")).rejects.toThrow()
  })

  it("AC10: two appends to the same month at the same moment both land as whole lines", async () => {
    const results = await Promise.all([
      appendActions(root, [sent({ to: "a@x.com" }), sent({ to: "c@x.com" })], { exec, now }),
      appendActions(root, [{ kind: "rejected", at, jobId: "j", what: "Sends a message", title: "T" }], { exec, now }),
    ])
    expect(results).toEqual([{ ok: true }, { ok: true }])
    const lines = body(await readFile(path.join(root, FILE), "utf-8"))
    expect(lines).toHaveLength(3)
    for (const l of lines) expect(l).toMatch(LINE)
    expect(lines.filter((l) => l.includes("a@x.com") || l.includes("c@x.com"))).toHaveLength(2)
  })

  it("AC14: the log is local only, with no network call", async () => {
    const src = await readFile(path.join(__dirname, "action-log.ts"), "utf-8")
    expect(src).not.toMatch(/fetch\(|https?:\/\//)
  })
})
