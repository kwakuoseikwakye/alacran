import { describe, it, expect } from "vitest"
import { extractEnvVar, readNotionToken } from "./read-notion-token"

describe("extractEnvVar", () => {
  it("extracts a plain value", () => {
    expect(extractEnvVar("NOTION_TOKEN=secret_abc123", "NOTION_TOKEN")).toBe("secret_abc123")
  })

  it("finds the key among other lines", () => {
    const env = "OTHER=1\n# a comment\nNOTION_TOKEN=secret_abc123\nMORE=2"
    expect(extractEnvVar(env, "NOTION_TOKEN")).toBe("secret_abc123")
  })

  it("strips surrounding double or single quotes", () => {
    expect(extractEnvVar('NOTION_TOKEN="secret_abc123"', "NOTION_TOKEN")).toBe("secret_abc123")
    expect(extractEnvVar("NOTION_TOKEN='secret_abc123'", "NOTION_TOKEN")).toBe("secret_abc123")
  })

  it("returns null when the key is absent", () => {
    expect(extractEnvVar("OTHER=1", "NOTION_TOKEN")).toBeNull()
  })

  it("returns null when the value is the empty placeholder api-connect writes", () => {
    expect(extractEnvVar("NOTION_TOKEN=", "NOTION_TOKEN")).toBeNull()
  })

  it("returns null for a whitespace-only value", () => {
    expect(extractEnvVar("NOTION_TOKEN=   ", "NOTION_TOKEN")).toBeNull()
  })

  it("does not match a key that is only a prefix of another (e.g. NOTION_TOKEN_OLD)", () => {
    expect(extractEnvVar("NOTION_TOKEN_OLD=secret_abc123", "NOTION_TOKEN")).toBeNull()
  })
})

describe("readNotionToken", () => {
  it("returns the token when .env has one", async () => {
    const readFileFn = async () => "NOTION_TOKEN=secret_real\n"
    expect(await readNotionToken("/company", readFileFn)).toBe("secret_real")
  })

  it("returns null when .env doesn't exist", async () => {
    const readFileFn = async () => {
      throw new Error("ENOENT")
    }
    expect(await readNotionToken("/company", readFileFn)).toBeNull()
  })

  it("returns null when .env exists but has no NOTION_TOKEN", async () => {
    const readFileFn = async () => "SLACK_BOT_TOKEN=xoxb-123\n"
    expect(await readNotionToken("/company", readFileFn)).toBeNull()
  })
})
