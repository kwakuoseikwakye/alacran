import { describe, it, expect, beforeEach, vi } from "vitest"

/**
 * One wire, tested once: the executor id that `buildAssistantLaunch` picked has
 * to land on the session `openSession` stores, because `hasLiveAssistant` reads
 * that exact field to decide whether the NEXT tab is briefed.
 *
 * Both halves were green with the connection cut — `sessions.test.ts` reaches
 * the map through `_setSessionForTest`, and `intro-command.test.ts` injects its
 * own `hasLiveAssistantFn`, so neither touches this line. Dropping it makes
 * every assistant tab introduce itself again, which is the bug the feature
 * fixes, and `executorId` is optional on the options object so `tsc` says
 * nothing.
 */
// How many terminals each workspace already holds, per test.
const counts: Record<string, number> = {}

// What the session map holds, per test (empty by default: no live terminals).
const listSessions = vi.fn((_agent: string): Record<string, unknown>[] => [])
const getSession = vi.fn((_agent: string, _id: string): Record<string, unknown> | undefined => undefined)

const openSession = vi.fn(async (options: Record<string, unknown>) => ({
  id: options.sessionId,
  kind: options.kind,
  label: options.label,
}))

vi.mock("@/lib/get-effective-agents", () => ({
  getEffectiveAgents: async () => [{ id: "acme", rootPath: "/companies/acme", kind: "command-set" }],
}))

vi.mock("@/lib/terminal/sessions", () => ({
  openSession: (options: Record<string, unknown>) => openSession(options),
  getSession: (agent: string, id: string) => getSession(agent, id),
  closeSession: () => {},
  listSessions: (agent: string) => listSessions(agent),
  countSessions: (_agent: string, workspace?: string) => counts[workspace ?? "main"] ?? 0,
  isValidSessionId: () => true,
  terminalAvailable: async () => true,
  MAX_SESSIONS_PER_WORKSPACE: 8,
}))

const buildAssistantLaunch = vi.fn(async (..._args: unknown[]) => ({
  ok: true,
  launch: { file: "claude", args: ["briefing"] },
  label: "Claude Code",
  executorId: "kiro",
}))
vi.mock("@/lib/terminal/intro-command", () => ({
  buildAssistantLaunch: (...args: unknown[]) => buildAssistantLaunch(...args),
}))

// Workspaces live in a file; here they are two fixed ones, one pinned to an AI.
vi.mock("@/lib/terminal/workspaces", () => ({
  listWorkspaces: async () => [
    { id: "main", name: "Main" },
    { id: "w1", name: "Research", executorId: "kimi" },
  ],
  createWorkspace: async () => ({ ok: true, workspace: { id: "w2", name: "x" } }),
  updateWorkspace: async () => ({ ok: true, workspace: { id: "w1", name: "x" } }),
  deleteWorkspace: async () => ({ ok: true, workspace: { id: "w1", name: "x" } }),
}))

const delegateTaskImpl = vi.fn(async (..._args: unknown[]): Promise<{ ok: boolean; message: string }> => ({
  ok: true,
  message: "Sent.",
}))
vi.mock("@/lib/terminal/delegate-task-impl", () => ({
  delegateTaskImpl: (...args: unknown[]) => delegateTaskImpl(...args),
}))

const readVoiceSettings = vi.fn(async (): Promise<{ providerId: string; autoDispatchCompanies?: string[] }> => ({ providerId: "browser" }))
vi.mock("@/lib/voice/settings-impl", () => ({
  readVoiceSettingsImpl: () => readVoiceSettings(),
}))

const getResult = vi.fn(async (..._args: unknown[]): Promise<Record<string, unknown>> => ({ changed: false, message: "none", strays: null }))
vi.mock("@/lib/company-commands/company-command-result-impl", () => ({
  getCompanyCommandResultImpl: (...args: unknown[]) => getResult(...args),
}))

const { POST } = await import("./route")

function post(body: Record<string, unknown>): Request {
  return new Request("http://127.0.0.1:4319/api/terminal/acme", {
    method: "POST",
    headers: { host: "127.0.0.1:4319", origin: "http://127.0.0.1:4319", "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function openTab(kind: string): Request {
  return new Request("http://127.0.0.1:4319/api/terminal/acme", {
    method: "POST",
    headers: {
      host: "127.0.0.1:4319",
      origin: "http://127.0.0.1:4319",
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "open", session: "s1", kind }),
  })
}

describe("POST /api/terminal/[agentId] — opening an assistant", () => {
  beforeEach(() => {
    openSession.mockClear()
  })

  it("records the session under the executor the launch actually chose", async () => {
    const response = await POST(openTab("ai"), { params: Promise.resolve({ agentId: "acme" }) })

    expect(response.status).toBe(200)
    expect(openSession).toHaveBeenCalledTimes(1)
    // "kiro", not the default — so a hardcoded id would fail this too.
    expect(openSession.mock.calls[0][0]).toMatchObject({ kind: "ai", executorId: "kiro" })
  })

  it("leaves a command line tab with no executor, because it runs no agent", async () => {
    await POST(openTab("shell"), { params: Promise.resolve({ agentId: "acme" }) })

    expect(openSession.mock.calls[0][0]).toMatchObject({ kind: "shell" })
    expect(openSession.mock.calls[0][0].executorId).toBeUndefined()
  })
})

describe("POST /api/terminal/[agentId] — workspaces", () => {
  const ctx = { params: Promise.resolve({ agentId: "acme" }) }
  beforeEach(() => {
    openSession.mockClear()
    buildAssistantLaunch.mockClear()
  })

  it("opens an assistant in a workspace under that workspace's own AI", async () => {
    const response = await POST(post({ type: "open", session: "s1", kind: "ai", workspace: "w1" }), ctx)

    expect(response.status).toBe(200)
    expect(openSession.mock.calls[0][0]).toMatchObject({ workspaceId: "w1" })
    // A resolver for kimi was handed over, not left to the company's default.
    const resolver = buildAssistantLaunch.mock.calls[0][2] as (id: string) => Promise<{ id: string }>
    expect((await resolver("acme")).id).toBe("kimi")
  })

  it("leaves the company's AI in charge when the workspace names none", async () => {
    await POST(post({ type: "open", session: "s1", kind: "ai", workspace: "main" }), ctx)

    expect(buildAssistantLaunch.mock.calls[0][2]).toBeUndefined()
    expect(openSession.mock.calls[0][0]).toMatchObject({ workspaceId: "main" })
  })

  it("files a command line under its workspace too", async () => {
    await POST(post({ type: "open", session: "s1", kind: "shell", workspace: "w1" }), ctx)

    expect(openSession.mock.calls[0][0]).toMatchObject({ kind: "shell", workspaceId: "w1" })
  })

  it("refuses a workspace the company does not have, rather than filing under Main", async () => {
    const response = await POST(post({ type: "open", session: "s1", kind: "shell", workspace: "gone" }), ctx)

    expect(response.status).toBe(409)
    expect(openSession).not.toHaveBeenCalled()
  })

  it("gives each workspace its own eight: a full one refuses, another still opens", async () => {
    counts.w1 = 8
    const full = await POST(post({ type: "open", session: "s1", kind: "shell", workspace: "w1" }), ctx)
    expect(full.status).toBe(429)
    expect(openSession).not.toHaveBeenCalled()

    // Main holds 7 and w1 holds 8: Main is not full, so it opens.
    counts.main = 7
    const main = await POST(post({ type: "open", session: "s2", kind: "shell", workspace: "main" }), ctx)
    expect(main.status).toBe(200)

    counts.main = 8
    expect((await POST(post({ type: "open", session: "s3", kind: "shell" }), ctx)).status).toBe(429)
    delete counts.w1
    delete counts.main
  })
})

describe("POST /api/terminal/[agentId] — delegate-task", () => {
  const ctx = { params: Promise.resolve({ agentId: "acme" }) }
  const summary = (id: string, kind: string, startedAt: number) => ({ id, kind, label: id, startedAt })
  beforeEach(() => {
    delegateTaskImpl.mockClear()
    listSessions.mockReset()
    getSession.mockReset()
    listSessions.mockReturnValue([])
  })

  it("types into the newest agent tab, found by the server because the card sends no session id", async () => {
    const write = vi.fn()
    listSessions.mockReturnValue([summary("sh", "shell", 9), summary("old", "ai", 1), summary("new", "ai", 5)])
    getSession.mockImplementation((_agent, id) => (id === "new" ? { kind: "ai", label: "Claude Code", pty: { write } } : undefined))

    const response = await POST(post({ type: "delegate-task", task: "draft the plan" }), ctx)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: "Sent." })
    // The sessions asked about are the company named in the URL, not anything from the body.
    expect(listSessions).toHaveBeenCalledWith("acme")
    expect(getSession).toHaveBeenCalledWith("acme", "new")
    const [, task, session] = delegateTaskImpl.mock.calls[0] as [unknown, unknown, { kind: string; label?: string; write: (d: string) => void }]
    expect(task).toBe("draft the plan")
    expect(session.kind).toBe("ai")
    // The tab's own name travels with it, so the reply can say where the task went.
    expect(session.label).toBe("Claude Code")
    session.write("typed\n")
    expect(write).toHaveBeenCalledWith("typed\n")
  })

  it("hands over no session when no agent tab is open, and relays the refusal as a 409", async () => {
    listSessions.mockReturnValue([summary("sh", "shell", 9)])
    delegateTaskImpl.mockResolvedValueOnce({ ok: false, message: "Your agent isn't open for Acme. Open it in Terminal, then send again." })

    const response = await POST(post({ type: "delegate-task", task: "draft the plan" }), ctx)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ message: "Your agent isn't open for Acme. Open it in Terminal, then send again." })
    expect(listSessions).toHaveBeenCalledWith("acme")
    expect((delegateTaskImpl.mock.calls[0] as unknown[])[2]).toBeUndefined()
    expect(getSession).not.toHaveBeenCalled()
  })
})

describe("POST /api/terminal/[agentId] — delegate-task with auto", () => {
  const ctx = { params: Promise.resolve({ agentId: "acme" }) }
  const summary = (id: string, kind: string, startedAt: number) => ({ id, kind, label: id, startedAt })
  beforeEach(() => {
    delegateTaskImpl.mockClear()
    readVoiceSettings.mockReset()
    listSessions.mockReset()
    getSession.mockReset()
    listSessions.mockReturnValue([])
    getResult.mockReset()
    getResult.mockResolvedValue({ changed: false, message: "none", strays: null })
  })

  // Final review: a typed Enter must not answer the agent's permission prompt for an earlier task.
  it("refuses while an earlier task's summary is waiting, without touching the agent", async () => {
    readVoiceSettings.mockResolvedValue({ providerId: "browser", autoDispatchCompanies: ["acme"] })
    getResult.mockResolvedValue({ changed: true, strays: [] })

    const response = await POST(post({ type: "delegate-task", task: "tidy the headings", auto: true }), ctx)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ message: "This needs your approval on screen." })
    expect(delegateTaskImpl).not.toHaveBeenCalled()
  })

  it("refuses while an earlier task has unreviewed stray edits", async () => {
    readVoiceSettings.mockResolvedValue({ providerId: "browser", autoDispatchCompanies: ["acme"] })
    getResult.mockResolvedValue({ changed: false, message: "", strays: ["a.md"] })

    const response = await POST(post({ type: "delegate-task", task: "tidy the headings", auto: true }), ctx)

    expect(response.status).toBe(409)
    expect(delegateTaskImpl).not.toHaveBeenCalled()
  })

  it("refuses when the pending check throws", async () => {
    readVoiceSettings.mockResolvedValue({ providerId: "browser", autoDispatchCompanies: ["acme"] })
    getResult.mockRejectedValue(new Error("boom"))

    const response = await POST(post({ type: "delegate-task", task: "tidy the headings", auto: true }), ctx)

    expect(response.status).toBe(409)
    expect(delegateTaskImpl).not.toHaveBeenCalled()
  })

  it("does not run the pending check for the card path", async () => {
    getResult.mockResolvedValue({ changed: true, strays: [] })
    await POST(post({ type: "delegate-task", task: "tidy the headings" }), ctx)
    expect(getResult).not.toHaveBeenCalled()
    expect(delegateTaskImpl).toHaveBeenCalledTimes(1)
  })

  // Review focus 2: the client's claim that auto-dispatch is on is never enough.
  it("refuses an auto request for a company whose switch is off, without touching the agent", async () => {
    readVoiceSettings.mockResolvedValue({ providerId: "browser" })

    const response = await POST(post({ type: "delegate-task", task: "tidy the headings", auto: true }), ctx)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ message: "This needs your approval on screen." })
    expect(delegateTaskImpl).not.toHaveBeenCalled()
  })

  it("refuses a switched-on company's gated task", async () => {
    readVoiceSettings.mockResolvedValue({ providerId: "browser", autoDispatchCompanies: ["acme"] })

    const response = await POST(post({ type: "delegate-task", task: "pay the Acme invoice", auto: true }), ctx)

    expect(response.status).toBe(409)
    expect(delegateTaskImpl).not.toHaveBeenCalled()
  })

  it("refuses when only another company is switched on", async () => {
    readVoiceSettings.mockResolvedValue({ providerId: "browser", autoDispatchCompanies: ["beta"] })

    const response = await POST(post({ type: "delegate-task", task: "tidy the headings", auto: true }), ctx)

    expect(response.status).toBe(409)
    expect(delegateTaskImpl).not.toHaveBeenCalled()
  })

  it("passes a clean task for a switched-on company to delegateTaskImpl", async () => {
    const write = vi.fn()
    readVoiceSettings.mockResolvedValue({ providerId: "browser", autoDispatchCompanies: ["acme"] })
    listSessions.mockReturnValue([summary("new", "ai", 5)])
    getSession.mockImplementation((_agent, id) => (id === "new" ? { kind: "ai", label: "Claude Code", pty: { write } } : undefined))

    const response = await POST(post({ type: "delegate-task", task: "tidy the headings", auto: true }), ctx)

    expect(response.status).toBe(200)
    expect((delegateTaskImpl.mock.calls[0] as unknown[])[1]).toBe("tidy the headings")
  })

  it("does not read the switch for a request without auto, so the card path is exactly as before", async () => {
    listSessions.mockReturnValue([])

    await POST(post({ type: "delegate-task", task: "pay the Acme invoice" }), ctx)

    expect(readVoiceSettings).not.toHaveBeenCalled()
    expect(delegateTaskImpl).toHaveBeenCalledTimes(1)
  })

  it("treats auto: false or a non-boolean auto as no auto", async () => {
    for (const auto of [false, "true", 1, null]) {
      readVoiceSettings.mockClear()
      await POST(post({ type: "delegate-task", task: "pay the Acme invoice", auto }), ctx)
      expect(readVoiceSettings).not.toHaveBeenCalled()
    }
  })
})
