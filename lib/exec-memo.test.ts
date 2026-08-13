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
    const { fn, calls } = counter("nana@plh.life")
    const at = () => 0

    const a = await memoizedExecFile("gog", ["auth", "list", "-j"], fn, at)
    const b = await memoizedExecFile("gog", ["auth", "list", "-j"], fn, at)

    expect(a.stdout).toBe("nana@plh.life")
    expect(b.stdout).toBe("nana@plh.life")
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

    await memoizedExecFile("gog", ["auth", "list", "-j"], fn, () => now)
    now = 5 * 60_000
    await memoizedExecFile("gog", ["auth", "list", "-j"], fn, () => now)

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
