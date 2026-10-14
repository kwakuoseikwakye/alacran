import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

let root: string
vi.mock("@/lib/get-effective-agents", () => ({ getEffectiveAgents: async () => [{ id: "acme", rootPath: root }] }))
const { GET } = await import("./route")
const req = (q: string) => new Request(`http://127.0.0.1:4319/api/content-social/image?${q}`, { headers: { host: "127.0.0.1:4319" } })

describe("GET /api/content-social/image", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "img-route-"))
    fs.mkdirSync(path.join(root, "notes/content/images"), { recursive: true })
    fs.writeFileSync(path.join(root, "notes/content/images/a.png"), "png")
  })
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  it("serves a saved post image", async () => {
    const res = await GET(req("company=acme&file=a.png"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
  })

  it.each(["../../HANDOFF.md", "a/b.png", ".x.png", "a.svg"])("refuses %s", async (file) => {
    expect((await GET(req(`company=acme&file=${encodeURIComponent(file)}`))).status).toBe(400)
  })

  it("refuses a non-local host", async () => {
    const res = await GET(new Request("http://evil.example/api/content-social/image?company=acme&file=a.png", { headers: { host: "evil.example" } }))
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
