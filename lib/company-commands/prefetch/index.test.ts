import { describe, it, expect } from "vitest"
import { COMPANY_COMMANDS } from "../registry"
import { runPrefetch } from "./index"
import type { PrefetchContext, PrefetchExecFileFn } from "./types"

const execFn: PrefetchExecFileFn = async () => ({ stdout: "", stderr: "" })
const ctx = (): PrefetchContext => ({ agentRootPath: "/tmp/x", fieldValues: {}, execFn })

describe("prefetchKind wiring", () => {
  it("leaves exactly refresh, check-messages, check-inbox, handoff and learn-preferences declaring a prefetch kind", () => {
    const withKind = COMPANY_COMMANDS.filter((c) => c.prefetchKind !== undefined).map((c) => c.id).sort()
    expect(withKind).toEqual(["check-inbox", "check-messages", "handoff", "learn-preferences", "refresh"])
  })

  it("gives check-inbox the inbox kind and handoff the handoff kind", () => {
    expect(COMPANY_COMMANDS.find((c) => c.id === "check-inbox")?.prefetchKind).toBe("inbox")
    expect(COMPANY_COMMANDS.find((c) => c.id === "handoff")?.prefetchKind).toBe("handoff")
  })

  it("gives check-messages the messages kind", () => {
    expect(COMPANY_COMMANDS.find((c) => c.id === "check-messages")?.prefetchKind).toBe("messages")
  })

  it("gives refresh the refresh kind", () => {
    expect(COMPANY_COMMANDS.find((c) => c.id === "refresh")?.prefetchKind).toBe("refresh")
  })

  it("has removed needsPrefetch from every command", () => {
    for (const command of COMPANY_COMMANDS) {
      expect(command).not.toHaveProperty("needsPrefetch")
    }
  })
})

describe("runPrefetch", () => {
  it("returns empty text for a command with no prefetch kind", async () => {
    expect(await runPrefetch(undefined, ctx())).toEqual({ ok: true, text: "" })
  })

  it("dispatches refresh to its real handler", async () => {
    const result = await runPrefetch("refresh", ctx())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // ctx()'s execFn answers every git call, and it has no readFileFn, so the
    // Notion half refuses — which refresh must degrade to a note rather than
    // propagate. That degradation is the whole reason this handler exists
    // instead of pointing the registry at check-notion's.
    expect(result.text).toContain("this company's own commits")
    expect(result.text).toContain("not connected for this company")
  })

  it("dispatches inbox and handoff to their real handlers", async () => {
    // ctx()'s execFn answers every call with empty output: no Google account is listed, so inbox
    // refuses in its own words; git answers nothing, so handoff still writes up an empty state.
    const inbox = await runPrefetch("inbox", ctx())
    expect(inbox).toEqual({ ok: false, message: expect.stringMatching(/google account/i) })
    const handoff = await runPrefetch("handoff", ctx())
    expect(handoff.ok).toBe(true)
    if (handoff.ok) expect(handoff.text).toContain("the working tree is clean")
  })

  // The guard has to stay even though every named kind now has a handler: a
  // registry entry can still name a kind nobody wired up, and running that
  // command unprefetched would silently drop the context its prompt promises.
  it("refuses a kind with no handler rather than running unprefetched", async () => {
    const result = await runPrefetch("made-up" as never, ctx())
    expect(result).toEqual({ ok: false, message: "No prefetch handler for kind: made-up" })
  })
})
