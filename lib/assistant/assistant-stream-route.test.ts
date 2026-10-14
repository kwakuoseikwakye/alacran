import { describe, it, expect, vi, beforeEach } from "vitest"
import { EventEmitter } from "node:events"

/**
 * Captures the prompt the route actually handed to `buildArgs` — the
 * `spawn`ed args are never inspected further because `spawn` itself is
 * mocked below (this route's own contract: never let an automated test
 * trigger a real headless agent run).
 */
let capturedPrompts: string[] = []

const resolvePersonaMock = vi.fn(async (agentRootPath: string | null) => {
  if (agentRootPath === "/companies/acme") {
    return {
      persona: {
        assistantName: "Acme Assistant",
        userName: "Alex",
        spokenLanguage: "en-US",
        replyLanguage: "en-US",
        voiceURI: "",
      },
      source: "company" as const,
    }
  }
  return {
    persona: {
      assistantName: "Machine Assistant",
      userName: "Alex",
      spokenLanguage: "en-US",
      replyLanguage: "en-US",
      voiceURI: "",
    },
    source: "machine" as const,
  }
})

vi.mock("@/lib/assistant/resolve-persona", () => ({
  resolvePersona: (agentRootPath: string | null) => resolvePersonaMock(agentRootPath),
}))

vi.mock("@/lib/get-effective-agents", () => ({
  getEffectiveAgents: async () => [
    { id: "acme", name: "Acme", rootPath: "/companies/acme", kind: "command-set" },
  ],
}))

vi.mock("@/lib/ai-executor-registry", () => ({
  getAiExecutorIdForAgent: async () => "claude-code",
}))

vi.mock("@/lib/ai-executors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-executors")>()
  return {
    ...actual,
    getAiExecutor: () => ({
      binaryName: "true",
      buildArgs: ({ prompt }: { prompt: string }) => {
        capturedPrompts.push(prompt)
        return []
      },
    }),
  }
})

vi.mock("@/lib/assistant/gather-all-companies", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/assistant/gather-all-companies")>()
  return {
    ...actual,
    gatherAllCompanies: async () => [
      { id: "acme", name: "Acme", kind: "command-set", source: "name-only" as const, text: "", truncated: false },
    ],
    gatherCrossCompanyDecisions: async () => [],
  }
})

vi.mock("@/lib/ask-company-impl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ask-company-impl")>()
  return {
    ...actual,
    gatherSingleCompanyContext: async () => "",
  }
})

// "What's waiting?" is answered locally from these two sources: no command review, but one stale operating guide.
vi.mock("@/lib/company-commands/pending-reviews", () => ({ listPendingReviews: async () => [] }))
vi.mock("@/lib/guide/observe", () => ({ guidePendingCount: async () => 1 }))

// The route's own comment says it: never let an automated pass trigger a
// real headless agent run. `spawn` is mocked to a fake child process that
// closes immediately, so the two persona-resolution tests below never
// launch a real process.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return {
    ...actual,
    spawn: () => {
      const cp = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
      cp.stdout = new EventEmitter()
      cp.stderr = new EventEmitter()
      queueMicrotask(() => cp.emit("close", 0))
      return cp
    },
  }
})

const { POST } = await import("@/app/api/assistant/stream/route")

function streamRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/assistant/stream", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

describe("POST /api/assistant/stream", () => {
  it("rejects cross-origin requests with 403", async () => {
    const req = new Request("http://localhost:3000/api/assistant/stream", {
      method: "POST",
      headers: {
        origin: "http://evil.com",
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ question: "test", scope: "all" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe("Forbidden")
  })

  it("rejects non-JSON requests with 415", async () => {
    const req = new Request("http://localhost:3000/api/assistant/stream", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "content-type": "text/plain",
      },
      body: "plain text",
    })
    const res = await POST(req)
    expect(res.status).toBe(415)
  })

  it("rejects empty question with 400", async () => {
    const req = new Request("http://localhost:3000/api/assistant/stream", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ question: "   ", scope: "all" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("Didn't catch a question")
  })

  describe("local status answers", () => {
    it("counts a waiting guide update when asked what is waiting, as the sidebar badge does", async () => {
      const res = await POST(streamRequest({ question: "What is waiting for my approval?", scope: "acme" }))
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text).toContain("1 change is waiting for your OK in Approvals.")
      expect(text).not.toContain("Nothing is waiting for your OK.")
    })
  })

  describe("persona resolution", () => {
    beforeEach(() => {
      resolvePersonaMock.mockClear()
      capturedPrompts = []
    })

    it("answers a named company with that company's own persona", async () => {
      const res = await POST(streamRequest({ question: "how are we doing?", scope: "acme" }))
      expect(res.status).toBe(200)

      // Resolved only after the agent lookup, with THAT company's root —
      // never called before the scope is known.
      expect(resolvePersonaMock).toHaveBeenCalledWith("/companies/acme")
      expect(capturedPrompts).toHaveLength(1)
      expect(capturedPrompts[0]).toContain("Your name is Acme Assistant")
    })

    it("answers scope: all with the machine persona, never a company's", async () => {
      const res = await POST(streamRequest({ question: "how are we doing?", scope: "all" }))
      expect(res.status).toBe(200)

      // No single company owns a cross-company answer, so this resolves
      // with no agent root at all.
      expect(resolvePersonaMock).toHaveBeenCalledWith(null)
      expect(capturedPrompts).toHaveLength(1)
      expect(capturedPrompts[0]).toContain("Your name is Machine Assistant")
      expect(capturedPrompts[0]).not.toContain("Acme Assistant")
    })
  })
})
