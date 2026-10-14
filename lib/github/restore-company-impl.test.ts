import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "../git-commit-file"

let parent: string
let registryPath: string
let calls: { command: string; args: string[] }[]

function fakeExec(onClone?: (targetPath: string) => Promise<void>): ExecFileFn {
  return async (command, args) => {
    calls.push({ command, args })
    if (command === "git" && args[0] === "clone" && onClone) {
      await onClone(args[args.length - 1])
    }
    return { stdout: "", stderr: "" }
  }
}

beforeEach(async () => {
  parent = await mkdtemp(path.join(tmpdir(), "restore-company-"))
  registryPath = path.join(parent, "registry.json")
  await writeFile(registryPath, "[]")
  calls = []
})

afterEach(async () => {
  await rm(parent, { recursive: true, force: true })
  vi.resetModules()
})

/** A clone that produces a real, valid company on disk. */
async function realisticClone(target: string) {
  await mkdir(path.join(target, ".git"), { recursive: true })
  await mkdir(path.join(target, ".claude"), { recursive: true })
}

describe("restoreCompanyImpl", () => {
  it("clones the repo and registers the result", async () => {
    const { restoreCompanyImpl } = await import("./restore-company-impl")
    const target = path.join(parent, "acme")

    const result = await restoreCompanyImpl(
      "Acme Co",
      "https://github.com/me/acme.git",
      target,
      registryPath,
      fakeExec(realisticClone)
    )

    expect(result.ok).toBe(true)
    const clone = calls.find((c) => c.args[0] === "clone")
    expect(clone!.args).toEqual(["clone", "--", "https://github.com/me/acme.git", target])
  })

  it("refuses a target directory that already exists", async () => {
    const { restoreCompanyImpl } = await import("./restore-company-impl")
    const target = path.join(parent, "taken")
    await mkdir(target, { recursive: true })

    const result = await restoreCompanyImpl("Taken", "https://github.com/me/x.git", target, registryPath, fakeExec())

    expect(result.ok).toBe(false)
    expect(calls.some((c) => c.args[0] === "clone")).toBe(false)
  })

  it("rejects a non-http(s)/ssh URL rather than handing it to git", async () => {
    const { restoreCompanyImpl } = await import("./restore-company-impl")
    const target = path.join(parent, "evil")

    const result = await restoreCompanyImpl("Evil", "--upload-pack=touch /tmp/pwned", target, registryPath, fakeExec())

    expect(result.ok).toBe(false)
    expect(calls.some((c) => c.args[0] === "clone")).toBe(false)
  })

  it("rejects a targetPath that git would parse as a flag", async () => {
    const { restoreCompanyImpl } = await import("./restore-company-impl")

    const result = await restoreCompanyImpl(
      "Evil",
      "https://github.com/me/x.git",
      "--upload-pack=touch /tmp/pwned",
      registryPath,
      fakeExec()
    )

    expect(result.ok).toBe(false)
    expect(calls.some((c) => c.args[0] === "clone")).toBe(false)
  })

  it("rejects a relative targetPath", async () => {
    const { restoreCompanyImpl } = await import("./restore-company-impl")

    const result = await restoreCompanyImpl(
      "Rel",
      "https://github.com/me/x.git",
      "some/relative/dir",
      registryPath,
      fakeExec()
    )

    expect(result.ok).toBe(false)
    expect(calls.some((c) => c.args[0] === "clone")).toBe(false)
  })

  it("passes an argv terminator so no operand can be read as an option", async () => {
    const { restoreCompanyImpl } = await import("./restore-company-impl")
    const target = path.join(parent, "term")

    await restoreCompanyImpl("Term", "https://github.com/me/x.git", target, registryPath, fakeExec(realisticClone))

    const clone = calls.find((c) => c.args[0] === "clone")
    expect(clone!.args).toEqual(["clone", "--", "https://github.com/me/x.git", target])
  })

  // A missing `.claude` is no longer a rejection — it never actually proved
  // anything about being a company (a real one can have none), so
  // requiring it only blocked real imports. `.git` is the guard that survives,
  // and it's the one that catches a clone which reported success but produced
  // nothing usable.
  it("rejects a clone that produced no git repository", async () => {
    const { restoreCompanyImpl } = await import("./restore-company-impl")
    const target = path.join(parent, "empty")

    const result = await restoreCompanyImpl(
      "Empty",
      "https://github.com/me/empty.git",
      target,
      registryPath,
      fakeExec(async (t) => {
        await mkdir(t, { recursive: true })
      })
    )

    expect(result.ok).toBe(false)
  })

  it("restores a cloned repo that has no .claude directory", async () => {
    const { restoreCompanyImpl } = await import("./restore-company-impl")
    const target = path.join(parent, "bare-company")

    const result = await restoreCompanyImpl(
      "Bare",
      "https://github.com/me/bare.git",
      target,
      registryPath,
      fakeExec(async (t) => {
        await mkdir(path.join(t, ".git"), { recursive: true })
      })
    )

    expect(result.ok).toBe(true)
  })
})
