import { describe, it, expect } from "vitest"
import {
  readTriageSenders,
  readTriageRepos,
  isAllowlistedSender,
  SENDERS_RELATIVE_PATH,
  REPOS_RELATIVE_PATH,
} from "./triage-config"

const missing = async () => {
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
}

describe("readTriageSenders", () => {
  it("reads a list of addresses", async () => {
    const read = async () => "senders:\n  - owner@example.com\n  - teammate@example.com\n"
    const result = await readTriageSenders("/c", read)
    expect(result).toEqual({ ok: true, senders: ["owner@example.com", "teammate@example.com"] })
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

describe("isAllowlistedSender", () => {
  const senders = ["owner@example.com", "teammate@example.com"]

  it("matches case-insensitively", () => {
    expect(isAllowlistedSender("Owner@Example.com", senders)).toBe(true)
  })

  it("matches an address inside a display-name header", () => {
    expect(isAllowlistedSender("Owner Sato <owner@example.com>", senders)).toBe(true)
  })

  it("rejects an address not on the list", () => {
    expect(isAllowlistedSender("stranger@example.com", senders)).toBe(false)
  })

  it("rejects a lookalike domain", () => {
    expect(isAllowlistedSender("owner@example.com.evil.com", senders)).toBe(false)
  })

  it("rejects an empty from header", () => {
    expect(isAllowlistedSender("", senders)).toBe(false)
  })
})

describe("readTriageRepos", () => {
  it("reads name, path and description", async () => {
    const read = async () =>
      "repos:\n  - name: plh-platform\n    path: /Users/x/ExampleOrg/plh/plh-platform\n    description: Main PLH web platform\n"
    const result = await readTriageRepos("/c", read)
    expect(result).toEqual({
      ok: true,
      repos: [
        {
          name: "plh-platform",
          path: "/Users/x/ExampleOrg/plh/plh-platform",
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
