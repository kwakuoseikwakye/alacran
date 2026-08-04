import { describe, it, expect } from "vitest"
import {
  readTriageSenders,
  readTriageRepos,
  isAllowlistedSender,
  extractSenderAddress,
  SENDERS_RELATIVE_PATH,
  REPOS_RELATIVE_PATH,
} from "./triage-config"

const missing = async () => {
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
}

describe("readTriageSenders", () => {
  it("reads a list of addresses", async () => {
    const read = async () => "senders:\n  - takeshi@plh.life\n  - koji.matsumoto@plh.life\n"
    const result = await readTriageSenders("/c", read)
    expect(result).toEqual({ ok: true, senders: ["takeshi@plh.life", "koji.matsumoto@plh.life"] })
  })

  it("refuses when the file is missing, naming the path", async () => {
    const result = await readTriageSenders("/c", missing)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain(SENDERS_RELATIVE_PATH)
  })

  it("refuses on an empty list rather than accepting anything", async () => {
    const result = await readTriageSenders("/c", async () => "senders: []\n")
    expect(result.ok).toBe(false)
  })

  it("refuses on malformed YAML", async () => {
    const result = await readTriageSenders("/c", async () => "senders: [unclosed\n")
    expect(result.ok).toBe(false)
  })

  it("refuses when the key is absent", async () => {
    const result = await readTriageSenders("/c", async () => "something_else: 1\n")
    expect(result.ok).toBe(false)
  })
})

describe("extractSenderAddress", () => {
  it("reads a bare address", () => {
    expect(extractSenderAddress("takeshi@plh.life")).toBe("takeshi@plh.life")
  })

  it("prefers the bracketed address over anything in the display name", () => {
    expect(extractSenderAddress("Takeshi Sato <takeshi@plh.life>")).toBe("takeshi@plh.life")
  })

  it("lowercases and trims", () => {
    expect(extractSenderAddress("  Takeshi@PLH.life  ")).toBe("takeshi@plh.life")
  })

  it("refuses a header carrying more than one address rather than picking one", () => {
    // An ambiguous From is an unverified From. Picking either address means this
    // module and an RFC 5322 parser can disagree about who sent the message, and
    // the disagreement fails open if the picked one happens to be allowlisted.
    expect(extractSenderAddress("Evil <evil@attacker.com> takeshi@plh.life")).toBeNull()
    expect(extractSenderAddress('"takeshi@plh.life" <evil@attacker.com>')).toBeNull()
  })

  it("refuses a header with no address at all", () => {
    expect(extractSenderAddress("(no From header)")).toBeNull()
    expect(extractSenderAddress("")).toBeNull()
  })

  it("refuses when the bracketed part is not the address the header contains", () => {
    expect(extractSenderAddress("Takeshi <no-address-here> takeshi@plh.life")).toBeNull()
  })
})

describe("isAllowlistedSender", () => {
  const senders = ["takeshi@plh.life", "koji.matsumoto@plh.life"]

  it("matches case-insensitively", () => {
    expect(isAllowlistedSender("Takeshi@PLH.life", senders)).toBe(true)
  })

  it("matches an address inside a display-name header", () => {
    expect(isAllowlistedSender("Takeshi Sato <takeshi@plh.life>", senders)).toBe(true)
  })

  it("rejects an address not on the list", () => {
    expect(isAllowlistedSender("stranger@plh.life", senders)).toBe(false)
  })

  it("rejects a lookalike domain", () => {
    expect(isAllowlistedSender("takeshi@plh.life.evil.com", senders)).toBe(false)
  })

  it("rejects an empty from header", () => {
    expect(isAllowlistedSender("", senders)).toBe(false)
  })

  it("rejects a header that pairs an allowlisted address with an unallowlisted one", () => {
    expect(isAllowlistedSender("Evil <evil@attacker.com> takeshi@plh.life", senders)).toBe(false)
  })
})

describe("readTriageRepos", () => {
  it("reads name, path and description", async () => {
    const read = async () =>
      "repos:\n  - name: plh-platform\n    path: /Users/x/Kirirom/plh/plh-platform\n    description: Main PLH web platform\n"
    const result = await readTriageRepos("/c", read)
    expect(result).toEqual({
      ok: true,
      repos: [
        {
          name: "plh-platform",
          path: "/Users/x/Kirirom/plh/plh-platform",
          description: "Main PLH web platform",
        },
      ],
    })
  })

  it("refuses when the file is missing, naming the path", async () => {
    const result = await readTriageRepos("/c", missing)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain(REPOS_RELATIVE_PATH)
  })

  it("refuses on an empty list", async () => {
    const result = await readTriageRepos("/c", async () => "repos: []\n")
    expect(result.ok).toBe(false)
  })

  it("refuses an entry missing a path", async () => {
    const result = await readTriageRepos("/c", async () => "repos:\n  - name: x\n    description: y\n")
    expect(result.ok).toBe(false)
  })
})
