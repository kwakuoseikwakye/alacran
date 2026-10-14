import { describe, it, expect, vi, afterEach } from "vitest"

/**
 * Auto-commit is the one path where nobody reads the diff, so it is the one
 * path that must refuse anything it cannot fully account for.
 *
 * These pin the two refusals. They are separated from schedules-impl.test.ts
 * because each needs its own module mocks for the result reader, and the
 * existing suite's tests deliberately inject a fake sweepFn instead.
 */
afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

async function loadWith(result: unknown, commitSpy = vi.fn()) {
  vi.doMock("../get-effective-agents", () => ({
    getEffectiveAgents: async () => [{ id: "acme", name: "Acme", rootPath: "/companies/acme", kind: "command-set" }],
  }))
  vi.doMock("../company-commands/run-lock", () => ({
    checkRunLockStatus: async () => ({ running: false }),
  }))
  vi.doMock("../company-commands/company-command-result-impl", () => ({
    getCompanyCommandResultImpl: async () => result,
  }))
  vi.doMock("../company-commands/commit-company-command-result-impl", () => ({
    commitCompanyCommandResultImpl: commitSpy.mockResolvedValue({ committed: true, message: "Committed" }),
  }))
  const mod = await import("./schedules-impl")
  return { commitFinishedRun: mod.commitFinishedRun, commitSpy }
}

describe("commitFinishedRun", () => {
  it("commits when the run stayed inside its own folder", async () => {
    const { commitFinishedRun, commitSpy } = await loadWith({
      changed: true,
      outputPath: "notes/company/digests/d.md",
      oldText: "",
      newText: "x",
      extraFiles: [],
      strays: [],
    })
    const outcome = await commitFinishedRun("acme", "digest")
    expect(outcome?.committed).toBe(true)
    expect(commitSpy).toHaveBeenCalledOnce()
  })

  it("refuses, and does not commit, when the run touched files outside its folder", async () => {
    const { commitFinishedRun, commitSpy } = await loadWith({
      changed: true,
      outputPath: "notes/company/digests/d.md",
      oldText: "",
      newText: "x",
      extraFiles: [],
      strays: ["HACKED.md", "src/index.ts"],
    })
    const outcome = await commitFinishedRun("acme", "digest")
    expect(outcome?.committed).toBe(false)
    expect(outcome?.message).toMatch(/waiting for you/i)
    expect(outcome?.message).toContain("HACKED.md")
    expect(commitSpy).not.toHaveBeenCalled()
  })

  /** "Couldn't tell" is not "nothing strayed". Unattended commit is exactly
   *  where treating unknown as clean would cost the most. */
  it("refuses when it could not determine what else changed", async () => {
    const { commitFinishedRun, commitSpy } = await loadWith({
      changed: true,
      outputPath: "notes/company/digests/d.md",
      oldText: "",
      newText: "x",
      extraFiles: [],
      strays: null,
    })
    const outcome = await commitFinishedRun("acme", "digest")
    expect(outcome?.committed).toBe(false)
    expect(outcome?.message).toMatch(/couldn't verify/i)
    expect(commitSpy).not.toHaveBeenCalled()
  })
})
