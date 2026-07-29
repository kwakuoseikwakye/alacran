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
    expect(clone!.args).toEqual(["clone", "https://github.com/me/acme.git", target])
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

  it("reports a clone that produced something that isn't a company", async () => {
    const { restoreCompanyImpl } = await import("./restore-company-impl")
    const target = path.join(parent, "empty")

    // clone "succeeds" but leaves no .claude — not an Alacrán company
    const result = await restoreCompanyImpl(
      "Empty",
      "https://github.com/me/empty.git",
      target,
      registryPath,
      fakeExec(async (t) => {
        await mkdir(path.join(t, ".git"), { recursive: true })
      })
    )

    expect(result.ok).toBe(false)
  })
})
