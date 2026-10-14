import { describe, it, expect } from "vitest"
import { conversationFingerprint, stableSessionSignature } from "./conversation-fingerprint"
import { getAiExecutor } from "../ai-executors"

const ESC = "\x1b"
/** Real kiro-cli output, captured verbatim (colour codes included). */
const kiroListing = (age: string, msgs: string) =>
  `${ESC}[38;5;12m\nChat sessions for /tmp/co:\n\n${ESC}[0mChat SessionId: ${ESC}[38;5;141m94bd8a67-0dd5-4fa3-85e9-8f2803309730\n${ESC}[0m  ${ESC}[2m${age}${ESC}[0m | reply with ok | ${ESC}[2m${msgs}${ESC}[0m | ${ESC}[2mclassic${ESC}[0m\n`

const kiro = getAiExecutor("kiro")
const claude = getAiExecutor("claude-code")
const exec = (stdout: string) => async () => ({ stdout, stderr: "" })

describe("stableSessionSignature", () => {
  // The bug this exists to prevent: Kiro prints a RELATIVE age, so hashing raw
  // output changes every tick, and a changed fingerprint triggers a run. That
  // is an unattended loop spending the user's credits every minute forever.
  it("does not change when only the clock has moved", () => {
    expect(stableSessionSignature(kiroListing("3 seconds ago", "2 msgs"))).toBe(
      stableSessionSignature(kiroListing("4 hours ago", "2 msgs"))
    )
  })

  it("changes when the conversation actually grows", () => {
    expect(stableSessionSignature(kiroListing("3 seconds ago", "2 msgs"))).not.toBe(
      stableSessionSignature(kiroListing("3 seconds ago", "6 msgs"))
    )
  })

  it("changes when a new session appears", () => {
    const two = kiroListing("1 min ago", "2 msgs") + "Chat SessionId: 11111111-2222-3333-4444-555555555555\n"
    expect(stableSessionSignature(two)).not.toBe(stableSessionSignature(kiroListing("1 min ago", "2 msgs")))
  })
})

describe("conversationFingerprint", () => {
  it("is null for an executor that cannot resume at all", async () => {
    const kimi = getAiExecutor("kimi")
    expect(kimi.resume).toBeUndefined()
    expect(await conversationFingerprint(kimi, "/tmp/co", exec(""))).toBeNull()
  })

  // Null is the guard: both CLIs silently START a conversation when asked to
  // resume one that does not exist, so a wrong answer here files an invention.
  it("is null when the CLI says the directory has no sessions", async () => {
    const out = `${ESC}[38;5;12mNo saved chat sessions for /tmp/co\n`
    expect(await conversationFingerprint(kiro, "/tmp/co", exec(out))).toBeNull()
  })

  it("is null when the CLI cannot be run at all", async () => {
    const boom = async () => {
      throw new Error("not installed")
    }
    expect(await conversationFingerprint(kiro, "/tmp/co", boom)).toBeNull()
  })

  it("is a stable value across ticks for a real listing", async () => {
    const a = await conversationFingerprint(kiro, "/tmp/co", exec(kiroListing("3 seconds ago", "2 msgs")))
    const b = await conversationFingerprint(kiro, "/tmp/co", exec(kiroListing("2 days ago", "2 msgs")))
    expect(a).not.toBeNull()
    expect(a).toBe(b)
  })

  it("falls back to the transcript store for an executor with no listing command", async () => {
    // Claude has no headless way to list sessions, so it must NOT shell out.
    let called = false
    const shouldNotRun = async () => {
      called = true
      return { stdout: "", stderr: "" }
    }
    expect(claude.resume?.listSessions).toBeUndefined()
    await conversationFingerprint(claude, "/no/such/dir", shouldNotRun, "/no/such/home")
    expect(called).toBe(false)
  })
})
