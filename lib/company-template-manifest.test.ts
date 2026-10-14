import { describe, it, expect } from "vitest"
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
