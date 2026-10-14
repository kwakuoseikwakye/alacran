import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  parseEnvFile,
  readEnvLocal,
  upsertEnvLocal,
  removeEnvLocal,
  runtimeEnv,
} from "./creds"

describe("creds.ts", () => {
  let tmpFile: string
  const prevOverride = process.env.FOUNDER_OS_ENV_LOCAL

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `creds-test-${process.pid}-${Math.random().toString(36).slice(2)}`)
    process.env.FOUNDER_OS_ENV_LOCAL = tmpFile
  })

  afterEach(() => {
    if (prevOverride === undefined) delete process.env.FOUNDER_OS_ENV_LOCAL
    else process.env.FOUNDER_OS_ENV_LOCAL = prevOverride
    try {
      fs.unlinkSync(tmpFile)
    } catch {}
  })

  test("parseEnvFile parses simple and quoted variables", () => {
    const content = `
      # Comments are ignored
      FOO=bar
      QUOTED="hello world"
      SINGLE='single quoted'
      EMPTY=
      SPACED = value
    `
    const parsed = parseEnvFile(content)
    expect(parsed.FOO).toBe("bar")
    expect(parsed.QUOTED).toBe("hello world")
    expect(parsed.SINGLE).toBe("single quoted")
    expect(parsed.EMPTY).toBe("")
    expect(parsed.SPACED).toBe("value")
  })

  test("upsertEnvLocal and readEnvLocal round-trip values safely", () => {
    upsertEnvLocal({ NOTION_API_KEY: "secret_123", SLACK_BOT_TOKEN: "xoxb-test" }, tmpFile)
    const read = readEnvLocal(tmpFile)
    expect(read.NOTION_API_KEY).toBe("secret_123")
    expect(read.SLACK_BOT_TOKEN).toBe("xoxb-test")

    // Update existing key and add a new one
    upsertEnvLocal({ NOTION_API_KEY: "secret_456", STRIPE_SECRET_KEY: "sk_live" }, tmpFile)
    const updated = readEnvLocal(tmpFile)
    expect(updated.NOTION_API_KEY).toBe("secret_456")
    expect(updated.SLACK_BOT_TOKEN).toBe("xoxb-test")
    expect(updated.STRIPE_SECRET_KEY).toBe("sk_live")
  })

  test("removeEnvLocal removes specified keys and preserves others", () => {
    upsertEnvLocal({ K1: "v1", K2: "v2", K3: "v3" }, tmpFile)
    removeEnvLocal(["K1", "K3"], tmpFile)
    const read = readEnvLocal(tmpFile)
    expect(read.K1).toBeUndefined()
    expect(read.K2).toBe("v2")
    expect(read.K3).toBeUndefined()
  })

  test("runtimeEnv merges process.env with envLocal", () => {
    upsertEnvLocal({ TEST_CREDS_OVERRIDE: "from_file" }, tmpFile)
    const env = runtimeEnv(tmpFile)
    expect(env.TEST_CREDS_OVERRIDE).toBe("from_file")
  })
})
