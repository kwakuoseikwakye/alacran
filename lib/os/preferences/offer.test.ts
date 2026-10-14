import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { CURSOR_FILE, OFFER_THRESHOLD, loadPreferenceOffer, offerFrom, readCursor, writeCursor } from "./offer"
import { WITHHELD, readOutcomes, recordOutcome, type OutcomeEntry } from "./outcomes"

const sandbox = mkdtempSync(path.join(os.tmpdir(), "offer-"))
afterAll(() => rmSync(sandbox, { recursive: true, force: true }))
let n = 0
const dir = () => path.join(sandbox, `d${n++}`)
const e = (command: string, outcome: OutcomeEntry["outcome"] = "revised"): OutcomeEntry => ({ at: "2026-10-12T00:00:00.000Z", command, outcome, kind: "known-file", files: 1, ...(outcome === "revised" ? { feedback: "shorter" } : {}) })

describe("offerFrom", () => {
  it("ignores learn-preferences' own reviews and withheld feedback", () => {
    const w = (): OutcomeEntry => ({ ...e("a"), feedback: WITHHELD })
    expect(offerFrom([e("learn-preferences"), e("learn-preferences"), e("learn-preferences")])).toBeNull()
    expect(offerFrom([w(), w(), w()])).toBeNull()
    expect(offerFrom([e("a"), e("a"), w()])).toBeNull()
    expect(offerFrom([e("a"), e("a"), e("a"), w()])).toEqual({ commands: [{ id: "a", revisions: 3 }] })
  })
  it("needs 3 revisions for the same command", () => {
    expect(OFFER_THRESHOLD).toBe(3)
    expect(offerFrom([e("a"), e("a")])).toBeNull()
    expect(offerFrom([e("a"), e("a"), e("a")])).toEqual({ commands: [{ id: "a", revisions: 3 }] })
  })
  it("does not add up revisions spread across commands, and ignores approvals and discards", () => {
    expect(offerFrom([e("a"), e("b"), e("c")])).toBeNull()
    expect(offerFrom([e("a"), e("a"), e("a", "approved"), e("a", "discarded")])).toBeNull()
  })
  it("lists every qualifying command, most revisions first", () => {
    const entries = [e("b"), e("b"), e("b"), e("a"), e("a"), e("a"), e("a")]
    expect(offerFrom(entries)).toEqual({ commands: [{ id: "a", revisions: 4 }, { id: "b", revisions: 3 }] })
  })
  it("ignores a revision with no feedback text", () => {
    const noText: OutcomeEntry = { ...e("a"), feedback: undefined }
    expect(offerFrom([noText, noText, noText])).toBeNull()
  })
})

describe("cursor + loadPreferenceOffer", () => {
  it("reads 0 for a missing, broken or nonsensical cursor", async () => {
    const d = dir()
    expect(await readCursor(d)).toBe(0)
    mkdirSync(d, { recursive: true })
    writeFileSync(path.join(d, CURSOR_FILE), "{oops")
    expect(await readCursor(d)).toBe(0)
    writeFileSync(path.join(d, CURSOR_FILE), JSON.stringify({ offset: -5 }))
    expect(await readCursor(d)).toBe(0)
    writeFileSync(path.join(d, CURSOR_FILE), JSON.stringify({ offset: "12" }))
    expect(await readCursor(d)).toBe(0)
  })
  it("offers from the log, and the cursor resets the count", async () => {
    const d = dir()
    for (let i = 0; i < 3; i++) await recordOutcome(d, { command: "make-posts", outcome: "revised", kind: "new-file-in-dir", files: 1, feedback: "shorter" })
    expect(await loadPreferenceOffer(d)).toEqual({ commands: [{ id: "make-posts", revisions: 3 }] })
    const { offset } = await readOutcomes(d)
    await writeCursor(d, offset)
    expect(await readCursor(d)).toBe(offset)
    expect(await loadPreferenceOffer(d)).toBeNull()
    await recordOutcome(d, { command: "make-posts", outcome: "revised", kind: "new-file-in-dir", files: 1, feedback: "shorter again" })
    expect(await loadPreferenceOffer(d)).toBeNull() // 1 new revision is not a pattern
  })
  it("is null for a company with no log", async () => {
    expect(await loadPreferenceOffer(dir())).toBeNull()
  })
})
