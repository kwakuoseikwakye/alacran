import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { editMonthlyLimit, readMonthlyLimit } from "./definitions"
import { setMonthlyLimit } from "./manage"
import { recordRunCost } from "./cost"

let root: string
let outside: string
const file = () => path.join(root, "definitions/budget.yaml")
async function write(text: string) {
  await mkdir(path.join(root, "definitions"), { recursive: true })
  await writeFile(file(), text)
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "budget-co-"))
  outside = await mkdtemp(path.join(tmpdir(), "budget-outside-"))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe("a limit file that leads outside the company folder", () => {
  it("is refused when budget.yaml is a symlink: the read fails closed and nothing is written", async () => {
    await writeFile(path.join(outside, "budget.yaml"), "monthly_limit_usd: 1000\n")
    await mkdir(path.join(root, "definitions"), { recursive: true })
    await symlink(path.join(outside, "budget.yaml"), file())
    expect((await readMonthlyLimit(root)).ok).toBe(false)
    const edited = await editMonthlyLimit(root, 5)
    expect(edited).toMatchObject({ ok: false, reason: expect.stringMatching(/plain file/) })
    expect(await readFile(path.join(outside, "budget.yaml"), "utf-8")).toBe("monthly_limit_usd: 1000\n")
  })

  it("is refused when definitions/ itself is a symlink out of the company", async () => {
    await writeFile(path.join(outside, "budget.yaml"), "monthly_limit_usd: 1000\n")
    await symlink(outside, path.join(root, "definitions"))
    expect((await readMonthlyLimit(root)).ok).toBe(false)
    expect((await editMonthlyLimit(root, 5)).ok).toBe(false)
    expect((await editMonthlyLimit(root, null)).ok).toBe(false)
    expect(await readFile(path.join(outside, "budget.yaml"), "utf-8")).toBe("monthly_limit_usd: 1000\n")
  })
})

describe("readMonthlyLimit", () => {
  it("means no limit when the file, the value or the whole document is absent", async () => {
    expect(await readMonthlyLimit(root)).toEqual({ ok: true, limitUsd: null })
    await write("# nothing yet\n")
    expect(await readMonthlyLimit(root)).toEqual({ ok: true, limitUsd: null })
    await write("monthly_limit_usd:\n")
    expect(await readMonthlyLimit(root)).toEqual({ ok: true, limitUsd: null })
  })

  it("reads a plain number, including 0", async () => {
    await write("monthly_limit_usd: 25.5\n")
    expect(await readMonthlyLimit(root)).toEqual({ ok: true, limitUsd: 25.5 })
    await write("monthly_limit_usd: 0\n")
    expect(await readMonthlyLimit(root)).toEqual({ ok: true, limitUsd: 0 })
  })

  it("reports a bad value plainly instead of guessing at it", async () => {
    for (const bad of ['monthly_limit_usd: "25"\n', "monthly_limit_usd: -3\n", "monthly_limit_usd: [1\n", "- 25\n"]) {
      await write(bad)
      const read = await readMonthlyLimit(root)
      expect(read.ok, bad).toBe(false)
      if (!read.ok) expect(read.reason.length).toBeGreaterThan(0)
    }
  })
})

describe("editMonthlyLimit", () => {
  it("sets the limit and keeps comments and other keys", async () => {
    await write("# Our spending rules\nmonthly_limit_usd: 10 # raised in October\nother: kept\n")
    expect(await editMonthlyLimit(root, 40)).toEqual({ ok: true })
    const text = await readFile(file(), "utf-8")
    expect(text).toContain("# Our spending rules")
    expect(text).toContain("other: kept")
    expect(await readMonthlyLimit(root)).toEqual({ ok: true, limitUsd: 40 })
  })

  it("removes only the key, keeping the comment", async () => {
    await write("# Our spending rules\nmonthly_limit_usd: 10\nother: kept\n")
    await editMonthlyLimit(root, null)
    const text = await readFile(file(), "utf-8")
    expect(text).toContain("# Our spending rules")
    expect(text).toContain("other: kept")
    expect(text).not.toContain("monthly_limit_usd")
  })

  it("says the file is unchanged, and writes nothing, when it already holds that value", async () => {
    await write("monthly_limit_usd: 10 # keep\n")
    expect(await editMonthlyLimit(root, 10)).toEqual({ ok: true, unchanged: true })
    expect(await readFile(file(), "utf-8")).toBe("monthly_limit_usd: 10 # keep\n")
  })

  it("leaves only the comments when the last key goes, and sets it again in block style", async () => {
    await write("# Owner note: keep this low\nmonthly_limit_usd: 10\n")
    await editMonthlyLimit(root, null)
    const removed = await readFile(file(), "utf-8")
    expect(removed).toBe("# Owner note: keep this low\n")
    expect(await readMonthlyLimit(root)).toEqual({ ok: true, limitUsd: null })
    await editMonthlyLimit(root, 5)
    const text = await readFile(file(), "utf-8")
    expect(text).toContain("# Owner note: keep this low")
    expect(text).toMatch(/^monthly_limit_usd: 5$/m)
    expect(text).not.toContain("{")
  })

  it("sets block style even on a file an earlier version left as {}", async () => {
    await write("# note\n\n{}\n")
    await editMonthlyLimit(root, 5)
    expect(await readFile(file(), "utf-8")).toMatch(/^monthly_limit_usd: 5$/m)
  })

  it("creates the file with a plain header, and does nothing to remove a limit that was never set", async () => {
    expect(await editMonthlyLimit(root, null)).toEqual({ ok: true, unchanged: true })
    await expect(readFile(file(), "utf-8")).rejects.toThrow()
    await editMonthlyLimit(root, 12.5)
    expect(await readFile(file(), "utf-8")).toMatch(/^# .*\nmonthly_limit_usd: 12.5\n$/)
  })

  it("writes nothing to a file it can't parse", async () => {
    await write("monthly_limit_usd: [1\n")
    expect((await editMonthlyLimit(root, 5)).ok).toBe(false)
    expect(await readFile(file(), "utf-8")).toBe("monthly_limit_usd: [1\n")
  })
})

describe("setMonthlyLimit", () => {
  function fakeGit() {
    const calls: string[][] = []
    const exec = async (_cmd: string, args: string[]) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }
    return { calls, exec }
  }

  it("refuses an amount that isn't one, and writes nothing", async () => {
    const git = fakeGit()
    for (const bad of ["abc", "-5", "1e3", "12.345", ""]) {
      const result = await setMonthlyLimit({ companyId: "acme", root, exec: git.exec }, bad)
      expect(result.ok, bad).toBe(false)
    }
    expect(git.calls).toHaveLength(0)
    await expect(readFile(file(), "utf-8")).rejects.toThrow()
  })

  it("saves the limit and commits only the limit file", async () => {
    const git = fakeGit()
    const result = await setMonthlyLimit({ companyId: "acme", root, exec: git.exec }, "$25")
    expect(result.ok).toBe(true)
    expect(await readMonthlyLimit(root)).toEqual({ ok: true, limitUsd: 25 })
    expect(git.calls.length).toBeGreaterThan(0)
    for (const args of git.calls) expect(args.slice(args.indexOf("--") + 1)).toEqual(["definitions/budget.yaml"])

    const removed = await setMonthlyLimit({ companyId: "acme", root, exec: git.exec }, null)
    expect(removed).toMatchObject({ ok: true, message: expect.stringMatching(/Limit removed/) })
    expect(await readMonthlyLimit(root)).toEqual({ ok: true, limitUsd: null })
  })

  it("skips the commit when nothing changes, for setting the same limit and removing none", async () => {
    const git = fakeGit()
    expect(await setMonthlyLimit({ companyId: "acme", root, exec: git.exec }, null)).toEqual({ ok: true, message: "There's no limit to remove." })
    await setMonthlyLimit({ companyId: "acme", root, exec: git.exec }, "25")
    const commits = git.calls.length
    expect(await setMonthlyLimit({ companyId: "acme", root, exec: git.exec }, "25.00")).toEqual({ ok: true, message: "That's already the limit." })
    expect(git.calls).toHaveLength(commits)
  })

  it("says so when the new limit is already reached this month", async () => {
    const git = fakeGit()
    const now = new Date(2026, 9, 20)
    const at = new Date(2026, 9, 2).toISOString()
    await recordRunCost(path.join(outside, "acme"), { job: "acme:digest", executorId: "claude-code", startedAt: at, finishedAt: at, costUsd: 3 })
    const result = await setMonthlyLimit({ companyId: "acme", root, exec: git.exec, now }, "2", outside)
    expect(result).toMatchObject({ ok: true, message: expect.stringMatching(/already reached it.*won't start AI runs on its own/) })
    const under = await setMonthlyLimit({ companyId: "acme", root, exec: git.exec, now }, "10", outside)
    expect(under).toMatchObject({ ok: true, message: expect.stringMatching(/Once this month's estimated cost reaches it/) })
  })
})
