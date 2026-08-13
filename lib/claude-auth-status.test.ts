import { describe, expect, it } from "vitest"
import { readClaudeAuthStatus } from "./claude-auth-status"

const LOGGED_IN = JSON.stringify({
  loggedIn: true,
  authMethod: "claude.ai",
  apiProvider: "firstParty",
  email: "nana@plh.life",
  orgId: "29cb779e",
  orgName: "PLH",
  subscriptionType: "team",
})

describe("readClaudeAuthStatus", () => {
  it("reads the real logged-in shape the CLI prints", async () => {
    const status = await readClaudeAuthStatus(async () => ({ stdout: LOGGED_IN, stderr: "" }))
    expect(status).toEqual({ loggedIn: true, email: "nana@plh.life", subscriptionType: "team" })
  })

  it("asks the CLI exactly once, with the verified argv", async () => {
    const calls: [string, string[]][] = []
    await readClaudeAuthStatus(async (command, args) => {
      calls.push([command, args])
      return { stdout: LOGGED_IN, stderr: "" }
    })
    expect(calls).toEqual([["claude", ["auth", "status"]]])
  })

  it("treats a non-zero exit as logged out", async () => {
    const status = await readClaudeAuthStatus(async () => {
      throw new Error("not logged in")
    })
    expect(status).toEqual({ loggedIn: false })
  })

  it("treats loggedIn:false as logged out even when an email is present", async () => {
    const status = await readClaudeAuthStatus(async () => ({
      stdout: JSON.stringify({ loggedIn: false, email: "stale@example.com" }),
      stderr: "",
    }))
    expect(status).toEqual({ loggedIn: false })
  })

  it("treats unparseable output as logged out rather than throwing", async () => {
    const status = await readClaudeAuthStatus(async () => ({ stdout: "not json", stderr: "" }))
    expect(status).toEqual({ loggedIn: false })
  })

  it("omits email and subscription when the CLI reports them blank", async () => {
    const status = await readClaudeAuthStatus(async () => ({
      stdout: JSON.stringify({ loggedIn: true, email: "   ", subscriptionType: "" }),
      stderr: "",
    }))
    expect(status).toEqual({ loggedIn: true, email: undefined, subscriptionType: undefined })
  })
})
