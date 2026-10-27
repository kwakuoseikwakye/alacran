import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { editMonthlyLimit, readMonthlyLimit } from "./definitions"
import { setMonthlyLimit } from "./manage"

let root: string
const file = () => path.join(root, "definitions/budget.yaml")
async function write(text: string) {
  await mkdir(path.join(root, "definitions"), { recursive: true })
  await writeFile(file(), text)
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "budget-co-"))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
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

  it("creates the file with a plain header, and does nothing to remove a limit that was never set", async () => {
    expect(await editMonthlyLimit(root, null)).toEqual({ ok: true })
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
})
