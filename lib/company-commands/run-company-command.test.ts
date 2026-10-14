import { describe, it, expect, vi } from "vitest"

vi.mock("./run-company-command-impl", () => ({
  runCompanyCommandImpl: vi.fn(async () => ({ started: true, message: "Started" })),
}))

import { runCompanyCommand } from "./run-company-command"
import { runCompanyCommandImpl } from "./run-company-command-impl"

describe("runCompanyCommand (the public action, also reached from an assistant proposal)", () => {
  it("refuses a command that only a review may start, without reaching the impl", async () => {
    const res = await runCompanyCommand("apply-session-facts", { note: "notes/company/sessions/a.md", lines: "x" }, "acme")
    expect(res).toEqual({ started: false, message: "That can only be started from a review." })
    expect(runCompanyCommandImpl).not.toHaveBeenCalled()
  })

  it("passes any other command through", async () => {
    expect(await runCompanyCommand("digest", {}, "acme")).toEqual({ started: true, message: "Started" })
    expect(runCompanyCommandImpl).toHaveBeenCalledWith("digest", {}, "acme")
  })
})
