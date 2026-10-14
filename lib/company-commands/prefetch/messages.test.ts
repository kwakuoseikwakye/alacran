import { describe, it, expect } from "vitest"
import { buildMessagesPrefetch } from "./messages"
import { FENCE_OPEN_PREFIX, FENCE_CLOSE_PREFIX } from "./untrusted-fence"
import type { PrefetchContext, PrefetchExecFileFn } from "./types"

const envelope = (data: unknown) => ({ stdout: JSON.stringify({ success: true, data, error: null }), stderr: "" })

const CHATS = [{ id: "c1", title: "Founders", network: "WhatsApp" }]
const MESSAGES = [{ text: "ship it friday", senderName: "Ama", timestamp: new Date().toISOString(), chatID: "c1" }]

/** Routes on the subcommand, so one fake serves both calls in a run. */
function fakeCli(
  overrides: { chats?: () => unknown; messages?: () => unknown } = {}
): { execFn: PrefetchExecFileFn; calls: string[][] } {
  const calls: string[][] = []
  const execFn: PrefetchExecFileFn = async (file, args) => {
    if (file !== "beeper") throw new Error(`unexpected binary ${file}`)
    calls.push(args)
    const run = args[0] === "chats" ? (overrides.chats ?? (() => CHATS)) : (overrides.messages ?? (() => MESSAGES))
    return envelope(run())
  }
  return { execFn, calls }
}

function ctx(execFn: PrefetchExecFileFn): PrefetchContext {
  return { agentRootPath: "/tmp/company", fieldValues: {}, execFn }
}

describe("buildMessagesPrefetch", () => {
  it("labels a line with the network and chat title, not the raw chat id", async () => {
    const { execFn } = fakeCli()
    const result = await buildMessagesPrefetch(ctx(execFn))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("[WhatsApp/Founders] Ama")
    expect(result.text).toContain("ship it friday")
  })

  it("fences the payload with a nonce that closes it", async () => {
    const { execFn } = fakeCli()
    const result = await buildMessagesPrefetch(ctx(execFn))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const nonce = result.text.match(/--- UNTRUSTED:([0-9a-f]{16}) ---/)?.[1]
    expect(nonce).toBeTruthy()
    expect(result.text).toContain(`${FENCE_OPEN_PREFIX}${nonce} ---`)
    expect(result.text).toContain(`${FENCE_CLOSE_PREFIX}${nonce} ---`)
    // The message body must sit INSIDE the fence, not before it.
    expect(result.text.indexOf("ship it friday")).toBeGreaterThan(result.text.indexOf(FENCE_OPEN_PREFIX))
  })

  it("cannot send: every call carries --read-only, and asks only for others' messages", async () => {
    const { execFn, calls } = fakeCli()
    await buildMessagesPrefetch(ctx(execFn))
    expect(calls.length).toBe(2)
    for (const args of calls) expect(args).toContain("--read-only")
    const search = calls.find((a) => a[0] === "messages")!
    expect(search.join(" ")).toContain("--sender others")
    expect(search).toContain("--after")
  })

  it("still reports the messages when the chat list cannot be read", async () => {
    const { execFn } = fakeCli({
      chats: () => {
        throw new Error("boom")
      },
    })
    const result = await buildMessagesPrefetch(ctx(execFn))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("ship it friday")
  })

  it("refuses before spawning when the CLI is not installed", async () => {
    const result = await buildMessagesPrefetch(
      ctx(async () => {
        throw new Error("spawn beeper ENOENT")
      })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/isn't installed/)
  })

  it("refuses with the connect step when Beeper has no session yet", async () => {
    const result = await buildMessagesPrefetch(
      ctx(async () => {
        throw new Error("401 Unauthorized: Invalid or missing token")
      })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/beeper setup/)
  })

  it("refuses on a quiet day instead of spending a run to write 'no messages'", async () => {
    const { execFn } = fakeCli({ messages: () => [] })
    const result = await buildMessagesPrefetch(ctx(execFn))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/nothing to write up/)
  })
})
