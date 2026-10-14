import { describe, it, expect, vi, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// The real department registry is deliberately NOT mocked: this proves a custom
// department defined on disk reaches the office. Everything else is stubbed empty.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "office-depts-"))
vi.mock("@/lib/get-effective-agents", () => ({ getEffectiveAgents: async () => [{ id: "acme", rootPath: root, kind: "command-set" }] }))
vi.mock("@/lib/terminal/sessions", () => ({ listSessions: () => [] }))
vi.mock("@/lib/agent-runs/run-engine", () => ({ listRunsImpl: async () => [] }))
vi.mock("@/lib/company-commands/pending-reviews", () => ({ listPendingReviews: async () => [] }))
vi.mock("@/lib/company-commands/run-lock", () => ({ checkRunLockStatus: async () => ({ running: false }) }))
vi.mock("@/lib/company-commands/running-command", () => ({ readRunningCommand: async () => null }))
vi.mock("@/lib/ai-executor-registry", () => ({ resolveAiExecutorForAgent: async () => ({ id: "claude-code" }) }))
vi.mock("@/lib/terminal/workspaces", () => ({ listWorkspaces: async () => [] }))
vi.mock("@/lib/vendored-skills", () => ({ isPackInstalled: async () => false }))
vi.mock("@/lib/schedules/schedules-impl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedules/schedules-impl")>()),
  readSchedulesStrict: async () => [],
  readLastRunsStrict: async () => ({}),
}))

afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

const { GET } = await import("./route")
const rooms = async () => {
  const host = "127.0.0.1:4319"
  const res = await GET(new Request(`http://${host}/api/office/acme`, { headers: { host } }), { params: Promise.resolve({ agentId: "acme" }) })
  return (await res.json()).rooms as { id: string; name: string; color: string }[]
}

describe("GET /api/office/[agentId] with the real department registry", () => {
  it("a custom department with records becomes a room, and leaves when its definition and records go", async () => {
    fs.mkdirSync(path.join(root, "definitions"), { recursive: true })
    fs.writeFileSync(
      path.join(root, "definitions", "departments.yaml"),
      `departments:\n  - {slug: legal, name: Legal Affairs, purpose: Contracts., color: "#0369a1"}\n`,
    )
    fs.mkdirSync(path.join(root, "records", "legal"), { recursive: true })
    fs.writeFileSync(path.join(root, "records", "legal", "a.md"), "x")
    expect((await rooms()).find((r) => r.id === "dept:legal")).toMatchObject({ name: "Legal Affairs", color: "#0369a1" })

    fs.rmSync(path.join(root, "definitions", "departments.yaml"))
    fs.rmSync(path.join(root, "records", "legal"), { recursive: true })
    expect((await rooms()).map((r) => r.id)).not.toContain("dept:legal")
  })
})
