import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { _clearSessionsForTest, _setSessionForTest, closeSession, type TerminalSession } from "./sessions"
import { createBacklog } from "./backlog"
import { ackStream, companyStreamResponse } from "./company-stream"
import type { IPty } from "@homebridge/node-pty-prebuilt-multiarch"

const fakePty = { kill: () => {}, write: () => {}, resize: () => {}, pause: () => {}, resume: () => {} } as unknown as IPty

function fakeSession(id: string, backlog = ""): TerminalSession {
  const b = createBacklog(200_000)
  b.push(backlog)
  return { id, agentId: "acme", kind: "shell", label: "Command line", startedAt: 1, pty: fakePty, backlog: b, listeners: new Set() }
}

/** Reads SSE frames off the response as they arrive. The stream's first frame
 *  names it (`{hello}`); that one is kept aside as `id()`, not returned. */
function frames(response: Response) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffered = ""
  let streamId = ""
  async function raw(): Promise<Record<string, string>> {
    for (;;) {
      const end = buffered.indexOf("\n\n")
      if (end >= 0) {
        const frame = buffered.slice(0, end)
        buffered = buffered.slice(end + 2)
        return JSON.parse(frame.replace(/^data: /, ""))
      }
      const { value } = await reader.read()
      buffered += decoder.decode(value)
    }
  }
  return {
    async next(): Promise<{ s: string; d: string }> {
      for (;;) {
        const frame = await raw()
        if (frame.hello) {
          streamId = frame.hello
          continue
        }
        return frame as { s: string; d: string }
      }
    },
    async id(): Promise<string> {
      while (!streamId) {
        const frame = await raw()
        if (frame.hello) streamId = frame.hello
      }
      return streamId
    },
  }
}

describe("companyStreamResponse", () => {
  beforeEach(() => _clearSessionsForTest())
  afterEach(() => _clearSessionsForTest())

  it("replays each live session's backlog, tagged with its id", async () => {
    _setSessionForTest(fakeSession("a", "hello"))
    const { next } = frames(companyStreamResponse(new Request("http://127.0.0.1/x"), "acme"))
    expect(await next()).toEqual({ s: "a", d: "hello" })
  })

  it("forwards live output from a session", async () => {
    const session = fakeSession("a")
    _setSessionForTest(session)
    const { next } = frames(companyStreamResponse(new Request("http://127.0.0.1/x"), "acme"))
    for (const listener of session.listeners) listener("live")
    expect(await next()).toEqual({ s: "a", d: "live" })
  })

  it("stops listening when the client goes away", async () => {
    const session = fakeSession("a")
    _setSessionForTest(session)
    const abort = new AbortController()
    companyStreamResponse(new Request("http://127.0.0.1/x", { signal: abort.signal }), "acme")
    expect(session.listeners.size).toBe(1)
    abort.abort()
    expect(session.listeners.size).toBe(0)
  })

  it("still delivers what a session said just before it was removed", async () => {
    const session = fakeSession("a")
    _setSessionForTest(session)
    const { next } = frames(companyStreamResponse(new Request("http://127.0.0.1/x"), "acme"))
    const [listener] = session.listeners
    listener("first") // leading edge: sent at once
    listener("[session ended]") // inside the interval: pending
    closeSession("acme", "a") // emits "removed", which must flush, not drop
    expect(await next()).toEqual({ s: "a", d: "first" })
    expect(await next()).toEqual({ s: "a", d: "[session ended]" })
  })
})

describe("companyStreamResponse flow control", () => {
  beforeEach(() => _clearSessionsForTest())
  afterEach(() => _clearSessionsForTest())

  function countingSession(id: string) {
    const calls = { pause: 0, resume: 0 }
    const pty = { kill: () => {}, write: () => {}, resize: () => {}, pause: () => void calls.pause++, resume: () => void calls.resume++ }
    const session = { ...fakeSession(id), pty: pty as unknown as IPty }
    return { session, calls }
  }

  it("pauses a session once the client has 100k+ characters of it not yet drawn, and resumes when it acks", async () => {
    const { session, calls } = countingSession("a")
    _setSessionForTest(session)
    const stream = frames(companyStreamResponse(new Request("http://127.0.0.1/x"), "acme"))
    const id = await stream.id()
    const [listener] = session.listeners
    for (let i = 0; i < 3; i++) listener("x".repeat(40_000)) // 120k sent, none drawn
    expect(calls).toEqual({ pause: 1, resume: 0 })
    ackStream(id, [{ session: "a", n: 80_000 }]) // 40k still outstanding: not caught up
    expect(calls.resume).toBe(0)
    ackStream(id, [{ session: "a", n: 40_000 }])
    expect(calls).toEqual({ pause: 1, resume: 1 })
  })

  it("holds only the session that is behind, not its quiet neighbours", async () => {
    const a = countingSession("a")
    const b = countingSession("b")
    _setSessionForTest(a.session)
    _setSessionForTest(b.session)
    const stream = frames(companyStreamResponse(new Request("http://127.0.0.1/x"), "acme"))
    await stream.id()
    const [flood] = a.session.listeners
    for (let i = 0; i < 3; i++) flood("x".repeat(40_000))
    expect(a.calls.pause).toBe(1)
    expect(b.calls.pause).toBe(0)
  })

  it("releases a paused pty when the client goes away", async () => {
    const { session, calls } = countingSession("a")
    _setSessionForTest(session)
    const abort = new AbortController()
    const stream = frames(companyStreamResponse(new Request("http://127.0.0.1/x", { signal: abort.signal }), "acme"))
    await stream.id()
    const [listener] = session.listeners
    for (let i = 0; i < 3; i++) listener("x".repeat(40_000))
    expect(calls.pause).toBe(1)
    abort.abort()
    expect(calls.resume).toBe(1)
  })

  it("ignores acks for a stream that doesn't exist", () => {
    expect(() => ackStream("no-such-stream", [{ session: "a", n: 10 }])).not.toThrow()
  })
})

describe("companyStreamResponse cleanup", () => {
  beforeEach(() => _clearSessionsForTest())
  afterEach(() => _clearSessionsForTest())

  it("cleans up at once when the client left before the stream started", () => {
    const calls = { pause: 0 }
    const session = { ...fakeSession("a"), pty: { ...fakePty, pause: () => void calls.pause++ } as unknown as IPty }
    _setSessionForTest(session)
    const abort = new AbortController()
    abort.abort() // disconnected while the route was still awaiting the company registry
    companyStreamResponse(new Request("http://127.0.0.1/x", { signal: abort.signal }), "acme")
    expect(session.listeners.size).toBe(0)
  })

  it("cleans up when the body is cancelled without an abort", async () => {
    const session = fakeSession("a")
    _setSessionForTest(session)
    const response = companyStreamResponse(new Request("http://127.0.0.1/x"), "acme")
    expect(session.listeners.size).toBe(1)
    await response.body!.cancel()
    expect(session.listeners.size).toBe(0)
  })
})
