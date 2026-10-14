import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { maskSecret, listKeyStatuses, upsertEnvLocal, KEY_SLOTS } from "./keys"

describe("keys.ts", () => {
  let tmpFile: string

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `keys-test-${process.pid}-${Math.random().toString(36).slice(2)}`)
  })

  afterEach(() => {
    try {
      fs.unlinkSync(tmpFile)
    } catch {}
  })

  test("maskSecret masks all but the last 4 characters", () => {
    expect(maskSecret("")).toBe("")
    expect(maskSecret("abc")).toBe("••••")
    expect(maskSecret("abcd")).toBe("••••")
    expect(maskSecret("sk_live_1234567890")).toBe("••••7890")
  })

  test("listKeyStatuses returns masked values and presence flags", () => {
    const env = {
      NOTION_API_KEY: "secret_1234",
      STRIPE_SECRET_KEY: "sk_live_9999",
    }
    const statuses = listKeyStatuses(env)
    expect(statuses.length).toBe(KEY_SLOTS.length)

    const notion = statuses.find((s) => s.envVar === "NOTION_API_KEY")!
    expect(notion.present).toBe(true)
    expect(notion.masked).toBe("••••1234")

    const slack = statuses.find((s) => s.envVar === "SLACK_BOT_TOKEN")!
    expect(slack.present).toBe(false)
    expect(slack.masked).toBe("")
  })

  test("upsertEnvLocal updates single line env values preserving other lines", () => {
    fs.writeFileSync(tmpFile, "FOO=bar\nNOTION_API_KEY=old\n", "utf8")
    upsertEnvLocal(tmpFile, "NOTION_API_KEY", "new_val")
    upsertEnvLocal(tmpFile, "STRIPE_SECRET_KEY", "stripe_val")

    const content = fs.readFileSync(tmpFile, "utf8")
    expect(content).toContain("FOO=bar")
    expect(content).toContain("NOTION_API_KEY=new_val")
    expect(content).toContain("STRIPE_SECRET_KEY=stripe_val")
  })

  test("upsertEnvLocal rejects invalid env var names or multiline values", () => {
    expect(() => upsertEnvLocal(tmpFile, "invalid-name", "val")).toThrow("invalid env var name")
    expect(() => upsertEnvLocal(tmpFile, "VALID_NAME", "line1\nline2")).toThrow("single line")
  })
})
