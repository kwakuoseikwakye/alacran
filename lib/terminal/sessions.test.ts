import { beforeEach, describe, expect, it } from "vitest"
import {
  _clearSessionsForTest,
  _setSessionForTest,
  getCompanyTerminalStatus,
  getAllCompaniesTerminalStatus,
  listSessions,
  countSessions,
  hasLiveAssistant,
  openSession,
  getSession,
  closeSession,
  terminalAvailable,
  subscribeCompany,
  registerSession,
  holdOutput,
  releaseOutput,
  type TerminalSession,
} from "./sessions"
import { createBacklog } from "./backlog"
import type { IPty } from "@homebridge/node-pty-prebuilt-multiarch"

const fakePty = {
  pid: 1234,
  cols: 80,
  rows: 24,
  process: "bash",
  handleFlowControl: false,
  onData: () => ({ dispose: () => {} }),
  onExit: () => ({ dispose: () => {} }),
  resize: () => {},
  write: () => {},
  kill: () => {},
  pause: () => {},
  resume: () => {},
} as unknown as IPty

function makeSession(over: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: "s1",
    agentId: "acme",
    kind: "ai",
    label: "Assistant",
    startedAt: 1000,
    pty: fakePty,
    backlog: createBacklog(200_000),
    listeners: new Set(),
    ...over,
  }
}

describe("terminal sessions status", () => {
  beforeEach(() => {
    _clearSessionsForTest()
  })

  it("returns running: false when no sessions exist for agent", () => {
    const status = getCompanyTerminalStatus("acme")
    expect(status).toEqual({
      running: false,
      hasAiAgent: false,
      count: 0,
      labels: [],
    })
  })

  it("detects an active AI agent terminal session", () => {
    _setSessionForTest(makeSession({ agentId: "acme", kind: "ai", label: "Assistant" }))
    const status = getCompanyTerminalStatus("acme")
    expect(status).toEqual({
      running: true,
      hasAiAgent: true,
      count: 1,
      labels: ["Assistant"],
    })
  })

  it("detects when only a shell session is active", () => {
    _setSessionForTest(makeSession({ agentId: "acme", kind: "shell", label: "Command line" }))
    const status = getCompanyTerminalStatus("acme")
    expect(status).toEqual({
      running: true,
      hasAiAgent: false,
      count: 1,
      labels: ["Command line"],
    })
  })

  it("detects multiple sessions across companies", () => {
    _setSessionForTest(makeSession({ id: "s1", agentId: "acme", kind: "ai", label: "Assistant", startedAt: 100 }))
    _setSessionForTest(makeSession({ id: "s2", agentId: "acme", kind: "shell", label: "Shell", startedAt: 200 }))
    _setSessionForTest(makeSession({ id: "s3", agentId: "beta", kind: "ai", label: "Claude Code", startedAt: 300 }))

    expect(countSessions("acme")).toBe(2)
    expect(countSessions("beta")).toBe(1)
    expect(countSessions("gamma")).toBe(0)

    const acmeStatus = getCompanyTerminalStatus("acme")
    expect(acmeStatus.running).toBe(true)
    expect(acmeStatus.hasAiAgent).toBe(true)
    expect(acmeStatus.count).toBe(2)

    const all = getAllCompaniesTerminalStatus()
    expect(all["acme"]).toEqual({
      running: true,
      hasAiAgent: true,
      count: 2,
      labels: ["Assistant", "Shell"],
    })
    expect(all["beta"]).toEqual({
      running: true,
      hasAiAgent: true,
      count: 1,
      labels: ["Claude Code"],
    })
    expect(all["gamma"]).toBeUndefined()
  })

  it("listSessions sorts by startedAt ascending and isolates companies", () => {
    _setSessionForTest(makeSession({ id: "s2", agentId: "acme", startedAt: 500, label: "Second" }))
    _setSessionForTest(makeSession({ id: "s1", agentId: "acme", startedAt: 100, label: "First" }))
    _setSessionForTest(makeSession({ id: "other", agentId: "other-co", startedAt: 50 }))

    const listed = listSessions("acme")
    expect(listed).toHaveLength(2)
    expect(listed[0].id).toBe("s1")
    expect(listed[1].id).toBe("s2")
  })

  it("listSessions says which AI each session runs, for the office view", () => {
    _setSessionForTest(makeSession({ id: "s1", agentId: "acme", kind: "ai", executorId: "codex" }))
    expect(listSessions("acme")[0].executorId).toBe("codex")
  })

  it("countSessions counts one workspace, with a session that names none under Main", () => {
    _setSessionForTest(makeSession({ id: "a", agentId: "acme", workspaceId: "w1" }))
    _setSessionForTest(makeSession({ id: "b", agentId: "acme", workspaceId: "w1" }))
    _setSessionForTest(makeSession({ id: "c", agentId: "acme" }))
    _setSessionForTest(makeSession({ id: "d", agentId: "acme", workspaceId: "main" }))

    expect(countSessions("acme", "w1")).toBe(2)
    expect(countSessions("acme")).toBe(2)
    expect(countSessions("acme", "nowhere")).toBe(0)
  })

  it("listSessions reports which workspace each session is in, so a reload files tabs back where they were", () => {
    _setSessionForTest(makeSession({ id: "a", agentId: "acme", startedAt: 1, workspaceId: "w1" }))
    _setSessionForTest(makeSession({ id: "b", agentId: "acme", startedAt: 2 }))

    expect(listSessions("acme").map((s) => [s.id, s.workspaceId])).toEqual([["a", "w1"], ["b", undefined]])
  })
})

describe("hasLiveAssistant", () => {
  beforeEach(() => {
    _clearSessionsForTest()
  })

  it("is false when this company has no terminals open at all", () => {
    expect(hasLiveAssistant("acme", "claude-code")).toBe(false)
  })

  it("is true once an assistant running that executor is live", () => {
    _setSessionForTest(makeSession({ agentId: "acme", kind: "ai", executorId: "claude-code" }))
    expect(hasLiveAssistant("acme", "claude-code")).toBe(true)
  })

  it("is false when every live assistant is a different executor", () => {
    // Switching the picker from Claude to Kiro means Kiro has never said hello
    // in this company, however many Claude tabs are still open.
    _setSessionForTest(makeSession({ agentId: "acme", kind: "ai", executorId: "claude-code" }))
    expect(hasLiveAssistant("acme", "kiro")).toBe(false)
  })

  it("ignores plain command line tabs, which never introduce anything", () => {
    // executorId is SET here on purpose: with it undefined the id comparison
    // alone returns false and the kind check is never exercised, so the test
    // passed with `kind === "ai"` deleted from the guard.
    _setSessionForTest(makeSession({ agentId: "acme", kind: "shell", executorId: "claude-code" }))
    expect(hasLiveAssistant("acme", "claude-code")).toBe(false)
  })

  it("is scoped to one company, so another company's tab never silences this one", () => {
    _setSessionForTest(makeSession({ agentId: "beta", kind: "ai", executorId: "claude-code" }))
    expect(hasLiveAssistant("acme", "claude-code")).toBe(false)
  })
})

describe("openSession records what hasLiveAssistant reads", () => {
  beforeEach(() => {
    _clearSessionsForTest()
  })

  /**
   * A real pty, because this is the one link that mocks cannot check: the route
   * test stubs openSession, and every hasLiveAssistant test reaches the map
   * through _setSessionForTest. With both of those green, deleting `executorId`
   * from openSession's own session literal left the whole suite passing while
   * every assistant tab silently went back to introducing itself.
   *
   * `/bin/cat` sits there doing nothing until it is killed, which is what makes
   * it safe to spawn here. No pty on this machine is a supported state
   * (sessions.ts explains the Node 18 case), so that branch asserts the
   * documented contract instead of skipping — a skipped test would report this
   * link as covered on exactly the machines where it is not.
   */
  it("stores the executor id on the session it opens", async () => {
    const available = await terminalAvailable()
    const session = await openSession({
      agentId: "acme",
      sessionId: "real1",
      cwd: "/tmp",
      kind: "ai",
      label: "Kiro",
      executorId: "kiro",
      launch: { file: "/bin/cat", args: [] },
    })

    if (!available) {
      expect(session).toBeNull()
      return
    }

    try {
      expect(session?.executorId).toBe("kiro")
      expect(hasLiveAssistant("acme", "kiro")).toBe(true)
      expect(hasLiveAssistant("acme", "claude-code")).toBe(false)
    } finally {
      closeSession("acme", "real1")
    }
    expect(getSession("acme", "real1")).toBeUndefined()
  })
})

describe("subscribeCompany", () => {
  beforeEach(() => _clearSessionsForTest())

  it("reports a closed session as removed, only to that company's listeners", () => {
    _setSessionForTest(makeSession({ id: "s1", agentId: "acme" }))
    const acme: unknown[] = []
    const other: unknown[] = []
    subscribeCompany("acme", (e) => acme.push(e))
    subscribeCompany("globex", (e) => other.push(e))
    closeSession("acme", "s1")
    expect(acme).toEqual([{ type: "removed", id: "s1" }])
    expect(other).toEqual([])
  })

  it("stops reporting after unsubscribe", () => {
    _setSessionForTest(makeSession({ id: "s1", agentId: "acme" }))
    const seen: unknown[] = []
    const off = subscribeCompany("acme", (e) => seen.push(e))
    off()
    closeSession("acme", "s1")
    expect(seen).toEqual([])
  })
})

describe("holdOutput / releaseOutput", () => {
  it("pauses once for any number of holders and resumes only when the last one lets go", () => {
    const calls: string[] = []
    const pty = { ...fakePty, pause: () => void calls.push("pause"), resume: () => void calls.push("resume") } as unknown as IPty
    const session = makeSession({ pty })
    holdOutput(session) // one window falls behind
    holdOutput(session) // and a second one
    releaseOutput(session) // the first catches up — the second still can't take more
    expect(calls).toEqual(["pause"])
    releaseOutput(session)
    expect(calls).toEqual(["pause", "resume"])
    releaseOutput(session) // an extra release is harmless
    expect(calls).toEqual(["pause", "resume"])
  })
})

describe("registerSession", () => {
  beforeEach(() => _clearSessionsForTest())

  it("lists a session it did not spawn and tells the company's streams about it", () => {
    const seen: unknown[] = []
    subscribeCompany("acme", (e) => seen.push(e.type))
    registerSession(makeSession({ id: "run1", kind: "run", label: "Agent · Tidy" }))
    expect(listSessions("acme").map((s) => [s.id, s.kind])).toEqual([["run1", "run"]])
    expect(seen).toEqual(["added"])
  })
})

describe("openSession onExit", () => {
  beforeEach(() => _clearSessionsForTest())

  it("tells the opener when the program ends by itself", async () => {
    if (!(await terminalAvailable())) return
    let ended = false
    await openSession({
      agentId: "acme",
      sessionId: "exits",
      cwd: process.cwd(),
      launch: { file: "/bin/sh", args: ["-c", "exit 0"] },
      onExit: () => void (ended = true),
    })
    for (let i = 0; i < 50 && !ended; i++) await new Promise((r) => setTimeout(r, 20))
    expect(ended).toBe(true)
  })
})
