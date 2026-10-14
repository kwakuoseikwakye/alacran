import { describe, it, expect, vi, afterEach, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { addGuide } from "./refresh"
import { observeGuide } from "./observe"
import { proposeGuide } from "./proposal"
import { recordDismissed, recordPending } from "./proposal-state"
import { defaultExecFile } from "@/lib/default-exec-file"
import { makeRepo, cleanup } from "./test-repo"

// File-wide: the pending flag can never be written (a full disk, say). Every other proposal-state function is real.
vi.mock("./proposal-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./proposal-state")>()),
  recordPending: vi.fn().mockRejectedValue(new Error("disk full")),
}))

const stateDirs: string[] = []
afterEach(() => {
  cleanup()
  while (stateDirs.length) fs.rmSync(stateDirs.pop()!, { recursive: true, force: true })
})
const PACKS = fs.mkdtempSync(path.join(os.tmpdir(), "guide-packs-"))
afterAll(() => fs.rmSync(PACKS, { recursive: true, force: true }))
const deps = { exec: defaultExecFile, packsRoot: PACKS }

describe("observeGuide when the pending flag cannot be written", () => {
  it("still knows the owner said Not now to this version, and does not throw", async () => {
    const r = makeRepo()
    r.write("AGENTS.md", "# Working agreement\n\nOwner rules.\n"); r.commitAll()
    await addGuide(r.dir, deps); r.commitAll("guide")
    r.write("definitions/departments.yaml", `departments:\n  - {slug: legal, name: Legal, purpose: Handles Legal., color: "#0369a1"}\n`); r.commitAll("dept")
    const live = await proposeGuide(r.dir, deps)
    if (live.kind !== "proposal") throw new Error("expected a proposal")
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "guide-observe-")), "acme")
    stateDirs.push(path.dirname(dir))
    await recordDismissed(dir, live.proposal.id)

    const view = await observeGuide({ id: "acme", rootPath: r.dir }, { dir, ...deps })

    expect(recordPending).toHaveBeenCalled() // the flag write was tried, and failed
    expect(view.result.kind).toBe("proposal")
    expect(view.dismissed).toBe(true) // a failed flag write must not bring a dismissed version back
  })
})
