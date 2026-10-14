import { describe, it, expect, beforeEach } from "vitest"
import { memoizedExecFile, clearExecMemo } from "./exec-memo"

function counter(stdout = "ok") {
  let calls = 0
  const fn = async () => {
    calls += 1
    return { stdout, stderr: "" }
  }
  return { fn, calls: () => calls }
}

describe("memoizedExecFile", () => {
  beforeEach(clearExecMemo)

  it("spawns once for repeated identical probes, which is the whole point", async () => {
    const { fn, calls } = counter("alex@example.com")
    const at = () => 0

    const a = await memoizedExecFile("gog", ["auth", "list", "-j"], fn, at)
    const b = await memoizedExecFile("gog", ["auth", "list", "-j"], fn, at)

    expect(a.stdout).toBe("alex@example.com")
    expect(b.stdout).toBe("alex@example.com")
    expect(calls()).toBe(1)
  })

  it("keys on the args too, so `which gog` never answers for `which gh`", async () => {
    const { fn, calls } = counter()
    const at = () => 0

    await memoizedExecFile("which", ["gog"], fn, at)
    await memoizedExecFile("which", ["gh"], fn, at)

    expect(calls()).toBe(2)
  })

  it("re-probes once the TTL has passed", async () => {
    const { fn, calls } = counter()
    let now = 0

    await memoizedExecFile("which", ["gog"], fn, () => now)
    now = 5 * 60_000
    await memoizedExecFile("which", ["gog"], fn, () => now)

    expect(calls()).toBe(2)
  })

  it("never caches a failure — a dismissed keychain prompt must not pin the answer", async () => {
    let calls = 0
    const fn = async () => {
      calls += 1
      if (calls === 1) throw new Error("user dismissed the keychain prompt")
      return { stdout: "connected", stderr: "" }
    }
    const at = () => 0

    await expect(memoizedExecFile("gog", ["auth", "list", "-j"], fn, at)).rejects.toThrow()
    const second = await memoizedExecFile("gog", ["auth", "list", "-j"], fn, at)

    expect(second.stdout).toBe("connected")
    expect(calls).toBe(2)
  })

  it("clearExecMemo makes the next call really re-run — this is what Re-check needs", async () => {
    const { fn, calls } = counter()
    const at = () => 0

    await memoizedExecFile("gog", ["auth", "status", "-j"], fn, at)
    clearExecMemo()
    await memoizedExecFile("gog", ["auth", "status", "-j"], fn, at)

    expect(calls()).toBe(2)
  })
})

describe("the slow auth probes get their own TTL", () => {
  beforeEach(clearExecMemo)

  it("keeps kiro-cli whoami — the 2.14s probe that dominates /connect — for an hour", async () => {
    let calls = 0
    const execFn = async () => {
      calls++
      return { stdout: "", stderr: "" }
    }
    let now = 0
    const at = () => now
    await memoizedExecFile("kiro-cli", ["whoami", "--format", "json"], execFn, at)
    now = 10 * 60_000 // well past the 5-minute default
    await memoizedExecFile("kiro-cli", ["whoami", "--format", "json"], execFn, at)
    expect(calls).toBe(1)
    now = 61 * 60_000
    await memoizedExecFile("kiro-cli", ["whoami", "--format", "json"], execFn, at)
    expect(calls).toBe(2)
  })

  it.each([
    ["gh", ["api", "user"]],
    ["claude", ["auth", "status"]],
    ["gog", ["auth", "list", "-j"]],
    ["beeper", ["--read-only", "version"]],
  ])("keeps %s account probes warm until the user explicitly re-checks", async (command, args) => {
    const { fn, calls } = counter()
    let now = 0
    await memoizedExecFile(command, args, fn, () => now)
    now = 10 * 60_000
    await memoizedExecFile(command, args, fn, () => now)
    expect(calls()).toBe(1)
  })

  it("does NOT extend `which kiro-cli`, or installing a tool would stay invisible for an hour", async () => {
    let calls = 0
    const execFn = async () => {
      calls++
      return { stdout: "", stderr: "" }
    }
    let now = 0
    const at = () => now
    await memoizedExecFile("which", ["kiro-cli"], execFn, at)
    now = 6 * 60_000
    await memoizedExecFile("which", ["kiro-cli"], execFn, at)
    expect(calls).toBe(2)
  })

  it("Re-check still really looks, whatever the TTL", async () => {
    let calls = 0
    const execFn = async () => {
      calls++
      return { stdout: "", stderr: "" }
    }
    await memoizedExecFile("beeper", ["chats", "list"], execFn)
    clearExecMemo()
    await memoizedExecFile("beeper", ["chats", "list"], execFn)
    expect(calls).toBe(2)
  })
})
