import { describe, it, expect, vi } from "vitest"

vi.mock("./commit-company-command-result-impl", () => ({
  commitCompanyCommandResultImpl: vi.fn(async () => ({ committed: true, message: "Committed" })),
}))

import { commitCompanyCommandResult } from "./commit-company-command-result"
import { commitCompanyCommandResultImpl } from "./commit-company-command-result-impl"
import { afterApproval } from "../os/preferences/outcome-hooks"

describe("commitCompanyCommandResult (the server action a person's Approve goes through)", () => {
  it("hands the impl the approval hook (log + first-run marker), and nothing else custom", async () => {
    await commitCompanyCommandResult("digest", "notes/company/digests/x.md", "acme", "the text they read")
    expect(commitCompanyCommandResultImpl).toHaveBeenCalledWith(
      "digest",
      "notes/company/digests/x.md",
      "acme",
      undefined,
      undefined,
      "the text they read",
      afterApproval,
      undefined
    )
  })
})
