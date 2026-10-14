import { describe, expect, it } from "vitest"
import { createStreamHub, type StreamSource } from "./stream-hub"

function fakeSource() {
  const source: StreamSource & { emit(s: string, d: string): void; reopen(): void } = {
    onmessage: null,
    onopen: null,
    close() {},
    emit(s, d) {
      source.onmessage?.({ data: JSON.stringify({ s, d }) })
    },
    reopen() {
      source.onopen?.()
    },
  }
  return source
}

function target() {
  const t = { text: "", write: (d: string) => void (t.text += d) }
  return t
}

describe("createStreamHub", () => {
  it("routes frames to the session they're tagged with", () => {
    const source = fakeSource()
    const hub = createStreamHub(() => source)
    const a = target()
    const b = target()
    hub.attach("a", a)
    hub.attach("b", b)
    source.emit("a", "one")
    source.emit("b", "two")
    expect([a.text, b.text]).toEqual(["one", "two"])
  })

  it("holds output that arrives before its pane attaches, then hands it over", () => {
    const source = fakeSource()
    const hub = createStreamHub(() => source)
    source.emit("a", "early")
    const a = target()
    hub.attach("a", a)
    expect(a.text).toBe("early")
  })

  it("ignores frames it can't read", () => {
    const source = fakeSource()
    const hub = createStreamHub(() => source)
    const a = target()
    hub.attach("a", a)
    source.onmessage?.({ data: "not json" })
    source.onmessage?.({ data: JSON.stringify({ s: 1, d: "x" }) })
    expect(a.text).toBe("")
  })
})

describe("createStreamHub acks", () => {
  const settle = () => new Promise((r) => setTimeout(r, 40))

  /** A pane that "draws" instantly: calls done as soon as it's written to. */
  const drawingTarget = () => ({ write: (_d: string, done?: () => void) => done?.() })

  it("acks what a pane has drawn to the stream that sent it", async () => {
    const source = fakeSource()
    const acks: { stream: string; items: { session: string; n: number }[] }[] = []
    const hub = createStreamHub(() => source, async (stream, items) => void acks.push({ stream, items }))
    hub.attach("a", drawingTarget())
    source.onmessage?.({ data: JSON.stringify({ hello: "stream-1" }) })
    source.emit("a", "12345")
    source.emit("a", "678")
    await settle()
    expect(acks).toEqual([{ stream: "stream-1", items: [{ session: "a", n: 8 }] }])
  })

  it("acks output for a pane that isn't attached yet on receipt, and not again when it attaches", async () => {
    const source = fakeSource()
    const acks: { session: string; n: number }[] = []
    const hub = createStreamHub(() => source, async (_s, items) => void acks.push(...items), 4)
    source.onmessage?.({ data: JSON.stringify({ hello: "stream-1" }) })
    source.emit("a", "abcdef") // 6 chars in, a capped 4 kept for the pane
    await settle()
    expect(acks).toEqual([{ session: "a", n: 6 }])
    const pane = { text: "", write: (d: string, done?: () => void) => void ((pane.text += d), done?.()) }
    hub.attach("a", pane)
    await settle()
    expect(pane.text).toBe("cdef")
    expect(acks).toEqual([{ session: "a", n: 6 }])
  })

  it("forgets unsent acks from a previous connection when the stream reconnects", async () => {
    const source = fakeSource()
    const acks: string[] = []
    let release!: () => void
    const hub = createStreamHub(
      () => source,
      (stream) => {
        acks.push(stream)
        return acks.length === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve()
      }
    )
    hub.attach("a", drawingTarget())
    source.onmessage?.({ data: JSON.stringify({ hello: "old" }) })
    source.emit("a", "x")
    await settle() // first ack in flight, to "old"
    source.emit("a", "y") // pending for "old"
    source.onmessage?.({ data: JSON.stringify({ hello: "new" }) })
    release()
    source.emit("a", "z")
    await settle()
    expect(acks).toEqual(["old", "new"])
  })
})

describe("createStreamHub flow-control safety", () => {
  const settle = () => new Promise((r) => setTimeout(r, 40))
  const hello = (source: ReturnType<typeof fakeSource>, id = "s1") =>
    source.onmessage?.({ data: JSON.stringify({ hello: id }) })

  it("acks output for a session with no pane as it arrives, so the server never pauses it on this page's account", async () => {
    const source = fakeSource()
    const acks: { session: string; n: number }[] = []
    createStreamHub(() => source, async (_s, items) => (acks.push(...items), true))
    hello(source)
    source.emit("orphan", "x".repeat(150_000))
    await settle()
    expect(acks).toEqual([{ session: "orphan", n: 150_000 }])
  })

  it("re-sends acks the server did not accept", async () => {
    const source = fakeSource()
    const sent: number[] = []
    let calls = 0
    const hub = createStreamHub(
      () => source,
      async (_s, items) => {
        calls++
        sent.push(items[0].n)
        return calls > 1 // the first ack POST fails (a 500, a registry rewrite)
      }
    )
    hub.attach("a", { write: (_d: string, done?: () => void) => done?.() })
    hello(source)
    source.emit("a", "12345")
    await settle()
    await settle()
    expect(sent).toEqual([5, 5])
  })

  it("acks on receipt while the page is hidden — a background window's timers are throttled", async () => {
    const source = fakeSource()
    const acks: number[] = []
    const hub = createStreamHub(() => source, async (_s, items) => (acks.push(items[0].n), true), 200_000, () => true)
    hub.attach("a", { write: () => {} }) // never finishes parsing: throttled
    hello(source)
    source.emit("a", "abc")
    await Promise.resolve()
    expect(acks).toEqual([3])
  })

  it("after a reconnect, resets a pane in-band on its first replayed frame and leaves panes with no replay alone", () => {
    const source = fakeSource()
    const hub = createStreamHub(() => source)
    const a = target()
    const b = target()
    hub.attach("a", a)
    hub.attach("b", b)
    source.reopen()
    source.emit("a", "old-a")
    source.emit("b", "old-b")
    source.reopen() // server restarted; only "a" survived
    source.emit("a", "replay")
    source.emit("a", "more")
    expect(a.text).toBe("old-a\x1bcreplaymore")
    expect(b.text).toBe("old-b")
  })
})
