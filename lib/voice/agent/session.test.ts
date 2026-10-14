import { describe, expect, it, vi } from "vitest"
import { ASK_COMPANY_TOOL, PROPOSE_SETUP_TOOL, PROPOSE_TASK_TOOL } from "../elevenlabs-api-impl"
import { MAX_RECONNECTS, createAgentSession, type ConversationLike, type SessionEvent, type StartOptions } from "./session"

function fakeConversation(): ConversationLike & { ended: number } {
  const c = {
    ended: 0,
    endSession: vi.fn(async () => {
      c.ended++
    }),
    setMicMuted: vi.fn(),
    sendUserMessage: vi.fn(),
    getInputVolume: () => 0,
    getOutputVolume: () => 0,
    getInputByteFrequencyData: () => new Uint8Array(0),
    getOutputByteFrequencyData: () => new Uint8Array(0),
  }
  return c
}

function statuses(events: SessionEvent[]) {
  return events.filter((e) => e.type === "status").map((e) => (e as { status: string }).status)
}

function gate() {
  let release!: () => void
  const promise = new Promise<void>((r) => (release = r))
  return { promise, release }
}

const settle = () => new Promise<void>((r) => setTimeout(r, 20))

function setup(over: Partial<Parameters<typeof createAgentSession>[0]> = {}) {
  const events: SessionEvent[] = []
  const opts: StartOptions[] = []
  const convs: ReturnType<typeof fakeConversation>[] = []
  const deps = {
    mint: vi.fn(async () => ({ ok: true as const, signedUrl: "wss://x" })),
    start: vi.fn(async (o: StartOptions): Promise<ConversationLike> => {
      opts.push(o)
      const c = fakeConversation()
      convs.push(c)
      return c
    }),
    askCompany: vi.fn(async () => "answer"),
    proposeDefineCompany: vi.fn(async () => "on screen"),
    proposeAgentTask: vi.fn(async () => "on screen"),
    onEvent: (e: SessionEvent) => events.push(e),
    wait: async () => {},
    ...over,
  }
  return { session: createAgentSession(deps), deps, events, opts, convs }
}

describe("createAgentSession", () => {
  it("connects: connecting then connected", async () => {
    const { session, events } = setup()
    await session.start()
    expect(events.filter((e) => e.type === "status").map((e) => (e as { status: string }).status)).toEqual([
      "connecting",
      "connected",
    ])
  })

  it("registers exactly the three client tools the agent is created with", async () => {
    const { session, opts } = setup()
    await session.start()
    expect(Object.keys(opts[0].clientTools).sort()).toEqual([ASK_COMPANY_TOOL, PROPOSE_SETUP_TOOL, PROPOSE_TASK_TOOL].sort())
  })

  it("ends as failed, with the plain message, when the call link cannot be minted", async () => {
    const { session, events, deps } = setup({ mint: vi.fn(async () => ({ ok: false as const, message: "No key." })) })
    await session.start()
    expect(events).toContainEqual({ type: "error", message: "No key." })
    expect(events).toContainEqual({ type: "ended", reason: "failed" })
    expect(deps.start).not.toHaveBeenCalled()
  })

  it("maps SDK messages and modes to session events", async () => {
    const { session, events, opts } = setup()
    await session.start()
    opts[0].onMessage({ role: "agent", message: "Hello" })
    opts[0].onMessage({ role: "user", message: "Hi" })
    opts[0].onModeChange({ mode: "speaking" })
    expect(events).toContainEqual({ type: "message", role: "agent", text: "Hello" })
    expect(events).toContainEqual({ type: "message", role: "user", text: "Hi" })
    expect(events).toContainEqual({ type: "mode", mode: "speaking" })
  })

  it("runs ask_company and reports start and done", async () => {
    const { session, events, opts, deps } = setup()
    await session.start()
    const answer = await opts[0].clientTools.ask_company({ question: "How many?", company: "Acme" })
    expect(answer).toBe("answer")
    expect(deps.askCompany).toHaveBeenCalledWith("How many?", "Acme", false)
    await opts[0].clientTools.ask_company({ question: "Set up", action: true })
    expect(deps.askCompany).toHaveBeenLastCalledWith("Set up", undefined, true)
    expect(events).toContainEqual({ type: "tool", phase: "start", question: "How many?" })
    expect(events).toContainEqual({ type: "tool", phase: "done", question: "How many?" })
  })

  it("returns a safe sentence and reports the error when ask_company throws, and the call stays up", async () => {
    const { session, events, opts } = setup({
      askCompany: vi.fn(async () => {
        throw new Error("boom")
      }),
    })
    await session.start()
    const answer = await opts[0].clientTools.ask_company({ question: "q" })
    expect(answer).toBe("I couldn't reach the company files just now.")
    expect(events).toContainEqual({ type: "tool", phase: "error", question: "q", detail: "boom" })
    expect(events.some((e) => e.type === "ended")).toBe(false)
  })

  it("reconnects after a drop and keeps the call alive once it works", async () => {
    const { session, events, opts, deps } = setup()
    await session.start()
    opts[0].onDisconnect({ reason: "error", message: "lost" })
    await vi.waitFor(() => expect(deps.start).toHaveBeenCalledTimes(2))
    expect(events).toContainEqual({ type: "status", status: "reconnecting" })
    await vi.waitFor(() => expect(statuses(events).slice(-3)).toEqual(["connected", "reconnecting", "connected"]))
    expect(events.some((e) => e.type === "ended")).toBe(false)
  })

  it("gives up after three failed reconnects, ends as dropped, and stops retrying", async () => {
    const { session, events, opts, deps } = setup()
    await session.start()
    ;(deps.start as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      throw new Error("offline")
    })
    opts[0].onDisconnect({ reason: "error", message: "lost" })
    await vi.waitFor(() => expect(events).toContainEqual({ type: "ended", reason: "dropped" }))
    expect(deps.start).toHaveBeenCalledTimes(1 + MAX_RECONNECTS)
    expect(events.filter((e) => e.type === "ended")).toEqual([{ type: "ended", reason: "dropped" }])
    expect(statuses(events)).toEqual([
      "connecting",
      "connected",
      "reconnecting",
      "reconnecting",
      "reconnecting",
      "ended",
    ])
  })

  it.each(["agent", "user"])("ends once as user, without redialling, when the %s ends the call", async (reason) => {
    const { session, events, opts, deps, convs } = setup()
    await session.start()
    opts[0].onDisconnect({ reason })
    await vi.waitFor(() => expect(events).toContainEqual({ type: "ended", reason: "user" }))
    expect(events.filter((e) => e.type === "ended")).toHaveLength(1)
    expect(deps.start).toHaveBeenCalledTimes(1)
    expect(events).not.toContainEqual({ type: "status", status: "reconnecting" })
    expect(convs[0].ended).toBe(1)
  })

  it("ends once, even if end() is called twice or the SDK reports a disconnect afterwards", async () => {
    const { session, events, opts, convs, deps } = setup()
    await session.start()
    await session.end("user")
    await session.end("silence")
    opts[0].onDisconnect({ reason: "error", message: "lost" })
    await Promise.resolve()
    expect(convs[0].ended).toBe(1)
    expect(deps.start).toHaveBeenCalledTimes(1)
    expect(events.filter((e) => e.type === "ended")).toEqual([{ type: "ended", reason: "user" }])
  })

  it("forwards mute and typed messages to the conversation", async () => {
    const { session, convs } = setup()
    await session.start()
    session.mute(true)
    session.send("typed question")
    expect(convs[0].setMicMuted).toHaveBeenCalledWith(true)
    expect(convs[0].sendUserMessage).toHaveBeenCalledWith("typed question")
  })

  it("ignores mute and send before a conversation exists", () => {
    const { session } = setup()
    expect(() => {
      session.mute(true)
      session.send("x")
    }).not.toThrow()
  })

  it("does not redial when end() lands during the reconnect wait", async () => {
    const g = gate()
    const { session, events, opts, deps } = setup({ wait: () => g.promise })
    await session.start()
    opts[0].onDisconnect({ reason: "error" })
    await vi.waitFor(() => expect(events).toContainEqual({ type: "status", status: "reconnecting" }))
    await session.end("user")
    g.release()
    await settle()
    expect(deps.start).toHaveBeenCalledTimes(1)
  })

  it("ends a conversation that finishes opening after end(), once, with no connected after ended", async () => {
    const g = gate()
    const conv = fakeConversation()
    const startFn = vi.fn(async (_o: StartOptions): Promise<ConversationLike> => {
      await g.promise
      return conv
    })
    const { session, events } = setup({ start: startFn })
    const started = session.start()
    await vi.waitFor(() => expect(startFn).toHaveBeenCalled())
    await session.end("user")
    g.release()
    await started
    expect(conv.ended).toBe(1)
    expect(events.filter((e) => e.type === "ended")).toEqual([{ type: "ended", reason: "user" }])
    expect(statuses(events)).toEqual(["connecting", "ended"])
    expect(session.conversation()).toBeNull()
  })

  it("never starts a conversation when end() lands while the link is being minted", async () => {
    const g = gate()
    const { session, deps } = setup({
      mint: vi.fn(async () => {
        await g.promise
        return { ok: true as const, signedUrl: "wss://x" }
      }),
    })
    const started = session.start()
    await vi.waitFor(() => expect(deps.mint).toHaveBeenCalled())
    await session.end("user")
    g.release()
    await started
    await settle()
    expect(deps.start).not.toHaveBeenCalled()
  })

  it("opens only one conversation on a double start()", async () => {
    const { session, deps } = setup()
    await Promise.all([session.start(), session.start()])
    await session.start()
    expect(deps.start).toHaveBeenCalledTimes(1)
  })

  it("does nothing on start() after end()", async () => {
    const { session, events, deps } = setup()
    await session.start()
    await session.end("user")
    const before = events.length
    await session.start()
    expect(deps.start).toHaveBeenCalledTimes(1)
    expect(events).toHaveLength(before)
  })

  it("runs one reconnect loop for duplicate disconnects, and ignores a stale disconnect from the old conversation", async () => {
    const g = gate()
    const { session, events, opts, deps, convs } = setup({ wait: () => g.promise })
    await session.start()
    opts[0].onDisconnect({ reason: "error" })
    opts[0].onDisconnect({ reason: "error" })
    await vi.waitFor(() => expect(events).toContainEqual({ type: "status", status: "reconnecting" }))
    g.release()
    await vi.waitFor(() => expect(deps.start).toHaveBeenCalledTimes(2))
    await settle()
    expect(deps.start).toHaveBeenCalledTimes(2)
    expect(convs[0].ended).toBe(1)
    opts[0].onDisconnect({ reason: "error" })
    await settle()
    session.mute(true)
    expect(convs[1].setMicMuted).toHaveBeenCalledWith(true)
    expect(deps.start).toHaveBeenCalledTimes(2)
    expect(events.some((e) => e.type === "ended")).toBe(false)
  })

  it("keeps the call open when the event listener throws on connected", async () => {
    const { session, convs, deps } = setup({
      onEvent: (e: SessionEvent) => {
        if (e.type === "status" && e.status === "connected") throw new Error("listener bug")
      },
    })
    await session.start()
    expect(deps.start).toHaveBeenCalledTimes(1)
    expect(session.conversation()).not.toBeNull()
    await session.end("user")
    expect(convs[0].ended).toBe(1)
  })

  it("answers ask_company with the safe sentence, without asking, once the session has ended", async () => {
    const { session, events, opts, deps } = setup()
    await session.start()
    await session.end("user")
    const before = events.length
    const answer = await opts[0].clientTools.ask_company({ question: "q" })
    expect(answer).toBe("I couldn't reach the company files just now.")
    expect(deps.askCompany).not.toHaveBeenCalled()
    expect(events).toHaveLength(before)
  })

  it("runs propose_define_company with the model's arguments and reports it as a tool event", async () => {
    const { session, opts, deps, events } = setup()
    await session.start()
    const args = { domain: "d", stakeholders: "s", valueFlow: "v", bottleneck: "b" }
    const out = await opts[0].clientTools.propose_define_company(args)
    expect(out).toBe("on screen")
    expect(deps.proposeDefineCompany).toHaveBeenCalledWith(args)
    expect(events).toContainEqual({ type: "tool", phase: "start", question: "Set up the company profile" })
    expect(events).toContainEqual({ type: "tool", phase: "done", question: "Set up the company profile" })
  })

  it("answers propose_define_company with one safe sentence and reports an error event when the handler throws", async () => {
    const { session, opts, events } = setup({ proposeDefineCompany: vi.fn(async () => { throw new Error("spawn ENOENT /bin/x") }) })
    await session.start()
    const out = await opts[0].clientTools.propose_define_company({})
    expect(out).toBe("I couldn't prepare that just now.")
    expect(events.some((e) => e.type === "tool" && e.phase === "error")).toBe(true)
    expect(events.some((e) => e.type === "ended")).toBe(false)
  })

  it("answers propose_define_company with the safe sentence, without running it or emitting events, once the session has ended", async () => {
    const { session, events, opts, deps } = setup()
    await session.start()
    await opts[0].clientTools.propose_define_company({ domain: "d" })
    await session.end("user")
    const before = events.length
    const after = await opts[0].clientTools.propose_define_company({ domain: "d" })
    expect(after).toBe("I couldn't prepare that just now.")
    expect(deps.proposeDefineCompany).toHaveBeenCalledTimes(1)
    expect(events).toHaveLength(before)
  })

  it("hands propose_define_company an empty object when the model sends no arguments", async () => {
    const { session, opts, deps } = setup()
    await session.start()
    await opts[0].clientTools.propose_define_company(undefined as never)
    expect(deps.proposeDefineCompany).toHaveBeenCalledWith({})
  })

  it("runs propose_agent_task with the model's arguments and reports it as a tool event", async () => {
    const { session, opts, deps, events } = setup()
    await session.start()
    const out = await opts[0].clientTools.propose_agent_task({ task: "draft the plan" })
    expect(out).toBe("on screen")
    expect(deps.proposeAgentTask).toHaveBeenCalledWith({ task: "draft the plan" })
    expect(events).toContainEqual({ type: "tool", phase: "start", question: "Pass a task to your agent" })
    expect(events).toContainEqual({ type: "tool", phase: "done", question: "Pass a task to your agent" })
  })

  it("answers propose_agent_task with one safe sentence when the handler throws", async () => {
    const { session, opts, events } = setup({ proposeAgentTask: vi.fn(async () => { throw new Error("boom /x") }) })
    await session.start()
    expect(await opts[0].clientTools.propose_agent_task({})).toBe("I couldn't prepare that just now.")
    expect(events.some((e) => e.type === "tool" && e.phase === "error")).toBe(true)
  })

  it("does not run propose_agent_task or emit anything once the call has ended", async () => {
    const { session, opts, deps, events } = setup()
    await session.start()
    await session.end("user")
    const before = events.length
    expect(await opts[0].clientTools.propose_agent_task({ task: "x" })).toBe("I couldn't prepare that just now.")
    expect(deps.proposeAgentTask).not.toHaveBeenCalled()
    expect(events).toHaveLength(before)
  })

  it("hands propose_agent_task an empty object when the model sends no arguments", async () => {
    const { session, opts, deps } = setup()
    await session.start()
    await opts[0].clientTools.propose_agent_task(undefined as never)
    expect(deps.proposeAgentTask).toHaveBeenCalledWith({})
  })
})
