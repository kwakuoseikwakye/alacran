import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it, vi } from "vitest"

const markFirstSaved = vi.hoisted(() => vi.fn(async (_dir: string) => {}))
vi.mock("@/lib/os/first-run-state", () => ({ markFirstSaved }))

import { afterApproval, afterDiscard } from "./outcome-hooks"
import { OUTCOMES_FILE } from "./outcomes"

const sandbox = mkdtempSync(path.join(os.tmpdir(), "outcome-hooks-"))
afterAll(() => rmSync(sandbox, { recursive: true, force: true }))
const lines = (d: string) => readFileSync(path.join(d, OUTCOMES_FILE), "utf-8").trimEnd().split("\n").map((l) => JSON.parse(l))

describe("outcome hooks", () => {
  it("afterApproval logs 'approved' and still marks the first save", async () => {
    const d = path.join(sandbox, "a")
    await afterApproval(d, { commandId: "digest", outputKind: "known-file" })
    expect(lines(d)).toMatchObject([{ command: "digest", outcome: "approved", kind: "known-file", files: 1 }])
    expect(markFirstSaved).toHaveBeenCalledWith(d)
  })
  it("afterApproval marks the first save even if the log cannot be written", async () => {
    markFirstSaved.mockClear()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const blocked = path.join(sandbox, "a", OUTCOMES_FILE, "x") // a path under a FILE cannot be created
    await afterApproval(blocked, { commandId: "digest", outputKind: "known-file" })
    expect(markFirstSaved).toHaveBeenCalledWith(blocked)
  })
  it("afterDiscard logs 'discarded'", async () => {
    const d = path.join(sandbox, "b")
    await afterDiscard(d, { commandId: "make-posts", outputKind: "new-file-in-dir" })
    expect(lines(d)).toMatchObject([{ command: "make-posts", outcome: "discarded", kind: "new-file-in-dir", files: 1 }])
  })
})
