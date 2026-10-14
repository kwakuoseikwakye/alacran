import { describe, it, expect } from "vitest"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createHash, generateKeyPairSync, sign as signOneShot } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"
import { performLinuxUpdateImpl, type ExecFileFn, type FetchLike } from "./perform-linux-update-impl"
import { RELEASES_API_URL } from "./fetch-latest-release-impl"

const ASSET_URL = "https://example.invalid/download/v1/Alacran.deb"

/**
 * Serves the release API and the asset from one fake, the way the real two
 * requests come back. `digest` defaults to the true hash of `body`, so a test
 * that wants a MISMATCH states a wrong one explicitly rather than relying on
 * the fixture happening to disagree.
 */
const SIG_URL = "https://example.invalid/download/v1/Alacran.deb.sig"

/**
 * Serves the release API, the .deb and its .sig from one fake, the way the
 * real three requests come back. `signed: false` models a release that
 * published no signature at all.
 */
function fakeFetch(body: string, opts: { ok?: boolean; signed?: boolean; sig?: string } = {}): FetchLike {
  const { ok = true, signed = true, sig = "c2ln" } = opts
  const assets = signed
    ? [
        { name: "Alacran.deb", browser_download_url: ASSET_URL },
        { name: "Alacran.deb.sig", browser_download_url: SIG_URL },
      ]
    : [{ name: "Alacran.deb", browser_download_url: ASSET_URL }]
  return async (url: string) => {
    if (url === RELEASES_API_URL) {
      return { ok: true, json: async () => ({ assets }), arrayBuffer: async () => new ArrayBuffer(0) }
    }
    if (url === SIG_URL) {
      return { ok: true, text: async () => sig, arrayBuffer: async () => new ArrayBuffer(0) }
    }
    return { ok, arrayBuffer: async () => new TextEncoder().encode(body).buffer, json: async () => ({}) }
  }
}

// Stands in for the real ed25519 check on the paths where the test is about
// something else. Rejection tests never use this.
const accept = () => true

async function inTmp(fn: (debPath: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "linux-update-"))
  try {
    await fn(path.join(dir, "Alacran.deb"))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe("performLinuxUpdateImpl", () => {
  it("downloads the .deb and installs it via pkexec dpkg -i", async () => {
    await inTmp(async (debPath) => {
      const calls: { command: string; args: string[] }[] = []
      const execFn: ExecFileFn = async (command, args) => {
        calls.push({ command, args })
        return { stdout: "", stderr: "" }
      }
      const result = await performLinuxUpdateImpl(execFn, fakeFetch("fake-deb-bytes"), debPath, accept)

      expect(result).toEqual({ ok: true })
      expect(await readFile(debPath, "utf-8")).toBe("fake-deb-bytes")
      expect(calls).toEqual([
        { command: "which", args: ["pkexec"] },
        { command: "pkexec", args: ["dpkg", "-i", debPath] },
      ])
    })
  })

  // The whole point of the signature: `pkexec dpkg -i` runs maintainer scripts
  // as root, so a payload we didn't sign must never reach that line — and must
  // not be left on disk for anyone to install by hand either. The REAL
  // verifier runs here; an attacker's signature is a well-formed one made with
  // the wrong key, which is exactly what this fixture is.
  it("refuses to install, and writes nothing, when the download isn't signed by us", async () => {
    await inTmp(async (debPath) => {
      const execFn: ExecFileFn = async () => {
        throw new Error("must not run anything for an unsigned download")
      }
      const { privateKey } = generateKeyPairSync("ed25519")
      const bytes = "evil-bytes"
      const forged = signOneShot(null, createHash("sha256").update(bytes).digest(), privateKey).toString("base64")
      const result = await performLinuxUpdateImpl(execFn, fakeFetch(bytes, { sig: forged }), debPath)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toContain("isn't signed by Alacrán")
      await expect(readFile(debPath, "utf-8")).rejects.toThrow()
    })
  })

  // Fail closed. Omitting the .sig costs an attacker nothing, so "no signature
  // published" must not be a softer outcome than "bad signature".
  it("refuses to install when the release publishes no signature at all", async () => {
    await inTmp(async (debPath) => {
      const execFn: ExecFileFn = async () => {
        throw new Error("must not run anything without a signature to check")
      }
      const result = await performLinuxUpdateImpl(execFn, fakeFetch("bytes", { signed: false }), debPath)

      expect(result.ok).toBe(false)
      await expect(readFile(debPath, "utf-8")).rejects.toThrow()
    })
  })

  it("fails without writing anything when the download itself fails", async () => {
    await inTmp(async (debPath) => {
      const execFn: ExecFileFn = async () => ({ stdout: "", stderr: "" })
      const result = await performLinuxUpdateImpl(execFn, fakeFetch("", { ok: false }), debPath, accept)

      expect(result.ok).toBe(false)
      await expect(readFile(debPath, "utf-8")).rejects.toThrow()
    })
  })

  it("falls back to a manual command when pkexec isn't installed", async () => {
    await inTmp(async (debPath) => {
      const execFn: ExecFileFn = async (command) => {
        if (command === "which") throw new Error("not found")
        throw new Error("should not reach pkexec")
      }
      const result = await performLinuxUpdateImpl(execFn, fakeFetch("bytes"), debPath, accept)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.manualCommand).toBe(`sudo apt install ${debPath}`)
    })
  })

  it("falls back to a manual command when pkexec runs but dpkg fails (e.g. the user cancels)", async () => {
    await inTmp(async (debPath) => {
      const execFn: ExecFileFn = async (command) => {
        if (command === "which") return { stdout: "/usr/bin/pkexec", stderr: "" }
        throw new Error("Request dismissed")
      }
      const result = await performLinuxUpdateImpl(execFn, fakeFetch("bytes"), debPath, accept)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toBe("Request dismissed")
        expect(result.manualCommand).toBe(`sudo apt install ${debPath}`)
      }
    })
  })
})
