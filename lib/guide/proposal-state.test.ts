import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  clearDismissed,
  isDismissed,
  isProposalId,
  pendingCountOf,
  readGuideProposalState,
  recordDismissed,
  recordPending,
} from "./proposal-state"

const dirs: string[] = []
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }) })
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "guide-state-")); dirs.push(d); return d }
const A = "a".repeat(64)
const B = "b".repeat(64)
const at = (iso: string) => () => new Date(iso)
const file = (dir: string) => path.join(dir, "guide-proposal.json")

describe("reading", () => {
  it("a missing file, a missing directory, corrupt JSON and wrong types all read as nothing recorded", async () => {
    const dir = tmp()
    expect(await readGuideProposalState(dir)).toEqual({})
    expect(await readGuideProposalState(path.join(dir, "nope"))).toEqual({})
    fs.writeFileSync(file(dir), "{not json")
    expect(await readGuideProposalState(dir)).toEqual({})
    fs.writeFileSync(file(dir), JSON.stringify(["x"]))
    expect(await readGuideProposalState(dir)).toEqual({})
    fs.writeFileSync(file(dir), JSON.stringify({ pending: { id: 7, detectedAt: "x" }, dismissed: "no" }))
    expect(await readGuideProposalState(dir)).toEqual({})
  })

  it("ignores an id that is not 64 hex characters, so a junk file cannot hide or raise a proposal", async () => {
    const dir = tmp()
    fs.writeFileSync(file(dir), JSON.stringify({ pending: { id: "../../etc", detectedAt: "2026-10-05T00:00:00.000Z" } }))
    expect(await readGuideProposalState(dir)).toEqual({})
  })
})

describe("isProposalId", () => {
  it("is true only for a lowercase 64-hex string, never for a value that merely prints as one", () => {
    expect(isProposalId(A)).toBe(true)
    for (const bad of [[A], A.toUpperCase(), A.slice(1), `${A}a`, `${A}\n`, "../../etc", 7, null, undefined, { id: A }]) {
      expect(isProposalId(bad)).toBe(false)
    }
  })

  it("the reader drops a stored id that is wrapped in an array", async () => {
    const dir = tmp()
    fs.writeFileSync(file(dir), JSON.stringify({ dismissed: { id: [A], dismissedAt: "2026-10-05T00:00:00.000Z" } }))
    expect(await readGuideProposalState(dir)).toEqual({})
  })
})

describe("pending", () => {
  it("records the id once and keeps the first detection time when the same id is seen again", async () => {
    const dir = tmp()
    await recordPending(dir, A, at("2026-10-05T09:00:00.000Z"))
    await recordPending(dir, A, at("2026-10-05T10:00:00.000Z"))
    expect((await readGuideProposalState(dir)).pending).toEqual({ id: A, detectedAt: "2026-10-05T09:00:00.000Z" })
    await recordPending(dir, B, at("2026-10-05T11:00:00.000Z"))
    expect((await readGuideProposalState(dir)).pending).toEqual({ id: B, detectedAt: "2026-10-05T11:00:00.000Z" })
  })

  it("clearing when nothing is pending writes nothing at all", async () => {
    const dir = tmp()
    await recordPending(dir, null)
    expect(fs.existsSync(file(dir))).toBe(false)
  })

  it("clearing keeps the dismissal", async () => {
    const dir = tmp()
    await recordDismissed(dir, A)
    await recordPending(dir, A)
    await recordPending(dir, null)
    const state = await readGuideProposalState(dir)
    expect(state.pending).toBeUndefined()
    expect(state.dismissed?.id).toBe(A)
  })
})

describe("dismissed", () => {
  it("remembers one version, replaces it with the next, and clears", async () => {
    const dir = tmp()
    await recordDismissed(dir, A, at("2026-10-05T09:00:00.000Z"))
    await recordDismissed(dir, A, at("2026-10-05T10:00:00.000Z"))
    expect((await readGuideProposalState(dir)).dismissed).toEqual({ id: A, dismissedAt: "2026-10-05T09:00:00.000Z" })
    await recordDismissed(dir, B)
    expect((await readGuideProposalState(dir)).dismissed?.id).toBe(B)
    await clearDismissed(dir)
    expect((await readGuideProposalState(dir)).dismissed).toBeUndefined()
  })

  it("isDismissed and pendingCountOf: a pending version the owner dismissed does not count, a different one does", async () => {
    const dir = tmp()
    await recordPending(dir, A)
    await recordDismissed(dir, A)
    let state = await readGuideProposalState(dir)
    expect(isDismissed(state, A)).toBe(true)
    expect(isDismissed(state, B)).toBe(false)
    expect(pendingCountOf(state)).toBe(0)
    await recordPending(dir, B)
    state = await readGuideProposalState(dir)
    expect(pendingCountOf(state)).toBe(1)
    expect(pendingCountOf({})).toBe(0)
  })
})

describe("writing", () => {
  it("leaves no temp files behind and never writes outside its directory", async () => {
    const dir = tmp()
    await recordPending(dir, A)
    await recordDismissed(dir, B)
    await clearDismissed(dir)
    expect(fs.readdirSync(dir)).toEqual(["guide-proposal.json"])
  })

  it("creates the directory when it does not exist yet", async () => {
    const dir = path.join(tmp(), "company-runs", "acme")
    await recordPending(dir, A)
    expect(fs.existsSync(file(dir))).toBe(true)
  })
})
