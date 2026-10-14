import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

let tmpCo: string

// The registry is the ONLY thing that may name a path here, so the test has to
// stand in for it — that boundary is the point of the route.
vi.mock("@/lib/get-effective-agents", () => ({
  getEffectiveAgents: async () => [{ id: "test-co", rootPath: tmpCo }],
}))

const { POST } = await import("./route")

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://127.0.0.1:4319/api/brain/dump", {
    method: "POST",
    headers: {
      host: "127.0.0.1:4319",
      origin: "http://127.0.0.1:4319",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe("POST /api/brain/dump", () => {
  let tmpEvil: string

  beforeEach(() => {
    tmpCo = fs.mkdtempSync(path.join(os.tmpdir(), "dump-route-test-"))
    tmpEvil = fs.mkdtempSync(path.join(os.tmpdir(), "dump-route-evil-"))
  })

  afterEach(() => {
    fs.rmSync(tmpCo, { recursive: true, force: true })
    fs.rmSync(tmpEvil, { recursive: true, force: true })
  })

  it("rejects empty body with 400", async () => {
    expect((await POST(post({}))).status).toBe(400)
  })

  it("refuses a cross-origin post without writing anything", async () => {
    const res = await POST(post({ text: "x", companyId: "test-co" }, { origin: "https://evil.example" }))
    expect(res.status).toBe(403)
    expect(fs.existsSync(path.join(tmpCo, "notes", "inbox.md"))).toBe(false)
  })

  it("appends capture to notes/inbox.md in the company the id resolves to", async () => {
    const res = await POST(
      post({
        text: "Client requested custom SLA terms for Q4.",
        title: "Client SLA request",
        companyId: "test-co",
        tags: ["contracts"],
      })
    )
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.relPath).toBe("notes/inbox.md")
    expect(data.timestamp).toBeDefined()

    const content = fs.readFileSync(path.join(tmpCo, "notes", "inbox.md"), "utf8")
    expect(content).toContain("# Inbox")
    expect(content).toContain("Client SLA request")
    expect(content).toContain("Client requested custom SLA terms for Q4.")
    expect(content).toContain("(tags: contracts)")
  })

  it("ignores a companyRoot in the body — a caller cannot choose where this writes", async () => {
    // The body names a directory it should have no say over. Before the id
    // became the only addressable thing, this wrote there.
    const res = await POST(post({ text: "planted", companyId: "test-co", companyRoot: tmpEvil }))
    expect(res.status).toBe(200)
    expect(fs.existsSync(path.join(tmpEvil, "notes"))).toBe(false)
    expect(fs.readFileSync(path.join(tmpCo, "notes", "inbox.md"), "utf8")).toContain("planted")
  })
})
