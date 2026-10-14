import { describe, it, expect } from "vitest"
import { createHash, generateKeyPairSync, sign as signOneShot, createPrivateKey } from "node:crypto"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { verifyReleaseSignature, RELEASE_PUBLIC_KEY } from "./verify-signature"

const digest = (s: string) => createHash("sha256").update(s).digest()

// The real private key, when this machine happens to be the release machine.
// Skipped elsewhere (CI, a fresh clone) rather than failed — the point of the
// key is that it ISN'T checked in, so its absence is the normal case.
function releaseKey() {
  try {
    return createPrivateKey(readFileSync(path.join(homedir(), ".alacran-release-key", "ed25519.pem")))
  } catch {
    return null
  }
}

describe("verifyReleaseSignature", () => {
  it("accepts a signature made by the real release key", () => {
    const key = releaseKey()
    if (!key) return // not the release machine
    const d = digest("pretend this is a .deb")
    expect(verifyReleaseSignature(d, signOneShot(null, d, key).toString("base64"))).toBe(true)
  })

  // The attack the whole scheme exists to stop: a well-formed signature over
  // the attacker's own bytes, made with a key that isn't ours.
  it("rejects a valid signature made by somebody else's key", () => {
    const { privateKey } = generateKeyPairSync("ed25519")
    const d = digest("a build we did not make")
    expect(verifyReleaseSignature(d, signOneShot(null, d, privateKey).toString("base64"))).toBe(false)
  })

  it("rejects a real signature replayed over different bytes", () => {
    const key = releaseKey()
    if (!key) return
    const sig = signOneShot(null, digest("the release we signed"), key).toString("base64")
    expect(verifyReleaseSignature(digest("swapped payload"), sig)).toBe(false)
  })

  // Everything that isn't a signature must be a plain false, never a throw:
  // this runs on the install path, where an exception would read as "retry".
  it.each([["", "empty"], ["not base64!!", "garbage"], ["<!DOCTYPE html>", "a 404 page"]])(
    "rejects %s (%s) without throwing",
    (bad) => {
      expect(verifyReleaseSignature(digest("x"), bad)).toBe(false)
    }
  )

  it("ships a parseable public key", () => {
    expect(() => Buffer.from(RELEASE_PUBLIC_KEY, "base64")).not.toThrow()
    expect(verifyReleaseSignature(digest("x"), "")).toBe(false)
  })
})
