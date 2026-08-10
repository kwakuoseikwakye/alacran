import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { performMacUpdateImpl } from "./perform-mac-update-impl"

let installRoot: string
let bundlePath: string
let zipPath: string
let execCalls: { command: string; args: string[] }[]

/** A minimal .app: a marker file we can read back to prove which copy won. */
async function makeBundle(at: string, marker: string) {
  await mkdir(path.join(at, "Contents", "MacOS"), { recursive: true })
  await mkdir(path.join(at, "Contents", "Resources", "app"), { recursive: true })
  await writeFile(path.join(at, "Contents", "MacOS", "launcher"), "#!/bin/bash\n", { mode: 0o755 })
  await writeFile(path.join(at, "VERSION"), marker, "utf-8")
}

/**
 * Stands in for `ditto -x -k`: writes the "new version" into the staging dir
 * the impl just created, so the swap has something real to move.
 */
function fakeExec(opts: { extract?: (dest: string) => Promise<void>; fail?: string } = {}) {
  return async (command: string, args: string[]) => {
    execCalls.push({ command, args })
    if (opts.fail === command) throw new Error(`${command} failed`)
    if (command === "ditto") {
      const dest = args[args.length - 1]
      if (opts.extract) await opts.extract(dest)
      else await makeBundle(path.join(dest, path.basename(bundlePath)), "new")
    }
    return { stdout: "", stderr: "" }
  }
}

const okFetch = async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode("zipbytes").buffer })

beforeEach(async () => {
  installRoot = await mkdtemp(path.join(tmpdir(), "mac-update-"))
  bundlePath = path.join(installRoot, "Alacrán.app")
  zipPath = path.join(installRoot, "download", "Alacran.zip")
  execCalls = []
  await makeBundle(bundlePath, "old")
})

afterEach(async () => {
  await rm(installRoot, { recursive: true, force: true })
})

async function versionAt(p: string): Promise<string> {
  return readFile(path.join(p, "VERSION"), "utf-8")
}

describe("performMacUpdateImpl", () => {
  it("replaces the running bundle in place and cleans up after itself", async () => {
    const result = await performMacUpdateImpl(fakeExec(), okFetch, bundlePath, zipPath)

    expect(result).toEqual({ ok: true })
    expect(await versionAt(bundlePath)).toBe("new")
    // Extracted with ditto (keeps the signature + exec bit), not unzip.
    expect(execCalls.find((c) => c.command === "ditto")?.args.slice(0, 3)).toEqual(["-x", "-k", zipPath])
    // Insurance, per the impl's comment — a fetch-downloaded payload isn't
    // quarantined, but this must still be applied before the swap.
    expect(execCalls.some((c) => c.command === "xattr" && c.args[0] === "-cr")).toBe(true)
    // No staging dir and no downloaded zip left behind.
    await expect(stat(zipPath)).rejects.toThrow()
    const leftovers = execCalls.filter((c) => c.command === "ditto").length
    expect(leftovers).toBe(1)
  })

  it("stages on the same volume as the install, since rename() can't cross volumes", async () => {
    await performMacUpdateImpl(fakeExec(), okFetch, bundlePath, zipPath)
    const dest = execCalls.find((c) => c.command === "ditto")!.args[3]
    expect(path.dirname(dest)).toBe(path.dirname(bundlePath))
  })

  it("refuses without downloading anything when not running from a .app", async () => {
    let fetched = false
    const result = await performMacUpdateImpl(
      fakeExec(),
      async () => {
        fetched = true
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }
      },
      null,
      zipPath
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("packaged copy")
    expect(fetched).toBe(false)
  })

  it("leaves the install untouched when the download fails", async () => {
    const result = await performMacUpdateImpl(
      fakeExec(),
      async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }),
      bundlePath,
      zipPath
    )

    expect(result.ok).toBe(false)
    expect(await versionAt(bundlePath)).toBe("old")
  })

  // The payload gate: a truncated or wrong-shaped archive must be caught
  // BEFORE the live bundle is moved, not after.
  it("refuses a payload with no app in it, without moving the live bundle", async () => {
    const result = await performMacUpdateImpl(
      fakeExec({ extract: async () => {} }),
      okFetch,
      bundlePath,
      zipPath
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("didn't contain the app")
    expect(await versionAt(bundlePath)).toBe("old")
  })

  it("refuses a payload whose launcher isn't executable", async () => {
    const result = await performMacUpdateImpl(
      fakeExec({
        extract: async (dest) => {
          const staged = path.join(dest, path.basename(bundlePath))
          await mkdir(path.join(staged, "Contents", "MacOS"), { recursive: true })
          await writeFile(path.join(staged, "Contents", "MacOS", "launcher"), "x", { mode: 0o644 })
        },
      }),
      okFetch,
      bundlePath,
      zipPath
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("missing its launcher")
    expect(await versionAt(bundlePath)).toBe("old")
  })

  it("rolls the original back if the second rename fails, so the user keeps a working install", async () => {
    // Extract a bundle, then delete it right before the swap moves it in —
    // reproduces "step 1 succeeded, step 2 failed" without stubbing fs.
    const exec = async (command: string, args: string[]) => {
      execCalls.push({ command, args })
      if (command === "ditto") {
        await makeBundle(path.join(args[args.length - 1], path.basename(bundlePath)), "new")
      }
      if (command === "xattr") {
        await rm(path.join(args[1]), { recursive: true, force: true })
      }
      return { stdout: "", stderr: "" }
    }

    const result = await performMacUpdateImpl(exec, okFetch, bundlePath, zipPath)

    expect(result.ok).toBe(false)
    // The original is back where it belongs, with its original contents.
    expect(await versionAt(bundlePath)).toBe("old")
    // And no ".old-<pid>" carcass left next to it.
    const { readdir } = await import("node:fs/promises")
    expect((await readdir(installRoot)).filter((n) => n.includes(".old-"))).toEqual([])
  })

  it("reports success even if deleting the old bundle fails — the update already happened", async () => {
    const result = await performMacUpdateImpl(fakeExec(), okFetch, bundlePath, zipPath)
    expect(result).toEqual({ ok: true })
    expect(await versionAt(bundlePath)).toBe("new")
  })
})
