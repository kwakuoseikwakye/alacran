import { describe, it, expect } from "vitest"
import { listGoogleAccountEmails, type ExecFileFn } from "./google-accounts"

function fakeExec(stdout: string | Error): ExecFileFn {
  return async () => {
    if (stdout instanceof Error) throw stdout
    return { stdout, stderr: "" }
  }
}

describe("listGoogleAccountEmails", () => {
  it("returns every stored account's email", async () => {
    const exec = fakeExec(
      JSON.stringify({ accounts: [{ email: "a@example.com" }, { email: "b@example.com" }] })
    )
    expect(await listGoogleAccountEmails(exec)).toEqual(["a@example.com", "b@example.com"])
  })

  it("returns an empty list when gog is missing or errors", async () => {
    expect(await listGoogleAccountEmails(fakeExec(new Error("not found")))).toEqual([])
  })

  it("returns an empty list on malformed JSON", async () => {
    expect(await listGoogleAccountEmails(fakeExec("not json {{{"))).toEqual([])
  })

  it("returns an empty list when there are no stored accounts", async () => {
    expect(await listGoogleAccountEmails(fakeExec(JSON.stringify({ accounts: [] })))).toEqual([])
  })

  it("filters out entries with a missing or blank email", async () => {
    const exec = fakeExec(JSON.stringify({ accounts: [{ email: "" }, { email: "ok@example.com" }, {}] }))
    expect(await listGoogleAccountEmails(exec)).toEqual(["ok@example.com"])
  })
})
