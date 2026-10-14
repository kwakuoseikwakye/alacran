import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/get-effective-agents", () => ({
  getEffectiveAgents: async () => [{ id: "acme", rootPath: "/companies/acme", kind: "command-set" }],
}))

vi.mock("@/lib/terminal/sessions", () => ({
  listSessions: () => [{ id: "s1", kind: "ai", label: "Claude Code", startedAt: Date.parse("2026-10-02T14:00:00.000Z") }],
}))

const listRunsImpl = vi.fn()
vi.mock("@/lib/agent-runs/run-engine", () => ({ listRunsImpl: (id: string) => listRunsImpl(id) }))

vi.mock("@/lib/company-commands/pending-reviews", () => ({
  listPendingReviews: async () => [{ agentId: "acme", commandId: "digest" }],
}))

const lockStatus = vi.fn()
vi.mock("@/lib/company-commands/run-lock", () => ({ checkRunLockStatus: async () => lockStatus() }))

const readRunningCommand = vi.fn()
vi.mock("@/lib/company-commands/running-command", () => ({ readRunningCommand: async () => readRunningCommand() }))

vi.mock("@/lib/ai-executor-registry", () => ({ resolveAiExecutorForAgent: async () => ({ id: "claude-code" }) }))

vi.mock("@/lib/terminal/workspaces", () => ({ listWorkspaces: async () => [{ id: "main", name: "Main" }] }))

const isPackInstalled = vi.fn()
vi.mock("@/lib/vendored-skills", () => ({ isPackInstalled: (...args: unknown[]) => isPackInstalled(...args) }))


vi.mock("@/lib/os/departments/registry", () => ({
  getCompanyDepartments: () => [
    { id: "dept-finances", slug: "finances", name: "Finances", tagline: "", color: "#10b981", order: 5, recordsCount: 2, roles: [] },
  ],
}))

vi.mock("@/lib/schedules/schedules-impl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedules/schedules-impl")>()),
  readSchedulesStrict: async () => [],
  readLastRunsStrict: async () => ({}),
}))

const { GET } = await import("./route")

const get = (id: string, host = "127.0.0.1:4319") =>
  GET(new Request(`http://${host}/api/office/${id}`, { headers: { host } }), { params: Promise.resolve({ agentId: id }) })

beforeEach(() => {
  listRunsImpl.mockReset()
  listRunsImpl.mockResolvedValue([])
  lockStatus.mockReset()
  lockStatus.mockReturnValue({ running: false })
  readRunningCommand.mockReset()
  readRunningCommand.mockResolvedValue(null)
  isPackInstalled.mockReset()
  isPackInstalled.mockImplementation(async (_root: string, dir: string) => dir === "marketing")
})

describe("GET /api/office/[agentId]", () => {
  it("refuses a request that did not come to this machine's loopback address", async () => {
    expect((await get("acme", "evil.com")).status).toBe(403)
  })

  it("404s a company it does not know", async () => {
    expect((await get("nobody")).status).toBe(404)
  })

  it("returns the office for a known company", async () => {
    const res = await get("acme")
    expect(res.status).toBe(200)
    const office = await res.json()
    expect(office.desks.map((d: { id: string }) => d.id)).toEqual(["terminal", "runs", "schedule"])
    expect(office.summary).toBe("1 working · 1 waiting on you")
  })

  it("marks the runs desk unreadable when the runs source throws, and still answers", async () => {
    listRunsImpl.mockRejectedValue(new Error("disk"))
    const office = await (await get("acme")).json()
    const runs = office.desks.find((d: { id: string }) => d.id === "runs")
    expect(runs.unreadable).toBe("Can't read agent runs")
    expect(runs.workers.map((w: { id: string }) => w.id)).toEqual(["review:digest"])
  })

  it("returns the rooms and the company's AI as a resident", async () => {
    const office = await (await get("acme")).json()
    expect(office.rooms.map((r: { id: string }) => r.id)).toEqual(["hq", "team:marketing", "dept:finances"])
    expect(office.residents).toEqual([{ executorId: "claude-code", name: "Claude", color: "#d9774f" }])
    expect(office.moreRooms).toBe(0)
  })

  it("names the running command, in its department, only while the lock is held", async () => {
    lockStatus.mockReturnValue({ running: true })
    readRunningCommand.mockResolvedValue({ commandId: "sync-finances", executorId: "claude-code", startedAt: "2026-10-03T09:00:00.000Z" })
    const office = await (await get("acme")).json()
    const runs = office.desks.find((d: { id: string }) => d.id === "runs")
    expect(runs.workers[0]).toMatchObject({ id: "command:running", label: "Reconcile Financial Records", roomId: "dept:finances" })
  })

  it("ignores a marker left behind once the lock is free", async () => {
    readRunningCommand.mockResolvedValue({ commandId: "sync-finances", executorId: "claude-code", startedAt: "t" })
    await get("acme")
    expect(readRunningCommand).not.toHaveBeenCalled()
  })
})
