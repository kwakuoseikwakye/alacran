import { describe, it, expect, afterEach, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { addGuide } from "./refresh"
import { guidePendingCount, observeGuide } from "./observe"
import { readGuideProposalState, recordDismissed } from "./proposal-state"
import { defaultExecFile } from "@/lib/default-exec-file"
import { makeRepo, cleanup } from "./test-repo"

const stateDirs: string[] = []
afterEach(() => {
  cleanup()
  while (stateDirs.length) fs.rmSync(stateDirs.pop()!, { recursive: true, force: true })
})
const PACKS = fs.mkdtempSync(path.join(os.tmpdir(), "guide-packs-"))
afterAll(() => fs.rmSync(PACKS, { recursive: true, force: true }))
const stateDir = () => { const d = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "guide-observe-")), "acme"); stateDirs.push(path.dirname(d)); return d }
const opts = (dir: string) => ({ dir, exec: defaultExecFile, packsRoot: PACKS })
const dept = (name: string) => `departments:\n  - {slug: ${name.toLowerCase()}, name: ${name}, purpose: Handles ${name}., color: "#0369a1"}\n`

async function company() {
  const r = makeRepo()
  r.write("AGENTS.md", "# Working agreement\n\nOwner rules.\n")
  r.commitAll()
  await addGuide(r.dir, { exec: defaultExecFile, packsRoot: PACKS })
  r.commitAll("guide")
  return r
}

describe("observeGuide", () => {
  it("a stale guide gives a proposal and sets the pending flag once, without touching the company", async () => {
    const r = await company()
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    const dir = stateDir()
    const view = await observeGuide({ id: "acme", rootPath: r.dir }, opts(dir))
    expect(view.result.kind).toBe("proposal")
    expect(view.dismissed).toBe(false)
    const id = view.result.kind === "proposal" ? view.result.proposal.id : ""
    const first = (await readGuideProposalState(dir)).pending
    expect(first?.id).toBe(id)
    await observeGuide({ id: "acme", rootPath: r.dir }, opts(dir))
    expect((await readGuideProposalState(dir)).pending).toEqual(first)
    expect(r.git("status", "--porcelain").trim()).toBe("")
    expect(await guidePendingCount("acme", dir)).toBe(1)
  })

  it("reports a dismissed version as dismissed and stops counting it for the badge", async () => {
    const r = await company()
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    const dir = stateDir()
    const view = await observeGuide({ id: "acme", rootPath: r.dir }, opts(dir))
    if (view.result.kind !== "proposal") throw new Error("expected a proposal")
    await recordDismissed(dir, view.result.proposal.id)
    expect((await observeGuide({ id: "acme", rootPath: r.dir }, opts(dir))).dismissed).toBe(true)
    expect(await guidePendingCount("acme", dir)).toBe(0)
  })

  it("a different change after a dismissal is not dismissed", async () => {
    const r = await company()
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    const dir = stateDir()
    const first = await observeGuide({ id: "acme", rootPath: r.dir }, opts(dir))
    if (first.result.kind !== "proposal") throw new Error("expected a proposal")
    await recordDismissed(dir, first.result.proposal.id)
    r.write("definitions/departments.yaml", dept("Legal") + `  - {slug: ops, name: Ops, purpose: Runs ops., color: "#0369a1"}\n`); r.commitAll("more")
    const second = await observeGuide({ id: "acme", rootPath: r.dir }, opts(dir))
    expect(second.result.kind).toBe("proposal")
    expect(second.dismissed).toBe(false)
    expect(await guidePendingCount("acme", dir)).toBe(1)
  })

  it("clears the pending flag when the guide is current again, and writes nothing when it was never set", async () => {
    const r = await company()
    const dir = stateDir()
    expect((await observeGuide({ id: "acme", rootPath: r.dir }, opts(dir))).result).toEqual({ kind: "none", state: { state: "up-to-date" } })
    expect(fs.existsSync(dir)).toBe(false)
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    await observeGuide({ id: "acme", rootPath: r.dir }, opts(dir))
    expect(await guidePendingCount("acme", dir)).toBe(1)
    r.git("revert", "--no-edit", "HEAD")
    await observeGuide({ id: "acme", rootPath: r.dir }, opts(dir))
    expect(await guidePendingCount("acme", dir)).toBe(0)
  })

  it("still returns the result when the state directory cannot be written", async () => {
    const r = await company()
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    const blocker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "guide-block-")), "file")
    stateDirs.push(path.dirname(blocker))
    fs.writeFileSync(blocker, "x")
    const view = await observeGuide({ id: "acme", rootPath: r.dir }, opts(path.join(blocker, "sub")))
    expect(view.result.kind).toBe("proposal")
    expect(view.dismissed).toBe(false)
  })

  it("a guide that needs attention is no proposal: the pending flag is cleared and an existing dismissal is kept", async () => {
    const r = await company()
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    const dir = stateDir()
    await observeGuide({ id: "acme", rootPath: r.dir }, opts(dir))
    expect(await guidePendingCount("acme", dir)).toBe(1)
    const earlier = "d".repeat(64) // an older version the owner said Not now to, so only the flag can make the count 0
    await recordDismissed(dir, earlier)
    fs.appendFileSync(path.join(r.dir, "AGENTS.md"), "\nOwner added a line.\n") // unsaved to history
    const view = await observeGuide({ id: "acme", rootPath: r.dir }, opts(dir))
    expect(view.result).toMatchObject({ kind: "none", state: { state: "needs-attention", reason: "dirty" } })
    expect(view.dismissed).toBe(false)
    expect(await guidePendingCount("acme", dir)).toBe(0)
    const state = await readGuideProposalState(dir)
    expect(state.pending).toBeUndefined()
    expect(state.dismissed?.id).toBe(earlier)
  })

  it("a company with no block is not-added and leaves no state behind", async () => {
    const r = makeRepo()
    const dir = stateDir()
    expect((await observeGuide({ id: "acme", rootPath: r.dir }, opts(dir))).result).toEqual({ kind: "none", state: { state: "not-added" } })
    expect(fs.existsSync(dir)).toBe(false)
  })
})

describe("guidePendingCount", () => {
  it("is 0 for a company that has never been observed", async () => {
    expect(await guidePendingCount("acme", stateDir())).toBe(0)
  })
})
