import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { POST, DELETE } from "@/app/api/connections/connect/route"
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


describe("POST & DELETE /api/connections/connect", () => {
  let tmp: string
  const prevOverride = process.env.FOUNDER_OS_ENV_LOCAL

  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `os-connect-${process.pid}-${Math.random().toString(36).slice(2)}`)
    process.env.FOUNDER_OS_ENV_LOCAL = tmp
  })

  afterEach(() => {
    if (prevOverride === undefined) delete process.env.FOUNDER_OS_ENV_LOCAL
    else process.env.FOUNDER_OS_ENV_LOCAL = prevOverride
    try {
      fs.unlinkSync(tmp)
    } catch {}
  })

  const post = (body: unknown) =>
    POST(
      new Request("http://127.0.0.1:4319/api/connections/connect", { headers: LOCAL,
        method: "POST",
        body: JSON.stringify(body),
      })
    )

  test("saves allowed keys for a listed integration and reports keySaved without echoing values", async () => {
    const res = await post({ slug: "notion", values: { NOTION_API_KEY: "ntn_secret_123" } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.keySaved).toBe(true)
    expect(JSON.stringify(body)).not.toContain("ntn_secret_123")
    expect(readEnvLocal(tmp).NOTION_API_KEY).toBe("ntn_secret_123")
  })

  test("a no-connector tile saves its generic key", async () => {
    const res = await post({ slug: "discord", values: { DISCORD_API_KEY: "dsc-1" } })
    expect(res.status).toBe(200)
    expect(readEnvLocal(tmp).DISCORD_API_KEY).toBe("dsc-1")
  })

  test("rejects unknown slugs, foreign keys, and unsafe values", async () => {
    expect((await post({ slug: "not-a-tool", values: { X_API_KEY: "v" } })).status).toBe(400)
    // a key that does not belong to this integration must never be written
    expect((await post({ slug: "notion", values: { ATTIO_API_KEY: "steal" } })).status).toBe(400)
    expect(readEnvLocal(tmp).ATTIO_API_KEY).toBeUndefined()
    expect((await post({ slug: "notion", values: { NOTION_API_KEY: "a\nb" } })).status).toBe(400)
    expect((await post({ slug: "notion", values: {} })).status).toBe(400)
    // guidance-only tiles (whatsapp needs Full Disk Access, not a key) take no keys
    expect((await post({ slug: "whatsapp", values: { WHATSAPP_API_KEY: "x" } })).status).toBe(400)
  })

  test("DELETE removes exactly the integration keys (disconnect)", async () => {
    await post({ slug: "notion", values: { NOTION_API_KEY: "k1" } })
    await post({ slug: "discord", values: { DISCORD_API_KEY: "k2" } })
    const res = await DELETE(
      new Request("http://127.0.0.1:4319/api/connections/connect", { headers: LOCAL,
        method: "DELETE",
        body: JSON.stringify({ slug: "notion" }),
      })
    )
    expect(res.status).toBe(200)
    expect((await res.json()).keySaved).toBe(false)
    expect(readEnvLocal(tmp).NOTION_API_KEY).toBeUndefined()
    expect(readEnvLocal(tmp).DISCORD_API_KEY).toBe("k2")
  })
})
