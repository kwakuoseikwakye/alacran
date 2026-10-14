import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { GET, POST } from "@/app/api/keys/route"
import { readEnvLocal } from "./creds"

// Every route handler now refuses a request that is not addressed to this
// machine, and refuses a write that is not same-origin JSON — so a test
// request has to look like one a browser on 127.0.0.1 really sends.
// See lib/http/local-request.ts.
const LOCAL = {
  host: "127.0.0.1:4319",
  origin: "http://127.0.0.1:4319",
  "content-type": "application/json",
}


describe("GET & POST /api/keys", () => {
  let tmp: string
  const prevOverride = process.env.FOUNDER_OS_ENV_LOCAL

  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `keys-route-${process.pid}-${Math.random().toString(36).slice(2)}`)
    process.env.FOUNDER_OS_ENV_LOCAL = tmp
  })

  afterEach(() => {
    if (prevOverride === undefined) delete process.env.FOUNDER_OS_ENV_LOCAL
    else process.env.FOUNDER_OS_ENV_LOCAL = prevOverride
    try {
      fs.unlinkSync(tmp)
    } catch {}
  })

  test("GET returns masked statuses of all declared slots", async () => {
    const res = await GET(new Request("http://127.0.0.1:4319/", { headers: LOCAL }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.keys)).toBe(true)
    expect(body.keys.length).toBeGreaterThan(10)
    // No raw secrets should be exposed
    body.keys.forEach((k: { masked: string }) => {
      if (k.masked) expect(k.masked).toMatch(/^••••/)
    })
  })

  test("POST saves valid key to .env.local and rejects unknown slots", async () => {
    const res = await POST(
      new Request("http://127.0.0.1:4319/api/keys", { headers: LOCAL,
        method: "POST",
        body: JSON.stringify({ envVar: "NOTION_API_KEY", value: "secret_live_999" }),
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(readEnvLocal(tmp).NOTION_API_KEY).toBe("secret_live_999")

    // Unknown slot rejected
    const badRes = await POST(
      new Request("http://127.0.0.1:4319/api/keys", { headers: LOCAL,
        method: "POST",
        body: JSON.stringify({ envVar: "UNKNOWN_VAR_SLOT", value: "test" }),
      })
    )
    expect(badRes.status).toBe(400)
  })
})
