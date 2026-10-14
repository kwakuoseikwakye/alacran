import { describe, expect, it, vi } from "vitest"
import {
  ASK_COMPANY_TOOL,
  buildAgentPrompt,
  createOrUpdateAgentImpl,
  listVoicesImpl,
  mintSignedUrlImpl,
  PROPOSE_SETUP_TOOL,
  PROPOSE_TASK_TOOL,
  type FetchFn,
} from "./elevenlabs-api-impl"

const KEY = "xi-secret-key"
const settings =
  (over: Record<string, unknown> = {}) =>
  async () =>
    ({ providerId: "elevenlabs", apiKey: KEY, ...over }) as never

function res(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

type Call = { url: string; init: RequestInit }
function recorder(handler: (c: Call) => Response) {
  const calls: Call[] = []
  const fetchFn = (async (url: string, init: RequestInit) => {
    const call = { url: String(url), init }
    calls.push(call)
    return handler(call)
  }) as unknown as FetchFn
  return { calls, fetchFn }
}
const headerOf = (c: Call, name: string) => (c.init.headers as Record<string, string>)[name]
/** Answer a POST /v1/convai/tools with the id that belongs to whichever of the three tools it creates. */
const toolReply = (c: Call, ids = { ask: "tool_77", setup: "setup_66", task: "task_55" }) => {
  const name = JSON.parse(String(c.init.body)).tool_config.name
  return res(200, { id: name === ASK_COMPANY_TOOL ? ids.ask : name === PROPOSE_SETUP_TOOL ? ids.setup : ids.task })
}

describe("mintSignedUrlImpl", () => {
  it("refuses without the provider, key, or agent — and never calls out", async () => {
    const fetchFn = vi.fn() as unknown as FetchFn
    expect((await mintSignedUrlImpl(fetchFn, async () => ({ providerId: "browser" }) as never)).ok).toBe(false)
    expect((await mintSignedUrlImpl(fetchFn, settings({ apiKey: undefined }))).ok).toBe(false)
    expect((await mintSignedUrlImpl(fetchFn, settings())).ok).toBe(false) // no agent yet
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("asks for the agent's signed url with the key in xi-api-key, and returns only the url", async () => {
    const { calls, fetchFn } = recorder(() => res(200, { signed_url: "wss://example/convai?token=abc" }))
    const result = await mintSignedUrlImpl(
      fetchFn,
      settings({ elevenlabs: { agentId: "agent_9", toolId: "t", voiceId: "v" } })
    )
    expect(calls[0].url).toBe("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent_9")
    expect(headerOf(calls[0], "xi-api-key")).toBe(KEY)
    expect(result).toEqual({ ok: true, signedUrl: "wss://example/convai?token=abc" })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it("explains a 401 and a 404 in plain words, never with the key", async () => {
    const withAgent = settings({ elevenlabs: { agentId: "agent_9", toolId: "t", voiceId: "v" } })
    const r401 = await mintSignedUrlImpl(recorder(() => res(401, {})).fetchFn, withAgent)
    const r404 = await mintSignedUrlImpl(recorder(() => res(404, {})).fetchFn, withAgent)
    expect(r401).toMatchObject({ ok: false, message: expect.stringMatching(/didn't recognise that key/) })
    expect(r404).toMatchObject({ ok: false, message: expect.stringMatching(/Create agent/) })
    expect(JSON.stringify([r401, r404])).not.toContain(KEY)
  })

  it("reports a network failure without leaking the key", async () => {
    const fetchFn = (async () => {
      throw new Error(`connect failed for ${KEY}`)
    }) as unknown as FetchFn
    const result = await mintSignedUrlImpl(
      fetchFn,
      settings({ elevenlabs: { agentId: "a", toolId: "t", voiceId: "v" } })
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain(KEY)
  })
})

describe("createOrUpdateAgentImpl", () => {
  const persona = {
    assistantName: "Zoey",
    userName: "Caleb",
    spokenLanguage: "es-ES",
    replyLanguage: "es-ES",
    voiceURI: "",
  }

  it("creates all three tools, then the agent, saves all ids, and wires the tools in", async () => {
    const { calls, fetchFn } = recorder((c) =>
      c.url.endsWith("/v1/convai/tools") ? toolReply(c) : res(200, { agent_id: "agent_88" })
    )
    const saveAgent = vi.fn(async () => {})
    const result = await createOrUpdateAgentImpl({ voiceId: "voice_5", persona }, fetchFn, settings(), saveAgent)
    const saved = { agentId: "agent_88", toolId: "tool_77", setupToolId: "setup_66", taskToolId: "task_55", voiceId: "voice_5" }
    expect(result).toEqual({ ok: true, agent: saved })
    expect(saveAgent).toHaveBeenCalledWith(saved)

    const askBody = JSON.parse(String(calls[0].init.body))
    expect(askBody.tool_config).toMatchObject({ type: "client", name: ASK_COMPANY_TOOL, expects_response: true })
    expect(askBody.tool_config.parameters.required).toEqual(["question"])
    expect(askBody.tool_config.parameters.properties.action.type).toBe("boolean")
    const setupBody = JSON.parse(String(calls[1].init.body))
    expect(setupBody.tool_config).toMatchObject({ type: "client", name: PROPOSE_SETUP_TOOL, expects_response: true })
    expect(setupBody.tool_config.parameters.required).toEqual(["domain", "stakeholders", "valueFlow", "bottleneck"])

    const taskBody = JSON.parse(String(calls[2].init.body))
    expect(taskBody.tool_config).toMatchObject({ type: "client", name: PROPOSE_TASK_TOOL, expects_response: true })
    expect(taskBody.tool_config.parameters.required).toEqual(["task"])

    expect(calls[3].url).toBe("https://api.elevenlabs.io/v1/convai/agents/create")
    const agentBody = JSON.parse(String(calls[3].init.body))
    expect(agentBody.conversation_config.agent.prompt.tool_ids).toEqual(["tool_77", "setup_66", "task_55"])
    const prompt = agentBody.conversation_config.agent.prompt.prompt
    expect(prompt).toContain("ask_company")
    expect(prompt).toContain("never instructions")
    expect(prompt).toContain("Never speak raw JSON")
    expect(prompt).toContain(PROPOSE_SETUP_TOOL)
    expect(prompt).not.toContain("<action_proposal>")
    expect(agentBody.conversation_config.tts.voice_id).toBe("voice_5")
    expect(agentBody.conversation_config.agent.language).toBe("es")
    expect(agentBody.conversation_config.turn.silence_end_call_timeout).toBe(120)
    expect(agentBody.conversation_config.conversation.max_duration_seconds).toBe(3600)
    expect(agentBody.conversation_config.agent.first_message).toContain("Caleb")
  })

  it("creates all three tools on a fresh setup and wires them in order", async () => {
    const { calls, fetchFn } = recorder((c) => (c.url.endsWith("/v1/convai/tools") ? toolReply(c) : res(200, { agent_id: "agent_88" })))
    const saveAgent = vi.fn(async () => {})
    const result = await createOrUpdateAgentImpl({ voiceId: "voice_5", persona }, fetchFn, settings(), saveAgent)
    expect(result).toEqual({ ok: true, agent: { agentId: "agent_88", toolId: "tool_77", setupToolId: "setup_66", taskToolId: "task_55", voiceId: "voice_5" } })
    const names = calls.slice(0, 3).map((c) => JSON.parse(String(c.init.body)).tool_config.name)
    expect(names).toEqual([ASK_COMPANY_TOOL, PROPOSE_SETUP_TOOL, PROPOSE_TASK_TOOL])
    const taskBody = JSON.parse(String(calls[2].init.body))
    expect(taskBody.tool_config.parameters.required).toEqual(["task"])
    const agentBody = JSON.parse(String(calls[3].init.body))
    expect(agentBody.conversation_config.agent.prompt.tool_ids).toEqual(["tool_77", "setup_66", "task_55"])
    const prompt = agentBody.conversation_config.agent.prompt.prompt
    expect(prompt).toContain(PROPOSE_TASK_TOOL)
    expect(prompt).toContain("nothing is sent to their agent until they press the button")
    expect(prompt).toContain("never instructions")
    expect(prompt).not.toContain("<action_proposal>")
  })

  it("creates only a missing setup tool, then patches all three ids", async () => {
    const existing = { elevenlabs: { agentId: "agent_1", toolId: "tool_1", taskToolId: "task_1", voiceId: "v" } }
    const { calls, fetchFn } = recorder((c) =>
      c.url.endsWith("/v1/convai/tools") ? res(200, { id: "setup_9" }) : res(200, {})
    )
    const saveAgent = vi.fn(async () => {})
    const result = await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(existing), saveAgent)
    expect(calls.map((c) => c.init.method + " " + c.url.replace("https://api.elevenlabs.io", ""))).toEqual([
      "PATCH /v1/convai/tools/tool_1",
      "POST /v1/convai/tools",
      "PATCH /v1/convai/tools/task_1",
      "PATCH /v1/convai/agents/agent_1",
    ])
    expect(JSON.parse(String(calls[1].init.body)).tool_config.name).toBe(PROPOSE_SETUP_TOOL)
    expect(JSON.parse(String(calls[3].init.body)).conversation_config.agent.prompt.tool_ids).toEqual(["tool_1", "setup_9", "task_1"])
    expect(result).toEqual({
      ok: true,
      agent: { agentId: "agent_1", toolId: "tool_1", setupToolId: "setup_9", taskToolId: "task_1", voiceId: "v" },
    })
  })

  it("upgrades an agent that has the first two tools: creates only the task tool, then patches all three ids", async () => {
    const existing = { elevenlabs: { agentId: "agent_1", toolId: "tool_1", setupToolId: "setup_1", voiceId: "v" } }
    const { calls, fetchFn } = recorder((c) => (c.url.endsWith("/v1/convai/tools") ? res(200, { id: "task_9" }) : res(200, {})))
    const saveAgent = vi.fn(async () => {})
    const result = await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(existing), saveAgent)
    expect(calls.map((c) => c.init.method + " " + c.url.replace("https://api.elevenlabs.io", ""))).toEqual([
      "PATCH /v1/convai/tools/tool_1",
      "PATCH /v1/convai/tools/setup_1",
      "POST /v1/convai/tools",
      "PATCH /v1/convai/agents/agent_1",
    ])
    expect(JSON.parse(String(calls[2].init.body)).tool_config.name).toBe(PROPOSE_TASK_TOOL)
    expect(JSON.parse(String(calls[3].init.body)).conversation_config.agent.prompt.tool_ids).toEqual(["tool_1", "setup_1", "task_9"])
    expect(result).toEqual({ ok: true, agent: { agentId: "agent_1", toolId: "tool_1", setupToolId: "setup_1", taskToolId: "task_9", voiceId: "v" } })
  })

  it("upgrades an agent that has only the first tool: creates setup then task, in that order", async () => {
    const existing = { elevenlabs: { agentId: "agent_1", toolId: "tool_1", voiceId: "v" } }
    const { calls, fetchFn } = recorder((c) => (c.url.endsWith("/v1/convai/tools") ? toolReply(c) : res(200, {})))
    const result = await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(existing), vi.fn(async () => {}))
    expect(calls.map((c) => c.init.method)).toEqual(["PATCH", "POST", "POST", "PATCH"])
    expect(calls.slice(1, 3).map((c) => JSON.parse(String(c.init.body)).tool_config.name)).toEqual([PROPOSE_SETUP_TOOL, PROPOSE_TASK_TOOL])
    expect(JSON.parse(String(calls[3].init.body)).conversation_config.agent.prompt.tool_ids).toEqual(["tool_1", "setup_66", "task_55"])
    expect(result).toMatchObject({ ok: true, agent: { toolId: "tool_1", setupToolId: "setup_66", taskToolId: "task_55" } })
  })

  it("updates the existing agent in place and reuses all three tools", async () => {
    const existing = {
      elevenlabs: { agentId: "agent_1", toolId: "tool_1", setupToolId: "setup_1", taskToolId: "task_1", voiceId: "old" },
    }
    const { calls, fetchFn } = recorder(() => res(200, {}))
    const saveAgent = vi.fn(async () => {})
    const result = await createOrUpdateAgentImpl({ voiceId: "new", persona: null }, fetchFn, settings(existing), saveAgent)
    expect(calls).toHaveLength(4) // one PATCH per saved tool, then the agent
    expect(calls[3].url).toBe("https://api.elevenlabs.io/v1/convai/agents/agent_1")
    expect(calls[3].init.method).toBe("PATCH")
    expect(result).toEqual({
      ok: true,
      agent: { agentId: "agent_1", toolId: "tool_1", setupToolId: "setup_1", taskToolId: "task_1", voiceId: "new" },
    })
  })

  it("creates a fresh agent when the old one was deleted on ElevenLabs' side (PATCH 404)", async () => {
    const existing = {
      elevenlabs: { agentId: "gone", toolId: "tool_1", setupToolId: "setup_1", taskToolId: "task_1", voiceId: "v" },
    }
    const { calls, fetchFn } = recorder((c) =>
      c.init.method === "PATCH" && c.url.includes("/agents/") ? res(404, {}) : res(200, { agent_id: "agent_new" })
    )
    const saveAgent = vi.fn(async () => {})
    const result = await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(existing), saveAgent)
    expect(calls.map((c) => c.init.method)).toEqual(["PATCH", "PATCH", "PATCH", "PATCH", "POST"])
    expect(result).toMatchObject({
      ok: true,
      agent: { agentId: "agent_new", toolId: "tool_1", setupToolId: "setup_1", taskToolId: "task_1" },
    })
  })

  it("refuses without a key and without calling out", async () => {
    const fetchFn = vi.fn() as unknown as FetchFn
    const result = await createOrUpdateAgentImpl(
      { voiceId: "v", persona: null },
      fetchFn,
      settings({ apiKey: undefined }),
      vi.fn()
    )
    expect(result.ok).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("says what to do when the key may lack agents access or credit (403), without the key", async () => {
    const result = await createOrUpdateAgentImpl(
      { voiceId: "v", persona: null },
      recorder(() => res(403, {})).fetchFn,
      settings(),
      vi.fn()
    )
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/agents access|credit/) })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })
})

describe("listVoicesImpl", () => {
  it("returns id and name only", async () => {
    const { calls, fetchFn } = recorder(() =>
      res(200, { voices: [{ voice_id: "v1", name: "Rachel", labels: { a: "b" }, preview_url: "x" }] })
    )
    const result = await listVoicesImpl(fetchFn, settings())
    expect(calls[0].url).toBe("https://api.elevenlabs.io/v2/voices?page_size=100")
    expect(result).toEqual({ ok: true, voices: [{ id: "v1", name: "Rachel" }] })
  })
})

describe("createOrUpdateAgentImpl: a saved tool that was deleted on ElevenLabs' side", () => {
  const existing = {
    elevenlabs: { agentId: "agent_1", toolId: "dead_tool", setupToolId: "dead_setup", taskToolId: "dead_task", voiceId: "v" },
  }
  const fresh = { ask: "tool_new", setup: "setup_new", task: "task_new" }
  const isToolCreate = (c: Call) => c.url.endsWith("/v1/convai/tools")
  const toolIdsOf = (c: Call) => JSON.parse(String(c.init.body)).conversation_config.agent.prompt.tool_ids

  it("PATCH 404 then create 422: makes all three tools again, creates the agent with them, saves all", async () => {
    const { calls, fetchFn } = recorder((c) => {
      if (isToolCreate(c)) return toolReply(c, fresh)
      if (c.init.method === "PATCH") return res(404, {})
      return toolIdsOf(c)[0] === "dead_tool" ? res(422, {}) : res(200, { agent_id: "agent_new" })
    })
    const saveAgent = vi.fn(async () => {})
    const result = await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(existing), saveAgent)
    expect(calls.filter(isToolCreate)).toHaveLength(3)
    expect(toolIdsOf(calls[calls.length - 1])).toEqual(["tool_new", "setup_new", "task_new"])
    expect(calls[calls.length - 1].url).toBe("https://api.elevenlabs.io/v1/convai/agents/create")
    const saved = { agentId: "agent_new", toolId: "tool_new", setupToolId: "setup_new", taskToolId: "task_new", voiceId: "v" }
    expect(result).toEqual({ ok: true, agent: saved })
    expect(saveAgent).toHaveBeenCalledWith(saved)
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it("PATCH 422: makes all three tools again and patches the same agent once more with them", async () => {
    const { calls, fetchFn } = recorder((c) => {
      if (isToolCreate(c)) return toolReply(c, fresh)
      if (!c.url.includes("/agents/")) return res(200, {}) // the tool PATCHes succeed; only the agent step rejects
      return toolIdsOf(c)[0] === "dead_tool" ? res(422, {}) : res(200, {})
    })
    const saveAgent = vi.fn(async () => {})
    const result = await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(existing), saveAgent)
    expect(calls.map((c) => c.init.method)).toEqual(["PATCH", "PATCH", "PATCH", "PATCH", "POST", "POST", "POST", "PATCH"])
    expect(calls[7].url).toBe("https://api.elevenlabs.io/v1/convai/agents/agent_1")
    expect(toolIdsOf(calls[7])).toEqual(["tool_new", "setup_new", "task_new"])
    const saved = { agentId: "agent_1", toolId: "tool_new", setupToolId: "setup_new", taskToolId: "task_new", voiceId: "v" }
    expect(result).toEqual({ ok: true, agent: saved })
    expect(saveAgent).toHaveBeenCalledWith(saved)
  })

  it("PATCH 500: returns the error with no tool creation and nothing saved", async () => {
    const { calls, fetchFn } = recorder(() => res(500, {}))
    const saveAgent = vi.fn(async () => {})
    const result = await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(existing), saveAgent)
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(1)
    expect(saveAgent).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it("tools made in this same call are never re-created when the agent step gives 422", async () => {
    const { calls, fetchFn } = recorder((c) => (isToolCreate(c) ? toolReply(c) : res(422, {})))
    const saveAgent = vi.fn(async () => {})
    const result = await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(), saveAgent)
    expect(result.ok).toBe(false)
    expect(calls.filter(isToolCreate)).toHaveLength(3) // one per tool, made once, not again on the 422
    expect(saveAgent).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain(KEY)
  })
})

describe("createOrUpdateAgentImpl: existing tools are brought up to date", () => {
  const saved = { elevenlabs: { agentId: "agent_1", toolId: "tool_1", setupToolId: "setup_1", taskToolId: "task_1", voiceId: "v" } }
  const isTool = (c: Call) => c.url.includes("/v1/convai/tools")

  it("gives ask_company the longest wait ElevenLabs allows (120 s)", async () => {
    const { calls, fetchFn } = recorder((c) => (c.url.endsWith("/v1/convai/tools") ? toolReply(c) : res(200, { agent_id: "a" })))
    await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(), vi.fn(async () => {}))
    expect(JSON.parse(String(calls[0].init.body)).tool_config.response_timeout_secs).toBe(120)
    expect(JSON.parse(String(calls[1].init.body)).tool_config.response_timeout_secs).toBeUndefined()
  })

  it("PATCHes each saved tool with its current config, then PATCHes the agent", async () => {
    const { calls, fetchFn } = recorder(() => res(200, {}))
    const result = await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(saved), vi.fn(async () => {}))
    expect(calls.map((c) => c.init.method + " " + c.url.replace("https://api.elevenlabs.io", ""))).toEqual([
      "PATCH /v1/convai/tools/tool_1",
      "PATCH /v1/convai/tools/setup_1",
      "PATCH /v1/convai/tools/task_1",
      "PATCH /v1/convai/agents/agent_1",
    ])
    const sent = calls.slice(0, 3).map((c) => JSON.parse(String(c.init.body)).tool_config)
    expect(sent.map((t) => t.name)).toEqual([ASK_COMPANY_TOOL, PROPOSE_SETUP_TOOL, PROPOSE_TASK_TOOL])
    expect(sent[0].response_timeout_secs).toBe(120)
    expect(result).toMatchObject({ ok: true, agent: { toolId: "tool_1", setupToolId: "setup_1", taskToolId: "task_1" } })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it("a tool PATCH 404 makes a fresh tool and the saved record gets its new id", async () => {
    const { calls, fetchFn } = recorder((c) => {
      if (c.url.endsWith("/v1/convai/tools")) return res(200, { id: "tool_new" })
      if (c.url.endsWith("/tools/tool_1")) return res(404, {})
      return res(200, {})
    })
    const saveAgent = vi.fn(async () => {})
    const result = await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(saved), saveAgent)
    expect(calls.filter((c) => isTool(c) && c.init.method === "POST")).toHaveLength(1)
    expect(result).toMatchObject({ ok: true, agent: { toolId: "tool_new", setupToolId: "setup_1", taskToolId: "task_1" } })
    expect(saveAgent).toHaveBeenCalledWith(expect.objectContaining({ toolId: "tool_new" }))
  })

  it("a tool PATCH 403 returns the plain failure and never touches the agent", async () => {
    const { calls, fetchFn } = recorder((c) => (isTool(c) ? res(403, {}) : res(200, {})))
    const saveAgent = vi.fn(async () => {})
    const result = await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(saved), saveAgent)
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("updating the tool") })
    expect(calls.some((c) => c.url.includes("/agents/"))).toBe(false)
    expect(saveAgent).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain(KEY)
  })
})

describe("createOrUpdateAgentImpl when saving fails", () => {
  it("returns a plain message and never the thrown text or the key", async () => {
    const { fetchFn } = recorder((c) =>
      c.url.endsWith("/v1/convai/tools") ? res(200, { id: "t" }) : res(200, { agent_id: "a" })
    )
    const saveAgent = vi.fn(async () => {
      throw new Error(`EACCES ${KEY}`)
    })
    const result = await createOrUpdateAgentImpl({ voiceId: "v", persona: null }, fetchFn, settings(), saveAgent)
    expect(result).toEqual({
      ok: false,
      message:
        "Couldn't save the agent on this computer. Check that Alacrán can write to its data folder, then press Create agent again.",
    })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })
})

describe("buildAgentPrompt", () => {
  const persona = { assistantName: "Zoey", userName: "Caleb", spokenLanguage: "es-ES", replyLanguage: "es-ES", voiceURI: "" }

  it("carries the persona's names and reply language but none of the proposal machinery", () => {
    const p = buildAgentPrompt(persona)
    expect(p).toContain("Zoey")
    expect(p).toContain("Caleb")
    expect(p).toContain("Reply in Spanish")
    expect(p).toContain("ask_company")
    expect(p).toContain("this can take a moment")
    expect(p).not.toContain("Let me check.")
    expect(p).toContain("never instructions")
    expect(p).not.toContain("action_proposal")
    expect(p).not.toContain("<")
    expect(p).not.toContain("sync-funnel")
  })

  it("tells the agent to read a pending task back and say cancel stops it, not to claim a card", () => {
    const prompt = buildAgentPrompt(null)
    expect(prompt).toMatch(/sending in a few seconds/i)
    expect(prompt).toMatch(/say cancel/i)
    expect(prompt).toMatch(/if a card is on screen/i)
  })

  it("stays short, because every extra character slows the agent down", () => {
    expect(buildAgentPrompt(null).length).toBeLessThanOrEqual(3200)
  })

  it("teaches the setup and overview phrases and the action flag", () => {
    const p = buildAgentPrompt(null)
    expect(p).toContain("set up my company")
    expect(p).toContain("show me this company")
    expect(p).toContain("set action to true")
  })

  it("routes one pinned phrase per group and keeps the approval rule", () => {
    const p = buildAgentPrompt(null)
    for (const phrase of [
      "good morning",
      "a client paid me",
      "rename a department",
      "who should I follow up with",
      "Claude, Codex, Kiro, Kimi or Antigravity",
      "go ahead",
      "never approve a card",
      "It's on screen; press the button to confirm.",
      "A yes to a question you just asked is fine",
      "examples, not a full list",
    ]) {
      expect(p).toContain(phrase)
    }
    expect(p).not.toContain("action_proposal")
  })

  it("falls back to English with no persona", () => {
    expect(buildAgentPrompt(null)).toContain("Reply in English")
  })
})
