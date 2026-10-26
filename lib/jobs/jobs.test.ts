import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { editJob, parseJobs, parsePolicies, type Job, type Policy } from "./definitions"
import { parseReport, runScript } from "./runner"
import { approvePolicy, checkPolicy, parseTemplate, processSends, render, sendTest, type Mail } from "./send-lane"
import { jobStore, jobsDir, type RunEntry } from "./store"
import { isJobDue, runDueJobsImpl, runJob } from "./sweep"
import { openFlagCount, openFlagsFrom, openHeld, readJobsView } from "./view"
import { decideHeld, recordHolds } from "./held"
import { approve, markHandled, setJobMode } from "./manage"

let root: string
let storeDir: string

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "jobs-company-"))
  storeDir = await mkdtemp(path.join(os.tmpdir(), "jobs-store-"))
  await mkdir(path.join(root, "scripts"), { recursive: true })
  await mkdir(path.join(root, "definitions"), { recursive: true })
  await mkdir(path.join(root, "templates"), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(storeDir, { recursive: true, force: true })
})

const job = (over: Partial<Job> = {}): Job => ({ id: "followup", run: "scripts/followup.sh", at: "08:00", mode: "shadow", enabled: true, ...over })
const policy = (over: Partial<Policy> = {}): Policy => ({
  id: "invite",
  channel: "outlook",
  template: "templates/invite.md",
  fields: ["name"],
  max_per_recipient: 2,
  min_days_between: 3,
  max_per_run: 10,
  ...over,
})
const TEMPLATE = "Subject: Welcome {{name}}\n\nHi {{name}},\nhere is your invite.\n"

async function script(body: string, name = "followup.sh") {
  await writeFile(path.join(root, "scripts", name), `#!/bin/sh\n${body}\n`)
}

describe("definitions", () => {
  it("parses jobs with defaults and reports bad entries without hiding good ones", () => {
    const parsed = parseJobs(
      ["jobs:", "  - { id: ok, run: scripts/a.py, at: '08:12' }", "  - { id: bad, run: ../x.py, at: '08:00' }", "  - { id: ok, run: scripts/b.sh, at: '09:00' }"].join("\n")
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.items).toEqual([{ id: "ok", run: "scripts/a.py", at: "08:12", mode: "shadow", enabled: true }])
    expect(parsed.invalid.map((i) => i.reason)).toEqual(["run must be a file under scripts/", 'id "ok" is used twice'])
  })

  it("treats a missing or empty file as no jobs and broken YAML as unreadable", () => {
    expect(parseJobs(null)).toEqual({ ok: true, items: [], invalid: [] })
    expect(parseJobs("jobs: [unclosed").ok).toBe(false)
  })

  it("rejects a policy channel other than outlook and a template outside the folder", () => {
    const parsed = parsePolicies("policies:\n  - { id: a, channel: sms, template: t.md }\n  - { id: b, channel: outlook, template: ../t.md }")
    expect(parsed.ok && parsed.items).toEqual([])
  })

  it("edits one job in place and keeps comments", async () => {
    await writeFile(path.join(root, "definitions/jobs.yaml"), "# my jobs\njobs:\n  - id: followup # the morning one\n    run: scripts/followup.sh\n    at: '08:00'\n")
    expect(await editJob(root, "followup", { mode: "live" })).toEqual({ ok: true })
    const text = await readFile(path.join(root, "definitions/jobs.yaml"), "utf-8")
    expect(text).toContain("# my jobs")
    expect(text).toContain("# the morning one")
    expect(text).toContain("mode: live")
    expect(await editJob(root, "nope", { mode: "live" })).toEqual({ ok: false, reason: 'No job called "nope".' })
  })
})

describe("runner", () => {
  it("runs the script with no AI, in shadow mode, and reads its report", async () => {
    await script(`echo "{\\"did\\":[\\"checked $ALACRAN_DRY_RUN\\"],\\"outcome\\":{\\"label\\":\\"joined\\",\\"value\\":3}}" > "$ALACRAN_REPORT"`)
    const run = await runScript(root, job(), "shadow")
    expect(run).toMatchObject({ ran: true, exitCode: 0, report: { did: ["checked 1"], outcome: { label: "joined", value: 3 } } })
  })

  it("does not set the dry-run variable in live mode", async () => {
    await script(`echo "{\\"did\\":[\\"[$ALACRAN_DRY_RUN]\\"]}" > "$ALACRAN_REPORT"`)
    expect(await runScript(root, job(), "live")).toMatchObject({ report: { did: ["[]"] } })
  })

  it("keeps the app's own environment away from the script", async () => {
    process.env.ALACRAN_TEST_SECRET = "hunter2"
    await script(`echo "{\\"did\\":[\\"[$ALACRAN_TEST_SECRET]\\"]}" > "$ALACRAN_REPORT"`)
    expect(await runScript(root, job(), "live")).toMatchObject({ report: { did: ["[]"] } })
    delete process.env.ALACRAN_TEST_SECRET
  })

  it("refuses a script that resolves outside scripts/", async () => {
    const outside = path.join(root, "evil.sh")
    await writeFile(outside, "#!/bin/sh\n")
    await symlink(outside, path.join(root, "scripts", "followup.sh"))
    expect(await runScript(root, job(), "shadow")).toEqual({ ran: false, reason: "scripts/followup.sh doesn't exist inside this company's scripts folder." })
  })

  it("reports a non-zero exit and a timeout", async () => {
    await script("echo boom >&2; exit 3")
    expect(await runScript(root, job(), "shadow")).toMatchObject({ ran: true, exitCode: 3, timedOut: false, stderrTail: "boom\n" })
    await script("sleep 5")
    expect(await runScript(root, job(), "shadow", undefined, 200)).toMatchObject({ ran: true, timedOut: true })
  })

  it("says plainly when the report is unreadable", () => {
    expect(parseReport("not json").error).toBe("The job wrote a report that isn't valid JSON.")
    expect(parseReport('{"did": "x"}').error).toMatch(/wrong shape/)
    expect(parseReport(null)).toEqual({ report: null, error: null })
  })

  it("AC1: accepts valid held steps and rejects the whole report for one malformed entry", () => {
    const mail = { to: " Ama@X.com ", subject: "Your invoice", body: "Hi Ama" }
    const ok = parseReport(
      JSON.stringify({
        send: [{ policy: "invite", to: "a@x.com" }],
        hold: [
          { row: "publication", title: "Email Ama", detail: "One-off", mail },
          { row: "money", title: "Pay the printer", detail: "£120" },
          { row: "credentials", title: "Give Kofi access", detail: "Drive" },
        ],
      })
    )
    expect(ok.error).toBeNull()
    expect(ok.report?.hold).toHaveLength(3)
    expect(ok.report?.hold[0].mail?.to).toBe("ama@x.com")
    expect(parseReport('{"did":["x"]}').report?.hold).toEqual([])

    const bad = (hold: object, reason: RegExp) => {
      const parsed = parseReport(JSON.stringify({ send: [{ policy: "invite", to: "a@x.com" }], hold: [{ row: "money", title: "fine", detail: "" }, hold] }))
      expect(parsed.report).toBeNull()
      expect(parsed.error).toMatch(/^The job's report has the wrong shape: /)
      expect(parsed.error).toMatch(reason)
    }
    bad({ row: "legal", title: "t", detail: "d" }, /./)
    bad({ row: "publication", title: "t", detail: "d", mail: { ...mail, to: "a@x.com, b@x.com" } }, /usable email address/)
    bad({ row: "publication", title: "t", detail: "d", mail: { ...mail, subject: "--confirm" } }, /dash/)
    bad({ row: "publication", title: "t", detail: "d", mail: { ...mail, body: "-x" } }, /dash/)
    bad({ row: "publication", title: "t", detail: "d", mail: { ...mail, subject: "a\nBcc: x@y.com" } }, /one line/)
    bad({ row: "money", title: "t", detail: "d", mail }, /Only a publication hold/)
    bad({ row: "money", title: "x".repeat(301), detail: "d" }, /./)
    bad({ row: "money", title: "t", detail: "x".repeat(2001) }, /./)
  })
})

describe("send lane", () => {
  const sends: Mail[] = []
  const send = async (mail: Mail) => {
    sends.push(mail)
  }
  beforeEach(async () => {
    sends.length = 0
    await writeFile(path.join(root, "templates/invite.md"), TEMPLATE)
  })

  it("parses and fills a template, keeping the subject on one line", () => {
    const t = parseTemplate(TEMPLATE)!
    expect(t.placeholders).toEqual(["name"])
    expect(render(t, { name: "Ama\nEvil: header" })).toEqual({ subject: "Welcome Ama Evil: header", body: "Hi Ama\nEvil: header,\nhere is your invite.\n" })
    expect(parseTemplate("no subject line")).toBeNull()
  })

  it("refuses everything until the policy is approved, and again after the template changes", async () => {
    const store = jobStore(storeDir)
    const req = [{ policy: "invite", to: "a@x.com", fields: { name: "Ama" } }]
    let lane = await processSends({ root, jobId: "j", mode: "live", requests: req, policies: [policy()], store, send })
    expect(lane.outcomes[0]).toMatchObject({ result: "refused", reason: 'The send policy "invite" hasn\'t been approved yet.' })
    expect(lane.flags).toHaveLength(1)

    await approvePolicy(root, policy(), store)
    lane = await processSends({ root, jobId: "j", mode: "live", requests: req, policies: [policy()], store, send })
    expect(lane.outcomes[0].result).toBe("sent")
    expect(sends).toEqual([{ to: "a@x.com", subject: "Welcome Ama", body: "Hi Ama,\nhere is your invite.\n" }])

    await writeFile(path.join(root, "templates/invite.md"), TEMPLATE + "P.S. new line\n")
    expect((await checkPolicy(root, policy(), (await store.readApprovals()).invite)).ok).toBe(false)
    lane = await processSends({ root, jobId: "j", mode: "live", requests: [{ policy: "invite", to: "b@x.com", fields: { name: "B" } }], policies: [policy()], store, send })
    expect(lane.outcomes[0].reason).toMatch(/changed after you approved it/)
    // Raising a cap in the policy breaks the approval too.
    await writeFile(path.join(root, "templates/invite.md"), TEMPLATE)
    expect((await checkPolicy(root, policy({ max_per_recipient: 5 }), (await store.readApprovals()).invite)).ok).toBe(false)
  })

  it("practice before approval previews the sends, and a live run flags an unapproved policy once", async () => {
    const store = jobStore(storeDir)
    const reqs = ["a@x.com", "b@x.com"].map((to) => ({ policy: "invite", to, fields: { name: "N" } }))
    const practice = await processSends({ root, jobId: "j", mode: "shadow", requests: reqs, policies: [policy()], store, send })
    expect(practice.outcomes.map((o) => o.result)).toEqual(["would-send", "would-send"])
    expect(practice.flags).toEqual([])
    const live = await processSends({ root, jobId: "j", mode: "live", requests: reqs, policies: [policy()], store, send })
    expect(live.outcomes.map((o) => o.result)).toEqual(["refused", "refused"])
    expect(live.flags).toHaveLength(1)
    expect(sends).toEqual([])
  })

  it("shadow mode sends nothing and logs nothing", async () => {
    const store = jobStore(storeDir)
    await approvePolicy(root, policy(), store)
    const lane = await processSends({ root, jobId: "j", mode: "shadow", requests: [{ policy: "invite", to: "a@x.com", fields: { name: "Ama" } }], policies: [policy()], store, send })
    expect(lane.outcomes).toEqual([{ policy: "invite", to: "a@x.com", result: "would-send" }])
    expect(sends).toEqual([])
    expect(await store.readSent()).toEqual([])
  })

  it("enforces per-recipient cap, days apart, stop list, per-run cap, fields and duplicates", async () => {
    const store = jobStore(storeDir)
    await writeFile(path.join(root, "definitions/stop.yaml"), "stop:\n  - Stop@X.com\n")
    const p = policy({ stop_list: "definitions/stop.yaml", max_per_run: 2 })
    await approvePolicy(root, p, store)
    const day = 24 * 60 * 60 * 1000
    await store.appendSent({ policy: "invite", to: "capped@x.com", at: new Date(Date.now() - 10 * day).toISOString(), jobId: "j", subject: "s" })
    await store.appendSent({ policy: "invite", to: "capped@x.com", at: new Date(Date.now() - 5 * day).toISOString(), jobId: "j", subject: "s" })
    await store.appendSent({ policy: "invite", to: "recent@x.com", at: new Date(Date.now() - 1 * day).toISOString(), jobId: "j", subject: "s" })
    const lane = await processSends({
      root,
      jobId: "j",
      mode: "live",
      policies: [p],
      store,
      send,
      requests: [
        { policy: "invite", to: "capped@x.com", fields: { name: "C" } },
        { policy: "invite", to: "recent@x.com", fields: { name: "R" } },
        { policy: "invite", to: "stop@x.com", fields: { name: "S" } },
        { policy: "invite", to: "noname@x.com", fields: {} },
        { policy: "invite", to: "extra@x.com", fields: { name: "E", phone: "1" } },
        { policy: "invite", to: "not-an-email", fields: { name: "N" } },
        { policy: "invite", to: "one@x.com", fields: { name: "1" } },
        { policy: "invite", to: "ONE@x.com", fields: { name: "1" } },
        { policy: "invite", to: "two@x.com", fields: { name: "2" } },
        { policy: "invite", to: "three@x.com", fields: { name: "3" } },
        { policy: "nope", to: "z@x.com", fields: {} },
      ],
    })
    expect(lane.outcomes.map((o) => `${o.to}:${o.result}`)).toEqual([
      "capped@x.com:refused",
      "recent@x.com:refused",
      "stop@x.com:refused",
      "noname@x.com:refused",
      "extra@x.com:refused",
      "not-an-email:refused",
      "one@x.com:sent",
      "one@x.com:refused",
      "two@x.com:sent",
      "three@x.com:refused",
      "z@x.com:refused",
    ])
    // Quiet: too recent, stop list, duplicate. Everything else needs a person.
    expect(lane.flags.map((f) => f.item)).toEqual(["capped@x.com", "noname@x.com", "extra@x.com", "not-an-email", "three@x.com", "z@x.com"])
    expect(sends.map((s) => s.to)).toEqual(["one@x.com", "two@x.com"])
    expect((await store.readSent()).filter((s) => s.to === "one@x.com")).toHaveLength(1)
  })

  it("stops a policy whose stop list exists but can't be read", async () => {
    const store = jobStore(storeDir)
    await writeFile(path.join(root, "definitions/stop.yaml"), "stop: [unclosed")
    const p = policy({ stop_list: "definitions/stop.yaml" })
    await approvePolicy(root, p, store)
    const lane = await processSends({ root, jobId: "j", mode: "live", policies: [p], store, send, requests: [{ policy: "invite", to: "a@x.com", fields: { name: "A" } }] })
    expect(lane.outcomes[0].reason).toMatch(/can't be read/)
    expect(sends).toEqual([])
  })

  it("records a failed send as a flag and does not log it as sent", async () => {
    const store = jobStore(storeDir)
    await approvePolicy(root, policy(), store)
    const lane = await processSends({
      root,
      jobId: "j",
      mode: "live",
      policies: [policy()],
      store,
      send: async () => {
        throw new Error("Not signed in")
      },
      requests: [{ policy: "invite", to: "a@x.com", fields: { name: "A" } }],
    })
    expect(lane.flags).toEqual([{ item: "a@x.com", reason: "Sending failed: Not signed in" }])
    expect(await store.readSent()).toEqual([])
  })

  it("test mode sends to one address with [TEST] and never touches the sent-log", async () => {
    const store = jobStore(storeDir)
    expect(await sendTest(root, policy(), "me@x.com", send)).toEqual({ ok: true })
    expect(sends).toEqual([{ to: "me@x.com", subject: "[TEST] Welcome [name]", body: "Hi [name],\nhere is your invite.\n" }])
    expect(await store.readSent()).toEqual([])
    expect(await sendTest(root, policy(), "a@x.com, b@x.com", send)).toEqual({ ok: false, reason: "Enter one email address." })
  })
})

describe("sweep", () => {
  it("fires once a day after its time, and not on the day it appeared after that time", () => {
    const j = job({ at: "08:00" })
    expect(isJobDue(j, undefined, "2026-10-15 07:00", "2026-10-16", "08:00")).toBe(true)
    expect(isJobDue(j, "2026-10-16", undefined, "2026-10-16", "09:00")).toBe(false)
    expect(isJobDue(j, undefined, undefined, "2026-10-16", "07:59")).toBe(false)
    expect(isJobDue(j, undefined, "2026-10-16 10:00", "2026-10-16", "11:00")).toBe(false)
    expect(isJobDue(job({ enabled: false }), undefined, undefined, "2026-10-16", "09:00")).toBe(false)
  })

  it("runs a live job end to end: report, sends through the lane, run log, flags", async () => {
    await writeFile(path.join(root, "templates/invite.md"), TEMPLATE)
    await writeFile(path.join(root, "definitions/send-policies.yaml"), "policies:\n  - id: invite\n    channel: outlook\n    template: templates/invite.md\n    fields: [name]\n")
    await script(
      `cat > "$ALACRAN_REPORT" <<'EOF'\n{"did":["found 2 people"],"flagged":[{"item":"row 7","reason":"paid by someone else"}],"send":[{"policy":"invite","to":"a@x.com","fields":{"name":"Ama"}}]}\nEOF`
    )
    const store = jobStore(storeDir)
    const parsed = parsePolicies(await readFile(path.join(root, "definitions/send-policies.yaml"), "utf-8"))
    await approvePolicy(root, parsed.ok ? parsed.items[0] : policy(), store)
    const sent: Mail[] = []
    const entry = await runJob(root, job({ mode: "live" }), store, { send: async (m) => void sent.push(m) })
    expect(entry).toMatchObject({ status: "ok", message: "Ran, sent 1, 1 needs you", did: ["found 2 people"] })
    expect(sent.map((m) => m.to)).toEqual(["a@x.com"])
    expect((await store.readRuns()).map((r) => r.runId)).toEqual([entry.runId])
    expect((await store.readState()).lastRun.followup).toMatchObject({ status: "ok" })
  })

  it("a failed script sends nothing even if its report asks to", async () => {
    await script(`echo '{"send":[{"policy":"invite","to":"a@x.com","fields":{"name":"A"}}]}' > "$ALACRAN_REPORT"; exit 1`)
    const send = vi.fn()
    const entry = await runJob(root, job({ mode: "live" }), jobStore(storeDir), { send })
    expect(entry.status).toBe("failed")
    expect(entry.flagged.at(-1)?.reason).toBe("The job failed (exit 1).")
    expect(send).not.toHaveBeenCalled()
  })

  const HOLDS = [
    { row: "publication", title: "Email Ama", detail: "One-off", mail: { to: "ama@x.com", subject: "Hello", body: "Hi Ama" } },
    { row: "money", title: "Pay the printer", detail: "£120" },
  ]
  const holdScript = () => script(`cat > "$ALACRAN_REPORT" <<'EOF'\n${JSON.stringify({ did: ["checked"], hold: HOLDS })}\nEOF`)

  it("AC2: a live run stores each held step in app data, sends nothing, and says how many wait", async () => {
    await holdScript()
    const store = jobStore(storeDir)
    const send = vi.fn()
    const entry = await runJob(root, job({ mode: "live" }), store, { send, now: () => new Date("2026-10-26T09:00:00Z") })
    expect(entry.status).toBe("ok")
    expect(entry.message).toBe("Ran, 2 waiting for your OK")
    expect(entry.holds?.map((h) => h.result)).toEqual(["held", "held"])
    expect(send).not.toHaveBeenCalled()
    const held = await store.readHeld()
    expect(held).toHaveLength(2)
    expect(held[0]).toMatchObject({ jobId: "followup", runId: entry.runId, row: "publication", title: "Email Ama", detail: "One-off", mail: HOLDS[0].mail, createdAt: "2026-10-26T09:00:00.000Z", status: "pending" })
    expect(held[1]).toMatchObject({ row: "money", status: "pending" })
    expect(held[1].mail).toBeUndefined()
    // The queue lives in the store directory, never in the company folder.
    expect(storeDir.startsWith(root)).toBe(false)
  })

  it("AC2: a failed run holds nothing; AC4: a second day's identical run doesn't add duplicates", async () => {
    await script(`echo '${JSON.stringify({ hold: HOLDS })}' > "$ALACRAN_REPORT"; exit 1`)
    const store = jobStore(storeDir)
    expect((await runJob(root, job({ mode: "live" }), store)).status).toBe("failed")
    await expect(store.readHeld()).resolves.toEqual([])
    await holdScript()
    await runJob(root, job({ mode: "live" }), store)
    const again = await runJob(root, job({ mode: "live" }), store)
    expect(again.holds?.map((h) => h.result)).toEqual(["already-waiting", "already-waiting"])
    expect(again.message).toBe("Ran, 2 waiting for your OK")
    expect(await store.readHeld()).toHaveLength(2)
  })

  it("AC3: a practice run records 'would hold' and creates nothing anyone can approve", async () => {
    await holdScript()
    const store = jobStore(storeDir)
    const send = vi.fn()
    const entry = await runJob(root, job({ mode: "shadow" }), store, { send })
    expect(entry.message).toBe("Practice run, would hold 2")
    expect(entry.holds?.map((h) => h.result)).toEqual(["would-hold", "would-hold"])
    expect(await store.readHeld()).toEqual([])
    expect((await readFile(path.join(storeDir, "runs.jsonl"), "utf-8"))).toContain("would-hold")
    // Nothing from a practice run has an id, so the server has nothing to approve.
    expect(await decideHeld(store, [entry.runId], "approve", send)).toMatchObject({ sent: 0, skipped: 1 })
    expect(send).not.toHaveBeenCalled()
  })

  it("the tick runs due jobs only, once", async () => {
    await writeFile(path.join(root, "definitions/jobs.yaml"), "jobs:\n  - { id: followup, run: scripts/followup.sh, at: '08:00' }\n")
    await script(`echo '{"did":["ok"]}' > "$ALACRAN_REPORT"`)
    const agents = [{ id: "acme", rootPath: root }]
    // First sight at 07:00: recorded, not yet due.
    expect(await runDueJobsImpl({ now: () => new Date(2026, 9, 16, 7, 0) }, agents, storeDir)).toBe(0)
    expect(await runDueJobsImpl({ now: () => new Date(2026, 9, 16, 8, 1) }, agents, storeDir)).toBe(1)
    expect(await runDueJobsImpl({ now: () => new Date(2026, 9, 16, 9, 0) }, agents, storeDir)).toBe(0)
    expect(await runDueJobsImpl({ now: () => new Date(2026, 9, 17, 8, 0) }, agents, storeDir)).toBe(1)
  })
})

describe("view and manage", () => {
  const run = (over: Partial<RunEntry>): RunEntry => ({
    runId: "r1",
    jobId: "followup",
    date: "2026-10-16",
    startedAt: "",
    finishedAt: "",
    mode: "shadow",
    status: "ok",
    message: "",
    exitCode: 0,
    did: [],
    flagged: [],
    sends: [],
    ...over,
  })

  it("shows only the latest run's unhandled flags per job", () => {
    const flags = openFlagsFrom(
      [run({ runId: "old", flagged: [{ item: "a", reason: "x" }] }), run({ runId: "new", flagged: [{ item: "b", reason: "y" }, { item: "c", reason: "z" }] })],
      ["new#0"]
    )
    expect(flags.map((f) => f.item)).toEqual(["c"])
  })

  it("AC12: the badge counts open flags plus open held steps, and a broken queue counts 0 without hiding flags", async () => {
    const store = jobStore(jobsDir("acme", storeDir))
    await store.appendRun(run({ flagged: [{ item: "row 7", reason: "x" }] }))
    await recordHolds(store, { jobId: "followup", runId: "r1", entries: [{ row: "money", title: "a", detail: "" }, { row: "credentials", title: "b", detail: "" }], now: new Date() })
    expect(await openFlagCount("acme", storeDir)).toBe(3)
    await writeFile(path.join(jobsDir("acme", storeDir), "held.json"), "[broken")
    expect(await openFlagCount("acme", storeDir)).toBe(1)
    expect(await openHeld("acme", storeDir)).toEqual({ ok: false })
  })

  it("AC12: every Approvals badge sum site counts through openFlagCount, so the totals agree", async () => {
    const app = path.resolve(__dirname, "../..")
    for (const file of ["lib/os/pending-approvals.ts", "app/layout.tsx", "app/c/[companyId]/layout.tsx"]) {
      expect(await readFile(path.join(app, file), "utf-8"), file).toMatch(/openFlagCount\(/)
    }
  })

  it("AC13: decided held steps stay readable as history under their own job", async () => {
    await writeFile(path.join(root, "definitions/jobs.yaml"), "jobs:\n  - { id: followup, run: scripts/followup.sh, at: '08:00' }\n  - { id: other, run: scripts/other.sh, at: '09:00' }\n")
    const store = jobStore(jobsDir("acme", storeDir))
    const at = new Date()
    const mk = (title: string, mail = false) => ({ row: "publication" as const, title, detail: "", ...(mail ? { mail: { to: `${title}@x.com`, subject: "s", body: "b" } } : {}) })
    await recordHolds(store, { jobId: "followup", runId: "r1", entries: [mk("sent", true), mk("failed", true), mk("approved"), mk("rejected")], now: at })
    await recordHolds(store, { jobId: "other", runId: "r2", entries: [mk("elsewhere")], now: at })
    const ids = Object.fromEntries((await store.readHeld()).map((h) => [h.title, h.id]))
    await decideHeld(store, [ids.sent], "approve", async () => {})
    await decideHeld(store, [ids.failed], "approve", async () => {
      throw new Error("nope")
    })
    await decideHeld(store, [ids.approved], "approve", async () => {})
    await decideHeld(store, [ids.rejected], "reject", async () => {})
    const view = await readJobsView("acme", root, at, storeDir)
    if (!view.ok) throw new Error("view")
    const followup = view.jobs.find((j) => j.id === "followup")!
    expect(followup.held.map((h) => `${h.title}:${h.status}`).sort()).toEqual(["approved:approved", "failed:failed", "rejected:rejected", "sent:sent"])
    expect(view.jobs.find((j) => j.id === "other")!.held.map((h) => h.title)).toEqual(["elsewhere"])
    expect(view.heldError).toBe(false)
  })

  it("marks a job missed when it was known before yesterday and hasn't run since", async () => {
    await writeFile(path.join(root, "definitions/jobs.yaml"), "jobs:\n  - { id: followup, run: scripts/followup.sh, at: '08:00' }\n")
    const store = jobStore(path.join(storeDir, "acme"))
    await store.updateState(() => ({ lastRun: { followup: { date: "2026-10-12", status: "ok", message: "" } }, firstSeen: { followup: "2026-10-10 07:00" } }))
    const view = await readJobsView("acme", root, new Date(2026, 9, 16, 12, 0), storeDir)
    expect(view.ok && view.jobs[0].missed).toBe(true)
  })

  it("going live commits the jobs file; approving commits a decision note", async () => {
    await writeFile(path.join(root, "definitions/jobs.yaml"), "jobs:\n  - { id: followup, run: scripts/followup.sh, at: '08:00' }\n")
    await writeFile(path.join(root, "templates/invite.md"), TEMPLATE)
    await writeFile(path.join(root, "definitions/send-policies.yaml"), "policies:\n  - { id: invite, channel: outlook, template: templates/invite.md, fields: [name] }\n")
    const calls: string[][] = []
    const exec = async (_cmd: string, args: string[]) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }
    const ctx = { companyId: "acme", root, storeRoot: storeDir, exec, now: new Date(2026, 9, 16, 9, 0) }
    expect(await setJobMode(ctx, "followup", "live")).toMatchObject({ ok: true })
    expect(calls.some((a) => a.includes("commit") && a.includes("definitions/jobs.yaml"))).toBe(true)
    expect(await approve(ctx, "invite")).toMatchObject({ ok: true, message: "Approved. Live jobs may now send this message within its limits." })
    const note = await readFile(path.join(root, "docs/decisions/2026-10-16-approve-send-policy-invite.md"), "utf-8")
    expect(note).toContain("# Approve send policy: invite")
    expect(note).toContain("Subject: Welcome {{name}}")
    expect(await markHandled(ctx, "bad key")).toMatchObject({ ok: false })
    expect(await markHandled(ctx, "2026-10-16T00:00:00.000Z-followup-abc123#0")).toMatchObject({ ok: true })
  })
})
