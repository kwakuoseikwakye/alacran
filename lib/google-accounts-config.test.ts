import { describe, it, expect } from "vitest"
import { readGoogleAccounts, GOOGLE_ACCOUNTS_RELATIVE_PATH } from "./google-accounts-config"

describe("readGoogleAccounts", () => {
  it("returns the configured accounts", async () => {
    const readFileFn = async (p: string) => {
      expect(p).toContain(GOOGLE_ACCOUNTS_RELATIVE_PATH)
      return "accounts:\n  - a@example.com\n  - b@example.com\n"
    }
    expect(await readGoogleAccounts("/c", readFileFn)).toEqual(["a@example.com", "b@example.com"])
  })

  it("returns [] when the file doesn't exist", async () => {
    const readFileFn = async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    }
    expect(await readGoogleAccounts("/c", readFileFn)).toEqual([])
  })

  it("returns [] on invalid YAML", async () => {
    const readFileFn = async () => "not: valid: yaml: [["
    expect(await readGoogleAccounts("/c", readFileFn)).toEqual([])
  })

  it("returns [] when accounts is missing or not a list", async () => {
    const readFileFn = async () => "other: stuff\n"
    expect(await readGoogleAccounts("/c", readFileFn)).toEqual([])
  })

  it("filters out non-string / blank entries", async () => {
    const readFileFn = async () => "accounts:\n  - a@example.com\n  - \"\"\n  - 5\n"
    expect(await readGoogleAccounts("/c", readFileFn)).toEqual(["a@example.com"])
  })

  it("returns [] for an empty accounts list", async () => {
    const readFileFn = async () => "accounts: []\n"
    expect(await readGoogleAccounts("/c", readFileFn)).toEqual([])
  })
})
