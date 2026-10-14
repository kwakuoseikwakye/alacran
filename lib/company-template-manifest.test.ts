import { describe, it, expect } from "vitest"
import { COMPANY_STARTER_PACKS } from "./company-starter-packs"
import { TEMPLATE_MANIFEST } from "./company-template-manifest"

describe("TEMPLATE_MANIFEST", () => {
  // Broadened in v56 from ".github/workflows" to all of ".github". The
  // workflows folder is the one that breaks a new company's first backup (it
  // needs the `workflow` OAuth scope just to be pushed, which gh's default
  // scopes don't include); the rest of .github had nothing left worth
  // shipping once v37 deleted the issue templates, so the whole directory
  // stays out and the docs stay honest about it.
  it("never ships anything from .github", () => {
    expect(TEMPLATE_MANIFEST.filter((p) => p.startsWith(".github"))).toEqual([])
  })
})

describe("daily-team-log stays out of every user's company", () => {
  it("is absent from the bundled template and both manifests", async () => {
    // Stated constraint, not an accident: daily-team-log is the maintainer's
    // own workflow, installed from the `plh-ops` built-in, which is
    // existence-gated on ~/AI-Native/plh-ops and therefore absent from every
    // shipped install. It must never arrive in a company by scaffolding
    // either — a new company has no business inheriting it, and v20's own
    // documented limitation (one global per-machine config path) means a
    // second copy couldn't work anyway.
    const manifest = TEMPLATE_MANIFEST.join("\n").toLowerCase()
    expect(manifest).not.toContain("daily-team-log")
    expect(manifest).not.toContain("daily_team_log")

    const packs = JSON.stringify(COMPANY_STARTER_PACKS).toLowerCase()
    expect(packs).not.toContain("daily-team-log")
    expect(packs).not.toContain("daily_team_log")
  })
})
