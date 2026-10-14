import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

// These forms once POSTed to /api/c/<id>/commands/<job>, a route that never
// existed, so their jobs could not start. Department jobs run through the
// runCompanyCommand server action, like MakePostsForm.
const FORMS: [string, string][] = [
  ["finances/audit-finances-form.tsx", "audit-finances"],
  ["leads-customers/research-prospects-form.tsx", "research-prospects"],
  ["comms/find-replies-form.tsx", "FIND_REPLIES_COMMAND_ID"],
  ["content-social/make-posts-form.tsx", "make-posts"],
]

describe("department job forms", () => {
  it.each(FORMS)("%s starts its job through runCompanyCommand", (file, job) => {
    const src = readFileSync(path.join(__dirname, file), "utf-8")
    expect(src).not.toContain("/api/c/")
    expect(src).toContain("runCompanyCommand(")
    expect(src).toContain(job)
  })
})
