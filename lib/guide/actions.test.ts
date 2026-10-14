import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it, expect, vi, afterEach } from "vitest"
import {
  addGuideActionImpl,
  approveGuideProposalActionImpl,
  dismissGuideProposalActionImpl,
  reopenGuideProposalActionImpl,
} from "./actions"
import { parseBlock } from "./apply"
import { proposeGuide } from "./proposal"
import { readGuideProposalState, recordDismissed, recordPending } from "./proposal-state"
import { defaultExecFile } from "@/lib/default-exec-file"
import { makeRepo, cleanup } from "./test-repo"

const stateDirs: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
  while (stateDirs.length) fs.rmSync(stateDirs.pop()!, { recursive: true, force: true })
})
const agreement = "# Working agreement\n\nOwner rules.\n"
const A = "a".repeat(64)

function setup() {
  const r = makeRepo(); r.write("AGENTS.md", agreement); r.commitAll()
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "guide-actions-state-")); stateDirs.push(state)
  const revalidate = vi.fn()
  const deps = { resolveRoot: async (id: string) => (id === "acme" ? r.dir : null), revalidate, stateDir: () => state }
  return { r, deps, revalidate, state }
}
const dept = `departments:\n  - {slug: legal, name: Legal, purpose: Contracts., color: "#0369a1"}\n`

/** A company whose guide went stale because a department was added outside the app, plus what the owner was shown. */
async function staleCompany() {
  const s = setup()
  await addGuideActionImpl("acme", s.deps)
  s.r.write("definitions/departments.yaml", dept); s.r.commitAll("dept")
  const res = await proposeGuide(s.r.dir, { exec: defaultExecFile })
  if (res.kind !== "proposal") throw new Error("expected a proposal")
  return { ...s, expected: { id: res.proposal.id, baseBodyHash: res.proposal.baseBodyHash } }
}
const commitCount = (r: ReturnType<typeof makeRepo>) => Number(r.git("rev-list", "--count", "HEAD").trim())

describe("add", () => {
  it("resolves the root from the company id, commits only AGENTS.md and revalidates", async () => {
    const { r, deps, revalidate } = setup()
    r.write("unrelated.txt", "someone else's work")
    const res = await addGuideActionImpl("acme", deps)
    expect(res).toMatchObject({ ok: true, committed: true, changed: true })
    expect(r.git("show", "--name-only", "--format=", "HEAD").trim()).toBe("AGENTS.md")
    expect(r.git("status", "--porcelain")).toContain("unrelated.txt")
    expect(revalidate).toHaveBeenCalledWith("/c/acme/skills")
  })
  it("reports a refusal as a plain error, not an exception", async () => {
    const { deps } = setup()
    await addGuideActionImpl("acme", deps)
    expect(await addGuideActionImpl("acme", deps)).toMatchObject({ ok: false, code: "exists" })
  })
  it("a commit failure after the write is ok:true, committed:false with a short plain message", async () => {
    const { r, deps } = setup()
    r.write(".git/hooks/pre-commit", "#!/bin/sh\necho 'boom: /secret/path'\necho second line\nexit 1\n")
    fs.chmodSync(`${r.dir}/.git/hooks/pre-commit`, 0o755)
    const res = await addGuideActionImpl("acme", deps)
    expect(res).toMatchObject({ ok: true, committed: false, changed: true })
    const msg = (res as { commitError: string }).commitError
    expect(msg.length).toBeLessThanOrEqual(200)
    expect(msg).not.toContain("\n")
    expect(msg).not.toContain("second line")
    expect(r.git("status", "--porcelain")).toContain("AGENTS.md")
  })
})

describe("approve", () => {
  it("rewrites only the guide block, in one commit that touches only AGENTS.md, and clears the pending flag", async () => {
    const { r, deps, revalidate, state, expected } = await staleCompany()
    r.write("unrelated.txt", "someone else's work")
    await recordPending(state, expected.id)
    const before = r.read("AGENTS.md")
    const commitsBefore = commitCount(r)
    const res = await approveGuideProposalActionImpl("acme", expected, deps)
    expect(res).toMatchObject({ ok: true, committed: true, changed: true })
    expect(commitCount(r)).toBe(commitsBefore + 1)
    expect(r.git("show", "--name-only", "--format=", "HEAD").trim()).toBe("AGENTS.md")
    expect(r.git("log", "-1", "--format=%s").trim()).toBe("docs: update the operating guide")
    expect(r.git("status", "--porcelain")).toContain("unrelated.txt")
    const after = r.read("AGENTS.md")
    const was = parseBlock(before)
    const now = parseBlock(after)
    if (was.kind !== "ok" || now.kind !== "ok") throw new Error("expected blocks")
    expect(after.slice(0, now.start)).toBe(before.slice(0, was.start))
    expect(after.slice(now.end)).toBe(before.slice(was.end))
    expect(after).toContain("Legal")
    expect((await readGuideProposalState(state)).pending).toBeUndefined()
    for (const page of ["skills", "tasks", "dashboard"]) expect(revalidate).toHaveBeenCalledWith(`/c/acme/${page}`)
  })

  it("writes exactly the proposal that was shown: the new block's body hash is the proposal id", async () => {
    const { r, deps, expected } = await staleCompany()
    expect(await approveGuideProposalActionImpl("acme", expected, deps)).toMatchObject({ ok: true, changed: true })
    const written = parseBlock(r.read("AGENTS.md"))
    if (written.kind !== "ok") throw new Error("expected a block")
    expect(written.bodyHash).toBe(expected.id)
  })

  it("an input that changes after the guide was read is not written under this approval", async () => {
    const { r, deps, expected } = await staleCompany()
    const file = path.join(r.dir, "AGENTS.md")
    const real = fs.promises.readFile
    let looks = 0
    vi.spyOn(fs.promises, "readFile").mockImplementation((async (...args: Parameters<typeof real>) => {
      // The first look at AGENTS.md is the reading that approve checks and writes from. Anything that looks again does
      // so after that, and a department landing right then must not be smuggled into what the owner approved.
      if (String(args[0]) === file && ++looks === 2) {
        fs.writeFileSync(path.join(r.dir, "definitions/departments.yaml"), `${dept}  - {slug: ops, name: Ops, purpose: Runs ops., color: "#0369a1"}\n`)
      }
      return real(...args)
    }) as typeof real)
    const res = await approveGuideProposalActionImpl("acme", expected, deps)
    vi.restoreAllMocks()
    expect(res).toMatchObject({ ok: true, committed: true, changed: true })
    const after = r.read("AGENTS.md")
    expect(after).toContain("Legal")
    expect(after).not.toContain("Ops")
    expect(parseBlock(after)).toMatchObject({ kind: "ok", bodyHash: expected.id })
    expect(r.git("status", "--porcelain")).toContain("definitions/departments.yaml") // the later change is still the owner's, unsaved
    expect(await proposeGuide(r.dir, { exec: defaultExecFile })).toMatchObject({ kind: "proposal" }) // and it gets its own proposal next
  })

  it("an AGENTS.md that cannot be read is reported plainly, without paths, and nothing is written", async () => {
    const { r, deps, expected } = await staleCompany()
    fs.rmSync(path.join(r.dir, "AGENTS.md")); fs.mkdirSync(path.join(r.dir, "AGENTS.md"))
    const commitsBefore = commitCount(r)
    expect(await approveGuideProposalActionImpl("acme", expected, deps)).toEqual({ ok: false, code: "failed", error: "AGENTS.md couldn't be read or written." })
    expect(commitCount(r)).toBe(commitsBefore)
  })

  it("writes nothing and says so when the proposal changed since it was shown", async () => {
    const { r, deps, expected } = await staleCompany()
    const before = r.read("AGENTS.md")
    const commitsBefore = commitCount(r)
    const wrongId = await approveGuideProposalActionImpl("acme", { ...expected, id: A }, deps)
    expect(wrongId).toEqual({ ok: false, code: "changed", error: "Things changed while you were reading. Here are the new changes." })
    expect(await approveGuideProposalActionImpl("acme", { ...expected, baseBodyHash: A }, deps)).toMatchObject({ ok: false, code: "changed" })
    expect(r.read("AGENTS.md")).toBe(before)
    expect(commitCount(r)).toBe(commitsBefore)
  })

  it("inputs that changed again between viewing and approving are refused, not silently applied", async () => {
    const { r, deps, expected } = await staleCompany()
    r.write("definitions/departments.yaml", `${dept}  - {slug: ops, name: Ops, purpose: Runs ops., color: "#0369a1"}\n`); r.commitAll("more")
    const before = r.read("AGENTS.md")
    expect(await approveGuideProposalActionImpl("acme", expected, deps)).toMatchObject({ ok: false, code: "changed" })
    expect(r.read("AGENTS.md")).toBe(before)
  })

  it("an already current guide writes nothing, makes no commit, and clears the pending flag", async () => {
    const { r, deps, state } = setup()
    await addGuideActionImpl("acme", deps)
    await recordPending(state, A)
    const commitsBefore = commitCount(r)
    const res = await approveGuideProposalActionImpl("acme", { id: A, baseBodyHash: A }, deps)
    expect(res).toEqual({ ok: true, changed: false, committed: true })
    expect(commitCount(r)).toBe(commitsBefore)
    expect((await readGuideProposalState(state)).pending).toBeUndefined()
  })

  it("refuses an edited block with a plain message and leaves the file alone", async () => {
    const { r, deps, expected } = await staleCompany()
    r.write("AGENTS.md", r.read("AGENTS.md").replace("Read the company's", "Read my")); r.commitAll("edit")
    const before = r.read("AGENTS.md")
    const res = await approveGuideProposalActionImpl("acme", expected, deps)
    expect(res).toMatchObject({ ok: false, code: "edited" })
    expect((res as { error: string }).error).not.toMatch(/\/|errno|ENOENT/)
    expect(r.read("AGENTS.md")).toBe(before)
  })

  it("an unknown company never reaches the filesystem, and junk input is refused first", async () => {
    const { deps, expected } = await staleCompany()
    expect(await approveGuideProposalActionImpl("ghost", expected, deps)).toEqual({ ok: false, code: "not-found", error: "Company not found: ghost" })
    expect(await approveGuideProposalActionImpl("acme", { id: "../x", baseBodyHash: A }, deps)).toMatchObject({ ok: false, code: "invalid" })
    expect(await approveGuideProposalActionImpl("acme", undefined as never, deps)).toMatchObject({ ok: false, code: "invalid" })
  })

  it("refuses an id or base wrapped in an array, though String([id]) looks like a hash", async () => {
    const { r, deps } = await staleCompany()
    const before = r.read("AGENTS.md")
    expect(await approveGuideProposalActionImpl("acme", { id: [A] as never, baseBodyHash: A }, deps)).toMatchObject({ ok: false, code: "invalid" })
    expect(await approveGuideProposalActionImpl("acme", { id: A, baseBodyHash: [A] as never }, deps)).toMatchObject({ ok: false, code: "invalid" })
    expect(r.read("AGENTS.md")).toBe(before)
  })

  it("two concurrent approvals of the same proposal make exactly one AGENTS.md commit", async () => {
    const { r, deps, expected } = await staleCompany()
    const commitsBefore = commitCount(r)
    const results = await Promise.all([
      approveGuideProposalActionImpl("acme", expected, deps),
      approveGuideProposalActionImpl("acme", expected, deps),
    ])
    expect(results.every((x) => x.ok)).toBe(true)
    expect(results.filter((x) => x.ok && x.changed)).toHaveLength(1)
    expect(commitCount(r)).toBe(commitsBefore + 1)
    expect(r.git("status", "--porcelain").trim()).toBe("")
  })

  it("a commit failure after the write is ok:true, committed:false with a short plain message, and still clears pending", async () => {
    const { r, deps, state, expected } = await staleCompany()
    await recordPending(state, expected.id)
    r.write(".git/hooks/pre-commit", "#!/bin/sh\necho 'boom: /secret/path'\nexit 1\n")
    fs.chmodSync(`${r.dir}/.git/hooks/pre-commit`, 0o755)
    const res = await approveGuideProposalActionImpl("acme", expected, deps)
    expect(res).toMatchObject({ ok: true, committed: false, changed: true })
    expect((res as { commitError: string }).commitError).not.toContain("/secret/path")
    expect(r.git("status", "--porcelain")).toContain("AGENTS.md")
    expect((await readGuideProposalState(state)).pending).toBeUndefined()
  })
})

describe("dismiss and reopen", () => {
  it("dismiss remembers the version and never touches AGENTS.md or git", async () => {
    const { r, deps, state, revalidate } = setup()
    await addGuideActionImpl("acme", deps)
    const before = r.read("AGENTS.md")
    const commitsBefore = commitCount(r)
    expect(await dismissGuideProposalActionImpl("acme", A, deps)).toEqual({ ok: true })
    expect(await dismissGuideProposalActionImpl("acme", A, deps)).toEqual({ ok: true })
    expect((await readGuideProposalState(state)).dismissed?.id).toBe(A)
    expect(r.read("AGENTS.md")).toBe(before)
    expect(commitCount(r)).toBe(commitsBefore)
    expect(revalidate).toHaveBeenCalledWith("/c/acme/dashboard")
  })

  it("refuses an id that is not a proposal id, and an unknown company", async () => {
    const { deps, state } = setup()
    expect(await dismissGuideProposalActionImpl("acme", "../../x", deps)).toMatchObject({ ok: false, code: "invalid" })
    expect(await dismissGuideProposalActionImpl("ghost", A, deps)).toMatchObject({ ok: false, code: "not-found" })
    expect(await readGuideProposalState(state)).toEqual({})
  })

  it("refuses an id wrapped in an array, and a refused dismiss leaves the recorded dismissal alone", async () => {
    // An array would be written as {id: [..]}, which the reader drops, so it would silently clear a real dismissal.
    const { deps, state } = setup()
    await recordDismissed(state, A)
    expect(await dismissGuideProposalActionImpl("acme", [A] as never, deps)).toMatchObject({ ok: false, code: "invalid" })
    expect((await readGuideProposalState(state)).dismissed?.id).toBe(A)
  })

  it("reopen forgets the dismissal so the proposal can show again", async () => {
    const { deps, state } = setup()
    await recordDismissed(state, A)
    expect(await reopenGuideProposalActionImpl("acme", deps)).toEqual({ ok: true })
    expect((await readGuideProposalState(state)).dismissed).toBeUndefined()
    expect(await reopenGuideProposalActionImpl("ghost", deps)).toMatchObject({ ok: false, code: "not-found" })
  })
})
