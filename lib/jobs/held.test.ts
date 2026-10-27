import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { bulkSummary, decideHeld, recordHolds } from "./held"
import { decideHeldActions } from "./manage"
import type { HoldRequest } from "./runner"
import type { Mail } from "./send-lane"
import { jobStore, jobsDir, type JobStore } from "./store"
import { openFlagCount, openHeld } from "./view"

let storeRoot: string
let companyRoot: string
let store: JobStore
let gitCalls: string[][]
const now = new Date("2026-10-26T09:00:00Z")
// A stand-in git: the action log commits in the company folder, and a test never runs real git.
const gitOk = async (_cmd: string, args: string[]) => {
  gitCalls.push(args)
  return { stdout: "", stderr: "" }
}

beforeEach(async () => {
  storeRoot = await mkdtemp(path.join(os.tmpdir(), "held-store-"))
  companyRoot = await mkdtemp(path.join(os.tmpdir(), "held-company-"))
  store = jobStore(jobsDir("acme", storeRoot))
  gitCalls = []
})
afterEach(async () => {
  await rm(storeRoot, { recursive: true, force: true })
  await rm(companyRoot, { recursive: true, force: true })
})

const mailHold = (to = "ama@x.com", subject = "Your invoice"): HoldRequest => ({
  row: "publication",
  title: `Email ${to}`,
  detail: "One-off reminder",
  mail: { to, subject, body: "Hi,\nplease pay.\n" },
})
const money: HoldRequest = { row: "money", title: "Pay the printer £120", detail: "Invoice 42" }
const access: HoldRequest = { row: "credentials", title: "Give Kofi Drive access", detail: "New hire" }

async function hold(entries: HoldRequest[]) {
  await recordHolds(store, { jobId: "followup", runId: "r1", entries, now })
  return store.readHeld()
}

describe("held queue", () => {
  it("AC4: the same step held again while one waits is not added twice; after a reject it can be held again", async () => {
    const first = await recordHolds(store, { jobId: "followup", runId: "r1", entries: [mailHold(), mailHold()], now })
    expect(first.map((o) => o.result)).toEqual(["held", "already-waiting"])
    const second = await recordHolds(store, { jobId: "followup", runId: "r2", entries: [mailHold()], now })
    expect(second.map((o) => o.result)).toEqual(["already-waiting"])
    expect(await store.readHeld()).toHaveLength(1)
    // A different job holding the same content is a different step.
    await recordHolds(store, { jobId: "other", runId: "r3", entries: [mailHold()], now })
    expect(await store.readHeld()).toHaveLength(2)
    const [item] = await store.readHeld()
    await decideHeld(store, [item.id], "reject", vi.fn())
    await recordHolds(store, { jobId: "followup", runId: "r4", entries: [mailHold()], now })
    expect((await store.readHeld()).filter((h) => h.status === "pending")).toHaveLength(2)
  })

  it("AC6: approving a held mail sends exactly the stored snapshot, once, and marks it sent", async () => {
    const [item] = await hold([mailHold()])
    const send = vi.fn(async (_: Mail) => {})
    const r = await decideHeld(store, [item.id], "approve", send, () => now)
    expect(r).toMatchObject({ sent: 1, failed: 0 })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toEqual(item.mail)
    expect((await store.readHeld())[0]).toMatchObject({ status: "sent", sentAt: now.toISOString() })
  })

  it("AC6: only the server-side decision path, with a valid id, can move an item off pending", async () => {
    const [item] = await hold([mailHold()])
    const send = vi.fn(async () => {})
    const ctx = { companyId: "acme", root: companyRoot, storeRoot, exec: gitOk }
    expect(await decideHeldActions(ctx, ["../../etc"], "approve", send)).toEqual({ ok: false, message: "That item isn't valid." })
    expect(await decideHeldActions(ctx, "x" as unknown, "approve", send)).toMatchObject({ ok: false })
    expect(send).not.toHaveBeenCalled()
    expect(await decideHeldActions(ctx, [item.id], "approve", send)).toEqual({ ok: true, message: "Sent 1." })
  })

  it("AC7: two racing approvals send the mail at most once", async () => {
    const [a, b] = await hold([mailHold("a@x.com"), mailHold("b@x.com")])
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const send = vi.fn(async (_: Mail) => gate)
    const both = Promise.all([decideHeld(store, [a.id], "approve", send), decideHeld(store, [a.id, b.id], "approve", send)])
    await new Promise((r) => setTimeout(r, 20))
    release()
    const [one, all] = await both
    expect(send.mock.calls.map((c) => (c[0] as Mail).to).sort()).toEqual(["a@x.com", "b@x.com"])
    expect(one.sent + all.sent).toBe(2)
    expect(one.skipped + all.skipped).toBe(1)
    // A second press after it went out does nothing.
    expect(await decideHeld(store, [a.id], "approve", send)).toMatchObject({ sent: 0, skipped: 1 })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("AC8: a failed send shows failed with the reason, stays listed, and is never retried", async () => {
    const [item] = await hold([mailHold()])
    const send = vi.fn(async () => {
      throw new Error("Not signed in to Outlook")
    })
    expect(await decideHeld(store, [item.id], "approve", send)).toMatchObject({ failed: 1 })
    expect((await store.readHeld())[0]).toMatchObject({ status: "failed", reason: "Not signed in to Outlook." })
    const open = await openHeld("acme", storeRoot)
    expect(open.ok && open.items.map((i) => i.status)).toEqual(["failed"])
    await decideHeld(store, [item.id], "approve", send)
    expect(send).toHaveBeenCalledTimes(1)
    // Clearing takes it off Approvals but keeps the failure in history.
    expect(await decideHeld(store, [item.id], "reject", send)).toMatchObject({ cleared: 1 })
    expect(await openHeld("acme", storeRoot)).toEqual({ ok: true, items: [] })
    expect((await store.readHeld())[0].status).toBe("failed")
  })

  it("an approved money step not yet cleared blocks a re-hold; once cleared it can be held again", async () => {
    const [item] = await hold([money])
    const send = vi.fn()
    await decideHeld(store, [item.id], "approve", send)
    expect(await recordHolds(store, { jobId: "followup", runId: "r2", entries: [money], now })).toEqual([expect.objectContaining({ result: "already-waiting" })])
    expect(await store.readHeld()).toHaveLength(1)
    // "Done, clear it"
    expect(await decideHeld(store, [item.id], "reject", send)).toMatchObject({ cleared: 1 })
    expect(await recordHolds(store, { jobId: "followup", runId: "r3", entries: [money], now })).toEqual([expect.objectContaining({ result: "held" })])
    expect((await store.readHeld()).map((h) => h.status)).toEqual(["approved", "pending"])
    expect(send).not.toHaveBeenCalled()
  })

  it("AC9: approving money or credentials records the decision and executes nothing", async () => {
    const items = await hold([money, access])
    const send = vi.fn()
    const ctx = { companyId: "acme", root: companyRoot, storeRoot, exec: gitOk }
    const r = await decideHeldActions(ctx, items.map((i) => i.id), "approve", send)
    expect(r.message).toBe("2 approved for you to do yourself. Alacrán can't carry these steps out itself: you do them.")
    expect(r.message).not.toMatch(/\b(done|sent|paid)\b/i)
    expect(send).not.toHaveBeenCalled()
    for (const h of await store.readHeld()) expect(h).toMatchObject({ status: "approved", decidedAt: expect.any(String) })
    // They stay in Approvals, and in the badge, until the owner says they've done them.
    expect(await openFlagCount("acme", storeRoot)).toBe(2)
    expect(await decideHeldActions(ctx, [items[0].id], "reject", send)).toEqual({ ok: true, message: "Cleared 1." })
    const open = await openHeld("acme", storeRoot)
    expect(open.ok && open.items.map((i) => i.id)).toEqual([items[1].id])
    expect(await openFlagCount("acme", storeRoot)).toBe(1)
    expect((await store.readHeld())[0]).toMatchObject({ status: "approved", clearedAt: expect.any(String) })
  })

  it("AC10: reject marks it rejected with a time, sends nothing, and it leaves the waiting list", async () => {
    const [item] = await hold([mailHold()])
    const send = vi.fn()
    expect(await decideHeld(store, [item.id], "reject", send, () => now)).toMatchObject({ rejected: 1 })
    expect((await store.readHeld())[0]).toMatchObject({ status: "rejected", decidedAt: now.toISOString() })
    expect(send).not.toHaveBeenCalled()
    expect(await openHeld("acme", storeRoot)).toEqual({ ok: true, items: [] })
  })

  it("AC11: approve-all says what it will send first, and one failure doesn't stop the rest", async () => {
    const items = await hold([mailHold("a@x.com"), mailHold("b@x.com"), mailHold("a@x.com", "Second note"), money])
    expect(bulkSummary(items)).toBe("This sends 3 messages to 2 people and records 1 decision for you to carry out yourself. Nothing is sent until you confirm.")
    const send = vi.fn(async (m: Mail) => {
      if (m.to === "b@x.com") throw new Error("Outlook refused it")
    })
    const ctx = { companyId: "acme", root: companyRoot, storeRoot, exec: gitOk }
    const r = await decideHeldActions(ctx, items.map((i) => i.id), "approve", send)
    expect(send).toHaveBeenCalledTimes(3)
    expect(r).toEqual({ ok: false, message: "1 failed to send.", note: "Sent 2, 1 approved for you to do yourself. Alacrán can't carry these steps out itself: you do them." })
    const rest = await hold([mailHold("c@x.com"), mailHold("d@x.com")])
    const pending = rest.filter((h) => h.status === "pending").map((h) => h.id)
    expect(await decideHeldActions(ctx, pending, "reject", send)).toEqual({ ok: true, message: "Rejected 2." })
  })

  it("AC12: a broken queue file is never read as empty, and is never overwritten", async () => {
    await hold([mailHold()])
    const file = path.join(jobsDir("acme", storeRoot), "held.json")
    await writeFile(file, "{ not json")
    await expect(store.readHeld()).rejects.toThrow()
    await expect(recordHolds(store, { jobId: "followup", runId: "r9", entries: [money], now })).rejects.toThrow()
    expect(await openHeld("acme", storeRoot)).toEqual({ ok: false })
    const ctx = { companyId: "acme", root: companyRoot, storeRoot, exec: gitOk }
    expect(await decideHeldActions(ctx, ["00000000-0000-4000-8000-000000000000"], "approve", vi.fn())).toMatchObject({ ok: false })
  })

  it("failed send: the CLI's terminal command is dropped, so the owner sees only the Connected tools route", async () => {
    const [item] = await hold([mailHold()])
    const send = vi.fn(async () => {
      throw new Error("Not signed in to Outlook. Connect it in Alacrán (Connected tools), or run: alacran-outlook auth login")
    })
    await decideHeld(store, [item.id], "approve", send)
    expect((await store.readHeld())[0].reason).toBe("Not signed in to Outlook. Connect it in Alacrán (Connected tools).")
  })

  it("failed send: the job's next run can offer it again, and the new card replaces the old failure", async () => {
    const [item] = await hold([mailHold()])
    await decideHeld(store, [item.id], "approve", vi.fn(async () => Promise.reject(new Error("offline"))))
    const again = await recordHolds(store, { jobId: "followup", runId: "r2", entries: [mailHold()], now })
    expect(again.map((o) => o.result)).toEqual(["held"])
    const open = await openHeld("acme", storeRoot)
    expect(open.ok && open.items.map((i) => i.status)).toEqual(["pending"])
    expect((await store.readHeld())[0]).toMatchObject({ status: "failed", clearedAt: now.toISOString() })
  })

  it("stuck send: Clear works only once it has been sending longer than the send timeout, and frees the step to be held again", async () => {
    const [item] = await hold([mailHold()])
    // A send that never settles leaves the item in `sending`.
    void decideHeld(store, [item.id], "approve", () => new Promise(() => {}), () => now)
    await vi.waitFor(async () => expect((await store.readHeld())[0].status).toBe("sending"))
    const soon = () => new Date(now.getTime() + 30_000)
    expect(await decideHeld(store, [item.id], "reject", vi.fn(), soon)).toMatchObject({ cleared: 0, skipped: 1 })
    expect(await recordHolds(store, { jobId: "followup", runId: "r2", entries: [mailHold()], now })).toEqual([expect.objectContaining({ result: "already-waiting" })])
    const late = () => new Date(now.getTime() + 61_000)
    expect(await decideHeld(store, [item.id], "reject", vi.fn(), late)).toMatchObject({ cleared: 1 })
    expect(await openHeld("acme", storeRoot)).toEqual({ ok: true, items: [] })
    expect((await store.readHeld())[0]).toMatchObject({ status: "sending", clearedAt: expect.any(String) })
    expect((await recordHolds(store, { jobId: "followup", runId: "r3", entries: [mailHold()], now }))[0].result).toBe("held")
  })

  it("a record that fails after a send never says 'nothing was sent', and the other claimed items still go", async () => {
    const items = await hold([mailHold("a@x.com"), mailHold("b@x.com")])
    const file = path.join(jobsDir("acme", storeRoot), "held.json")
    const sent: string[] = []
    const send = vi.fn(async (m: Mail) => {
      sent.push(m.to)
      // The queue file breaks between the send and its record.
      if (m.to === "a@x.com") await writeFile(file, "{ not json")
    })
    const ctx = { companyId: "acme", root: companyRoot, storeRoot, exec: gitOk }
    const r = await decideHeldActions(ctx, items.map((i) => i.id), "approve", send)
    expect(sent).toEqual(["a@x.com", "b@x.com"])
    expect(r.ok).toBe(false)
    expect(r.message).toBe("2 may have been sent but couldn't be recorded: check Outlook's Sent folder before doing anything else.")
    expect(r.message).not.toMatch(/nothing was/i)
    // Only a failure before anything is claimed says nothing was changed or sent.
    expect((await decideHeldActions(ctx, [items[0].id], "approve", send)).message).toMatch(/nothing was changed or sent/)
  })

  it("AC9: trimming old history never drops a step the owner still owes", async () => {
    const at = now.toISOString()
    const item = (i: number, status: string) => ({ id: `id-${i}`, key: `k${i}`, jobId: "j", runId: "r", row: "money", title: "t", detail: "", createdAt: at, status })
    const file = path.join(jobsDir("acme", storeRoot), "held.json")
    await hold([])
    await writeFile(file, JSON.stringify([item(0, "approved"), ...Array.from({ length: 501 }, (_, i) => item(i + 1, "rejected"))]))
    await recordHolds(store, { jobId: "followup", runId: "r2", entries: [money], now })
    const after = await store.readHeld()
    expect(after.find((h) => h.id === "id-0")).toBeDefined()
    expect(after.filter((h) => h.status === "rejected")).toHaveLength(500)
  })
})

describe("action log of held decisions", () => {
  const at = new Date(2026, 9, 26, 9, 0)
  const ctx = () => ({ companyId: "acme", root: companyRoot, storeRoot, exec: gitOk, now: at })
  const lines = async () => {
    const text = await readFile(path.join(companyRoot, "records/actions/2026-10.md"), "utf-8").catch(() => "")
    return text.split("\n").filter((l) => l.startsWith("- "))
  }
  const commits = () => gitCalls.filter((a) => a.includes("commit"))

  it("AC3: an approved held mail logs one 'sent' line, approved by the owner; a failed one logs the reason", async () => {
    const [ok, bad] = await hold([mailHold(), mailHold("kofi@x.com", "Reminder")])
    const send = vi.fn(async (m: Mail) => {
      if (m.to === "kofi@x.com") throw new Error("Outlook refused it")
    })
    await decideHeldActions(ctx(), [ok.id], "approve", send)
    await decideHeldActions(ctx(), [bad.id], "approve", send)
    expect(await lines()).toEqual([
      '- 2026-10-26 09:00 · Sent email "Your invoice" to ama@x.com · job followup · approved by the owner',
      '- 2026-10-26 09:00 · Email "Reminder" to kofi@x.com not sent: Outlook refused it. · job followup · approved by the owner',
    ])
    // The body never reaches the log.
    expect((await readFile(path.join(companyRoot, "records/actions/2026-10.md"), "utf-8")).includes("please pay")).toBe(false)
  })

  it("AC3: a double approve logs one line for one mail; approve-all logs one line per mail sent or failed", async () => {
    const [a] = await hold([mailHold("a@x.com")])
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const send = vi.fn(async (_: Mail) => gate)
    const both = Promise.all([decideHeldActions(ctx(), [a.id], "approve", send), decideHeldActions(ctx(), [a.id], "approve", send)])
    await new Promise((r) => setTimeout(r, 20))
    release()
    await both
    expect(send).toHaveBeenCalledTimes(1)
    expect(await lines()).toHaveLength(1)

    const items = await hold([mailHold("b@x.com"), mailHold("c@x.com"), mailHold("d@x.com")])
    gitCalls = []
    await decideHeldActions(ctx(), items.map((i) => i.id), "approve", async (m: Mail) => {
      if (m.to === "c@x.com") throw new Error("offline")
    })
    const all = await lines()
    expect(all.filter((l) => l.includes("Sent email"))).toHaveLength(3)
    expect(all.filter((l) => l.includes("not sent: offline."))).toHaveLength(1)
    // AC6: approve-all with three mails is one commit.
    expect(commits()).toHaveLength(1)
  })

  it("AC4: approving money logs it as the owner's to carry out, never as done; 'Done, clear it' adds a second line", async () => {
    const [item] = await hold([money])
    const send = vi.fn()
    await decideHeldActions(ctx(), [item.id], "approve", send)
    const [first] = await lines()
    expect(first).toBe('- 2026-10-26 09:00 · Spends money: "Pay the printer £120" · job followup · approved by the owner, to be carried out by the owner')
    expect(first).not.toMatch(/Sent|marked done/)
    await decideHeldActions(ctx(), [item.id], "reject", send)
    expect((await lines())[1]).toBe('- 2026-10-26 09:00 · Spends money: "Pay the printer £120" · job followup · marked done by the owner')
    expect(send).not.toHaveBeenCalled()
  })

  it("AC5/AC6: rejecting several steps logs one 'rejected' line each, sends nothing, and commits once", async () => {
    const items = await hold([mailHold(), access])
    const send = vi.fn()
    expect(await decideHeldActions(ctx(), items.map((i) => i.id), "reject", send)).toEqual({ ok: true, message: "Rejected 2." })
    const all = await lines()
    expect(all).toHaveLength(2)
    for (const l of all) expect(l).toMatch(/· job followup · rejected by the owner$/)
    expect(all[0]).toContain('Rejected: "Email ama@x.com"')
    expect(send).not.toHaveBeenCalled()
    expect(commits()).toHaveLength(1)
    // A second press decides nothing and logs nothing.
    await decideHeldActions(ctx(), items.map((i) => i.id), "reject", send)
    expect(await lines()).toHaveLength(2)
  })

  it("AC9: a log that can't be committed leaves the send as it was and says so in the result", async () => {
    const [item] = await hold([mailHold()])
    const send = vi.fn(async () => {})
    const broken = async (_cmd: string, args: string[]) => {
      if (args.includes("commit")) throw new Error("index.lock")
      return { stdout: "", stderr: "" }
    }
    const r = await decideHeldActions({ ...ctx(), exec: broken }, [item.id], "approve", send)
    expect(r).toEqual({ ok: false, message: "The action log in the company folder couldn't be updated.", note: "Sent 1." })
    expect(send).toHaveBeenCalledTimes(1)
    expect((await store.readHeld())[0].status).toBe("sent")
    expect(await lines()).toHaveLength(1)
  })
})
