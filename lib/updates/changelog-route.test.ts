import { describe, it, expect } from "vitest"
import { GET } from "@/app/api/changelog/route"

// Every route handler now refuses a request that is not addressed to this
// machine, and refuses a write that is not same-origin JSON — so a test
// request has to look like one a browser on 127.0.0.1 really sends.
// See lib/http/local-request.ts.
const LOCAL = {
  host: "127.0.0.1:4319",
  origin: "http://127.0.0.1:4319",
  "content-type": "application/json",
}


describe("GET /api/changelog", () => {
  it("returns 200 with JSON feed containing parsed entries and version information", async () => {
    const response = await GET(new Request("http://127.0.0.1:4319/", { headers: LOCAL }))
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.currentVersion).toBeDefined()
    expect(Array.isArray(json.entries)).toBe(true)
    expect(json.entries.length).toBeGreaterThan(0)

    for (const entry of json.entries) {
      // The slice number stays internal: it is a key, and the version the user
      // sees is the release they installed.
      expect(entry.id).toMatch(/^v\d+$/)
      expect(entry.title).toBeTruthy()
      expect(["feature", "improvement", "fix"]).toContain(entry.category)
      if (entry.version !== undefined) {
        expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/)
      }
    }
  })

  it("serves nothing engineering-facing over the wire", async () => {
    const json = await (await GET(new Request("http://127.0.0.1:4319/", { headers: LOCAL }))).json()
    for (const entry of json.entries) {
      for (const text of [entry.title, ...entry.highlights]) {
        expect(text, entry.id).not.toMatch(/`/)
        expect(text, entry.id).not.toMatch(/[\w.-]+\/[\w.-]+/)
      }
    }
  })
})
