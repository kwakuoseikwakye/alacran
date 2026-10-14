import { describe, expect, it, vi } from "vitest"
import { createMicGate, spaceMayWake } from "./mic-gate"
import { createAgentSession, type ConversationLike, type SessionEvent } from "./session"

function wire(pushToTalk: boolean) {
  const convs: { setMicMuted: ReturnType<typeof vi.fn> }[] = []
  const ui: boolean[] = []
  let touched = 0
  const ref: { s?: ReturnType<typeof createAgentSession> } = {}
  const gate = createMicGate({
    mute: (m) => ref.s?.mute(m),
    onMuted: (m) => ui.push(m),
    touch: () => touched++,
    pushToTalk: () => pushToTalk,
  })
  const opts: { onDisconnect: (d?: unknown) => void }[] = []
  const session = createAgentSession({
    mint: async () => ({ ok: true as const, signedUrl: "wss://x" }),
    start: vi.fn(async (o) => {
      opts.push(o)
      const c = {
        endSession: vi.fn(async () => {}), setMicMuted: vi.fn(), sendUserMessage: vi.fn(),
        getInputVolume: () => 0, getOutputVolume: () => 0,
        getInputByteFrequencyData: () => new Uint8Array(), getOutputByteFrequencyData: () => new Uint8Array(),
      }
      convs.push(c)
      return c as unknown as ConversationLike
    }),
    askCompany: async () => "", proposeDefineCompany: async () => "", proposeAgentTask: async () => "",
    onEvent: (e: SessionEvent) => { if (e.type === "status" && e.status === "connected") gate.onConnected() },
    wait: async () => {},
  })
  ref.s = session
  return { gate, session, convs, ui, opts, touched: () => touched }
}

describe("push-to-talk mic gate", () => {
  it("mutes on connect and again after a reconnect", async () => {
    const { gate, session, convs, opts } = wire(true)
    gate.reset()
    await session.start()
    expect(convs[0].setMicMuted).toHaveBeenCalledWith(true)
    opts[0].onDisconnect({ reason: "error" })
    await vi.waitFor(() => expect(convs).toHaveLength(2))
    await vi.waitFor(() => expect(convs[1].setMicMuted).toHaveBeenCalledWith(true))
  })
  it("leaves the mic open when push-to-talk is off", async () => {
    const { gate, session, convs } = wire(false)
    gate.reset()
    await session.start()
    expect(convs[0].setMicMuted).not.toHaveBeenCalled()
    gate.talk(true)
    expect(convs[0].setMicMuted).not.toHaveBeenCalled()
  })
  it("talk opens the mic and counts as activity; release closes it", async () => {
    const { gate, session, convs, ui, touched } = wire(true)
    gate.reset()
    await session.start()
    gate.talk(true)
    expect(convs[0].setMicMuted).toHaveBeenLastCalledWith(false)
    expect(ui.at(-1)).toBe(false)
    expect(touched()).toBe(1)
    gate.talk(false)
    expect(convs[0].setMicMuted).toHaveBeenLastCalledWith(true)
    expect(ui.at(-1)).toBe(true)
    expect(touched()).toBe(1)
  })
  it("toggle still flips the mic when push-to-talk is off, and clear forgets it", async () => {
    const { gate, session, convs } = wire(false)
    gate.reset()
    await session.start()
    gate.toggle()
    expect(convs[0].setMicMuted).toHaveBeenLastCalledWith(true)
    gate.clear()
    expect(gate.isMuted()).toBe(false)
  })
})

describe("releasing push-to-talk before a conversation exists", () => {
  it("leaves the gate muted so the next conversation starts closed", () => {
    const mute = vi.fn()
    const gate = createMicGate({ mute, onMuted: () => {}, touch: () => {}, pushToTalk: () => true })
    gate.reset()
    gate.talk(true)
    gate.talk(false)
    mute.mockClear()
    gate.onConnected()
    expect(mute).toHaveBeenCalledWith(true)
  })
})

describe("spaceMayWake", () => {
  it("lets Space talk anywhere once awake, but wakes the assistant only from inside it (waking costs minutes)", () => {
    expect(spaceMayWake(true, false)).toBe(true)
    expect(spaceMayWake(true, true)).toBe(true)
    expect(spaceMayWake(false, true)).toBe(true)
    expect(spaceMayWake(false, false)).toBe(false)
  })
})
